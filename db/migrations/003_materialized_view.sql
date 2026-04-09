-- ============================================================
-- 003_materialized_view.sql — 지도용 Light 집계 뷰
-- ============================================================
-- 리(geocode_address) 단위로 집계하여 지도 마커 데이터 생성
-- 업로드 후 REFRESH MATERIALIZED VIEW CONCURRENTLY 호출 필요
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
  ARRAY_AGG(DISTINCT dl_nm)    FILTER (WHERE dl_nm    IS NOT NULL AND dl_nm    <> '') AS dl_names
FROM kepco_data
WHERE lat IS NOT NULL
GROUP BY geocode_address;

-- CONCURRENTLY REFRESH를 위해 UNIQUE INDEX 필수
CREATE UNIQUE INDEX idx_summary_address ON kepco_map_summary (geocode_address);
CREATE INDEX idx_summary_latlng         ON kepco_map_summary (lat, lng);

COMMENT ON MATERIALIZED VIEW kepco_map_summary IS '지도 마커용 리 단위 집계. 업로드 후 REFRESH MATERIALIZED VIEW CONCURRENTLY 호출.';
