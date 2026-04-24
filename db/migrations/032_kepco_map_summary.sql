-- ══════════════════════════════════════════════
-- 032: kepco_map_summary MV 재생성 (bjd_master 기반)
-- ══════════════════════════════════════════════
-- 배경:
--   기존 MV (013) 는 kepco_addr JOIN kepco_capa 기반.
--   031 에서 kepco_capa.addr_id → bjd_code 로 전환됨에 따라
--   MV 도 bjd_master JOIN 으로 재구성.
--
-- 핵심 변화:
--   - 좌표/주소 출처: kepco_addr → bjd_master (행안부 99.1% 정확)
--   - PK: geocode_address → bjd_code (외부 API 키 호환)
--   - sentinel 행 (bjd_code='0000000000') 제외 → 지도에 표시 안 됨
--                                                   (별도 점검은 SQL 직쿼리로)
--
-- 컬럼 (웹 호환성 위해 기존 컬럼명 그대로 유지 — 웹 코드 변경 최소화):
--   bjd_code (신규 PK), geocode_address (호환용 동적 생성),
--   lat, lng,
--   addr_do, addr_si, addr_gu, addr_dong, addr_li,
--   total, subst_no_cap, mtr_no_cap, dl_no_cap,
--   subst_remaining_kw, mtr_remaining_kw, dl_remaining_kw, max_remaining_kw,
--   subst_names, dl_names
--
-- 인덱스:
--   UNIQUE (bjd_code)        — REFRESH CONCURRENTLY 필수
--   (lat, lng)               — viewport 영역 검색
--   (max_remaining_kw DESC)  — "잔여 큰 순" 정렬
-- ══════════════════════════════════════════════

DROP MATERIALIZED VIEW IF EXISTS kepco_map_summary;

CREATE MATERIALIZED VIEW kepco_map_summary AS
SELECT
  -- 식별/조인 키
  c.bjd_code,
  CONCAT_WS(' ', b.sep_1, b.sep_2, b.sep_3, b.sep_4, b.sep_5) AS geocode_address,

  -- 위치 (행안부 좌표)
  b.lat,
  b.lng,

  -- 주소 5필드
  b.sep_1 AS addr_do,
  b.sep_2 AS addr_si,
  b.sep_3 AS addr_gu,
  b.sep_4 AS addr_dong,
  b.sep_5 AS addr_li,

  -- 갯수
  COUNT(*)::int AS total,

  -- 여유용량 없음 카운트 (KEPCO 수식 — 기존 013 동일)
  SUM(CASE WHEN (COALESCE(c.subst_capa,0) - COALESCE(c.subst_pwr,0) <= 0)
            OR (COALESCE(c.subst_capa,0) - COALESCE(c.g_subst_capa,0) <= 0)
       THEN 1 ELSE 0 END)::int AS subst_no_cap,
  SUM(CASE WHEN (COALESCE(c.mtr_capa,0) - COALESCE(c.mtr_pwr,0) <= 0)
            OR (COALESCE(c.mtr_capa,0) - COALESCE(c.g_mtr_capa,0) <= 0)
       THEN 1 ELSE 0 END)::int AS mtr_no_cap,
  SUM(CASE WHEN (COALESCE(c.dl_capa,0) - COALESCE(c.dl_pwr,0) <= 0)
            OR (COALESCE(c.dl_capa,0) - COALESCE(c.g_dl_capa,0) <= 0)
       THEN 1 ELSE 0 END)::int AS dl_no_cap,

  -- 시설별 잔여 (kW) — 음수는 0 으로 clamp
  GREATEST(0, COALESCE(MAX(COALESCE(c.subst_capa,0) - COALESCE(c.subst_pwr,0)), 0))::int AS subst_remaining_kw,
  GREATEST(0, COALESCE(MAX(COALESCE(c.mtr_capa,0)   - COALESCE(c.mtr_pwr,0)),   0))::int AS mtr_remaining_kw,
  GREATEST(0, COALESCE(MAX(COALESCE(c.dl_capa,0)    - COALESCE(c.dl_pwr,0)),    0))::int AS dl_remaining_kw,

  -- 종합 잔여 (3 시설 중 최대)
  GREATEST(
    GREATEST(0, COALESCE(MAX(COALESCE(c.subst_capa,0) - COALESCE(c.subst_pwr,0)), 0)),
    GREATEST(0, COALESCE(MAX(COALESCE(c.mtr_capa,0)   - COALESCE(c.mtr_pwr,0)),   0)),
    GREATEST(0, COALESCE(MAX(COALESCE(c.dl_capa,0)    - COALESCE(c.dl_pwr,0)),    0))
  )::int AS max_remaining_kw,

  -- 시설명 array (호버/툴팁용 — DISTINCT + 빈값 필터)
  ARRAY_AGG(DISTINCT c.subst_nm) FILTER (WHERE c.subst_nm IS NOT NULL AND c.subst_nm <> '') AS subst_names,
  ARRAY_AGG(DISTINCT c.dl_nm)    FILTER (WHERE c.dl_nm    IS NOT NULL AND c.dl_nm    <> '') AS dl_names

FROM kepco_capa c
JOIN bjd_master b ON b.bjd_code = c.bjd_code
WHERE c.bjd_code <> '0000000000'   -- sentinel(매칭 실패) 제외
  AND b.lat IS NOT NULL             -- 좌표 없는 bjd_master 행 제외 (마커 표시 불가)
GROUP BY
  c.bjd_code,
  b.sep_1, b.sep_2, b.sep_3, b.sep_4, b.sep_5,
  b.lat, b.lng;

-- ─────────────────────────────────────────────
-- 인덱스 (3개)
-- ─────────────────────────────────────────────

-- REFRESH CONCURRENTLY 필수 — UNIQUE 보장
CREATE UNIQUE INDEX idx_summary_bjd
  ON kepco_map_summary (bjd_code);

-- 지도 viewport 영역 검색
CREATE INDEX idx_summary_xy
  ON kepco_map_summary (lat, lng);

-- "잔여 큰 순" 정렬 가속 (사이드바 TOP 20 등)
CREATE INDEX idx_summary_remaining_desc
  ON kepco_map_summary (max_remaining_kw DESC);

-- ─────────────────────────────────────────────
-- 권한 (013 동일)
-- ─────────────────────────────────────────────

GRANT SELECT ON kepco_map_summary TO authenticated;
REVOKE ALL   ON kepco_map_summary FROM anon;

COMMENT ON MATERIALIZED VIEW kepco_map_summary IS
  '지도 마커용 리 단위 집계 (bjd_master JOIN). 2026-04-24 재구성. sentinel/좌표없음 제외.';
