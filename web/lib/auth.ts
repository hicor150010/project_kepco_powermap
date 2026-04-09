/**
 * 인증/권한 헬퍼
 * - Server Component / Route Handler에서 사용
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type UserRole = "admin" | "viewer";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string | null;
}

/** 현재 로그인한 사용자 + 권한 정보 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // user_roles는 RLS상 본인 행만 SELECT 가능
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role, display_name")
    .eq("user_id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? "",
    role: (roleRow?.role as UserRole) ?? "viewer",
    displayName: roleRow?.display_name ?? null,
  };
}

/** 관리자 권한 검증 (admin이 아니면 null 반환) */
export async function requireAdmin(): Promise<AuthUser | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

/**
 * service_role로 user_roles 조회 (RLS 우회)
 * — 관리자 페이지에서 모든 사용자 목록 가져올 때 사용
 */
export async function listAllUsers() {
  const admin = createAdminClient();
  const { data: authData, error: authErr } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (authErr) throw authErr;

  const { data: roles, error: rolesErr } = await admin
    .from("user_roles")
    .select("user_id, role, display_name");
  if (rolesErr) throw rolesErr;

  const roleMap = new Map(roles.map((r) => [r.user_id, r]));

  return authData.users.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    role: (roleMap.get(u.id)?.role as UserRole) ?? "viewer",
    displayName: roleMap.get(u.id)?.display_name ?? null,
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at,
  }));
}
