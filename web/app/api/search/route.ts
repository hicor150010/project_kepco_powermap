/**
 * GET /api/search?q=...
 *
 * 화면 하단 검색 패널에서 호출.
 *   q   - 사용자가 입력한 자유 텍스트 (예: "용구리 100")
 *
 * 응답:
 *   { ok, ri: SearchRiResult[], ji: KepcoDataRow[], jiFallback, parsed }
 *
 * - parsed는 디버그/사용자 안내용으로 함께 내려준다.
 * - 인증된 사용자만 접근.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseQuery } from "@/lib/search/parseQuery";
import { searchKepco } from "@/lib/search/searchKepco";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const parsed = parseQuery(q);

  // 키워드도 본번도 없으면 굳이 DB 호출하지 않음
  if (parsed.keywords.length === 0 && parsed.lotNo === null) {
    return NextResponse.json({
      ok: true,
      ri: [],
      ji: [],
      jiFallback: false,
      parsed,
    });
  }

  try {
    const result = await searchKepco({
      keywords: parsed.keywords,
      lotNo: parsed.lotNo,
    });
    return NextResponse.json({
      ok: true,
      ri: result.ri,
      ji: result.ji,
      jiFallback: result.jiFallback,
      tooBroad: result.tooBroad,
      parsed,
    });
  } catch (err: any) {
    console.error("[search] 실패", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
