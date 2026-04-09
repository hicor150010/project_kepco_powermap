/**
 * KEPCO 주소 계층 API 프록시 (브라우저 CORS 우회)
 *
 * GET /api/admin/crawl/regions?gbn=init           → 시/도 목록
 * GET /api/admin/crawl/regions?gbn=0&addr_do=...  → 시 목록
 * GET /api/admin/crawl/regions?gbn=1&addr_do=...&addr_si=... → 구/군 목록
 * GET /api/admin/crawl/regions?gbn=2&...          → 동/면 목록
 * GET /api/admin/crawl/regions?gbn=3&...          → 리 목록
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

const KEPCO_BASE = "https://online.kepco.co.kr";

export async function GET(request: NextRequest) {
  const me = await requireAdmin();
  if (!me) {
    return NextResponse.json(
      { ok: false, error: "관리자만 접근 가능합니다." },
      { status: 403 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const gbn = sp.get("gbn") || "";

  const headers = {
    "Content-Type": "application/json",
    Referer: `${KEPCO_BASE}/EWM092D00`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };

  try {
    if (gbn === "init") {
      // 시/도 목록
      const resp = await fetch(`${KEPCO_BASE}/ew/cpct/retrieveAddrInit`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      const data = await resp.json();
      const list = (data.dlt_sido || []).map(
        (item: Record<string, string>) => item.ADDR_DO
      );
      return NextResponse.json({ ok: true, list });
    }

    // gbn 0~3: 하위 주소 계층
    const body = {
      dma_addrGbn: {
        gbn,
        addr_do: sp.get("addr_do") || "",
        addr_si: sp.get("addr_si") || "",
        addr_gu: sp.get("addr_gu") || "",
        addr_lidong: sp.get("addr_lidong") || "",
        addr_li: sp.get("addr_li") || "",
        addr_jibun: "",
      },
    };

    const resp = await fetch(`${KEPCO_BASE}/ew/cpct/retrieveAddrGbn`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    const keyMap: Record<string, string> = {
      "0": "ADDR_SI",
      "1": "ADDR_GU",
      "2": "ADDR_LIDONG",
      "3": "ADDR_LI",
    };
    const key = keyMap[gbn] || "";
    const items = data.dlt_addrGbn || [];
    const list = items
      .map((item: Record<string, string>) => item[key])
      .filter(Boolean);

    return NextResponse.json({ ok: true, list });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: `KEPCO API 호출 실패: ${err?.message || err}` },
      { status: 502 }
    );
  }
}
