-- ============================================================
-- 015_cancelled_status.sql — crawl_jobs status에 'cancelled' 추가
-- 작성: 2026-04-12
--
-- 목적:
--   사용자 중단(cancelled)과 타임아웃 중단(stopped)을 구분.
--   stopped: 시스템 타임아웃, cron이 이어서 재개 가능
--   cancelled: 사용자 의도적 취소, cron이 건드리지 않음
--
-- 기존 사용자 중단 Job도 cancelled로 업데이트
-- ============================================================

-- 1) CHECK 제약 교체
ALTER TABLE crawl_jobs DROP CONSTRAINT IF EXISTS crawl_jobs_status_check;
ALTER TABLE crawl_jobs ADD CONSTRAINT crawl_jobs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'stopped', 'stop_requested', 'cancelled'));
