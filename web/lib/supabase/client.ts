/**
 * Supabase 브라우저 클라이언트 (Client Components 전용)
 * - Cookie 기반 세션 관리 (@supabase/ssr)
 * - anon 키 사용 (RLS로 보호됨)
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
