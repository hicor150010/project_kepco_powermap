-- ══════════════════════════════════════════════
-- 024: search_kepco 폴백(Phase 2-2) 최적화
-- ══════════════════════════════════════════════
-- 배경:
--   023 적용 후에도 "키워드+지번" 검색 (예: "대흥리 517-9") 이 2.5~3.3초 소요.
--   원인 — 정확 매칭 0건 → 폴백 실행 → 4초 걸림.
--
--   폴백 쿼리 EXPLAIN 확인:
--     Index Scan idx_capa_jibun_main ... rows=1,375,435  (3718ms)
--     `kepco_jibun_main(...) IS NOT NULL` 조건만 있어 거의 모든 행 스캔
--     + ABS(...) 정렬을 위해 top-N heapsort
--
-- 해결:
--   폴백에서 `matched_addr CTE` 로 addr 먼저 좁힘.
--   Nested Loop with idx_capa_addr_id → 1626행만 처리.
--   실측: 4014ms → 209ms (19배).
--
-- 정확 매칭 (Phase 2-1) 은 기존 유지:
--   idx_capa_jibun_main 으로 `= lot_no` 특정 본번 잡아 빠름 (155ms).
-- ══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_kepco(
  keywords TEXT[],
  lot_no   INTEGER DEFAULT NULL,
  ri_limit INTEGER DEFAULT 20,
  ji_limit INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  ri_result   JSONB;
  ji_result   JSONB;
  ji_count    INTEGER := 0;
  is_fallback BOOLEAN := FALSE;
BEGIN
  IF keywords IS NULL OR array_length(keywords, 1) IS NULL THEN
    RETURN jsonb_build_object('ri', '[]'::jsonb, 'ji', '[]'::jsonb, 'ji_fallback', false);
  END IF;

  -- ─────────────────────────────────────────────
  -- Phase 1: 리 단위 그룹 — kepco_map_summary MV 재활용
  -- ─────────────────────────────────────────────
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO ri_result
  FROM (
    SELECT
      m.addr_do, m.addr_si, m.addr_gu, m.addr_dong, m.addr_li,
      m.geocode_address,
      m.total::int AS cnt,
      m.lat, m.lng
    FROM kepco_map_summary m
    WHERE (
      SELECT bool_and(
        COALESCE(m.addr_do,'')   ILIKE '%' || kw || '%'
     OR COALESCE(m.addr_si,'')   ILIKE '%' || kw || '%'
     OR COALESCE(m.addr_gu,'')   ILIKE '%' || kw || '%'
     OR COALESCE(m.addr_dong,'') ILIKE '%' || kw || '%'
     OR COALESCE(m.addr_li,'')   ILIKE '%' || kw || '%'
      )
      FROM unnest(keywords) AS kw
    )
    ORDER BY m.total DESC
    LIMIT ri_limit
  ) t;

  -- ─────────────────────────────────────────────
  -- Phase 2: 지번 단위 결과 (lot_no 있을 때만)
  -- ─────────────────────────────────────────────
  IF lot_no IS NOT NULL THEN
    -- 2-1) 정확 매칭 — idx_capa_jibun_main 으로 특정 본번 인덱스 탐색
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb), COUNT(*)::int
    INTO ji_result, ji_count
    FROM (
      SELECT
        c.id, a.addr_do, a.addr_si, a.addr_gu, a.addr_dong, a.addr_li,
        c.addr_jibun, a.geocode_address, a.lat, a.lng,
        c.subst_nm, c.mtr_no, c.dl_nm,
        c.subst_capa, c.subst_pwr, c.g_subst_capa,
        c.mtr_capa, c.mtr_pwr, c.g_mtr_capa,
        c.dl_capa, c.dl_pwr, c.g_dl_capa,
        c.step1_cnt, c.step1_pwr, c.step2_cnt, c.step2_pwr,
        c.step3_cnt, c.step3_pwr,
        c.updated_at
      FROM kepco_capa c
      JOIN kepco_addr a ON a.id = c.addr_id
      WHERE (
        SELECT bool_and(
          COALESCE(a.addr_do,'')   ILIKE '%' || kw || '%'
       OR COALESCE(a.addr_si,'')   ILIKE '%' || kw || '%'
       OR COALESCE(a.addr_gu,'')   ILIKE '%' || kw || '%'
       OR COALESCE(a.addr_dong,'') ILIKE '%' || kw || '%'
       OR COALESCE(a.addr_li,'')   ILIKE '%' || kw || '%'
        )
        FROM unnest(keywords) AS kw
      )
      AND kepco_jibun_main(c.addr_jibun) = lot_no
      ORDER BY a.addr_do, a.addr_gu, a.addr_dong, a.addr_li,
               c.subst_nm, c.mtr_no, c.dl_nm
      LIMIT ji_limit
    ) r;

    -- 2-2) 정확 매칭 0건이면 근접 본번 폴백 (addr 먼저 좁힘)
    IF ji_count = 0 THEN
      is_fallback := TRUE;

      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      INTO ji_result
      FROM (
        WITH matched_addr AS (
          SELECT a.id
          FROM kepco_addr a
          WHERE (
            SELECT bool_and(
              COALESCE(a.addr_do,'')   ILIKE '%' || kw || '%'
           OR COALESCE(a.addr_si,'')   ILIKE '%' || kw || '%'
           OR COALESCE(a.addr_gu,'')   ILIKE '%' || kw || '%'
           OR COALESCE(a.addr_dong,'') ILIKE '%' || kw || '%'
           OR COALESCE(a.addr_li,'')   ILIKE '%' || kw || '%'
            )
            FROM unnest(keywords) AS kw
          )
        )
        SELECT
          c.id, a.addr_do, a.addr_si, a.addr_gu, a.addr_dong, a.addr_li,
          c.addr_jibun, a.geocode_address, a.lat, a.lng,
          c.subst_nm, c.mtr_no, c.dl_nm,
          c.subst_capa, c.subst_pwr, c.g_subst_capa,
          c.mtr_capa, c.mtr_pwr, c.g_mtr_capa,
          c.dl_capa, c.dl_pwr, c.g_dl_capa,
          c.step1_cnt, c.step1_pwr, c.step2_cnt, c.step2_pwr,
          c.step3_cnt, c.step3_pwr,
          c.updated_at
        FROM kepco_capa c
        JOIN kepco_addr a ON a.id = c.addr_id
        WHERE c.addr_id IN (SELECT id FROM matched_addr)
          AND kepco_jibun_main(c.addr_jibun) IS NOT NULL
        ORDER BY ABS(kepco_jibun_main(c.addr_jibun) - lot_no), c.addr_jibun
        LIMIT ji_limit
      ) r;
    END IF;
  ELSE
    ji_result := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ri', ri_result,
    'ji', ji_result,
    'ji_fallback', is_fallback
  );
END;
$$;

COMMENT ON FUNCTION search_kepco IS
  '주소/지번 통합 검색. Phase 1 MV / Phase 2-1 idx_capa_jibun_main / Phase 2-2 matched_addr CTE (2026-04-22).';
