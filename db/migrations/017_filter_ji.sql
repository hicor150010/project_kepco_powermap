-- ============================================================
-- 017_filter_ji.sql — 조건검색 지번 단위 조회 RPC
--
-- 여러 geocode_address에 속하는 지번(KepcoDataRow)을 한 번에 조회.
-- 조건검색 2단계에서 "지번 단위" 탭이 사용한다.
--
-- 인자:
--   addrs    - geocode_address 배열
--   max_rows - 최대 반환 건수 (기본 200)
--
-- 반환: get_location_detail과 동일한 컬럼 구조
-- ============================================================

CREATE OR REPLACE FUNCTION get_filter_ji(
  addrs    TEXT[],
  max_rows INTEGER DEFAULT 200
)
RETURNS TABLE (
  id bigint,
  addr_do text,
  addr_si text,
  addr_gu text,
  addr_dong text,
  addr_li text,
  addr_jibun text,
  geocode_address text,
  lat float8,
  lng float8,
  subst_nm text,
  mtr_no text,
  dl_nm text,
  subst_capa int,
  subst_pwr int,
  g_subst_capa int,
  mtr_capa int,
  mtr_pwr int,
  g_mtr_capa int,
  dl_capa int,
  dl_pwr int,
  g_dl_capa int,
  step1_cnt int,
  step1_pwr int,
  step2_cnt int,
  step2_pwr int,
  step3_cnt int,
  step3_pwr int,
  updated_at timestamptz
) AS $$
  SELECT
    c.id,
    a.addr_do, a.addr_si, a.addr_gu, a.addr_dong, a.addr_li,
    c.addr_jibun,
    a.geocode_address,
    a.lat, a.lng,
    c.subst_nm, c.mtr_no, c.dl_nm,
    c.subst_capa, c.subst_pwr, c.g_subst_capa,
    c.mtr_capa, c.mtr_pwr, c.g_mtr_capa,
    c.dl_capa, c.dl_pwr, c.g_dl_capa,
    c.step1_cnt, c.step1_pwr, c.step2_cnt, c.step2_pwr,
    c.step3_cnt, c.step3_pwr,
    c.updated_at
  FROM kepco_capa c
  JOIN kepco_addr a ON a.id = c.addr_id
  WHERE a.geocode_address = ANY(addrs)
  ORDER BY a.geocode_address, c.addr_jibun, c.subst_nm, c.mtr_no, c.dl_nm
  LIMIT max_rows;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_filter_ji IS
  '조건검색 지번 조회. 여러 geocode_address의 지번 데이터를 limit 포함 반환. idx_kepco_geocode_address 인덱스 활용.';
