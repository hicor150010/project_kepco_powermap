-- ============================================================
-- 010_data_history.sql — 여유용량 상태 변경 이력 + 트리거
-- 작성: 2026-04-09
-- ============================================================

-- ─────────────────────────────────────────────
-- kepco_data_history — 여유용량 상태 변경 기록
-- 변경분만 기록, 7일 보존 (cleanup workflow에서 삭제)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kepco_data_history (
  id BIGSERIAL PRIMARY KEY,

  -- 원본 참조 (FK 아님 — JOIN용, 삭제 시 자연 소멸)
  kepco_data_id BIGINT NOT NULL,

  -- 변경 감지 날짜
  changed_at DATE NOT NULL,

  -- 변경 전 여유용량 상태만 기록
  old_vol_subst TEXT,    -- 변전소 (이전 상태)
  old_vol_mtr TEXT,      -- 주변압기 (이전 상태)
  old_vol_dl TEXT        -- 배전선로 (이전 상태)
);

COMMENT ON TABLE kepco_data_history IS '여유용량 상태 변경 이력. 변경된 행만 기록, 7일 보존.';
COMMENT ON COLUMN kepco_data_history.kepco_data_id IS 'kepco_data.id 참조. LEFT JOIN으로 번지 상세 조회.';
COMMENT ON COLUMN kepco_data_history.changed_at IS '변경 전 데이터의 날짜 (OLD.updated_at 기준)';

-- 인덱스
CREATE INDEX idx_history_changed_at ON kepco_data_history(changed_at);
CREATE INDEX idx_history_kepco_id ON kepco_data_history(kepco_data_id);

-- RLS
ALTER TABLE kepco_data_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can view history"
  ON kepco_data_history FOR SELECT
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- 트리거: vol_subst/vol_mtr/vol_dl 변경 시 자동 기록
-- UPSERT의 UPDATE 부분에서만 발동 (INSERT 시에는 발동 안 함)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION track_kepco_vol_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.vol_subst IS DISTINCT FROM NEW.vol_subst OR
      OLD.vol_mtr   IS DISTINCT FROM NEW.vol_mtr   OR
      OLD.vol_dl    IS DISTINCT FROM NEW.vol_dl)
  THEN
    INSERT INTO kepco_data_history (
      kepco_data_id, changed_at,
      old_vol_subst, old_vol_mtr, old_vol_dl
    ) VALUES (
      OLD.id, OLD.updated_at::date,
      OLD.vol_subst, OLD.vol_mtr, OLD.vol_dl
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kepco_vol_history ON kepco_data;
CREATE TRIGGER trg_kepco_vol_history
  BEFORE UPDATE ON kepco_data
  FOR EACH ROW EXECUTE FUNCTION track_kepco_vol_changes();
