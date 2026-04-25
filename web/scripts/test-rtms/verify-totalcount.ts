/**
 * 871건 의심 검증 — 고령군 12개월 각 월별 totalCount 직접 수신.
 *
 * 실행 (web/ 안):
 *   npx tsx --env-file=.env.local scripts/test-rtms/verify-totalcount.ts
 *
 * 우리 lib 거치지 않고 RTMS 직접 호출 → totalCount 만 출력 → 합산.
 * 우리 시스템 응답 871건과 일치하는지 비교.
 */
export {};

import { XMLParser } from "fast-xml-parser";

const ENDPOINT =
  "https://apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade";
const KEY = process.env.DATA_GO_KR_KEY || "";
const UA = "Mozilla/5.0 (compatible; SUNLAP/1.0; +https://sunlap.kr)";
const LAWD_CD = "47830"; // 고령군

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

function recentYms(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

async function fetchTotal(ym: string): Promise<number> {
  const params = new URLSearchParams({
    serviceKey: KEY,
    LAWD_CD,
    DEAL_YMD: ym,
    numOfRows: "1",
    pageNo: "1",
  });
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const data = parser.parse(text);
  const tc = data?.response?.body?.totalCount;
  return Number(tc) || 0;
}

async function main() {
  console.log(`=== 고령군(${LAWD_CD}) 12개월 totalCount 직접 검증 ===\n`);
  const yms = recentYms(12);
  const results = await Promise.all(
    yms.map(async (ym) => ({ ym, total: await fetchTotal(ym) })),
  );

  let sum = 0;
  for (const r of results) {
    console.log(`  ${r.ym}: ${r.total}건`);
    sum += r.total;
  }
  console.log(`\n  ▶ 합계: ${sum}건`);
  console.log(`  ▶ 우리 시스템 표시: 871건`);
  console.log(
    sum === 871
      ? "  ✅ 정확히 일치"
      : `  ⚠️ 차이 ${Math.abs(sum - 871)}건 — UI 가 호출 시점 이후 갱신됐을 수 있음`,
  );
}

main();
