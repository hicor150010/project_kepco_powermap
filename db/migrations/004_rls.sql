-- ============================================================
-- 004_rls.sql — Row Level Security 정책
-- ============================================================
-- 정책:
-- - 인증된 사용자(authenticated): SELECT 가능
-- - INSERT/UPDATE/DELETE: 서버(service_role)에서만 → API Route 경유 강제
-- - 관리자 계정 관리는 API Route + 권한 체크 (코드 레벨)
-- ============================================================

-- ─────────────────────────────────────────────
-- geocode_cache
-- ─────────────────────────────────────────────
ALTER TABLE geocode_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geocode_cache_select" ON geocode_cache;
CREATE POLICY "geocode_cache_select"
  ON geocode_cache FOR SELECT
  TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE는 정책 없음 → service_role만 가능

-- ─────────────────────────────────────────────
-- kepco_data
-- ─────────────────────────────────────────────
ALTER TABLE kepco_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kepco_data_select" ON kepco_data;
CREATE POLICY "kepco_data_select"
  ON kepco_data FOR SELECT
  TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE는 service_role만

-- ─────────────────────────────────────────────
-- user_roles
-- ─────────────────────────────────────────────
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 본인 역할은 본인이 조회 가능 (페이지 진입 시 권한 체크)
DROP POLICY IF EXISTS "user_roles_select_self" ON user_roles;
CREATE POLICY "user_roles_select_self"
  ON user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 관리자는 모든 역할 조회 가능 (관리자 페이지에서 사용)
-- ※ 여기서는 user_roles 자기참조라 RLS만으론 어려움
--   → admin 페이지의 모든 user_roles 조회는 API Route + service_role로 처리

-- INSERT/UPDATE/DELETE는 service_role만 (관리자 API 경유)

-- ─────────────────────────────────────────────
-- kepco_map_summary (Materialized View)
-- ─────────────────────────────────────────────
-- Materialized View는 RLS 직접 적용 불가
-- 대신 view 함수를 만들거나, 호출자(API Route)에서 인증 체크
-- 일단은 anon에는 GRANT 안 줌, authenticated에만 SELECT
GRANT SELECT ON kepco_map_summary TO authenticated;
REVOKE ALL ON kepco_map_summary FROM anon;
