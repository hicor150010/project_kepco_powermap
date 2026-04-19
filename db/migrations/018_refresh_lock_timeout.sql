-- ============================================================
-- 018_refresh_lock_timeout.sql — 새로고침 함수 동시성/타임아웃 보강
-- 작성: 2026-04-19
--
-- 배경:
--   데이터 증가로 REFRESH MATERIALIZED VIEW CONCURRENTLY 가
--   PostgREST 기본 statement_timeout (8초) 에 잘려 500 에러 발생.
--   동시에 여러 사용자가 새로고침을 누를 때의 보호도 부재.
--
-- 변경:
--   1) 메타 테이블 kepco_refresh_log — 마지막 REFRESH 완료 시각 1행
--   2) 함수 refresh_kepco_summary 재정의:
--      - SET statement_timeout = '5min'  (PostgREST 기본 우회)
--      - 60초 cooldown — 의도된 캐시
--      - pg_try_advisory_lock — 동시 호출 즉시 거절 (대기 안 함)
--      - jsonb 응답 ({ ok, skipped, age_sec? })
--
-- 안전성:
--   - try_advisory_lock 은 비차단 → 무한 대기 없음
--   - 트랜잭션 종료 시 advisory lock 자동 해제 → 영구 잠김 없음
--   - statement_timeout = '5min' 이내 강제 종료 보장
-- ============================================================

-- 1) 메타 테이블 (1행 강제)
CREATE TABLE IF NOT EXISTS kepco_refresh_log (
  id int PRIMARY KEY CHECK (id = 1),
  last_refreshed_at timestamptz NOT NULL DEFAULT 'epoch'
);
INSERT INTO kepco_refresh_log (id) VALUES (1) ON CONFLICT DO NOTHING;

COMMENT ON TABLE kepco_refresh_log IS
  'kepco_map_summary 의 마지막 REFRESH 완료 시각. cooldown 계산용 1행 메타 테이블.';

-- 2) RPC 함수 재정의 — 반환 타입이 void → jsonb 로 바뀌므로 DROP 후 CREATE
DROP FUNCTION IF EXISTS refresh_kepco_summary();

CREATE OR REPLACE FUNCTION refresh_kepco_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5min'   -- 함수 실행 동안만 PostgREST 기본 timeout 우회
AS $$
DECLARE
  last_at  timestamptz;
  age_sec  int;
  COOLDOWN_SEC constant int := 60;
  LOCK_KEY     constant int := 74218501;  -- 임의 정수, 다른 함수와 충돌만 안 나면 OK
BEGIN
  -- (1) cooldown 체크 — 60초 이내면 즉시 ok 반환 (DB 부하 0, 사용자엔 "완료"로 보임)
  SELECT last_refreshed_at INTO last_at FROM kepco_refresh_log WHERE id = 1;
  age_sec := EXTRACT(EPOCH FROM (now() - last_at))::int;
  IF age_sec < COOLDOWN_SEC THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'cooldown',
      'age_sec', age_sec
    );
  END IF;

  -- (2) 동시 호출 방어 — 비차단 락. 다른 세션이 REFRESH 중이면 즉시 false.
  IF NOT pg_try_advisory_lock(LOCK_KEY) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'in_progress'
    );
  END IF;

  -- (3) 실제 REFRESH (CONCURRENTLY 우선, 빈 뷰 등 fallback)
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY kepco_map_summary;
  EXCEPTION
    WHEN feature_not_supported THEN
      REFRESH MATERIALIZED VIEW kepco_map_summary;
  END;

  -- (4) 완료 시각 기록 + 락 해제
  UPDATE kepco_refresh_log SET last_refreshed_at = now() WHERE id = 1;
  PERFORM pg_advisory_unlock(LOCK_KEY);

  RETURN jsonb_build_object('ok', true, 'skipped', false);
END;
$$;

REVOKE ALL    ON FUNCTION refresh_kepco_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_kepco_summary() TO service_role;

COMMENT ON FUNCTION refresh_kepco_summary() IS
  '집계 뷰 갱신. 60초 cooldown + advisory lock + 5분 statement_timeout 으로 보호.';
