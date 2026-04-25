-- ══════════════════════════════════════════════
-- 036: get_location_summary RPC — 마커 클릭 카드용 집계
-- ══════════════════════════════════════════════
-- 입력:  p_bjd_code (행안부 법정동코드 10자리)
-- 출력:  total + 시설별 (변전소/주변압기/배전선로) 여유·부족 카운트
--
-- 배경:
--   기존 get_location_detail 은 마을 전체 행 (평균 383, P90 643, max 1524) 을
--   raw 로 반환 → 마커 클릭당 gzip 30KB. 카드는 시설별 비율 6개 숫자만 필요한데
--   raw 1500행을 받는 것은 명백한 낭비. 이 RPC 는 카드 전용 집계만 반환한다.
--
-- 흐름:
--   마을 마커 클릭 → get_location_summary (이 함수, ~80 bytes)
--   "상세 보기" 클릭 → get_location_detail (raw rows, 기존 그대로)
--
-- 여유 판정 (kepco_vol_formula):
--   여유 = (capa - pwr > 0) AND (capa - g_capa > 0)
--   부족 = NOT 여유
--   NULL 은 0 으로 취급 → 모든 행은 무조건 avail OR short 둘 중 하나.
-- ══════════════════════════════════════════════

DROP FUNCTION IF EXISTS get_location_summary(char);
DROP FUNCTION IF EXISTS get_location_summary(text);

CREATE OR REPLACE FUNCTION get_location_summary(p_bjd_code char(10))
RETURNS TABLE (
  total       int,
  subst_avail int,
  subst_short int,
  mtr_avail   int,
  mtr_short   int,
  dl_avail    int,
  dl_short    int
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COUNT(*)::int AS total,

    COUNT(*) FILTER (
      WHERE COALESCE(subst_capa, 0) - COALESCE(subst_pwr, 0)    > 0
        AND COALESCE(subst_capa, 0) - COALESCE(g_subst_capa, 0) > 0
    )::int AS subst_avail,
    COUNT(*) FILTER (
      WHERE NOT (
        COALESCE(subst_capa, 0) - COALESCE(subst_pwr, 0)    > 0
        AND COALESCE(subst_capa, 0) - COALESCE(g_subst_capa, 0) > 0
      )
    )::int AS subst_short,

    COUNT(*) FILTER (
      WHERE COALESCE(mtr_capa, 0) - COALESCE(mtr_pwr, 0)    > 0
        AND COALESCE(mtr_capa, 0) - COALESCE(g_mtr_capa, 0) > 0
    )::int AS mtr_avail,
    COUNT(*) FILTER (
      WHERE NOT (
        COALESCE(mtr_capa, 0) - COALESCE(mtr_pwr, 0)    > 0
        AND COALESCE(mtr_capa, 0) - COALESCE(g_mtr_capa, 0) > 0
      )
    )::int AS mtr_short,

    COUNT(*) FILTER (
      WHERE COALESCE(dl_capa, 0) - COALESCE(dl_pwr, 0)    > 0
        AND COALESCE(dl_capa, 0) - COALESCE(g_dl_capa, 0) > 0
    )::int AS dl_avail,
    COUNT(*) FILTER (
      WHERE NOT (
        COALESCE(dl_capa, 0) - COALESCE(dl_pwr, 0)    > 0
        AND COALESCE(dl_capa, 0) - COALESCE(g_dl_capa, 0) > 0
      )
    )::int AS dl_short

  FROM kepco_capa
  WHERE bjd_code = p_bjd_code;
$$;

GRANT EXECUTE ON FUNCTION get_location_summary(char) TO authenticated;

COMMENT ON FUNCTION get_location_summary(char) IS
  '마커 클릭 카드용 — 마을(bjd_code) 의 시설별 여유·부족 집계 1행 반환. raw rows 는 get_location_detail 사용.';
