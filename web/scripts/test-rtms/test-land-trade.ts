/**
 * RTMS 토지매매 라이브 호출 검증 스크립트.
 *
 * 실행 (web/ 안에서):
 *   npx tsx --env-file=.env.local scripts/test-rtms/test-land-trade.ts
 *
 * 시나리오:
 *   1. 강남구(11680) → 도시·거래 多 (≥1건)
 *   2. 시골 시군구 → 0~소량 (NO_DATA 안전 검증)
 *
 * 회귀 방지:
 *   - 응답 필드명 바뀌면 normalize() 실패 → 평당가 0 검출
 *   - User-Agent 누락 시 400 Request Blocked → 첫 호출에서 발견
 */
export {};

import { getLandTradesByBjd } from "../../lib/rtms/land-trade";
import { computeLandStats } from "../../lib/rtms/trade-stats";

interface TestCase {
  name: string;
  bjdCode: string;
  expectMin: number; // 최소 거래 건수 (도시는 ≥1, 시골은 0 허용)
}

const CASES: TestCase[] = [
  { name: "강남구 자곡동 (도시·거래 多)", bjdCode: "1168010300", expectMin: 1 },
  { name: "고령군 개진면 (시골)", bjdCode: "4783035000", expectMin: 0 },
];

async function main() {
  console.log("=== RTMS 토지매매 라이브 검증 ===\n");

  for (const tc of CASES) {
    console.log(`▶ ${tc.name} (bjd=${tc.bjdCode})`);
    const start = Date.now();
    try {
      const rows = await getLandTradesByBjd(tc.bjdCode, 3); // 3개월만 테스트 (빠름)
      const elapsed = Date.now() - start;
      const stats = computeLandStats(rows, 3);

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
          jimok: sample.jimok,
          area_m2: sample.area_m2,
          price_won: sample.price_won,
          pricePerPyeong: sample.pricePerPyeong,
          zoning: sample.zoning,
          umdNm: sample.umdNm,
        });
        console.log("  통계:", {
          total: stats.total,
          medianPricePerPyeong: stats.medianPricePerPyeong,
          byCategory: stats.byCategory.slice(0, 3),
        });

        // 정규화 sanity check
        const broken = rows.filter(
          (r) => r.price_won <= 0 || r.area_m2 <= 0 || r.pricePerPyeong <= 0,
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
