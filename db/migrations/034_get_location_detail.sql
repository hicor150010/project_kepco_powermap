-- ══════════════════════════════════════════════
-- 034: get_location_detail RPC — 마커 클릭 상세 조회
-- ══════════════════════════════════════════════
-- 입력:  p_bjd_code (행안부 법정동코드)
-- 출력:  해당 bjd_code 의 모든 kepco_capa 행
--
-- 마을 이름·주소·좌표는 클라이언트가 이미 MV(kepco_map_summary)에서 보유.
-- 이 RPC 는 진짜 본질만 — bjd_code 기준 capa 행 반환.
-- ══════════════════════════════════════════════

DROP FUNCTION IF EXISTS get_location_detail(char);
DROP FUNCTION IF EXISTS get_location_detail(text);

CREATE OR REPLACE FUNCTION get_location_detail(p_bjd_code char(10))
RETURNS SETOF kepco_capa
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM kepco_capa
  WHERE bjd_code = p_bjd_code
  ORDER BY addr_jibun, subst_nm, mtr_no, dl_nm;
$$;

GRANT EXECUTE ON FUNCTION get_location_detail(char) TO authenticated;

COMMENT ON FUNCTION get_location_detail(char) IS
  '마커 클릭 시 해당 리(bjd_code)의 kepco_capa 행 반환. 주소/좌표는 클라이언트가 MV 에서 보유.';
