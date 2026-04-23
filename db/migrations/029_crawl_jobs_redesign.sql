-- ══════════════════════════════════════════════════════════════
-- 029 — crawl_jobs 재설계 (2중 제어 모델)
-- 작성: 2026-04-23
--
-- 설계 의도:
--   사용자 의도(intent)와 실제 상태(status)를 명확히 분리한다.
--   Worker 가 둘을 reconcile 하여
--     ① 유령 Job 부활,
--     ② 사용자 cancel 무시,
--     ③ 크롤러 돌연사 방치
--   세 문제를 제거한다.
--
-- 대체 대상: 009, 011, 015, 019 (모두 통합 재정의)
-- 기존 데이터는 2026-04-23 TRUNCATE 로 먼저 비웠음.
-- ══════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS crawl_jobs CASCADE;

CREATE TABLE crawl_jobs (
  id              BIGSERIAL PRIMARY KEY,

  -- ── [목표] 무엇을 크롤할 것인가 ──
  thread          INT  NOT NULL CHECK (thread IN (1,2,3,4,5)),
  sido            TEXT NOT NULL,
  si              TEXT,
  gu              TEXT,
  dong            TEXT,
  li              TEXT,
  mode            TEXT NOT NULL DEFAULT 'single'
                  CHECK (mode IN ('single','recurring')),
  options         JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_cycles      INT,
  cycle_count     INT  NOT NULL DEFAULT 0,

  -- ── [의도] 사용자가 원하는 상태 ──
  intent          TEXT NOT NULL DEFAULT 'run'
                  CHECK (intent IN ('run','cancel')),
  requested_by    UUID REFERENCES auth.users(id),

  -- ── [관측] 실제 일어난 상태 ──
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','completed','cancelled','failed')),
  github_run_id   BIGINT,
  last_heartbeat  TIMESTAMPTZ,
  checkpoint      JSONB,
  progress        JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message   TEXT,

  -- ── [타임스탬프] ──
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_crawl_jobs_thread_status ON crawl_jobs(thread, status);
CREATE INDEX idx_crawl_jobs_active
  ON crawl_jobs(thread) WHERE status IN ('pending','running');
CREATE INDEX idx_crawl_jobs_created ON crawl_jobs(created_at DESC);

ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can view crawl_jobs"
  ON crawl_jobs FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE crawl_jobs IS
  '2중 제어: intent(사용자 의도) + status(실제 관측). Worker 가 둘을 reconcile.';
COMMENT ON COLUMN crawl_jobs.intent IS
  'run(실행/계속) | cancel(정지). UI/API 만 수정.';
COMMENT ON COLUMN crawl_jobs.status IS
  'pending → running → (completed|cancelled|failed). 크롤러/Worker 만 수정.';
COMMENT ON COLUMN crawl_jobs.checkpoint IS
  '재개 위치. null=처음부터.';
COMMENT ON COLUMN crawl_jobs.progress IS
  '실시간 통계. processed/found/errors/geocoded/addr_parts/recent_errors 등.';
COMMENT ON COLUMN crawl_jobs.github_run_id IS
  'GitHub Actions run id. cancel API 호출에 필요.';
