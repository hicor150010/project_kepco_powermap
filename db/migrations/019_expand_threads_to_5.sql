-- ══════════════════════════════════════════════
-- 019: 수집기 3개 → 5개 확장 (CHECK 제약 완화)
-- ══════════════════════════════════════════════
-- 배경: 011_crawl_threads.sql 에서 thread IN (1,2,3) 으로 잠가둠.
-- 5개로 증설하려면 CHECK 제약을 (1,2,3,4,5) 로 완화 필요.
--
-- 적용 순서: 반드시 코드 배포 전에 먼저 실행할 것.
-- 그렇지 않으면 수집기 4/5 가 INSERT 시 CHECK 위반으로 실패.
-- ══════════════════════════════════════════════

ALTER TABLE crawl_jobs DROP CONSTRAINT IF EXISTS crawl_jobs_thread_check;
ALTER TABLE crawl_jobs ADD CONSTRAINT crawl_jobs_thread_check
  CHECK (thread IN (1, 2, 3, 4, 5));
