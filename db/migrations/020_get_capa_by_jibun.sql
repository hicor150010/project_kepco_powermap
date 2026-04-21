-- ══════════════════════════════════════════════
-- 020: 지번 단위 여유용량 조회 RPC (1차 1단계 — 필지 클릭 정보 카드용)
-- ══════════════════════════════════════════════
-- 용도: 지도 클릭 → VWorld 필지 조회 → 그 지번의 KEPCO 여유용량 반환
--
-- 매칭 정책:
--   1) 정확한 지번 매칭 (addr_jibun = p_jibun) → match_mode='exact'
--   2) 같은 리(里) 안에서 같은 군(산/일반)의 본번 거리 최소 지번 1개
--      → match_mode='nearest_jibun', nearest_jibun=실제 사용된 지번
--   3) 우선군(산↔일반)에 없으면 0행 ("이 리에 데이터 없음")
--
-- "본번 거리"는 PostGIS 좌표 거리가 아니라 정수 비교 (kepco_jibun_main).
-- 같은 리 안에서만 비교하므로 빠르고 의미도 명확.
-- ══════════════════════════════════════════════

-- RETURNS TABLE 컬럼 변경 시 CREATE OR REPLACE 불가 → 명시적 DROP
DROP FUNCTION IF EXISTS get_capa_by_jibun(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_capa_by_jibun(
  p_ctp_nm TEXT,  -- 시도 ("서울특별시")
  p_sig_nm TEXT,  -- 시군구 ("강남구")
  p_emd_nm TEXT,  -- 읍면동 ("삼성동")
  p_li_nm  TEXT,  -- 리 ("" or "대흥리")
  p_jibun  TEXT   -- 지번 ("148-11" or "산23-4")
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
  updated_at timestamptz,
  match_mode text,    -- 'exact' or 'nearest_jibun'
  nearest_jibun text  -- nearest_jibun 모드일 때 실제 사용된 지번
) AS $$
DECLARE
  v_input_is_san BOOLEAN := (p_jibun LIKE '산%');
  v_input_main   INTEGER := kepco_jibun_main(p_jibun);
BEGIN
  RETURN QUERY
  WITH matched_addr AS (
    -- 주소 매칭 (시도+시군구+읍면동+리)
    SELECT a.id
    FROM kepco_addr a
    WHERE a.addr_do = p_ctp_nm
      AND a.addr_gu = p_sig_nm
      AND a.addr_dong = p_emd_nm
      AND COALESCE(a.addr_li, '') = COALESCE(p_li_nm, '')
    LIMIT 1
  ),
  exact_match AS (
    -- 1단계: 정확한 지번 매칭
    SELECT c.*, 'exact'::text AS m_mode, NULL::text AS m_jibun
    FROM kepco_capa c
    JOIN matched_addr ma ON ma.id = c.addr_id
    WHERE c.addr_jibun = p_jibun
  ),
  -- 같은 리 안의 같은 군(산/일반) 후보
  same_group AS (
    SELECT c.*
    FROM kepco_capa c
    JOIN matched_addr ma ON ma.id = c.addr_id
    WHERE NOT EXISTS (SELECT 1 FROM exact_match)
      AND (c.addr_jibun LIKE '산%') = v_input_is_san
      AND kepco_jibun_main(c.addr_jibun) IS NOT NULL
      AND v_input_main IS NOT NULL
  ),
  -- 본번 거리 최소 지번 1개 선정
  nearest_pick AS (
    SELECT sg.addr_jibun AS pick_jibun
    FROM same_group sg
    ORDER BY ABS(kepco_jibun_main(sg.addr_jibun) - v_input_main), sg.addr_jibun
    LIMIT 1
  ),
  nearest_match AS (
    SELECT c.*, 'nearest_jibun'::text AS m_mode, np.pick_jibun AS m_jibun
    FROM kepco_capa c
    JOIN matched_addr ma ON ma.id = c.addr_id
    JOIN nearest_pick np ON np.pick_jibun = c.addr_jibun
  ),
  chosen AS (
    SELECT * FROM exact_match
    UNION ALL
    SELECT * FROM nearest_match
  )
  SELECT
    ch.id,
    a.addr_do, a.addr_si, a.addr_gu, a.addr_dong, a.addr_li,
    ch.addr_jibun,
    a.geocode_address,
    a.lat, a.lng,
    ch.subst_nm, ch.mtr_no, ch.dl_nm,
    ch.subst_capa, ch.subst_pwr, ch.g_subst_capa,
    ch.mtr_capa, ch.mtr_pwr, ch.g_mtr_capa,
    ch.dl_capa, ch.dl_pwr, ch.g_dl_capa,
    ch.step1_cnt, ch.step1_pwr, ch.step2_cnt, ch.step2_pwr,
    ch.step3_cnt, ch.step3_pwr,
    ch.updated_at,
    ch.m_mode,
    ch.m_jibun
  FROM chosen ch
  JOIN kepco_addr a ON a.id = ch.addr_id
  ORDER BY ch.subst_nm, ch.mtr_no, ch.dl_nm;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_capa_by_jibun IS
  '지번 단위 KEPCO 여유용량 조회. 1) 정확 매칭 2) 같은 리 안 같은 군(산/일반) 본번 거리 최소 지번 1개. nearest_jibun 컬럼에 실제 사용된 지번 반환. 1차 1단계 필지 클릭 카드용.';
