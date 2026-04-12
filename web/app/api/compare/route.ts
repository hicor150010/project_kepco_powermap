/**
 * GET /api/compare?date=2026-04-01&subst=any&mtr=any&dl=gained
 * changelog 기반 비교 — 특정 날짜 이후 ref 대비 변화 조회
 * 시설별 필터: any / gained / lost
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CompareRefRow {
  geocode_address: string;
  lat: number;
  lng: number;
  addr_do: string;
  addr_si: string | null;
  addr_gu: string | null;
  addr_dong: string | null;
  addr_li: string | null;
  prev_subst_ok: boolean;
  prev_mtr_ok: boolean;
  prev_dl_ok: boolean;
  curr_subst_ok: boolean;
  curr_mtr_ok: boolean;
  curr_dl_ok: boolean;
  changed_date: string;
  changed_count: number;
}

export interface CompareRefResponse {
  ok: boolean;
  rows: CompareRefRow[];
  total: number;
}

const VALID_FILTERS = new Set(["any", "gained", "lost"]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const dateParam = sp.get("date");
  const substFilter = sp.get("subst") || "any";
  const mtrFilter = sp.get("mtr") || "any";
  const dlFilter = sp.get("dl") || "any";

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json(
      { ok: false, error: "date 파라미터가 필요합니다. (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  if (!VALID_FILTERS.has(substFilter) || !VALID_FILTERS.has(mtrFilter) || !VALID_FILTERS.has(dlFilter)) {
    return NextResponse.json(
      { ok: false, error: "필터 값은 any/gained/lost 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("compare_changelog", {
    target_date: dateParam,
    subst_filter: substFilter,
    mtr_filter: mtrFilter,
    dl_filter: dlFilter,
  });

  if (error) {
    console.error("[compare] RPC 실패:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as CompareRefRow[];

  return NextResponse.json({
    ok: true,
    rows,
    total: rows.length,
  } satisfies CompareRefResponse);
}
