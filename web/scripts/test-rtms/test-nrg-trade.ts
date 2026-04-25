/**
 * RTMS 상업·업무용(NrgTrade) 라이브 호출 검증 스크립트.
 *
 * 실행 (web/ 안):
 *   npx tsx --env-file=.env.local scripts/test-rtms/test-nrg-trade.ts
 *
 * 회귀 방지:
 *   - 응답 필드명 바뀌면 normalize() 실패 → 평당가 0 검출
 *   - User-Agent 누락 시 400 Request Blocked → 첫 호출에서 발견
 *   - 마스킹 패턴 (집합=정확/일반=마스킹) 일관성 확인
 */
export {};

import { getNrgTradesByBjd } from "../../lib/rtms/nrg-trade";
import { computeNrgStats } from "../../lib/rtms/trade-stats";

interface TestCase {
  name: string;
  bjdCode: string;
  expectMin: number;
}

const CASES: TestCase[] = [
  { name: "강남구 자곡동 (도시·거래 多)", bjdCode: "1168010300", expectMin: 1 },
  { name: "고령군 개진면 (시골)", bjdCode: "4783035000", expectMin: 0 },
];

async function main() {
  console.log("=== RTMS 상업·업무용 라이브 검증 ===\n");

  for (const tc of CASES) {
    console.log(`▶ ${tc.name} (bjd=${tc.bjdCode})`);
    const start = Date.now();
    try {
      const rows = await getNrgTradesByBjd(tc.bjdCode, 3);
      const elapsed = Date.now() - start;
      const stats = computeNrgStats(rows, 3);

      console.log(`  ✅ ${rows.length}건 (${elapsed}ms)`);
      if (rows.length < tc.expectMin) {
        console.error(`  ❌ 기대 최소 ${tc.expectMin}건, 실제 ${rows.length}건`);
        process.exitCode = 1;
      }

      if (rows.length > 0) {
        const sample = rows[0];
        console.log("  샘플:", {
          dealYmd: sample.dealYmd,
          jibun: sample.jibun,
          buildingType: sample.buildingType,
          buildingUse: sample.buildingUse,
          buildYear: sample.buildYear,
          buildingAr: sample.buildingAr,
          floor: sample.floor,
          price_won: sample.price_won,
          pricePerPyeong: sample.pricePerPyeong,
          zoning: sample.zoning,
          umdNm: sample.umdNm,
          buyerGbn: sample.buyerGbn,
          slerGbn: sample.slerGbn,
        });
        console.log("  통계:", {
          total: stats.total,
          medianPricePerPyeong: stats.medianPricePerPyeong,
          byCategory: stats.byCategory.slice(0, 3),
        });

        // 마스킹 일관성 sanity check
        const 일반총 = rows.filter((r) => r.buildingType === "일반").length;
        const 일반마스킹 = rows.filter(
          (r) => r.buildingType === "일반" && r.jibun.includes("*"),
        ).length;
        const 집합총 = rows.filter((r) => r.buildingType === "집합").length;
        const 집합마스킹 = rows.filter(
          (r) => r.buildingType === "집합" && r.jibun.includes("*"),
        ).length;
        console.log(
          `  마스킹: 일반 ${일반마스킹}/${일반총} · 집합 ${집합마스킹}/${집합총}`,
        );
        if (일반총 > 0 && 일반마스킹 < 일반총) {
          console.warn(
            `  ⚠️ 일반건축물 일부가 마스킹 안 됨 — 정책 변경 가능성`,
          );
        }
        if (집합총 > 0 && 집합마스킹 > 0) {
          console.warn(`  ⚠️ 집합건축물 일부가 마스킹됨 — 정책 변경 가능성`);
        }

        const broken = rows.filter(
          (r) =>
            r.price_won <= 0 || r.buildingAr <= 0 || r.pricePerPyeong <= 0,
        );
        if (broken.length > 0) {
          console.error(`  ❌ ${broken.length}건 정규화 실패`);
          process.exitCode = 1;
        }
      }
    } catch (err) {
      console.error(`  ❌ 호출 실패:`, err);
      process.exitCode = 1;
    }
    console.log();
  }

  console.log(process.exitCode ? "❌ 일부 실패" : "✅ 전체 통과");
}

main();
