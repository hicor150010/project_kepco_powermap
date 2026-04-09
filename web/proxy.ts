import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 다음 경로 외 모든 요청에 미들웨어 적용:
     * - _next/static (정적 자산)
     * - _next/image (이미지 최적화)
     * - favicon.ico
     * - 이미지/폰트 파일
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)",
  ],
};
