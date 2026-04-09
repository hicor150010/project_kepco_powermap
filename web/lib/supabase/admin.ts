/**
 * Supabase 관리자 클라이언트 (Route Handlers 전용)
 * - service_role 키 사용 → RLS 우회, 모든 권한
 * - 절대 브라우저에 노출 금지
 * - 사용 예: 사용자 생성/삭제, 데이터 일괄 upsert, Materialized View REFRESH
 */
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
