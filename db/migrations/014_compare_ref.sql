-- ============================================================
-- 014_compare_ref.sql — ref 기준 비교 시스템
-- 작성: 2026-04-12
--
-- 목적:
--   기존 kepco_capa_history(트리거 기반, 7일 보존)를 삭제하고
--   kepco_capa_ref(기준 스냅샷) 방식으로 전환.
--   각 지번의 최초 기록 시점 여유 상태를 보존하고,
--   현재 상태와 비교하여 변화를 감지.
-- ============================================================

-- ═══════════════════════════════════════════════
-- Phase 1: 기존 히스토리 시스템 삭제
-- ═══════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_kepco_capa_history ON kepco_capa;
DROP FUNCTION IF EXISTS fn_kepco_capa_history();
DROP FUNCTION IF EXISTS get_changes_since(date);
DROP TABLE IF EXISTS kepco_capa_history;

-- ═══════════════════════════════════════════════
-- Phase 2: kepco_capa_ref 테이블 생성
-- ═══════════════════════════════════════════════

CREATE TABLE kepco_capa_ref (
  capa_id      BIGINT PRIMARY KEY,   -- kepco_capa.id (FK 아님 — 성능)
  snapshot_at  DATE NOT NULL,         -- 이 지번이 처음 기록된 시점
  subst_ok     BOOLEAN NOT NULL,      -- 그 시점의 변전소 여유 상태
  mtr_ok       BOOLEAN NOT NULL,      -- 그 시점의 주변압기 여유 상태
  dl_ok        BOOLEAN NOT NULL       -- 그 시점의 배전선로 여유 상태
);

COMMENT ON TABLE kepco_capa_ref IS
  '기준 스냅샷. 각 지번의 최초 기록 시점 여유 상태를 불변으로 보존. 현재 kepco_capa와 비교하여 변화 감지.';

-- RLS
ALTER TABLE kepco_capa_ref ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kepco_capa_ref_select" ON kepco_capa_ref
  FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════
-- Phase 3: RPC — sync_capa_ref()
-- 새 지번만 ref에 추가. 기존 행은 절대 건드리지 않음.
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_capa_ref()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO kepco_capa_ref (capa_id, snapshot_at, subst_ok, mtr_ok, dl_ok)
  SELECT
    c.id,
    CURRENT_DATE,
    (COALESCE(c.subst_capa, 0) - COALESCE(c.subst_pwr, 0) > 0)
      AND (COALESCE(c.subst_capa, 0) - COALESCE(c.g_subst_capa, 0) > 0),
    (COALESCE(c.mtr_capa, 0) - COALESCE(c.mtr_pwr, 0) > 0)
      AND (COALESCE(c.mtr_capa, 0) - COALESCE(c.g_mtr_capa, 0) > 0),
    (COALESCE(c.dl_capa, 0) - COALESCE(c.dl_pwr, 0) > 0)
      AND (COALESCE(c.dl_capa, 0) - COALESCE(c.g_dl_capa, 0) > 0)
  FROM kepco_capa c
  WHERE NOT EXISTS (
    SELECT 1 FROM kepco_capa_ref r WHERE r.capa_id = c.id
  );
$$;

REVOKE ALL ON FUNCTION sync_capa_ref() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sync_capa_ref() TO service_role;

COMMENT ON FUNCTION sync_capa_ref() IS
  '새 지번만 ref에 추가. 기존 행은 불변. 크롤러 flush 후 호출.';

-- ═══════════════════════════════════════════════
-- Phase 4: RPC — reset_capa_ref()
-- 관리자 리셋: 전체 삭제 후 현재 상태로 다시 찍기
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION reset_capa_ref()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE kepco_capa_ref;
  PERFORM sync_capa_ref();
END;
$$;

REVOKE ALL ON FUNCTION reset_capa_ref() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_capa_ref() TO service_role;

COMMENT ON FUNCTION reset_capa_ref() IS
  '관리자 리셋. ref 전체 삭제 후 현재 상태를 새 기준으로 저장.';

-- ═══════════════════════════════════════════════
-- Phase 5: RPC — compare_with_ref()
-- ref(기준) vs 현재 kepco_capa 비교
-- 시설별 필터: any/same/gained/lost
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION compare_with_ref(
  subst_filter TEXT DEFAULT 'any',
  mtr_filter   TEXT DEFAULT 'any',
  dl_filter    TEXT DEFAULT 'any'
)
RETURNS TABLE (
  geocode_address text,
  lat float8,
  lng float8,
  addr_do text,
  addr_si text,
  addr_gu text,
  addr_dong text,
  addr_li text,
  prev_subst_ok boolean,
  prev_mtr_ok boolean,
  prev_dl_ok boolean,
  curr_subst_ok boolean,
  curr_mtr_ok boolean,
  curr_dl_ok boolean,
  changed_count bigint
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH curr AS (
    SELECT
      c.id AS capa_id,
      c.addr_id,
      (COALESCE(c.subst_capa, 0) - COALESCE(c.subst_pwr, 0) > 0)
        AND (COALESCE(c.subst_capa, 0) - COALESCE(c.g_subst_capa, 0) > 0) AS subst_ok,
      (COALESCE(c.mtr_capa, 0) - COALESCE(c.mtr_pwr, 0) > 0)
        AND (COALESCE(c.mtr_capa, 0) - COALESCE(c.g_mtr_capa, 0) > 0) AS mtr_ok,
      (COALESCE(c.dl_capa, 0) - COALESCE(c.dl_pwr, 0) > 0)
        AND (COALESCE(c.dl_capa, 0) - COALESCE(c.g_dl_capa, 0) > 0) AS dl_ok
    FROM kepco_capa c
  ),
  compared AS (
    SELECT
      cu.addr_id,
      r.subst_ok AS prev_subst,
      r.mtr_ok   AS prev_mtr,
      r.dl_ok    AS prev_dl,
      cu.subst_ok AS curr_subst,
      cu.mtr_ok   AS curr_mtr,
      cu.dl_ok    AS curr_dl
    FROM curr cu
    JOIN kepco_capa_ref r ON r.capa_id = cu.capa_id
    WHERE
      -- 최소 하나의 시설에서 변화가 있거나, 특정 필터 조건
      (
        r.subst_ok IS DISTINCT FROM cu.subst_ok
        OR r.mtr_ok IS DISTINCT FROM cu.mtr_ok
        OR r.dl_ok IS DISTINCT FROM cu.dl_ok
        OR subst_filter != 'any'
        OR mtr_filter != 'any'
        OR dl_filter != 'any'
      )
      -- 시설별 필터 적용
      AND (subst_filter = 'any'
        OR (subst_filter = 'same' AND r.subst_ok = cu.subst_ok)
        OR (subst_filter = 'gained' AND r.subst_ok = false AND cu.subst_ok = true)
        OR (subst_filter = 'lost' AND r.subst_ok = true AND cu.subst_ok = false))
      AND (mtr_filter = 'any'
        OR (mtr_filter = 'same' AND r.mtr_ok = cu.mtr_ok)
        OR (mtr_filter = 'gained' AND r.mtr_ok = false AND cu.mtr_ok = true)
        OR (mtr_filter = 'lost' AND r.mtr_ok = true AND cu.mtr_ok = false))
      AND (dl_filter = 'any'
        OR (dl_filter = 'same' AND r.dl_ok = cu.dl_ok)
        OR (dl_filter = 'gained' AND r.dl_ok = false AND cu.dl_ok = true)
        OR (dl_filter = 'lost' AND r.dl_ok = true AND cu.dl_ok = false))
  )
  SELECT
    a.geocode_address,
    a.lat, a.lng,
    a.addr_do, a.addr_si, a.addr_gu, a.addr_dong, a.addr_li,
    cm.prev_subst, cm.prev_mtr, cm.prev_dl,
    cm.curr_subst, cm.curr_mtr, cm.curr_dl,
    COUNT(*) OVER (PARTITION BY a.geocode_address)
  FROM compared cm
  JOIN kepco_addr a ON a.id = cm.addr_id
  WHERE a.lat IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION compare_with_ref IS
  'ref(기준 스냅샷) vs 현재 kepco_capa 비교. 시설별 필터(any/same/gained/lost) 지원.';

-- ═══════════════════════════════════════════════
-- Phase 6: RPC — get_ref_info()
-- 기준일 정보 조회 (UI 표시용)
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_ref_info()
RETURNS TABLE (
  snapshot_date date,
  total_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    MIN(snapshot_at) AS snapshot_date,
    COUNT(*) AS total_count
  FROM kepco_capa_ref;
$$;

-- ═══════════════════════════════════════════════
-- Phase 7: 초기 스냅샷 생성
-- ═══════════════════════════════════════════════

SELECT sync_capa_ref();
