/**
 * POST /api/upload — 2026-04-22 잠정 중단
 *
 * 엑셀 업로드는 크롤러로 대체되어 현재 사용하지 않습니다.
 * 복구 필요 시 git 에서 이전 버전 (commit b78ad59 이전) 복원 가능.
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "엑셀 업로드는 현재 사용하지 않습니다. 관리자에게 문의하세요.",
    },
    { status: 503 },
  );
}
