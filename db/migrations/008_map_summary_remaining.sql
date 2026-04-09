-- ============================================================
-- 008_map_summary_remaining.sql — kepco_map_summary 에 잔여 용량 추가
-- 작성: 2026-04-08
--
-- 목적:
--   썬캐쉬하우스 사용자(태양광 사업자)는 "이 마을에 최대 몇 kW까지
--   들어갈 수 있는가"가 가장 중요한 정보다.
--   각 마을이 연결된 시설들의 잔여(기준 - 접수)를 시설 종류별로
--   계산하고, 그중 최대값을 max_remaining_kw 로 보관한다.
--
-- 정의:
--   - 시설별 잔여 = MAX(capa - pwr)  (한 마을 안에서 가장 큰 시설 잔여)
--   - max_remaining_kw = 세 시설 잔여 중 가장 큰 값
--     → "이 마을에서 잡을 수 있는 가장 큰 발전 용량" 의 직관적 근사치
--
-- ⚠️ DROP/CREATE 방식이라 기존 인덱스도 함께 재생성한다.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS kepco_map_summary;

CREATE MATERIALIZED VIEW kepco_map_summary AS
SELECT
  geocode_address,
  MAX(lat) AS lat,
  MAX(lng) AS lng,
  COUNT(*) AS total,
  SUM(CASE WHEN vol_subst <> '여유용량 있음' THEN 1 ELSE 0 END) AS subst_no_cap,
  SUM(CASE WHEN vol_mtr   <> '여유용량 있음' THEN 1 ELSE 0 END) AS mtr_no_cap,
  SUM(CASE WHEN vol_dl    <> '여유용량 있음' THEN 1 ELSE 0 END) AS dl_no_cap,
  MAX(addr_do)   AS addr_do,
  MAX(addr_si)   AS addr_si,
  MAX(addr_gu)   AS addr_gu,
  MAX(addr_dong) AS addr_dong,
  MAX(addr_li)   AS addr_li,
  ARRAY_AGG(DISTINCT subst_nm) FILTER (WHERE subst_nm IS NOT NULL AND subst_nm <> '') AS subst_names,
  ARRAY_AGG(DISTINCT dl_nm)    FILTER (WHERE dl_nm    IS NOT NULL AND dl_nm    <> '') AS dl_names,
  -- 시설별 잔여 (kW) — 마을 안 가장 큰 시설 단일값
  GREATEST(0, COALESCE(MAX(COALESCE(subst_capa, 0) - COALESCE(subst_pwr, 0)), 0))::bigint AS subst_remaining_kw,
  GREATEST(0, COALESCE(MAX(COALESCE(mtr_capa,   0) - COALESCE(mtr_pwr,   0)), 0))::bigint AS mtr_remaining_kw,
  GREATEST(0, COALESCE(MAX(COALESCE(dl_capa,    0) - COALESCE(dl_pwr,    0)), 0))::bigint AS dl_remaining_kw,
  -- 종합 — 세 시설 중 가장 큰 잔여 (사업 가능 최대치 직관 표현)
  GREATEST(
    GREATEST(0, COALESCE(MAX(COALESCE(subst_capa, 0) - COALESCE(subst_pwr, 0)), 0)),
    GREATEST(0, COALESCE(MAX(COALESCE(mtr_capa,   0) - COALESCE(mtr_pwr,   0)), 0)),
    GREATEST(0, COALESCE(MAX(COALESCE(dl_capa,    0) - COALESCE(dl_pwr,    0)), 0))
  )::bigint AS max_remaining_kw
FROM kepco_data
WHERE lat IS NOT NULL
GROUP BY geocode_address;

-- CONCURRENTLY REFRESH를 위해 UNIQUE INDEX 필수
CREATE UNIQUE INDEX idx_summary_address ON kepco_map_summary (geocode_address);
CREATE INDEX idx_summary_latlng         ON kepco_map_summary (lat, lng);
-- TOP N 정렬용 (잔여 용량 큰 순)
CREATE INDEX idx_summary_remaining_desc ON kepco_map_summary (max_remaining_kw DESC);

COMMENT ON MATERIALIZED VIEW kepco_map_summary IS
  '지도 마커용 리 단위 집계 + 잔여 용량 (썬캐쉬하우스 사업성 평가용). 업로드 후 REFRESH MATERIALIZED VIEW CONCURRENTLY 호출.';
