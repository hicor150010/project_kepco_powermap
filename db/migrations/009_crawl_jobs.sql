-- ============================================================
-- 009_crawl_jobs.sql — 크롤링 작업 관리 테이블
-- 작성: 2026-04-09
-- ============================================================

-- ─────────────────────────────────────────────
-- crawl_jobs — 크롤링 작업 제어/모니터링 허브
-- 웹 관리자 UI에서 생성, GitHub Actions에서 실행
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id BIGSERIAL PRIMARY KEY,

  -- 크롤링 대상 지역 (scope)
  sido TEXT NOT NULL,
  si TEXT,
  gu TEXT,
  dong TEXT,
  li TEXT,

  -- 상태 관리
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','stopped','stop_requested')),

  -- 진행률 (10건마다 업데이트)
  progress JSONB DEFAULT '{}'::jsonb,
  -- 예: {processed: 1234, found: 1200, errors: 5, current_address: "경기도 수원시..."}

  -- 체크포인트 (500건마다 저장, 재개용)
  checkpoint JSONB,
  -- 예: {position: {do_idx:0, si_idx:3, ...}, stats: {processed:1234, found:1200, errors:5}}

  -- 옵션
  options JSONB DEFAULT '{}'::jsonb,
  -- 예: {fetch_step_data: false, delay: 0.5, flush_size: 500}

  -- GitHub Actions 연동
  github_run_id BIGINT,

  -- 요청자
  requested_by UUID REFERENCES auth.users(id),

  -- 에러 정보
  error_message TEXT,

  -- 타임스탬프
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE crawl_jobs IS '크롤링 작업 관리. 웹 UI에서 생성/중단, GitHub Actions에서 실행/업데이트.';
COMMENT ON COLUMN crawl_jobs.status IS 'pending→running→completed|failed|stop_requested→stopped';
COMMENT ON COLUMN crawl_jobs.progress IS '실시간 진행률 (10건마다 갱신)';
COMMENT ON COLUMN crawl_jobs.checkpoint IS '재개용 체크포인트 (500건마다 갱신)';

-- 인덱스
CREATE INDEX idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX idx_crawl_jobs_created ON crawl_jobs(created_at DESC);

-- RLS
ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can view crawl_jobs"
  ON crawl_jobs FOR SELECT
  TO authenticated
  USING (true);
