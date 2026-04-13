-- ============================================================
-- 017_compare_at.sql — 시점 복원 기반 비교 RPC
-- 작성: 2026-04-13
--
-- 목적:
--   두 시점의 여유 상태를 복원하여 비교.
--   date_b = NULL이면 현재 kepco_capa 실시간 계산값 사용.
--
-- 복원 원리:
--   1. changelog에 해당 날짜 + 해당 지번이 있으면 → 그 값
--   2. 없으면 → ref 값 (단, ref.snapshot_at <= 해당 날짜)
--   3. ref.snapshot_at > 해당 날짜 → 그 시점에 데이터 없음 → 제외
-- ============================================================

CREATE OR REPLACE FUNCTION compare_at(
  date_a       DATE,
  date_b       DATE    DEFAULT NULL,
  subst_filter TEXT    DEFAULT 'any',
  mtr_filter   TEXT    DEFAULT 'any',
  dl_filter    TEXT    DEFAULT 'any'
)
RETURNS TABLE (
  geocode_address text,
  lat             float8,
  lng             float8,
  addr_do         text,
  addr_si         text,
  addr_gu         text,
  addr_dong       text,
  addr_li         text,
  addr_jibun      text,
  subst_nm        text,
  mtr_no          text,
  dl_nm           text,
  prev_subst_ok   boolean,
  prev_mtr_ok     boolean,
  prev_dl_ok      boolean,
  curr_subst_ok   boolean,
  curr_mtr_ok     boolean,
  curr_dl_ok      boolean
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY

  -- ── 시점 A 복원 ──
  WITH restore_a AS (
    SELECT
      r.capa_id,
      COALESCE(cl.subst_ok, r.subst_ok) AS subst_ok,
      COALESCE(cl.mtr_ok,   r.mtr_ok)   AS mtr_ok,
      COALESCE(cl.dl_ok,    r.dl_ok)    AS dl_ok
    FROM kepco_capa_ref r
    LEFT JOIN kepco_capa_changelog cl
      ON cl.capa_id = r.capa_id AND cl.changed_date = date_a
    WHERE r.snapshot_at <= date_a
  ),

  -- ── 시점 B 복원 (NULL이면 현재값) ──
  restore_b AS (
    SELECT
      r.capa_id,
      CASE WHEN date_b IS NULL THEN
        (COALESCE(c.subst_capa, 0) - COALESCE(c.subst_pwr, 0) > 0)
          AND (COALESCE(c.subst_capa, 0) - COALESCE(c.g_subst_capa, 0) > 0)
      ELSE
        COALESCE(cl.subst_ok, r.subst_ok)
      END AS subst_ok,
      CASE WHEN date_b IS NULL THEN
        (COALESCE(c.mtr_capa, 0) - COALESCE(c.mtr_pwr, 0) > 0)
          AND (COALESCE(c.mtr_capa, 0) - COALESCE(c.g_mtr_capa, 0) > 0)
      ELSE
        COALESCE(cl.mtr_ok, r.mtr_ok)
      END AS mtr_ok,
      CASE WHEN date_b IS NULL THEN
        (COALESCE(c.dl_capa, 0) - COALESCE(c.dl_pwr, 0) > 0)
          AND (COALESCE(c.dl_capa, 0) - COALESCE(c.g_dl_capa, 0) > 0)
      ELSE
        COALESCE(cl.dl_ok, r.dl_ok)
      END AS dl_ok
    FROM kepco_capa_ref r
    JOIN kepco_capa c ON c.id = r.capa_id
    LEFT JOIN kepco_capa_changelog cl
      ON cl.capa_id = r.capa_id AND cl.changed_date = date_b
    WHERE date_b IS NULL OR r.snapshot_at <= date_b
  )

  -- ── 두 시점 비교 ──
  SELECT
    a_addr.geocode_address,
    a_addr.lat, a_addr.lng,
    a_addr.addr_do, a_addr.addr_si, a_addr.addr_gu,
    a_addr.addr_dong, a_addr.addr_li,
    c.addr_jibun, c.subst_nm, c.mtr_no, c.dl_nm,
    ra.subst_ok AS prev_subst_ok,
    ra.mtr_ok   AS prev_mtr_ok,
    ra.dl_ok    AS prev_dl_ok,
    rb.subst_ok AS curr_subst_ok,
    rb.mtr_ok   AS curr_mtr_ok,
    rb.dl_ok    AS curr_dl_ok
  FROM restore_a ra
  JOIN restore_b rb ON rb.capa_id = ra.capa_id
  JOIN kepco_capa c ON c.id = ra.capa_id
  JOIN kepco_addr a_addr ON a_addr.id = c.addr_id
  WHERE a_addr.lat IS NOT NULL
    -- 최소 하나의 시설에서 변화가 있거나 필터 지정
    AND (
      ra.subst_ok IS DISTINCT FROM rb.subst_ok
      OR ra.mtr_ok IS DISTINCT FROM rb.mtr_ok
      OR ra.dl_ok IS DISTINCT FROM rb.dl_ok
      OR subst_filter != 'any'
      OR mtr_filter != 'any'
      OR dl_filter != 'any'
    )
    -- 시설별 필터
    AND (subst_filter = 'any'
      OR (subst_filter = 'gained' AND ra.subst_ok = false AND rb.subst_ok = true)
      OR (subst_filter = 'lost'   AND ra.subst_ok = true  AND rb.subst_ok = false))
    AND (mtr_filter = 'any'
      OR (mtr_filter = 'gained' AND ra.mtr_ok = false AND rb.mtr_ok = true)
      OR (mtr_filter = 'lost'   AND ra.mtr_ok = true  AND rb.mtr_ok = false))
    AND (dl_filter = 'any'
      OR (dl_filter = 'gained' AND ra.dl_ok = false AND rb.dl_ok = true)
      OR (dl_filter = 'lost'   AND ra.dl_ok = true  AND rb.dl_ok = false));
END;
$$;

COMMENT ON FUNCTION compare_at IS
  '두 시점의 여유 상태를 복원하여 비교. date_b=NULL이면 현재값 사용. 복원: changelog에 해당 날짜 있으면 그 값, 없으면 ref.';
