-- ============================================================
-- 006_refresh_function.sql — Materialized View REFRESH 함수
-- ============================================================
-- supabase-js에서 raw SQL을 직접 호출할 수 없으므로
-- RPC 함수로 감싸서 .rpc('refresh_kepco_summary')로 호출
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_kepco_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- 함수 정의자(보통 postgres)의 권한으로 실행
AS $$
BEGIN
  -- CONCURRENTLY: 잠금 없이 갱신 (UNIQUE INDEX 필수, 003에서 생성됨)
  REFRESH MATERIALIZED VIEW CONCURRENTLY kepco_map_summary;
EXCEPTION
  WHEN feature_not_supported THEN
    -- 첫 REFRESH(빈 뷰)는 CONCURRENTLY 불가 → 일반 REFRESH로 fallback
    REFRESH MATERIALIZED VIEW kepco_map_summary;
END;
$$;

-- 실행 권한: service_role만 호출 가능 (anon/authenticated 차단)
REVOKE ALL ON FUNCTION refresh_kepco_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_kepco_summary() TO service_role;

COMMENT ON FUNCTION refresh_kepco_summary() IS '엑셀 업로드 후 호출. CONCURRENTLY로 잠금 없이 집계 뷰 갱신.';
