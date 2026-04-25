/**
 * umdNm 필터링 가능성 검증.
 *
 * 검증 목적:
 *   1. umdNm 필드의 실제 형태 분포 (도시 vs 시골)
 *   2. 읍면동(sep_3) startsWith 매칭이 잘 되는지
 *   3. 리(sep_4) 매칭 가능성
 *   4. 클릭 시나리오별 매칭율
 *
 * 실행 (web/ 안):
 *   npx tsx --env-file=.env.local scripts/test-rtms/verify-umd-filter.ts
 */
export {};

import { getLandTradesByBjd } from "../../lib/rtms/land-trade";
import { getNrgTradesByBjd } from "../../lib/rtms/nrg-trade";

interface Scenario {
  name: string;
  bjdCode: string;
  // 클릭 지번이 속한 가상 sep_3 / sep_4 — 실제 사용자가 클릭했을 때 가정
  clickEmd: string; // sep_3 (읍면동)
  clickRi: string | null; // sep_4 (리)
}

// 실제 사용자가 자주 클릭할 만한 지역 시뮬레이션
const SCENARIOS: Scenario[] = [
  {
    name: "강남구 자곡동 (도시)",
    bjdCode: "1168010300",
    clickEmd: "자곡동",
    clickRi: null,
  },
  {
    name: "고령군 쌍림면 (시골)",
    bjdCode: "4783032000",
    clickEmd: "쌍림면",
    clickRi: "매촌리",
  },
  {
    name: "고령군 대가야읍 (시골)",
    bjdCode: "4783025000",
    clickEmd: "대가야읍",
    clickRi: "지산리",
  },
];

interface PatternReport {
  total: number;
  uniqueUmdCount: number;
  withSpace: number; // "쌍림면 매촌리" 형태
  withoutSpace: number; // "자곡동" 형태
  examples: string[];
  matchByEmd: number; // sep_3 startsWith 매칭
  matchByRi: number; // sep_4 includes 매칭
  matchExactCombo: number; // sep_3 + " " + sep_4 정확
}

function analyze(rows: { umdNm: string }[], scenario: Scenario): PatternReport {
  const set = new Set<string>();
  let withSpace = 0;
  let withoutSpace = 0;
  let matchByEmd = 0;
  let matchByRi = 0;
  let matchExactCombo = 0;
  const combo = scenario.clickRi
    ? `${scenario.clickEmd} ${scenario.clickRi}`
    : scenario.clickEmd;

  for (const r of rows) {
    if (!r.umdNm) continue;
    set.add(r.umdNm);
    if (r.umdNm.includes(" ")) withSpace++;
    else withoutSpace++;

    if (r.umdNm.startsWith(scenario.clickEmd)) matchByEmd++;
    if (scenario.clickRi && r.umdNm.includes(scenario.clickRi)) matchByRi++;
    if (r.umdNm === combo) matchExactCombo++;
  }

  return {
    total: rows.length,
    uniqueUmdCount: set.size,
    withSpace,
    withoutSpace,
    examples: Array.from(set).sort().slice(0, 8),
    matchByEmd,
    matchByRi,
    matchExactCombo,
  };
}

async function runOne(scenario: Scenario, kind: "land" | "nrg") {
  const fetch =
    kind === "land"
      ? getLandTradesByBjd(scenario.bjdCode, 3)
      : getNrgTradesByBjd(scenario.bjdCode, 3);
  const rows = await fetch;
  const report = analyze(rows, scenario);

  console.log(`  [${kind.toUpperCase()}] 총 ${report.total}건`);
  console.log(
    `    고유 umdNm: ${report.uniqueUmdCount}개 (예시: ${report.examples.join(", ")})`,
  );
  console.log(
    `    형태: 공백포함 ${report.withSpace} (읍/면+리) · 동만 ${report.withoutSpace}`,
  );
  console.log(
    `    매칭: startsWith("${scenario.clickEmd}") = ${report.matchByEmd}건` +
      (scenario.clickRi
        ? ` · includes("${scenario.clickRi}") = ${report.matchByRi}건`
        : ""),
  );
  if (scenario.clickRi) {
    const combo = `${scenario.clickEmd} ${scenario.clickRi}`;
    console.log(`    정확 매칭 ("${combo}"): ${report.matchExactCombo}건`);
  }
}

async function main() {
  console.log("=== umdNm 필터링 가능성 검증 ===\n");

  for (const sc of SCENARIOS) {
    console.log(`▶ ${sc.name} (bjd=${sc.bjdCode})`);
    console.log(
      `  시나리오: 클릭 지번 sep_3="${sc.clickEmd}"` +
        (sc.clickRi ? ` sep_4="${sc.clickRi}"` : ""),
    );
    try {
      await runOne(sc, "land");
      await runOne(sc, "nrg");
    } catch (err) {
      console.error("  ❌", err);
    }
    console.log();
  }
}

main();
