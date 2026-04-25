/**
 * refreshKepcoCapaByJibun 단위 테스트 — fetch mock.
 *
 * 검증:
 *   - 필수 입력 검증 (jibun, addr|bjd_code)
 *   - POST body 가 refresh=true 포함
 *   - 200 + ok=true → rows 반환
 *   - 200 + ok=false → error 반환
 *   - 5xx → error 반환
 *   - network throw → error 반환
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { refreshKepcoCapaByJibun } from "./refresh-by-jibun";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("refreshKepcoCapaByJibun — 입력 검증", () => {
  it("jibun 누락 → ok=false", async () => {
    const r = await refreshKepcoCapaByJibun({ addr: "x" } as never);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/jibun/);
  });

  it("addr/bjd_code 둘 다 없음 → ok=false", async () => {
    const r = await refreshKepcoCapaByJibun({ jibun: "1" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/addr.*bjd_code/);
  });
});

describe("refreshKepcoCapaByJibun — fetch 동작", () => {
  it("POST body 가 refresh=true 포함", async () => {
    let captured: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      captured = init?.body as string;
      return new Response(
        JSON.stringify({
          ok: true, source: "kepco_live", rows: [], fetched_at: "2026-01-01",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await refreshKepcoCapaByJibun({
      addr: "경기도 양평군 청운면 갈운리 24-1", jibun: "24-1",
    });

    expect(captured).toBeTruthy();
    const body = JSON.parse(captured!);
    expect(body.refresh).toBe(true);
    expect(body.jibun).toBe("24-1");
    expect(body.addr).toBe("경기도 양평군 청운면 갈운리 24-1");
  });

  it("200 + ok=true → rows 반환", async () => {
    const sampleRow = { id: 1, bjd_code: "X", addr_jibun: "1", subst_nm: "서홍천" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true, source: "kepco_live", rows: [sampleRow], fetched_at: "2026-01-01T00:00:00Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const r = await refreshKepcoCapaByJibun({ addr: "x", jibun: "1" });
    expect(r.ok).toBe(true);
    expect(r.source).toBe("kepco_live");
    expect(r.rows).toHaveLength(1);
    expect(r.fetched_at).toBe("2026-01-01T00:00:00Z");
  });

  it("200 + ok=false → error 반환", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: "잘못된 입력" }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );

    const r = await refreshKepcoCapaByJibun({ addr: "x", jibun: "1" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("잘못된 입력");
  });

  it("5xx → error 반환", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "서버 에러" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    const r = await refreshKepcoCapaByJibun({ addr: "x", jibun: "1" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("서버 에러");
  });

  it("network throw → error 반환", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network fail"));

    const r = await refreshKepcoCapaByJibun({ addr: "x", jibun: "1" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Network fail");
  });
});
