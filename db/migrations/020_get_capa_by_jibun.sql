-- ══════════════════════════════════════════════
-- 020: 지번 단위 여유용량 조회 RPC (1차 1단계 — 필지 클릭 정보 카드용)
-- ══════════════════════════════════════════════
-- 용도: 지도 클릭 → VWorld 필지 조회 → 그 지번의 KEPCO 여유용량 반환
--
-- 매칭 정책 (3단계 fallback):
--   1) 정확한 지번 매칭 (addr_do+addr_gu+addr_dong+addr_li+addr_jibun)
--   2) 같은 리 내 모든 행 (지번 매칭 실패 시, 리 대표값으로)
--   3) 0행 (리 자체 없음 = "데이터 없음")
--
-- 응답 구조는 get_location_detail 과 동일하게 유지 (재활용 + 일관성).
-- 추가로 match_mode 컬럼: 'exact' / 'li_fallback' / (없으면 0행)
-- ══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_capa_by_jibun(
  p_ctp_nm TEXT,  -- 시도 ("서울특별시")
  p_sig_nm TEXT,  -- 시군구 ("강남구")
  p_emd_nm TEXT,  -- 읍면동 ("삼성동")
  p_li_nm  TEXT,  -- 리 ("" or "대흥리")
  p_jibun  TEXT   -- 지번 ("148-11")
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
  match_mode text  -- 'exact' or 'li_fallback'
) AS $$
  WITH matched_addr AS (
    -- 주소 매칭 (시도+시군구+읍면동+리)
    SELECT id
    FROM kepco_addr
    WHERE addr_do = p_ctp_nm
      AND addr_gu = p_sig_nm
      AND addr_dong = p_emd_nm
      AND COALESCE(addr_li, '') = COALESCE(p_li_nm, '')
    LIMIT 1
  ),
  exact_match AS (
    -- 1단계: 정확한 지번 매칭
    SELECT c.*, 'exact'::text AS match_mode
    FROM kepco_capa c
    JOIN matched_addr ma ON ma.id = c.addr_id
    WHERE c.addr_jibun = p_jibun
  ),
  li_fallback AS (
    -- 2단계: 리 내 모든 행 (exact 가 0건일 때만)
    SELECT c.*, 'li_fallback'::text AS match_mode
    FROM kepco_capa c
    JOIN matched_addr ma ON ma.id = c.addr_id
    WHERE NOT EXISTS (SELECT 1 FROM exact_match)
  ),
  chosen AS (
    SELECT * FROM exact_match
    UNION ALL
    SELECT * FROM li_fallback
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
    ch.match_mode
  FROM chosen ch
  JOIN kepco_addr a ON a.id = ch.addr_id
  ORDER BY ch.addr_jibun, ch.subst_nm, ch.mtr_no, ch.dl_nm;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_capa_by_jibun IS
  '지번 단위 KEPCO 여유용량 조회. 1) 정확한 지번 매칭 2) 실패 시 리 단위 fallback. 1차 1단계 필지 클릭 카드용.';
