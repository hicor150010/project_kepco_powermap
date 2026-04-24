-- ══════════════════════════════════════════════
-- 035: search_kepco RPC 복원 (Phase 2 구조)
-- ══════════════════════════════════════════════
-- 배경:
--   031 (kepco_capa bjd 전환) 에서 옛 search_kepco DROP. 이후 미복원으로
--   /api/search 가 "Could not find function" 500 에러 상태.
--
-- 옛 구조 (024) 와 차이:
--   - kepco_addr JOIN → bjd_master JOIN (addr_id 컬럼 폐기됨)
--   - 매칭 키: c.addr_id = a.id  →  c.bjd_code = b.bjd_code
--   - JOIN 대상 컬럼: a.addr_do/li/geocode_address/lat/lng → b.sep_1~5/lat/lng
--   - ji 응답에 주소/좌표 미포함 (KepcoCapaRow raw). 주소/좌표는 클라이언트 enrichment
--     (Sidebar.tsx → enrichKepcoCapaRowsWithVillageInfo) 가 합성.
--
-- 시그니처는 동일: search_kepco(keywords TEXT[], lot_no INT, ri_limit INT, ji_limit INT)
--   응답 JSONB { ri, ji, ji_fallback }
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
  -- Phase 1: 리 단위 그룹 — kepco_map_summary MV
  --   MV 가 이미 addr_do/si/gu/dong/li 컬럼 보유 (정규화 후에도 동일)
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
  --   응답: kepco_capa raw row (KepcoDataRow). 주소/좌표는 클라이언트 enrichment.
  -- ─────────────────────────────────────────────
  IF lot_no IS NOT NULL THEN
    -- 2-1) 정확 매칭 — kepco_jibun_main(addr_jibun) = lot_no
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb), COUNT(*)::int
    INTO ji_result, ji_count
    FROM (
      SELECT
        c.id, c.bjd_code, c.addr_jibun,
        c.subst_nm, c.mtr_no, c.dl_nm,
        c.subst_capa, c.subst_pwr, c.g_subst_capa,
        c.mtr_capa, c.mtr_pwr, c.g_mtr_capa,
        c.dl_capa, c.dl_pwr, c.g_dl_capa,
        c.step1_cnt, c.step1_pwr, c.step2_cnt, c.step2_pwr,
        c.step3_cnt, c.step3_pwr,
        c.updated_at
      FROM kepco_capa c
      JOIN bjd_master b ON b.bjd_code = c.bjd_code
      WHERE c.bjd_code <> '0000000000'
        AND (
          SELECT bool_and(
            COALESCE(b.sep_1,'') ILIKE '%' || kw || '%'
         OR COALESCE(b.sep_2,'') ILIKE '%' || kw || '%'
         OR COALESCE(b.sep_3,'') ILIKE '%' || kw || '%'
         OR COALESCE(b.sep_4,'') ILIKE '%' || kw || '%'
         OR COALESCE(b.sep_5,'') ILIKE '%' || kw || '%'
          )
          FROM unnest(keywords) AS kw
        )
        AND kepco_jibun_main(c.addr_jibun) = lot_no
      ORDER BY b.sep_1, b.sep_3, b.sep_4, b.sep_5,
               c.subst_nm, c.mtr_no, c.dl_nm
      LIMIT ji_limit
    ) r;

    -- 2-2) 정확 매칭 0건이면 근접 본번 폴백 (matched bjd 먼저 좁힘)
    IF ji_count = 0 THEN
      is_fallback := TRUE;

      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      INTO ji_result
      FROM (
        WITH matched_bjd AS (
          SELECT b.bjd_code
          FROM bjd_master b
          WHERE (
            SELECT bool_and(
              COALESCE(b.sep_1,'') ILIKE '%' || kw || '%'
           OR COALESCE(b.sep_2,'') ILIKE '%' || kw || '%'
           OR COALESCE(b.sep_3,'') ILIKE '%' || kw || '%'
           OR COALESCE(b.sep_4,'') ILIKE '%' || kw || '%'
           OR COALESCE(b.sep_5,'') ILIKE '%' || kw || '%'
            )
            FROM unnest(keywords) AS kw
          )
        )
        SELECT
          c.id, c.bjd_code, c.addr_jibun,
          c.subst_nm, c.mtr_no, c.dl_nm,
          c.subst_capa, c.subst_pwr, c.g_subst_capa,
          c.mtr_capa, c.mtr_pwr, c.g_mtr_capa,
          c.dl_capa, c.dl_pwr, c.g_dl_capa,
          c.step1_cnt, c.step1_pwr, c.step2_cnt, c.step2_pwr,
          c.step3_cnt, c.step3_pwr,
          c.updated_at
        FROM kepco_capa c
        WHERE c.bjd_code IN (SELECT bjd_code FROM matched_bjd)
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
  'Phase 2 구조: bjd_master JOIN + kepco_map_summary MV. 응답 ji 는 KepcoCapaRow raw (클라이언트 enrichment).';
