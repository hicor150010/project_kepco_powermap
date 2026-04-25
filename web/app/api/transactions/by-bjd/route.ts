/**
 * GET /api/transactions/by-bjd?bjd_code=...&months=12
 *
 * Atomic endpoint — 시군구 단위 토지 실거래가 조회.
 * 영업담당자의 시세 감각·협상 근거 자료.
 *
 * 입력:
 *   - bjd_code (10) — 행안부 법정동 코드. 앞 5자리 = LAWD_CD
 *   - months — 조회 개월 수 (1~24, 기본 12)
 *
 * 외부 호출:
 *   - 국토부 RTMS getRTMSDataSvcLandTrade
 *   - months 회 (서버 fan-out, 사용자→서버는 1회)
 *
 * 응답:
 *   { ok: true, bjd_code, months, rows: LandTransaction[], stats: TradeStats }
 *   { ok: false, error }
 *
 * 캐시: private, s-maxage=21600 (6h) — 이번 달 분 매일 갱신 가능
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLandTradesByBjd } from "@/lib/rtms/land-trade";
import { computeStats } from "@/lib/rtms/trade-stats";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const bjdCode =
    request.nextUrl.searchParams.get("bjd_code")?.trim() ?? "";
  if (!/^\d{10}$/.test(bjdCode)) {
    return NextResponse.json(
      { ok: false, error: "bjd_code 는 10자리 숫자여야 합니다." },
      { status: 400 },
    );
  }

  const monthsRaw = Number(
    request.nextUrl.searchParams.get("months") ?? "12",
  );
  const months =
    Number.isFinite(monthsRaw) && monthsRaw >= 1 && monthsRaw <= 24
      ? Math.floor(monthsRaw)
      : 12;

  try {
    const rows = await getLandTradesByBjd(bjdCode, months);
    const stats = computeStats(rows, months);
    return NextResponse.json(
      { ok: true, bjd_code: bjdCode, months, rows, stats },
      {
        headers: {
          "Cache-Control": "private, s-maxage=21600, max-age=3600",
        },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[transactions/by-bjd] failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
