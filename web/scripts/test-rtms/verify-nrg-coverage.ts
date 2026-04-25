/**
 * 상업업무용(NrgTrade) 데이터 커버리지 검증.
 *
 * 검증 목적:
 *   1. 공장·창고가 이 endpoint 에 포함되는지 (buildingUse 분포)
 *   2. 산업단지 지역에서 공장/창고 비중 확인
 *   3. 마스킹 패턴 (일반 vs 집합)
 *
 * 실행 (web/ 안):
 *   npx tsx --env-file=.env.local scripts/test-rtms/verify-nrg-coverage.ts
 */
export {};

import { XMLParser } from "fast-xml-parser";

const ENDPOINT =
  "https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade";
const KEY = process.env.DATA_GO_KR_KEY || "";
const UA = "Mozilla/5.0 (compatible; SUNLAP/1.0; +https://sunlap.kr)";

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

interface NrgItem {
  buildingType?: string; // "일반"/"집합"
  buildingUse?: string; // "업무"/"공장"/"창고"/"제2종근린생활" 등
  jibun?: string;
  dealAmount?: string;
  buildingAr?: string;
  umdNm?: string;
  floor?: string;
}

const REGIONS = [
  { name: "강남구 (사무·상가 위주)", lawd: "11680" },
  { name: "평택시 (산업단지)", lawd: "41220" },
  { name: "화성시 (산업단지)", lawd: "41590" },
  { name: "안성시 (산업+농촌)", lawd: "41550" },
  { name: "시흥시 (반월·시화 산단)", lawd: "41390" },
  { name: "고령군 (시골)", lawd: "47830" },
];

async function fetchAllItems(lawd: string, ym: string): Promise<NrgItem[]> {
  const params = new URLSearchParams({
    serviceKey: KEY,
    LAWD_CD: lawd,
    DEAL_YMD: ym,
    numOfRows: "200",
    pageNo: "1",
  });
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const data = parser.parse(text);
  const code = data?.response?.header?.resultCode;
  if (code && code !== "00" && code !== "000") {
    if (code === "03") return [];
    throw new Error(`RTMS ${code}: ${data?.response?.header?.resultMsg}`);
  }
  const items = data?.response?.body?.items;
  if (!items || typeof items !== "object") return [];
  const raw = items.item;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

async function main() {
  console.log("=== 상업업무용(NrgTrade) 커버리지 검증 ===\n");
  console.log("질문: 공장/창고가 이 endpoint 에 포함되는가?\n");

  const ym = "202602";
  for (const region of REGIONS) {
    try {
      const items = await fetchAllItems(region.lawd, ym);
      console.log(`▶ ${region.name} (${region.lawd}, ${ym}) — 총 ${items.length}건`);

      // buildingUse 분포
      const useCount = new Map<string, number>();
      const typeMaskCount = { 일반_총: 0, 일반_마스킹: 0, 집합_총: 0, 집합_마스킹: 0 };
      const factoryItems: NrgItem[] = [];

      for (const it of items) {
        const use = it.buildingUse?.trim() || "(미상)";
        useCount.set(use, (useCount.get(use) ?? 0) + 1);

        const isMasked = !!it.jibun?.includes("*");
        if (it.buildingType === "일반") {
          typeMaskCount.일반_총++;
          if (isMasked) typeMaskCount.일반_마스킹++;
        } else if (it.buildingType === "집합") {
          typeMaskCount.집합_총++;
          if (isMasked) typeMaskCount.집합_마스킹++;
        }

        if (use.includes("공장") || use.includes("창고") || use.includes("산업")) {
          factoryItems.push(it);
        }
      }

      // 상위 분포
      const top = Array.from(useCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
      console.log("  buildingUse 분포 (상위 8):");
      for (const [k, v] of top) console.log(`    ${k.padEnd(20)} ${v}건`);

      console.log("  마스킹 패턴:");
      console.log(
        `    일반: ${typeMaskCount.일반_마스킹}/${typeMaskCount.일반_총} 마스킹`,
      );
      console.log(
        `    집합: ${typeMaskCount.집합_마스킹}/${typeMaskCount.집합_총} 마스킹`,
      );

      if (factoryItems.length > 0) {
        console.log(`  ⭐ 공장/창고/산업 매매: ${factoryItems.length}건`);
        for (const it of factoryItems.slice(0, 3)) {
          console.log(
            `    - ${it.buildingUse} | ${it.umdNm} ${it.jibun} | ${it.buildingAr}㎡ | ${it.dealAmount}만원`,
          );
        }
      } else {
        console.log("  ❌ 공장/창고 매매 없음");
      }
      console.log();
    } catch (err) {
      console.error(`  호출 실패:`, err);
    }
  }
}

main();
