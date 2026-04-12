-- ============================================================
-- 013_normalize.sql — kepco_data → kepco_addr + kepco_capa 정규화
-- 작성: 2026-04-12
--
-- 목적:
--   100만 행 kepco_data에서 주소 텍스트(5개)가 지번마다 중복 저장 (~96MB 낭비)
--   주소 마스터(kepco_addr ~1만 행) + 용량 데이터(kepco_capa ~100만 행) 분리
--   BIGINT → INTEGER 변환, crawled_at/row_hash 삭제
--
-- 변경 요약:
--   kepco_data → DROP
--   kepco_data_history → kepco_capa_history (RENAME)
--   kepco_addr (신규) — 리 단위 주소 마스터
--   kepco_capa (신규) — 지번×시설 용량 데이터
--   MV, RPC, 트리거 전면 재생성
-- ============================================================

-- ═══════════════════════════════════════════════
-- Phase 1: 의존 객체 제거
-- ═══════════════════════════════════════════════

DROP MATERIALIZED VIEW IF EXISTS kepco_map_summary;

DROP TRIGGER IF EXISTS trg_kepco_history ON public.kepco_data;
DROP TRIGGER IF EXISTS trg_row_hash ON public.kepco_data;
DROP TRIGGER IF EXISTS trg_kepco_data_updated_at ON public.kepco_data;

DROP FUNCTION IF EXISTS fn_kepco_history();
DROP FUNCTION IF EXISTS fn_kepco_row_hash();
DROP FUNCTION IF EXISTS get_changes_since(date);
DROP FUNCTION IF EXISTS search_kepco(text[], integer, integer, integer);

-- ═══════════════════════════════════════════════
-- Phase 2: kepco_addr 생성 + 데이터 이동
-- ═══════════════════════════════════════════════

CREATE TABLE kepco_addr (
  id              SERIAL PRIMARY KEY,
  addr_do         TEXT NOT NULL,
  addr_si         TEXT,
  addr_gu         TEXT,
  addr_dong       TEXT,
  addr_li         TEXT,
  geocode_address TEXT NOT NULL UNIQUE,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION
);

COMMENT ON TABLE kepco_addr IS '리 단위 주소 마스터. geocode_address가 UNIQUE 키. 거의 고정 데이터.';

-- 기존 kepco_data에서 고유 주소 추출
INSERT INTO kepco_addr (addr_do, addr_si, addr_gu, addr_dong, addr_li, geocode_address, lat, lng)
SELECT DISTINCT ON (geocode_address)
  addr_do, addr_si, addr_gu, addr_dong, addr_li, geocode_address,
  lat, lng
FROM kepco_data
WHERE geocode_address IS NOT NULL AND geocode_address <> ''
ORDER BY geocode_address, updated_at DESC;

-- 인덱스
CREATE INDEX idx_addr_latlng ON kepco_addr (lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX idx_addr_do_gu ON kepco_addr (addr_do, addr_gu);

-- ═══════════════════════════════════════════════
-- Phase 3: kepco_capa 생성 + 데이터 이동
-- ═══════════════════════════════════════════════

CREATE TABLE kepco_capa (
  id            BIGSERIAL PRIMARY KEY,
  addr_id       INTEGER NOT NULL REFERENCES kepco_addr(id),
  addr_jibun    TEXT,
  -- 시설
  subst_nm      TEXT,
  mtr_no        TEXT,
  dl_nm         TEXT,
  -- 용량 (BIGINT → INTEGER)
  subst_capa    INTEGER,
  subst_pwr     INTEGER,
  g_subst_capa  INTEGER,
  mtr_capa      INTEGER,
  mtr_pwr       INTEGER,
  g_mtr_capa    INTEGER,
  dl_capa       INTEGER,
  dl_pwr        INTEGER,
  g_dl_capa     INTEGER,
  -- STEP (pwr도 INTEGER로)
  step1_cnt     INTEGER,
  step1_pwr     INTEGER,
  step2_cnt     INTEGER,
  step2_pwr     INTEGER,
  step3_cnt     INTEGER,
  step3_pwr     INTEGER,
  -- 메타
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 복합 UNIQUE (row_hash 대체)
  CONSTRAINT kepco_capa_ukey UNIQUE (addr_id, addr_jibun, subst_nm, mtr_no, dl_nm)
);

COMMENT ON TABLE kepco_capa IS '지번×시설 용량 데이터. addr_id로 kepco_addr 참조. UPSERT 키 = (addr_id, addr_jibun, subst_nm, mtr_no, dl_nm).';

-- 기존 kepco_data에서 이동 (BIGINT → INTEGER 캐스팅)
INSERT INTO kepco_capa (
  addr_id, addr_jibun, subst_nm, mtr_no, dl_nm,
  subst_capa, subst_pwr, g_subst_capa,
  mtr_capa, mtr_pwr, g_mtr_capa,
  dl_capa, dl_pwr, g_dl_capa,
  step1_cnt, step1_pwr, step2_cnt, step2_pwr, step3_cnt, step3_pwr,
  updated_at
)
SELECT
  a.id,
  d.addr_jibun, d.subst_nm, d.mtr_no, d.dl_nm,
  d.subst_capa::int, d.subst_pwr::int, d.g_subst_capa::int,
  d.mtr_capa::int, d.mtr_pwr::int, d.g_mtr_capa::int,
  d.dl_capa::int, d.dl_pwr::int, d.g_dl_capa::int,
  d.step1_cnt, d.step1_pwr::int, d.step2_cnt, d.step2_pwr::int,
  d.step3_cnt, d.step3_pwr::int,
  d.updated_at
FROM kepco_data d
JOIN kepco_addr a ON a.geocode_address = d.geocode_address;

-- 인덱스
CREATE INDEX idx_capa_addr_id ON kepco_capa (addr_id);

-- ═══════════════════════════════════════════════
-- Phase 4: 히스토리 테이블 변경
-- ═══════════════════════════════════════════════

-- 테이블 이름 변경
ALTER TABLE kepco_data_history RENAME TO kepco_capa_history;

-- 컬럼 이름 변경
ALTER TABLE kepco_capa_history RENAME COLUMN kepco_data_id TO capa_id;

-- 인덱스 이름도 정리
ALTER INDEX IF EXISTS idx_history_changed_at RENAME TO idx_capa_history_changed_at;
ALTER INDEX IF EXISTS idx_history_kepco_id RENAME TO idx_capa_history_capa_id;

-- ═══════════════════════════════════════════════
-- Phase 5: 기존 테이블 삭제
-- ═══════════════════════════════════════════════

DROP TABLE kepco_data CASCADE;

-- ═══════════════════════════════════════════════
-- Phase 6: 트리거 재생성
-- ═══════════════════════════════════════════════

-- updated_at 자동 갱신 (set_updated_at 함수는 001에서 생성됨, 유지)
CREATE TRIGGER trg_kepco_capa_updated_at
  BEFORE UPDATE ON kepco_capa
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 히스토리 트리거: 용량 수치 변경 감지 → kepco_capa_history에 기록
CREATE OR REPLACE FUNCTION fn_kepco_capa_history()
RETURNS trigger AS $$
BEGIN
  IF OLD.subst_capa IS DISTINCT FROM NEW.subst_capa
  OR OLD.subst_pwr  IS DISTINCT FROM NEW.subst_pwr
  OR OLD.g_subst_capa IS DISTINCT FROM NEW.g_subst_capa
  OR OLD.mtr_capa   IS DISTINCT FROM NEW.mtr_capa
  OR OLD.mtr_pwr    IS DISTINCT FROM NEW.mtr_pwr
  OR OLD.g_mtr_capa IS DISTINCT FROM NEW.g_mtr_capa
  OR OLD.dl_capa    IS DISTINCT FROM NEW.dl_capa
  OR OLD.dl_pwr     IS DISTINCT FROM NEW.dl_pwr
  OR OLD.g_dl_capa  IS DISTINCT FROM NEW.g_dl_capa
  THEN
    INSERT INTO kepco_capa_history (
      capa_id, changed_at,
      old_subst_capa, old_subst_pwr, old_g_subst_capa,
      old_mtr_capa, old_mtr_pwr, old_g_mtr_capa,
      old_dl_capa, old_dl_pwr, old_g_dl_capa
    ) VALUES (
      OLD.id, CURRENT_DATE,
      OLD.subst_capa, OLD.subst_pwr, OLD.g_subst_capa,
      OLD.mtr_capa, OLD.mtr_pwr, OLD.g_mtr_capa,
      OLD.dl_capa, OLD.dl_pwr, OLD.g_dl_capa
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kepco_capa_history
  BEFORE UPDATE ON kepco_capa
  FOR EACH ROW EXECUTE FUNCTION fn_kepco_capa_history();

-- ═══════════════════════════════════════════════
-- Phase 7: RPC 재생성
-- ═══════════════════════════════════════════════

-- 7-1) get_location_detail — 마커 클릭 시 마을 상세 조회
CREATE OR REPLACE FUNCTION get_location_detail(addr text)
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
  updated_at timestamptz
) AS $$
  SELECT
    c.id,
    a.addr_do, a.addr_si, a.addr_gu, a.addr_dong, a.addr_li,
    c.addr_jibun,
    a.geocode_address,
    a.lat, a.lng,
    c.subst_nm, c.mtr_no, c.dl_nm,
    c.subst_capa, c.subst_pwr, c.g_subst_capa,
    c.mtr_capa, c.mtr_pwr, c.g_mtr_capa,
    c.dl_capa, c.dl_pwr, c.g_dl_capa,
    c.step1_cnt, c.step1_pwr, c.step2_cnt, c.step2_pwr,
    c.step3_cnt, c.step3_pwr,
    c.updated_at
  FROM kepco_capa c
  JOIN kepco_addr a ON a.id = c.addr_id
  WHERE a.geocode_address = addr
  ORDER BY c.addr_jibun, c.subst_nm, c.mtr_no, c.dl_nm;
$$ LANGUAGE sql STABLE;

-- 7-2) search_kepco — 주소/지번 통합 검색
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

  -- 1) 리 단위 그룹 결과 (kepco_addr만으로 충분)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO ri_result
  FROM (
    SELECT
      a.addr_do, a.addr_si, a.addr_gu, a.addr_dong, a.addr_li,
      a.geocode_address,
      COUNT(*)::int AS cnt,
      a.lat, a.lng
    FROM kepco_addr a
    JOIN kepco_capa c ON c.addr_id = a.id
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
    GROUP BY a.addr_do, a.addr_si, a.addr_gu, a.addr_dong, a.addr_li,
             a.geocode_address, a.lat, a.lng
    ORDER BY cnt DESC
    LIMIT ri_limit
  ) t;

  -- 2) 지번 단위 결과 (lot_no 있을 때만)
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

-- 7-3) get_changes_since — 비교 분석용
CREATE OR REPLACE FUNCTION get_changes_since(since_date date)
RETURNS TABLE (
  geocode_address text,
  lat float8,
  lng float8,
  addr_do text,
  addr_si text,
  addr_gu text,
  addr_dong text,
  addr_li text,
  addr_jibun text,
  subst_nm text,
  dl_nm text,
  -- 현재 수치
  cur_subst_capa int,
  cur_subst_pwr int,
  cur_g_subst_capa int,
  cur_mtr_capa int,
  cur_mtr_pwr int,
  cur_g_mtr_capa int,
  cur_dl_capa int,
  cur_dl_pwr int,
  cur_g_dl_capa int,
  -- 이전 수치
  prev_subst_capa int,
  prev_subst_pwr int,
  prev_g_subst_capa int,
  prev_mtr_capa int,
  prev_mtr_pwr int,
  prev_g_mtr_capa int,
  prev_dl_capa int,
  prev_dl_pwr int,
  prev_g_dl_capa int,
  -- 변경 건수
  changed_count bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH earliest_change AS (
    SELECT DISTINCT ON (h.capa_id)
      h.capa_id,
      h.old_subst_capa, h.old_subst_pwr, h.old_g_subst_capa,
      h.old_mtr_capa, h.old_mtr_pwr, h.old_g_mtr_capa,
      h.old_dl_capa, h.old_dl_pwr, h.old_g_dl_capa
    FROM kepco_capa_history h
    WHERE h.changed_at >= since_date
    ORDER BY h.capa_id, h.changed_at ASC
  )
  SELECT
    a.geocode_address, a.lat, a.lng,
    a.addr_do, a.addr_si, a.addr_gu, a.addr_dong, a.addr_li,
    c.addr_jibun,
    c.subst_nm, c.dl_nm,
    c.subst_capa, c.subst_pwr, c.g_subst_capa,
    c.mtr_capa, c.mtr_pwr, c.g_mtr_capa,
    c.dl_capa, c.dl_pwr, c.g_dl_capa,
    ec.old_subst_capa, ec.old_subst_pwr, ec.old_g_subst_capa,
    ec.old_mtr_capa, ec.old_mtr_pwr, ec.old_g_mtr_capa,
    ec.old_dl_capa, ec.old_dl_pwr, ec.old_g_dl_capa,
    COUNT(*) OVER (PARTITION BY a.geocode_address)
  FROM earliest_change ec
  JOIN kepco_capa c ON c.id = ec.capa_id
  JOIN kepco_addr a ON a.id = c.addr_id
  WHERE a.lat IS NOT NULL
  AND (
    ec.old_subst_capa IS DISTINCT FROM c.subst_capa
    OR ec.old_subst_pwr IS DISTINCT FROM c.subst_pwr
    OR ec.old_g_subst_capa IS DISTINCT FROM c.g_subst_capa
    OR ec.old_mtr_capa IS DISTINCT FROM c.mtr_capa
    OR ec.old_mtr_pwr IS DISTINCT FROM c.mtr_pwr
    OR ec.old_g_mtr_capa IS DISTINCT FROM c.g_mtr_capa
    OR ec.old_dl_capa IS DISTINCT FROM c.dl_capa
    OR ec.old_dl_pwr IS DISTINCT FROM c.dl_pwr
    OR ec.old_g_dl_capa IS DISTINCT FROM c.g_dl_capa
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ═══════════════════════════════════════════════
-- Phase 8: Materialized View 재생성
-- ═══════════════════════════════════════════════

CREATE MATERIALIZED VIEW kepco_map_summary AS
SELECT
  a.geocode_address,
  a.lat,
  a.lng,
  COUNT(*) AS total,
  -- 여유용량 없음 카운트 (KEPCO 수식)
  SUM(CASE WHEN (COALESCE(c.subst_capa,0) - COALESCE(c.subst_pwr,0) <= 0)
            OR (COALESCE(c.subst_capa,0) - COALESCE(c.g_subst_capa,0) <= 0)
       THEN 1 ELSE 0 END) AS subst_no_cap,
  SUM(CASE WHEN (COALESCE(c.mtr_capa,0) - COALESCE(c.mtr_pwr,0) <= 0)
            OR (COALESCE(c.mtr_capa,0) - COALESCE(c.g_mtr_capa,0) <= 0)
       THEN 1 ELSE 0 END) AS mtr_no_cap,
  SUM(CASE WHEN (COALESCE(c.dl_capa,0) - COALESCE(c.dl_pwr,0) <= 0)
            OR (COALESCE(c.dl_capa,0) - COALESCE(c.g_dl_capa,0) <= 0)
       THEN 1 ELSE 0 END) AS dl_no_cap,
  a.addr_do,
  a.addr_si,
  a.addr_gu,
  a.addr_dong,
  a.addr_li,
  ARRAY_AGG(DISTINCT c.subst_nm) FILTER (WHERE c.subst_nm IS NOT NULL AND c.subst_nm <> '') AS subst_names,
  ARRAY_AGG(DISTINCT c.dl_nm)    FILTER (WHERE c.dl_nm    IS NOT NULL AND c.dl_nm    <> '') AS dl_names,
  -- 시설별 잔여 (kW)
  GREATEST(0, COALESCE(MAX(COALESCE(c.subst_capa,0) - COALESCE(c.subst_pwr,0)), 0))::int AS subst_remaining_kw,
  GREATEST(0, COALESCE(MAX(COALESCE(c.mtr_capa,0)   - COALESCE(c.mtr_pwr,0)),   0))::int AS mtr_remaining_kw,
  GREATEST(0, COALESCE(MAX(COALESCE(c.dl_capa,0)    - COALESCE(c.dl_pwr,0)),    0))::int AS dl_remaining_kw,
  -- 종합 잔여
  GREATEST(
    GREATEST(0, COALESCE(MAX(COALESCE(c.subst_capa,0) - COALESCE(c.subst_pwr,0)), 0)),
    GREATEST(0, COALESCE(MAX(COALESCE(c.mtr_capa,0)   - COALESCE(c.mtr_pwr,0)),   0)),
    GREATEST(0, COALESCE(MAX(COALESCE(c.dl_capa,0)    - COALESCE(c.dl_pwr,0)),    0))
  )::int AS max_remaining_kw
FROM kepco_capa c
JOIN kepco_addr a ON a.id = c.addr_id
WHERE a.lat IS NOT NULL
GROUP BY a.geocode_address, a.lat, a.lng,
         a.addr_do, a.addr_si, a.addr_gu, a.addr_dong, a.addr_li;

-- CONCURRENTLY REFRESH를 위해 UNIQUE INDEX 필수
CREATE UNIQUE INDEX idx_summary_address ON kepco_map_summary (geocode_address);
CREATE INDEX idx_summary_latlng ON kepco_map_summary (lat, lng);
CREATE INDEX idx_summary_remaining_desc ON kepco_map_summary (max_remaining_kw DESC);

COMMENT ON MATERIALIZED VIEW kepco_map_summary IS
  '지도 마커용 리 단위 집계 + 잔여 용량. kepco_addr JOIN kepco_capa 기반.';

-- ═══════════════════════════════════════════════
-- Phase 9: RLS + 권한
-- ═══════════════════════════════════════════════

ALTER TABLE kepco_addr ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kepco_addr_select" ON kepco_addr FOR SELECT TO authenticated USING (true);

ALTER TABLE kepco_capa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kepco_capa_select" ON kepco_capa FOR SELECT TO authenticated USING (true);

GRANT SELECT ON kepco_map_summary TO authenticated;
REVOKE ALL ON kepco_map_summary FROM anon;

-- refresh_kepco_summary 함수는 MV 이름 동일하므로 그대로 동작
-- (006_refresh_function.sql에서 생성됨)

-- ═══════════════════════════════════════════════
-- Phase 10: cleanup
-- ═══════════════════════════════════════════════

-- 불필요 인덱스 정리 (kepco_data CASCADE 삭제 시 함께 삭제됨)
-- VACUUM은 운영 환경에서 별도 실행 권장
-- VACUUM ANALYZE kepco_addr;
-- VACUUM ANALYZE kepco_capa;
