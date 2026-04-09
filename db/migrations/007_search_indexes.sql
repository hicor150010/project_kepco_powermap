-- ============================================================
-- 007_search_indexes.sql — 주소·지번 검색 성능 인덱스
-- 작성: 2026-04-08
--
-- 화면 하단 검색 패널이 사용한다.
--   1) 리 단위 그룹 검색: addr_li / addr_dong ILIKE 키워드
--   2) 지번 정확/근접 검색: addr_li 일치 + addr_jibun 본번 비교
-- ============================================================

-- ─────────────────────────────────────────────
-- 1) 행정구역별 인덱스 (리·동 단위 그룹 조회)
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kepco_addr_li   ON kepco_data (addr_li);
CREATE INDEX IF NOT EXISTS idx_kepco_addr_dong ON kepco_data (addr_dong);

-- ─────────────────────────────────────────────
-- 2) 부분 일치(ILIKE) 가속용 trigram 인덱스
--    pg_trgm extension 필요
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_kepco_addr_li_trgm
  ON kepco_data USING gin (addr_li gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_kepco_addr_dong_trgm
  ON kepco_data USING gin (addr_dong gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_kepco_addr_gu_trgm
  ON kepco_data USING gin (addr_gu gin_trgm_ops);

-- ─────────────────────────────────────────────
-- 3) 지번 본번 추출 함수 (불변 함수 → 인덱스 가능)
--    "100" → 100, "100-1" → 100, "산100-2" → 100, "산" → NULL
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION kepco_jibun_main(jibun TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(substring(jibun FROM '\d+'), '')::int
$$;

COMMENT ON FUNCTION kepco_jibun_main IS
  '지번 문자열에서 본번(첫 숫자 시퀀스)만 정수로 추출. 없으면 NULL.';

-- ─────────────────────────────────────────────
-- 4) (addr_li, 본번) 함수형 인덱스
--    같은 리 안에서 본번 정렬·근접 검색을 빠르게
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kepco_li_jibun_main
  ON kepco_data (addr_li, kepco_jibun_main(addr_jibun))
  WHERE addr_li IS NOT NULL;

-- ============================================================
-- RPC: search_kepco
--   화면 하단 검색 패널이 사용하는 통합 검색.
--   한 번의 호출로 "리 단위 그룹"과 "지번 단위 행" 두 결과를
--   JSONB로 반환한다.
--
--   인자:
--     keywords  - 행정구역 키워드 배열 (각각 ILIKE OR로 결합)
--     lot_no    - 지번 본번 (NULL이면 지번 검색 생략)
--     ri_limit  - 리 결과 최대 개수 (기본 20)
--     ji_limit  - 지번 결과 최대 개수 (기본 30)
--
--   반환:
--     {
--       "ri":          [ {addr_do, addr_si, addr_gu, addr_dong, addr_li,
--                        cnt, lat, lng}, ... ],
--       "ji":          [ kepco_data row, ... ],
--       "ji_fallback": true|false  -- 정확 매칭 실패 후 근접으로 채웠는지
--     }
-- ============================================================
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
  kw_filter   TEXT;
  ri_result   JSONB;
  ji_result   JSONB;
  ji_count    INTEGER := 0;
  is_fallback BOOLEAN := FALSE;
BEGIN
  -- 키워드가 비어있으면 빈 결과 반환
  IF keywords IS NULL OR array_length(keywords, 1) IS NULL THEN
    RETURN jsonb_build_object('ri', '[]'::jsonb, 'ji', '[]'::jsonb, 'ji_fallback', false);
  END IF;

  -- ─────────────────────────────────────────────
  -- 1) 리 단위 그룹 결과
  --    각 키워드가 do/gu/dong/li 중 어디에든 매칭되어야 함 (AND)
  -- ─────────────────────────────────────────────
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO ri_result
  FROM (
    SELECT
      addr_do,
      addr_si,
      addr_gu,
      addr_dong,
      addr_li,
      COUNT(*)::int AS cnt,
      -- 리 단위 좌표 — 같은 리는 같은 lat/lng 가짐 (geocode_cache가 리 단위)
      MAX(lat) AS lat,
      MAX(lng) AS lng
    FROM kepco_data k
    WHERE (
      SELECT bool_and(
        COALESCE(k.addr_do,'')   ILIKE '%' || kw || '%'
     OR COALESCE(k.addr_si,'')   ILIKE '%' || kw || '%'
     OR COALESCE(k.addr_gu,'')   ILIKE '%' || kw || '%'
     OR COALESCE(k.addr_dong,'') ILIKE '%' || kw || '%'
     OR COALESCE(k.addr_li,'')   ILIKE '%' || kw || '%'
      )
      FROM unnest(keywords) AS kw
    )
    GROUP BY addr_do, addr_si, addr_gu, addr_dong, addr_li
    ORDER BY cnt DESC
    LIMIT ri_limit
  ) t;

  -- ─────────────────────────────────────────────
  -- 2) 지번 단위 결과 (lot_no 있을 때만)
  -- ─────────────────────────────────────────────
  IF lot_no IS NOT NULL THEN
    -- 2-1) 정확 매칭 시도
    SELECT COALESCE(jsonb_agg(row_to_json(k)), '[]'::jsonb), COUNT(*)::int
    INTO ji_result, ji_count
    FROM (
      SELECT *
      FROM kepco_data k
      WHERE (
        SELECT bool_and(
          COALESCE(k.addr_do,'')   ILIKE '%' || kw || '%'
       OR COALESCE(k.addr_si,'')   ILIKE '%' || kw || '%'
       OR COALESCE(k.addr_gu,'')   ILIKE '%' || kw || '%'
       OR COALESCE(k.addr_dong,'') ILIKE '%' || kw || '%'
       OR COALESCE(k.addr_li,'')   ILIKE '%' || kw || '%'
        )
        FROM unnest(keywords) AS kw
      )
      AND kepco_jibun_main(k.addr_jibun) = lot_no
      ORDER BY addr_do, addr_gu, addr_dong, addr_li, subst_nm, mtr_no, dl_nm
      LIMIT ji_limit
    ) k;

    -- 2-2) 정확 매칭이 0건이면 근접 본번으로 폴백
    IF ji_count = 0 THEN
      is_fallback := TRUE;
      SELECT COALESCE(jsonb_agg(row_to_json(k)), '[]'::jsonb)
      INTO ji_result
      FROM (
        SELECT *
        FROM kepco_data k
        WHERE (
          SELECT bool_and(
            COALESCE(k.addr_do,'')   ILIKE '%' || kw || '%'
         OR COALESCE(k.addr_si,'')   ILIKE '%' || kw || '%'
         OR COALESCE(k.addr_gu,'')   ILIKE '%' || kw || '%'
         OR COALESCE(k.addr_dong,'') ILIKE '%' || kw || '%'
         OR COALESCE(k.addr_li,'')   ILIKE '%' || kw || '%'
          )
          FROM unnest(keywords) AS kw
        )
        AND kepco_jibun_main(k.addr_jibun) IS NOT NULL
        ORDER BY ABS(kepco_jibun_main(k.addr_jibun) - lot_no), addr_jibun
        LIMIT ji_limit
      ) k;
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
  '주소·지번 통합 검색. 리 단위 그룹과 지번 단위 행을 한 번에 반환. 지번 정확 매칭 실패 시 같은 키워드 범위 내에서 본번 차이가 가장 작은 행으로 폴백.';
