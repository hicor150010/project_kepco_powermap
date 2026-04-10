-- ══════════════════════════════════════════════
-- 009: kepco_data_history 확장 + 자동 기록 트리거
-- ══════════════════════════════════════════════

-- 1. 수치 컬럼 추가 (이미 있으면 무시)
ALTER TABLE public.kepco_data_history
  ADD COLUMN IF NOT EXISTS old_subst_capa int,
  ADD COLUMN IF NOT EXISTS old_subst_pwr int,
  ADD COLUMN IF NOT EXISTS old_g_subst_capa int,
  ADD COLUMN IF NOT EXISTS old_mtr_capa int,
  ADD COLUMN IF NOT EXISTS old_mtr_pwr int,
  ADD COLUMN IF NOT EXISTS old_g_mtr_capa int,
  ADD COLUMN IF NOT EXISTS old_dl_capa int,
  ADD COLUMN IF NOT EXISTS old_dl_pwr int,
  ADD COLUMN IF NOT EXISTS old_g_dl_capa int;

-- 2. 트리거 함수: UPDATE 시 용량 관련 값 변경 감지 → history 자동 기록
CREATE OR REPLACE FUNCTION fn_kepco_history()
RETURNS trigger AS $$
BEGIN
  -- 상태 텍스트 또는 수치 중 하나라도 바뀌면 기록
  IF OLD.vol_subst  IS DISTINCT FROM NEW.vol_subst
  OR OLD.vol_mtr    IS DISTINCT FROM NEW.vol_mtr
  OR OLD.vol_dl     IS DISTINCT FROM NEW.vol_dl
  OR OLD.subst_capa IS DISTINCT FROM NEW.subst_capa
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
      old_vol_subst, old_vol_mtr, old_vol_dl,
      old_subst_capa, old_subst_pwr, old_g_subst_capa,
      old_mtr_capa, old_mtr_pwr, old_g_mtr_capa,
      old_dl_capa, old_dl_pwr, old_g_dl_capa
    ) VALUES (
      OLD.id, CURRENT_DATE,
      OLD.vol_subst, OLD.vol_mtr, OLD.vol_dl,
      OLD.subst_capa, OLD.subst_pwr, OLD.g_subst_capa,
      OLD.mtr_capa, OLD.mtr_pwr, OLD.g_mtr_capa,
      OLD.dl_capa, OLD.dl_pwr, OLD.g_dl_capa
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. 트리거 연결 (이미 있으면 교체)
DROP TRIGGER IF EXISTS trg_kepco_history ON public.kepco_data;
CREATE TRIGGER trg_kepco_history
  BEFORE UPDATE ON public.kepco_data
  FOR EACH ROW
  EXECUTE FUNCTION fn_kepco_history();

-- ══════════════════════════════════════════════
-- 4. 비교 RPC 함수: 특정 날짜 이후 변경된 마을 목록 반환
-- ══════════════════════════════════════════════

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
  -- 현재값 (kepco_data는 bigint)
  cur_vol_subst text,
  cur_vol_mtr text,
  cur_vol_dl text,
  cur_subst_capa bigint,
  cur_subst_pwr bigint,
  cur_mtr_capa bigint,
  cur_mtr_pwr bigint,
  cur_dl_capa bigint,
  cur_dl_pwr bigint,
  -- 이전값 (history는 int)
  prev_vol_subst text,
  prev_vol_mtr text,
  prev_vol_dl text,
  prev_subst_capa int,
  prev_subst_pwr int,
  prev_mtr_capa int,
  prev_mtr_pwr int,
  prev_dl_capa int,
  prev_dl_pwr int,
  -- 변경 건수
  changed_count bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH earliest_change AS (
    SELECT DISTINCT ON (h.kepco_data_id)
      h.kepco_data_id,
      h.old_vol_subst,
      h.old_vol_mtr,
      h.old_vol_dl,
      h.old_subst_capa,
      h.old_subst_pwr,
      h.old_mtr_capa,
      h.old_mtr_pwr,
      h.old_dl_capa,
      h.old_dl_pwr
    FROM kepco_data_history h
    WHERE h.changed_at >= since_date
    ORDER BY h.kepco_data_id, h.changed_at ASC
  )
  SELECT
    d.geocode_address,
    d.lat,
    d.lng,
    d.addr_do,
    d.addr_si,
    d.addr_gu,
    d.addr_dong,
    d.addr_li,
    d.addr_jibun,
    d.subst_nm,
    d.dl_nm,
    d.vol_subst,
    d.vol_mtr,
    d.vol_dl,
    d.subst_capa,
    d.subst_pwr,
    d.mtr_capa,
    d.mtr_pwr,
    d.dl_capa,
    d.dl_pwr,
    ec.old_vol_subst,
    ec.old_vol_mtr,
    ec.old_vol_dl,
    ec.old_subst_capa,
    ec.old_subst_pwr,
    ec.old_mtr_capa,
    ec.old_mtr_pwr,
    ec.old_dl_capa,
    ec.old_dl_pwr,
    COUNT(*) OVER (PARTITION BY d.geocode_address)
  FROM earliest_change ec
  JOIN kepco_data d ON d.id = ec.kepco_data_id
  WHERE d.lat IS NOT NULL
  AND (
    ec.old_vol_subst IS DISTINCT FROM d.vol_subst
    OR ec.old_vol_mtr IS DISTINCT FROM d.vol_mtr
    OR ec.old_vol_dl IS DISTINCT FROM d.vol_dl
  );
END;
$$ LANGUAGE plpgsql STABLE;
