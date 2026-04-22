-- ══════════════════════════════════════════════
-- 021: geocode_cache 에서 지번 단위 좌표 행 제거
-- ══════════════════════════════════════════════
-- 배경 (2026-04-22 정책):
--   - 지번 단위 좌표는 DB 에 저장하지 않고 Vercel KV (TTL 3일) 에만 캐시
--   - geocode_cache 는 마을(리/동) 단위 좌표만 유지
--   - 기존에 쌓인 지번 행은 삭제해 역할 분리 일관성 회복
--
-- 판정: address 마지막 토큰이 숫자/산숫자 패턴이면 지번 단위로 판정
--   - "159-2", "42", "산1-1", "산23" 등
--   - 마을 단위 ("... 대흥리") 는 한글로 끝나므로 영향 없음
-- ══════════════════════════════════════════════

BEGIN;

-- 삭제 대상 미리보기용 (실행 전 주석 해제하여 건수 확인 권장)
-- SELECT COUNT(*) AS total_cache_rows FROM geocode_cache;
-- SELECT COUNT(*) AS jibun_rows
--   FROM geocode_cache
--   WHERE address ~ '(^|\s)(산)?\d+(-\d+)?$';

DELETE FROM geocode_cache
WHERE address ~ '(^|\s)(산)?\d+(-\d+)?$';

-- 실행 후 남은 행은 마을(리/동) 단위만
-- SELECT COUNT(*) AS remaining FROM geocode_cache;

COMMIT;

COMMENT ON TABLE geocode_cache IS
  '마을(리/동) 단위 좌표 캐시 전용. 지번 단위 좌표는 Vercel KV (TTL 3일) 사용. (2026-04-22)';
