-- ══════════════════════════════════════════════
-- 033: refresh_kepco_summary RPC 재생성
-- ══════════════════════════════════════════════
-- 배경:
--   기존 018 의 보호 로직(60s cooldown + advisory lock + 5min timeout)
--   그대로 살려서 재정의. MV 가 032 에서 새로 만들어졌고 RPC 자체는 부재 상태.
--
-- 두 진입점 동시 사용:
--   1) 크롤러 자동 (1시간 주기) — crawl_to_db.py 가 호출
--   2) 사용자 UI 수동       — web/app/api/refresh-mv/route.ts 가 호출
--
-- 보호 메커니즘:
--   - SET statement_timeout = '5min'  — PostgREST 기본 8s 우회 (MV 갱신은 분 단위 가능)
--   - 60초 cooldown                    — 연타 / 두 진입점 동시 호출 흡수
--   - pg_try_advisory_lock(비차단)     — 다른 세션 REFRESH 중이면 즉시 거절
--
-- 응답 형식 (jsonb):
--   { "ok": true, "skipped": false }                          — REFRESH 수행
--   { "ok": true, "skipped": true, "reason": "cooldown",
--     "age_sec": 12 }                                          — 60s 안에 또 호출됨
--   { "ok": true, "skipped": true, "reason": "in_progress" } — 다른 세션이 진행 중
--
-- 메타 테이블 kepco_refresh_log (이미 존재 — 재생성 안 함):
--   id=1, last_refreshed_at — cooldown 계산용
-- ══════════════════════════════════════════════

-- 반환 타입이 jsonb 라 DROP 후 재생성
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
  LOCK_KEY     constant int := 74218501;  -- 임의 정수, 다른 함수와 충돌 안 나면 OK
BEGIN
  -- (1) cooldown 체크 — 60초 이내면 즉시 ok 반환 (DB 부하 0)
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

  -- (3) 실제 REFRESH (CONCURRENTLY 우선, 빈 뷰 fallback)
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY kepco_map_summary;
  EXCEPTION
    WHEN feature_not_supported THEN
      -- 첫 REFRESH(빈 뷰)는 CONCURRENTLY 불가
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
  'kepco_map_summary MV 갱신. 60초 cooldown + advisory lock + 5분 statement_timeout.';
