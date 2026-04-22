-- ══════════════════════════════════════════════
-- 025: get_capa_by_jibun 주소 매칭 완화 — VWorld/KEPCO 체계 흡수
-- ══════════════════════════════════════════════
-- 버그:
--   지도 클릭 (좌표→VWorld→RPC) 와 검색 클릭 (row→RPC) 이 같은 지번인데
--   결과가 다름. 지도 클릭은 "데이터 없음", 검색 클릭은 정상.
--
-- 원인:
--   KEPCO API 규칙상 특정 행은 `addr_gu="-기타지역"` 로 저장되고 실제 시군구는
--   `addr_si` 로 들어감. 예:
--     DB: addr_do=제주특별자치도, addr_si=서귀포시, addr_gu=-기타지역,
--         addr_dong=성산읍, addr_li=시흥리
--     VWorld: ctp_nm=제주특별자치도, sig_nm=서귀포시, emd_nm=성산읍, li_nm=시흥리
--   RPC 가 `addr_gu = p_sig_nm` 으로만 매칭 → 지도 클릭(sig_nm=서귀포시) 실패.
--
-- 해결:
--   `addr_gu = p_sig_nm OR addr_si = p_sig_nm` 으로 완화.
--   (addr_do + addr_dong + addr_li + addr_jibun 이 같으면 유일하므로 오매칭 0)
--
-- 이로써 두 진입점(/api/parcel, /api/parcel-by-address) 모두 RPC 한 곳에서
-- 흡수. 진입점별 주소 정규화 분기 불필요.
-- ══════════════════════════════════════════════

DROP FUNCTION IF EXISTS get_capa_by_jibun(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_capa_by_jibun(
  p_ctp_nm TEXT,
  p_sig_nm TEXT,
  p_emd_nm TEXT,
  p_li_nm  TEXT,
  p_jibun  TEXT
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
  match_mode text,
  nearest_jibun text
) AS $$
DECLARE
  v_input_is_san BOOLEAN := (p_jibun LIKE '산%');
  v_input_main   INTEGER := kepco_jibun_main(p_jibun);
BEGIN
  RETURN QUERY
  WITH matched_addr AS (
    -- 주소 매칭 완화 — addr_gu 또는 addr_si 어느 쪽이든 p_sig_nm 과 일치 허용.
    -- KEPCO DB 규칙상 addr_si/addr_gu 중 하나만 실제 명, 나머지는 "-기타지역".
    -- 이론적 오매칭 0, 안전을 위해 addr_gu 정확 매칭을 우선으로 정렬.
    SELECT a.id
    FROM kepco_addr a
    WHERE a.addr_do = p_ctp_nm
      AND (a.addr_gu = p_sig_nm OR a.addr_si = p_sig_nm)
      AND a.addr_dong = p_emd_nm
      AND COALESCE(a.addr_li, '') = COALESCE(p_li_nm, '')
    ORDER BY
      CASE WHEN a.addr_gu = p_sig_nm THEN 0 ELSE 1 END,
      a.id
    LIMIT 1
  ),
  exact_match AS (
    SELECT c.*, 'exact'::text AS m_mode, NULL::text AS m_jibun
    FROM kepco_capa c
    JOIN matched_addr ma ON ma.id = c.addr_id
    WHERE c.addr_jibun = p_jibun
  ),
  same_group AS (
    SELECT c.*
    FROM kepco_capa c
    JOIN matched_addr ma ON ma.id = c.addr_id
    WHERE NOT EXISTS (SELECT 1 FROM exact_match)
      AND (c.addr_jibun LIKE '산%') = v_input_is_san
      AND kepco_jibun_main(c.addr_jibun) IS NOT NULL
      AND v_input_main IS NOT NULL
  ),
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
  '지번 단위 여유용량. 시군구는 addr_gu 또는 addr_si 중 어느 쪽이든 매칭(2026-04-22 fix: VWorld sig_nm 과 KEPCO -기타지역 규칙 흡수).';
