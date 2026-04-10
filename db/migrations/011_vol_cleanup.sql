-- ============================================================
-- 011_vol_cleanup.sql — vol 컬럼 제거 + DB 초기화 + 트리거/RPC 수정
-- 작성: 2026-04-11
--
-- KEPCO 여유용량 판정 수식 (프론트엔드 소스에서 추출):
--   없음 = (capa - pwr ≤ 0) OR (capa - g_capa ≤ 0)
--   있음 = (capa - pwr > 0) AND (capa - g_capa > 0)
--
-- vol_subst/mtr/dl 문자열은 계산으로 대체 가능 → 삭제.
-- ⚠️ users 테이블 외 전체 초기화
-- ============================================================

-- ─────────────────────────────────────────────
-- 1) Materialized View 먼저 삭제 (vol 컬럼 의존)
-- ─────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS kepco_map_summary;

-- ─────────────────────────────────────────────
-- 2) 트리거 제거 (vol 컬럼 참조)
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_kepco_history ON public.kepco_data;
DROP FUNCTION IF EXISTS fn_kepco_history();

-- ─────────────────────────────────────────────
-- 3) 데이터 초기화 (users 제외)
-- ─────────────────────────────────────────────
TRUNCATE TABLE kepco_data CASCADE;
TRUNCATE TABLE kepco_data_history;
TRUNCATE TABLE crawl_jobs CASCADE;
TRUNCATE TABLE geocode_cache;

-- ─────────────────────────────────────────────
-- 4) vol 컬럼 + 인덱스 삭제 — kepco_data
-- ─────────────────────────────────────────────
ALTER TABLE kepco_data DROP COLUMN IF EXISTS vol_subst;
ALTER TABLE kepco_data DROP COLUMN IF EXISTS vol_mtr;
ALTER TABLE kepco_data DROP COLUMN IF EXISTS vol_dl;

-- vol 인덱스 삭제
DROP INDEX IF EXISTS idx_kepco_vol_subst;
DROP INDEX IF EXISTS idx_kepco_vol_mtr;
DROP INDEX IF EXISTS idx_kepco_vol_dl;

-- ─────────────────────────────────────────────
-- 5) vol 컬럼 삭제 — kepco_data_history
-- ─────────────────────────────────────────────
ALTER TABLE kepco_data_history DROP COLUMN IF EXISTS old_vol_subst;
ALTER TABLE kepco_data_history DROP COLUMN IF EXISTS old_vol_mtr;
ALTER TABLE kepco_data_history DROP COLUMN IF EXISTS old_vol_dl;

-- ─────────────────────────────────────────────
-- 6) 트리거 재생성 — 수치 변경만 감지
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_kepco_history()
RETURNS trigger AS $$
BEGIN
  IF OLD.subst_capa IS DISTINCT FROM NEW.subst_capa
  OR OLD.subst_pwr  IS DISTINCT FROM NEW.subst_pwr
  OR OLD.g_subst_capa IS DISTINCT FROM NEW.g_subst_capa
  OR OLD.mtr_capa   IS DISTINCT FROM NEW.mtr_capa
  OR OLD.mtr_pwr    IS DISTINCT FROM NEW.mtr_pwr
  OR OLD.g_mtr_capa IS DISTINCT FROM NEW.g_mtr_capa
  OR OLD.dl_capa    IS DISTINCT FROM NEW.dl_capa
  OR OLD.dl_pwr     IS DISTINCT FROM NEW.dl_pwr
  OR OLD.g_dl_capa  IS DISTINCT FROM NEW.g_dl_capa
  THEN
    INSERT INTO public.kepco_data_history (
      kepco_data_id, changed_at,
      old_subst_capa, old_subst_pwr, old_g_subst_capa,
      old_mtr_capa, old_mtr_pwr, old_g_mtr_capa,
      old_dl_capa, old_dl_pwr, old_g_dl_capa
    ) VALUES (
      OLD.id, CURRENT_DATE,
      OLD.subst_capa, OLD.subst_pwr, OLD.g_subst_capa,
      OLD.mtr_capa, OLD.mtr_pwr, OLD.g_mtr_capa,
      OLD.dl_capa, OLD.dl_pwr, OLD.g_dl_capa
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kepco_history ON public.kepco_data;
CREATE TRIGGER trg_kepco_history
  BEFORE UPDATE ON public.kepco_data
  FOR EACH ROW
  EXECUTE FUNCTION fn_kepco_history();

-- ─────────────────────────────────────────────
-- 7) 비교 RPC 재생성 — 수식 기반 판정
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_changes_since(date);

CREATE OR REPLACE FUNCTION get_changes_since(since_date date)
RETURNS TABLE (
  geocode_address text,
  lat float8,
  lng float8,
  addr_do text,
  addr_si text,
  addr_gu text,
  addr_dong text,
  addr_li text,
  addr_jibun text,
  subst_nm text,
  dl_nm text,
  -- 현재 수치
  cur_subst_capa bigint,
  cur_subst_pwr bigint,
  cur_g_subst_capa bigint,
  cur_mtr_capa bigint,
  cur_mtr_pwr bigint,
  cur_g_mtr_capa bigint,
  cur_dl_capa bigint,
  cur_dl_pwr bigint,
  cur_g_dl_capa bigint,
  -- 이전 수치
  prev_subst_capa int,
  prev_subst_pwr int,
  prev_g_subst_capa int,
  prev_mtr_capa int,
  prev_mtr_pwr int,
  prev_g_mtr_capa int,
  prev_dl_capa int,
  prev_dl_pwr int,
  prev_g_dl_capa int,
  -- 변경 건수
  changed_count bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH earliest_change AS (
    SELECT DISTINCT ON (h.kepco_data_id)
      h.kepco_data_id,
      h.old_subst_capa, h.old_subst_pwr, h.old_g_subst_capa,
      h.old_mtr_capa, h.old_mtr_pwr, h.old_g_mtr_capa,
      h.old_dl_capa, h.old_dl_pwr, h.old_g_dl_capa
    FROM kepco_data_history h
    WHERE h.changed_at >= since_date
    ORDER BY h.kepco_data_id, h.changed_at ASC
  )
  SELECT
    d.geocode_address, d.lat, d.lng,
    d.addr_do, d.addr_si, d.addr_gu, d.addr_dong, d.addr_li, d.addr_jibun,
    d.subst_nm, d.dl_nm,
    d.subst_capa, d.subst_pwr, d.g_subst_capa,
    d.mtr_capa, d.mtr_pwr, d.g_mtr_capa,
    d.dl_capa, d.dl_pwr, d.g_dl_capa,
    ec.old_subst_capa, ec.old_subst_pwr, ec.old_g_subst_capa,
    ec.old_mtr_capa, ec.old_mtr_pwr, ec.old_g_mtr_capa,
    ec.old_dl_capa, ec.old_dl_pwr, ec.old_g_dl_capa,
    COUNT(*) OVER (PARTITION BY d.geocode_address)
  FROM earliest_change ec
  JOIN kepco_data d ON d.id = ec.kepco_data_id
  WHERE d.lat IS NOT NULL
  AND (
    ec.old_subst_capa IS DISTINCT FROM d.subst_capa
    OR ec.old_subst_pwr IS DISTINCT FROM d.subst_pwr
    OR ec.old_g_subst_capa IS DISTINCT FROM d.g_subst_capa
    OR ec.old_mtr_capa IS DISTINCT FROM d.mtr_capa
    OR ec.old_mtr_pwr IS DISTINCT FROM d.mtr_pwr
    OR ec.old_g_mtr_capa IS DISTINCT FROM d.g_mtr_capa
    OR ec.old_dl_capa IS DISTINCT FROM d.dl_capa
    OR ec.old_dl_pwr IS DISTINCT FROM d.dl_pwr
    OR ec.old_g_dl_capa IS DISTINCT FROM d.g_dl_capa
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ─────────────────────────────────────────────
-- 8) Materialized View 재생성 — 수식 기반
-- ─────────────────────────────────────────────
CREATE MATERIALIZED VIEW kepco_map_summary AS
SELECT
  geocode_address,
  MAX(lat) AS lat,
  MAX(lng) AS lng,
  COUNT(*) AS total,
  -- 여유용량 없음 카운트 (KEPCO 수식)
  SUM(CASE WHEN (COALESCE(subst_capa,0) - COALESCE(subst_pwr,0) <= 0)
            OR (COALESCE(subst_capa,0) - COALESCE(g_subst_capa,0) <= 0)
       THEN 1 ELSE 0 END) AS subst_no_cap,
  SUM(CASE WHEN (COALESCE(mtr_capa,0) - COALESCE(mtr_pwr,0) <= 0)
            OR (COALESCE(mtr_capa,0) - COALESCE(g_mtr_capa,0) <= 0)
       THEN 1 ELSE 0 END) AS mtr_no_cap,
  SUM(CASE WHEN (COALESCE(dl_capa,0) - COALESCE(dl_pwr,0) <= 0)
            OR (COALESCE(dl_capa,0) - COALESCE(g_dl_capa,0) <= 0)
       THEN 1 ELSE 0 END) AS dl_no_cap,
  MAX(addr_do) AS addr_do, MAX(addr_si) AS addr_si,
  MAX(addr_gu) AS addr_gu, MAX(addr_dong) AS addr_dong, MAX(addr_li) AS addr_li,
  ARRAY_AGG(DISTINCT subst_nm) FILTER (WHERE subst_nm IS NOT NULL AND subst_nm <> '') AS subst_names,
  ARRAY_AGG(DISTINCT dl_nm) FILTER (WHERE dl_nm IS NOT NULL AND dl_nm <> '') AS dl_names,
  GREATEST(0, COALESCE(MAX(COALESCE(subst_capa,0) - COALESCE(subst_pwr,0)), 0))::bigint AS subst_remaining_kw,
  GREATEST(0, COALESCE(MAX(COALESCE(mtr_capa,0) - COALESCE(mtr_pwr,0)), 0))::bigint AS mtr_remaining_kw,
  GREATEST(0, COALESCE(MAX(COALESCE(dl_capa,0) - COALESCE(dl_pwr,0)), 0))::bigint AS dl_remaining_kw,
  GREATEST(
    GREATEST(0, COALESCE(MAX(COALESCE(subst_capa,0) - COALESCE(subst_pwr,0)), 0)),
    GREATEST(0, COALESCE(MAX(COALESCE(mtr_capa,0) - COALESCE(mtr_pwr,0)), 0)),
    GREATEST(0, COALESCE(MAX(COALESCE(dl_capa,0) - COALESCE(dl_pwr,0)), 0))
  )::bigint AS max_remaining_kw
FROM kepco_data
WHERE lat IS NOT NULL
GROUP BY geocode_address;

CREATE UNIQUE INDEX idx_summary_address ON kepco_map_summary (geocode_address);
CREATE INDEX idx_summary_latlng ON kepco_map_summary (lat, lng);
CREATE INDEX idx_summary_remaining_desc ON kepco_map_summary (max_remaining_kw DESC);
