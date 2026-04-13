/**
 * GET /api/compare?date_a=2026-04-08&date_b=2026-04-12&subst=any&mtr=any&dl=any
 * 시점 복원 기반 비교 — date_b 생략 시 현재값 사용
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
  addr_jibun: string | null;
  subst_nm: string | null;
  mtr_no: string | null;
  dl_nm: string | null;
  prev_subst_ok: boolean;
  prev_mtr_ok: boolean;
  prev_dl_ok: boolean;
  curr_subst_ok: boolean;
  curr_mtr_ok: boolean;
  curr_dl_ok: boolean;
}

export interface CompareRefResponse {
  ok: boolean;
  rows: CompareRefRow[];
  total: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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
  const dateA = sp.get("date_a");
  const dateB = sp.get("date_b") || null;  // 없으면 null → 현재값
  const substFilter = sp.get("subst") || "any";
  const mtrFilter = sp.get("mtr") || "any";
  const dlFilter = sp.get("dl") || "any";

  if (!dateA || !DATE_RE.test(dateA)) {
    return NextResponse.json(
      { ok: false, error: "date_a 파라미터가 필요합니다. (YYYY-MM-DD)" },
      { status: 400 }
    );
  }
  if (dateB && !DATE_RE.test(dateB)) {
    return NextResponse.json(
      { ok: false, error: "date_b 형식이 잘못되었습니다. (YYYY-MM-DD)" },
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
  const { data, error } = await supabase.rpc("compare_at", {
    date_a: dateA,
    date_b: dateB,
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
