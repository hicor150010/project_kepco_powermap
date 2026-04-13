/**
 * POST /api/filter-ji
 *
 * 조건검색 2단계에서 "지번 단위" 탭이 호출.
 * 여러 geocode_address에 속하는 KepcoDataRow[]를 반환한다.
 *
 * Body:
 *   { addrs: string[], limit?: number }
 *
 * 응답:
 *   { ok: true, rows: KepcoDataRow[], total: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { KepcoDataRow } from "@/lib/types";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  let body: { addrs?: string[]; limit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const addrs = body.addrs;
  if (!Array.isArray(addrs) || addrs.length === 0) {
    return NextResponse.json(
      { ok: false, error: "addrs 배열이 필요합니다." },
      { status: 400 },
    );
  }

  const limit = Math.min(body.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_filter_ji", {
    addrs,
    max_rows: limit,
  });

  if (error) {
    console.error("[filter-ji] 조회 실패", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as KepcoDataRow[];

  return NextResponse.json({
    ok: true,
    rows,
    total: rows.length,
  });
}
