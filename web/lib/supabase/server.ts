/**
 * Supabase 서버 클라이언트 (Server Components / Route Handlers 전용)
 * - Cookie 기반 세션 (Next.js cookies()) → 인증된 사용자 컨텍스트
 * - anon 키 사용 (RLS 적용됨)
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서 호출되면 set 불가 (정상)
          }
        },
      },
    }
  );
}
