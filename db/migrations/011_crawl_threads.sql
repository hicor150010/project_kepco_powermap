-- ══════════════════════════════════════════════
-- 011: 멀티스레드 크롤링 지원
-- ══════════════════════════════════════════════

-- 스레드 번호 (1, 2, 3)
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS thread INT NOT NULL DEFAULT 1
  CHECK (thread IN (1, 2, 3));

-- 모드 (1회 / 반복)
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'single'
  CHECK (mode IN ('single', 'recurring'));

-- 반복 모드: 현재 순환 횟수
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS cycle_count INT NOT NULL DEFAULT 0;

-- 반복 모드: 최대 순환 횟수 (null = 무제한, 수동 중단만)
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS max_cycles INT;

-- 좀비 감지용: 마지막 heartbeat
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;

-- 스레드별 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_thread ON crawl_jobs (thread, status);
