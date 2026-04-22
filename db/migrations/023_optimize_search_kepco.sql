-- ══════════════════════════════════════════════
-- 023: search_kepco RPC 재작성 — MV 기반 Phase 1
-- ══════════════════════════════════════════════
-- 배경:
--   기존 search_kepco (013_normalize.sql) 의 Phase 1 (리 단위 그룹) 이
--   kepco_capa (137만행) Seq Scan + Hash Join + HashAggregate 로 1.4초 소요.
--   EXPLAIN 확인: capa 전체 스캔이 병목 (1216ms).
--
-- 해결:
--   kepco_map_summary MV 에 이미 같은 집계가 존재.
--     total, addr_do/si/gu/dong/li, geocode_address, lat, lng
--   Phase 1 에서 kepco_capa JOIN 제거 → MV 직접 조회.
--   실측: 1395ms → 125ms (11배 개선).
--
-- Phase 2 (지번 매칭) 는 기존 로직 유지.
--   022 로 idx_capa_jibun_main 추가되어 이미 빠름 (137만 → 1130 행 23ms).
--
-- MV 최신성 주의:
--   kepco_map_summary 는 REFRESH 후에만 반영 → 크롤링/업로드 직후 검색은
--   구버전일 수 있음. 단 이미 지도 마커도 같은 MV 사용, /api/refresh-mv 로
--   동기화되는 기존 파이프라인이 있어 새 이슈 아님.
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
  --   기존 로직 유지. idx_capa_jibun_main (022) 로 가속.
  -- ─────────────────────────────────────────────
  IF lot_no IS NOT NULL THEN
    -- 2-1) 정확 매칭
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

    -- 2-2) 정확 매칭 0건이면 근접 본번 폴백
    IF ji_count = 0 THEN
      is_fallback := TRUE;
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      INTO ji_result
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
  '주소/지번 통합 검색. Phase 1(리 그룹)은 kepco_map_summary MV 활용, Phase 2(지번)은 kepco_capa+idx_capa_jibun_main. (2026-04-22 최적화)';
