-- ============================================================
-- 005_seed_admin.sql — 첫 관리자 권한 부여
-- ============================================================
-- 사전 작업:
-- 1. Supabase 콘솔 → Authentication → Users → "Add user"로 계정 생성
-- 2. 생성된 User UID를 아래 INSERT 문에 입력
-- ============================================================

-- 백업 관리자 (hicor150010@gmail.com)
INSERT INTO user_roles (user_id, role, display_name)
VALUES (
  '617cf41e-c9a0-4d29-a3b3-20c9c86819d5',
  'admin',
  '관리자(백업)'
)
ON CONFLICT (user_id) DO UPDATE
  SET role = EXCLUDED.role,
      display_name = EXCLUDED.display_name;

-- 메인 관리자 (admin@kepco.local — 사용자는 "admin"으로 로그인)
INSERT INTO user_roles (user_id, role, display_name)
VALUES (
  'd87f6eb3-d8dc-4e3c-96bb-e6d9b828ac60',
  'admin',
  '관리자'
)
ON CONFLICT (user_id) DO UPDATE
  SET role = EXCLUDED.role,
      display_name = EXCLUDED.display_name;
