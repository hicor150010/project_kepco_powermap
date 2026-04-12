-- ============================================================
-- 016_changelog.sql — 변화 이력 테이블 + 감지 RPC
-- 작성: 2026-04-12
--
-- 목적:
--   kepco_capa_ref(기준) 대비 현재 kepco_capa의 여유 판정이
--   달라진 지번을 일별로 기록. 시점 추적 가능.
--   크롤러 flush마다 변화분만 감지하여 최소한의 데이터만 저장.
-- ============================================================

-- ═══════════════════════════════════════════════
-- 1. 테이블 생성
-- ═══════════════════════════════════════════════

CREATE TABLE kepco_capa_changelog (
  id            BIGSERIAL PRIMARY KEY,
  capa_id       BIGINT NOT NULL,          -- kepco_capa.id
  changed_date  DATE NOT NULL,            -- 변화 감지 시점
  subst_ok      BOOLEAN NOT NULL,         -- 이 시점의 변전소 여유
  mtr_ok        BOOLEAN NOT NULL,         -- 이 시점의 주변압기 여유
  dl_ok         BOOLEAN NOT NULL,         -- 이 시점의 배전선로 여유
  CONSTRAINT changelog_unique UNIQUE (capa_id, changed_date)
);

CREATE INDEX idx_changelog_date ON kepco_capa_changelog (changed_date);
CREATE INDEX idx_changelog_capa ON kepco_capa_changelog (capa_id);

COMMENT ON TABLE kepco_capa_changelog IS
  'ref 대비 여유 판정 변화 이력. 변화분만 기록, 시점 포함. 3개월 보존.';

-- RLS
ALTER TABLE kepco_capa_changelog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "changelog_select" ON kepco_capa_changelog
  FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════
-- 2. detect_changes(capa_ids) — 특정 capa_id들만 비교
--    크롤러 flush 후 호출. flush된 ID만 전달하여 부담 최소화.
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION detect_changes(capa_ids BIGINT[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  INSERT INTO kepco_capa_changelog (capa_id, changed_date, subst_ok, mtr_ok, dl_ok)
  SELECT
    c.id,
    CURRENT_DATE,
    (COALESCE(c.subst_capa, 0) - COALESCE(c.subst_pwr, 0) > 0)
      AND (COALESCE(c.subst_capa, 0) - COALESCE(c.g_subst_capa, 0) > 0),
    (COALESCE(c.mtr_capa, 0) - COALESCE(c.mtr_pwr, 0) > 0)
      AND (COALESCE(c.mtr_capa, 0) - COALESCE(c.g_mtr_capa, 0) > 0),
    (COALESCE(c.dl_capa, 0) - COALESCE(c.dl_pwr, 0) > 0)
      AND (COALESCE(c.dl_capa, 0) - COALESCE(c.g_dl_capa, 0) > 0)
  FROM kepco_capa c
  JOIN kepco_capa_ref r ON r.capa_id = c.id
  WHERE c.id = ANY(capa_ids)
    AND (
      -- ref와 현재 여유 판정이 다른 경우만
      r.subst_ok IS DISTINCT FROM (
        (COALESCE(c.subst_capa, 0) - COALESCE(c.subst_pwr, 0) > 0)
        AND (COALESCE(c.subst_capa, 0) - COALESCE(c.g_subst_capa, 0) > 0)
      )
      OR r.mtr_ok IS DISTINCT FROM (
        (COALESCE(c.mtr_capa, 0) - COALESCE(c.mtr_pwr, 0) > 0)
        AND (COALESCE(c.mtr_capa, 0) - COALESCE(c.g_mtr_capa, 0) > 0)
      )
      OR r.dl_ok IS DISTINCT FROM (
        (COALESCE(c.dl_capa, 0) - COALESCE(c.dl_pwr, 0) > 0)
        AND (COALESCE(c.dl_capa, 0) - COALESCE(c.g_dl_capa, 0) > 0)
      )
    )
  ON CONFLICT (capa_id, changed_date) DO UPDATE SET
    subst_ok = EXCLUDED.subst_ok,
    mtr_ok = EXCLUDED.mtr_ok,
    dl_ok = EXCLUDED.dl_ok;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION detect_changes(BIGINT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION detect_changes(BIGINT[]) TO service_role;

COMMENT ON FUNCTION detect_changes IS
  'flush된 capa_id 목록을 받아 ref 대비 여유 판정 변화를 changelog에 기록. 같은 날 중복 시 최신값으로 갱신.';

-- ═══════════════════════════════════════════════
-- 3. compare_changelog — UI 비교 조회용
--    특정 날짜의 changelog vs ref 비교
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION compare_changelog(
  target_date DATE,
  subst_filter TEXT DEFAULT 'any',
  mtr_filter   TEXT DEFAULT 'any',
  dl_filter    TEXT DEFAULT 'any'
)
RETURNS TABLE (
  geocode_address text,
  lat float8,
  lng float8,
  addr_do text,
  addr_si text,
  addr_gu text,
  addr_dong text,
  addr_li text,
  prev_subst_ok boolean,
  prev_mtr_ok boolean,
  prev_dl_ok boolean,
  curr_subst_ok boolean,
  curr_mtr_ok boolean,
  curr_dl_ok boolean,
  changed_date date,
  changed_count bigint
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.geocode_address,
    a.lat, a.lng,
    a.addr_do, a.addr_si, a.addr_gu, a.addr_dong, a.addr_li,
    r.subst_ok AS prev_subst_ok,
    r.mtr_ok   AS prev_mtr_ok,
    r.dl_ok    AS prev_dl_ok,
    cl.subst_ok AS curr_subst_ok,
    cl.mtr_ok   AS curr_mtr_ok,
    cl.dl_ok    AS curr_dl_ok,
    cl.changed_date,
    COUNT(*) OVER (PARTITION BY a.geocode_address)
  FROM kepco_capa_changelog cl
  JOIN kepco_capa_ref r ON r.capa_id = cl.capa_id
  JOIN kepco_capa c ON c.id = cl.capa_id
  JOIN kepco_addr a ON a.id = c.addr_id
  WHERE cl.changed_date >= target_date
    AND a.lat IS NOT NULL
    -- 시설별 필터
    AND (subst_filter = 'any'
      OR (subst_filter = 'gained' AND r.subst_ok = false AND cl.subst_ok = true)
      OR (subst_filter = 'lost' AND r.subst_ok = true AND cl.subst_ok = false))
    AND (mtr_filter = 'any'
      OR (mtr_filter = 'gained' AND r.mtr_ok = false AND cl.mtr_ok = true)
      OR (mtr_filter = 'lost' AND r.mtr_ok = true AND cl.mtr_ok = false))
    AND (dl_filter = 'any'
      OR (dl_filter = 'gained' AND r.dl_ok = false AND cl.dl_ok = true)
      OR (dl_filter = 'lost' AND r.dl_ok = true AND cl.dl_ok = false));
END;
$$;

COMMENT ON FUNCTION compare_changelog IS
  '특정 날짜 이후 changelog의 변화를 ref 기준으로 조회. 시설별 필터(any/gained/lost) 지원.';
