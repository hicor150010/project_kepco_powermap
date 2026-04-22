-- ══════════════════════════════════════════════
-- 022: kepco_capa.addr_jibun 본번 함수형 인덱스
-- ══════════════════════════════════════════════
-- 배경:
--   search_kepco RPC (013_normalize.sql) 의
--     AND kepco_jibun_main(c.addr_jibun) = lot_no
--   조건이 함수형 비교라 기존 인덱스 못 씀.
--   kepco_capa 137만 행 전체 스캔 → Supabase statement_timeout(8s) 초과.
--
-- 해결:
--   kepco_jibun_main(addr_jibun) 에 partial functional index.
--   NULL 은 제외해 인덱스 크기 최소화.
--
-- 주의:
--   Supabase SQL Editor 는 쿼리를 자동 트랜잭션 래핑.
--   CONCURRENTLY 는 트랜잭션 밖에서만 가능하므로 일반 CREATE INDEX 사용.
--   생성 중 kepco_capa 에 SHARE 락 → SELECT 가능, INSERT/UPDATE/DELETE 대기.
--   예상 시간: 10~30초 (137만 행).
--   크롤링/업로드 돌고 있지 않을 때 실행할 것.
-- ══════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_capa_jibun_main
  ON kepco_capa (kepco_jibun_main(addr_jibun))
  WHERE kepco_jibun_main(addr_jibun) IS NOT NULL;

COMMENT ON INDEX idx_capa_jibun_main IS
  'search_kepco RPC의 지번 본번 매칭 가속. 137만 행 seq scan → 인덱스 스캔.';

-- 실행 후 검증:
-- EXPLAIN ANALYZE
-- SELECT COUNT(*) FROM kepco_capa WHERE kepco_jibun_main(addr_jibun) = 517;
-- → Index Scan using idx_capa_jibun_main 로 나와야 정상.
