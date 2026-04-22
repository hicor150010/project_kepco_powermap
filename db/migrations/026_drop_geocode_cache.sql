-- ══════════════════════════════════════════════
-- 026: geocode_cache 테이블 제거
-- ══════════════════════════════════════════════
-- 배경 (2026-04-22):
--   리 단위 좌표는 kepco_addr.lat/lng 에 단일 저장으로 통합.
--   지번 단위 좌표는 VWorld WFS on-demand + Vercel KV (TTL 3일).
--   → geocode_cache 는 카카오 API 결과 중복 저장 캐시로만 쓰이고 있어 불필요.
--
-- 데이터 손실 검증 (crawler/verify_geocode_cache.py 실행 결과):
--   geocode_cache 총 4,765 행
--   → 4,763 행이 kepco_addr 에 동일 좌표로 존재 (양쪽 일치)
--   → kepco_addr 좌표 NULL 인데 cache 에만 좌표 있는 경우: 0 건
--   → leftover 2건 (지번 포함된 과거 주소 형태, 현행 스키마 불일치) 무시 가능
--
-- 코드 참조 정리 완료 (커밋 10a234f):
--   - geocoder/ 폴더 삭제 (워커)
--   - .github/workflows/geocode.yml 삭제 (cron)
--   - web/app/api/geocode/route.ts 삭제
--   - crawler/crawl_to_db.py 지오코딩 로직 제거
-- ══════════════════════════════════════════════

DROP TABLE IF EXISTS geocode_cache CASCADE;

-- 실행 후 확인 쿼리 (옵션):
--   SELECT COUNT(*) FROM kepco_addr WHERE lat IS NOT NULL;   -- 기존 좌표 수 유지 확인
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name = 'geocode_cache';   -- 0 rows 반환 시 성공
