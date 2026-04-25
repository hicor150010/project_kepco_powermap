-- ══════════════════════════════════════════════
-- 039: search_kepco RPC — smart fallback (성능 + UX)
-- ══════════════════════════════════════════════
-- 배경 (2026-04-25):
--   "직리 457" 처럼 흔한 리명 + 없는 본번 검색 시 폴백 쿼리가 8초 timeout 초과.
--   원인: matched_bjd 가 전국 직리 100여개 → 그 안 kepco_capa 수만 row →
--         ORDER BY ABS(kepco_jibun_main - lot_no) 가 모든 row 함수 평가 + 정렬.
--
-- 변경점:
--   1. matched_bjd 를 ARRAY 로 1회만 계산 → bjd_master ILIKE 풀 스캔 1번만
--   2. matched_bjd 가드 — 30개 초과면 폴백 차단 (too_broad 플래그)
--   3. 폴백 — CTE 분리(materialized 위험) 제거, lower5/upper5 가 직접 kepco_capa 조회
--      → 표현식 인덱스(idx_capa_jibun_main, 022) 활용으로 인덱스 스캔 가능
--   4. ji_limit 기본 30 → 10 (UX + egress 절감)
--
-- 응답 schema 변경:
--   기존: { ri, ji, ji_fallback }
--   신규: { ri, ji, ji_fallback, too_broad }
-- ══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_kepco(
  keywords TEXT[],
  lot_no   INTEGER DEFAULT NULL,
  ri_limit INTEGER DEFAULT 20,
  ji_limit INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  ri_result          JSONB;
  ji_result          JSONB := '[]'::jsonb;
  ji_count           INTEGER := 0;
  is_fallback        BOOLEAN := FALSE;
  too_broad          BOOLEAN := FALSE;
  matched_bjd_arr    TEXT[];
  matched_bjd_count  INTEGER;
  -- matched_bjd 임계치. 이보다 많으면 사용자 입력이 너무 광범위.
  -- "직리" 단독 같은 케이스가 차단됨. 시/군 추가하면 통과.
  bjd_threshold      CONSTANT INTEGER := 30;
BEGIN
  IF keywords IS NULL OR array_length(keywords, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ri', '[]'::jsonb,
      'ji', '[]'::jsonb,
      'ji_fallback', false,
      'too_broad', false
    );
  END IF;

  -- ─────────────────────────────────────────────
  -- Phase 1: 리 단위 그룹 — kepco_map_summary MV
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
  -- Phase 2: 지번 단위 (lot_no 있을 때만)
  -- ─────────────────────────────────────────────
  IF lot_no IS NOT NULL THEN

    -- matched_bjd 를 ARRAY 로 1회 계산 (bjd_master ILIKE 풀 스캔 1번)
    SELECT ARRAY_AGG(b.bjd_code) INTO matched_bjd_arr
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
    );
    matched_bjd_count := COALESCE(array_length(matched_bjd_arr, 1), 0);

    -- 매칭 0건 → 즉시 종료
    IF matched_bjd_count = 0 THEN
      RETURN jsonb_build_object(
        'ri', ri_result,
        'ji', '[]'::jsonb,
        'ji_fallback', false,
        'too_broad', false
      );
    END IF;

    -- 2-1) 정확 매칭 — kepco_jibun_main = lot_no
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
      WHERE c.bjd_code = ANY(matched_bjd_arr)
        AND kepco_jibun_main(c.addr_jibun) = lot_no
      ORDER BY b.sep_1, b.sep_3, b.sep_4, b.sep_5,
               c.subst_nm, c.mtr_no, c.dl_nm
      LIMIT ji_limit
    ) r;

    -- 2-2) 정확 매칭 0건 → 가드 후 폴백
    IF ji_count = 0 THEN
      IF matched_bjd_count > bjd_threshold THEN
        -- 너무 광범위 → 폴백 안 함, 사용자에게 안내
        too_broad := TRUE;
      ELSE
        -- 폴백: lot_no 양쪽 5개씩
        -- lower5/upper5 가 직접 kepco_capa 조회 → 인덱스 스캔 (idx_capa_jibun_main)
        is_fallback := TRUE;

        SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
        INTO ji_result
        FROM (
          WITH lower5 AS (
            SELECT
              c.id, c.bjd_code, c.addr_jibun,
              c.subst_nm, c.mtr_no, c.dl_nm,
              c.subst_capa, c.subst_pwr, c.g_subst_capa,
              c.mtr_capa, c.mtr_pwr, c.g_mtr_capa,
              c.dl_capa, c.dl_pwr, c.g_dl_capa,
              c.step1_cnt, c.step1_pwr, c.step2_cnt, c.step2_pwr,
              c.step3_cnt, c.step3_pwr,
              c.updated_at,
              kepco_jibun_main(c.addr_jibun) AS main
            FROM kepco_capa c
            WHERE c.bjd_code = ANY(matched_bjd_arr)
              AND kepco_jibun_main(c.addr_jibun) IS NOT NULL
              AND kepco_jibun_main(c.addr_jibun) <= lot_no
            ORDER BY kepco_jibun_main(c.addr_jibun) DESC, c.addr_jibun
            LIMIT 5
          ),
          upper5 AS (
            SELECT
              c.id, c.bjd_code, c.addr_jibun,
              c.subst_nm, c.mtr_no, c.dl_nm,
              c.subst_capa, c.subst_pwr, c.g_subst_capa,
              c.mtr_capa, c.mtr_pwr, c.g_mtr_capa,
              c.dl_capa, c.dl_pwr, c.g_dl_capa,
              c.step1_cnt, c.step1_pwr, c.step2_cnt, c.step2_pwr,
              c.step3_cnt, c.step3_pwr,
              c.updated_at,
              kepco_jibun_main(c.addr_jibun) AS main
            FROM kepco_capa c
            WHERE c.bjd_code = ANY(matched_bjd_arr)
              AND kepco_jibun_main(c.addr_jibun) IS NOT NULL
              AND kepco_jibun_main(c.addr_jibun) > lot_no
            ORDER BY kepco_jibun_main(c.addr_jibun) ASC, c.addr_jibun
            LIMIT 5
          )
          SELECT
            id, bjd_code, addr_jibun,
            subst_nm, mtr_no, dl_nm,
            subst_capa, subst_pwr, g_subst_capa,
            mtr_capa, mtr_pwr, g_mtr_capa,
            dl_capa, dl_pwr, g_dl_capa,
            step1_cnt, step1_pwr, step2_cnt, step2_pwr,
            step3_cnt, step3_pwr,
            updated_at
          FROM (
            SELECT * FROM lower5
            UNION ALL
            SELECT * FROM upper5
          ) merged
          ORDER BY ABS(main - lot_no), addr_jibun
        ) t;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ri', ri_result,
    'ji', ji_result,
    'ji_fallback', is_fallback,
    'too_broad', too_broad
  );
END;
$$;

COMMENT ON FUNCTION search_kepco IS
  'smart fallback v2: matched_bjd ARRAY 캐싱 + lower5/upper5 직접 조회(인덱스 활용)';
