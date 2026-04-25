/**
 * callKepcoSearch 단위 테스트 — fetch mock.
 *
 * 검증 항목:
 *   - 정상 200 → dlt_resultList 반환
 *   - 빈 dlt_resultList → []
 *   - 5xx → 재시도 → 200 성공
 *   - 5xx 4회 (초기 + 3 재시도) → throw
 *   - 4xx → 즉시 throw (재시도 안 함)
 *   - 세션 cache 재사용 (TTL 내 두 번째 호출 시 SESSION_PATH GET 1회만)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  callKepcoSearch,
  __resetSessionForTest,
} from "./kepco-client";

const SAMPLE_ROW = {
  SUBST_NM: "서홍천", SUBST_CD: "D337",
  MTR_NO: "4", DL_NM: "산음", DL_CD: "04",
  SUBST_CAPA: 0, SUBST_PWR: "0", G_SUBST_CAPA: "0",
  MTR_CAPA: 0, MTR_PWR: "0", G_MTR_CAPA: "0",
  DL_CAPA: 0, DL_PWR: 0, G_DL_CAPA: "0",
};

const FIELDS = {
  do: "경기도", si: "-기타지역", gu: "양평군",
  lidong: "청운면", li: "갈운리",
};

function mockResponse(status: number, body: unknown, setCookie?: string): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (setCookie) headers.set("set-cookie", setCookie);
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers,
  });
}

beforeEach(() => {
  __resetSessionForTest();
  vi.restoreAllMocks();
});

describe("callKepcoSearch — 정상 동작", () => {
  it("200 OK + dlt_resultList → 결과 반환", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockResponse(200, "", "JSESSIONID=abc123"))
      .mockResolvedValueOnce(mockResponse(200, { dlt_resultList: [SAMPLE_ROW] }));

    const res = await callKepcoSearch(FIELDS, "24-1");
    expect(res).toHaveLength(1);
    expect(res[0].SUBST_NM).toBe("서홍천");
    expect(fetchMock).toHaveBeenCalledTimes(2); // 세션 GET + POST
  });

  it("빈 dlt_resultList → []", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockResponse(200, ""))
      .mockResolvedValueOnce(mockResponse(200, { dlt_resultList: [] }));

    const res = await callKepcoSearch(FIELDS, "9999");
    expect(res).toEqual([]);
  });

  it("dlt_resultList 필드 부재 → []", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockResponse(200, ""))
      .mockResolvedValueOnce(mockResponse(200, {}));

    const res = await callKepcoSearch(FIELDS, "1");
    expect(res).toEqual([]);
  });
});

describe("callKepcoSearch — 재시도", () => {
  it("5xx → 재시도 → 200 성공 (재시도 1회)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockResponse(200, "")) // 세션 #1
      .mockResolvedValueOnce(mockResponse(503, "")) // POST #1 → 5xx
      .mockResolvedValueOnce(mockResponse(200, "")) // 세션 재생성
      .mockResolvedValueOnce(mockResponse(200, { dlt_resultList: [SAMPLE_ROW] })); // POST #2

    const res = await callKepcoSearch(FIELDS, "24-1");
    expect(res).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("5xx 모든 재시도 실패 (4회 시도) → throw", async () => {
    // 세션 GET + POST 5xx 시 세션 무효화 후 다음 시도에서 다시 세션 GET
    // 4회 시도 = 4 POST = 4 세션 GET + 4 POST = 8 fetch
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(mockResponse(503, ""));

    await expect(callKepcoSearch(FIELDS, "24-1")).rejects.toThrow(/KEPCO 503/);
    expect(fetchMock).toHaveBeenCalled();
  }, 10_000);

  it("4xx → 즉시 throw (재시도 안 함)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockResponse(200, ""))
      .mockResolvedValueOnce(mockResponse(400, "bad request"));

    await expect(callKepcoSearch(FIELDS, "24-1")).rejects.toThrow(/KEPCO 400/);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 세션 + POST 한 번 (재시도 X)
  });
});

describe("callKepcoSearch — 세션 cache", () => {
  it("연속 호출 시 세션 GET 1회만 (cache 재사용)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockResponse(200, "", "JSESSIONID=abc"))
      .mockResolvedValueOnce(mockResponse(200, { dlt_resultList: [SAMPLE_ROW] }))
      .mockResolvedValueOnce(mockResponse(200, { dlt_resultList: [] }));

    await callKepcoSearch(FIELDS, "24-1");
    await callKepcoSearch(FIELDS, "9999");

    expect(fetchMock).toHaveBeenCalledTimes(3); // GET 1 + POST 2
  });
});

describe("callKepcoSearch — 요청 body 형식", () => {
  it("dma_reqParam 으로 5필드+jibun 전달", async () => {
    let capturedBody: string | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url, init) => {
        if (String(url).endsWith("/EWM092D00")) return mockResponse(200, "");
        capturedBody = init?.body as string;
        return mockResponse(200, { dlt_resultList: [] });
      }
    );

    await callKepcoSearch(FIELDS, "24-1");

    expect(capturedBody).toBeTruthy();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed).toEqual({
      dma_reqParam: {
        searchCondition: "address",
        do: "경기도",
        si: "-기타지역",
        gu: "양평군",
        lidong: "청운면",
        li: "갈운리",
        jibun: "24-1",
      },
    });
  });
});
