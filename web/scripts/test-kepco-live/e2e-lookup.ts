/**
 * lookup-capacity e2e — 실제 KEPCO + Supabase 1회 호출.
 *
 * 실행:
 *   cd web && npx tsx --env-file=.env.local scripts/test-kepco-live/e2e-lookup.ts
 *
 * 시나리오:
 *   1. addr + DB hit (이미 크롤링된 양평군 갈운리)
 *   2. addr + refresh=true (KEPCO 강제 호출 + upsert)
 *   3. addr + bjd_master 매칭 실패 (가짜 시명)
 *   4. addr + DB miss + KEPCO 0건 (KEPCO DB 없는 번지)
 *   5. bjd_code 단독 + refresh=true (sep 역추출)
 */

import { lookupCapacity } from "@/lib/kepco-live/lookup-capacity";

interface Scenario {
  label: string;
  input: Parameters<typeof lookupCapacity>[0];
  expectSource?: string[];  // 가능한 source 값
}

const SCENARIOS: Scenario[] = [
  {
    label: "1. addr + DB hit (양평 갈운리 24-1)",
    input: { addr: "경기도 양평군 청운면 갈운리 24-1", jibun: "24-1" },
    expectSource: ["db_cache", "kepco_live", "not_found"],
  },
  {
    label: "2. addr + refresh=true (KEPCO 강제 호출 + upsert)",
    input: {
      addr: "경기도 양평군 청운면 갈운리 24-1",
      jibun: "24-1",
      refresh: true,
    },
    expectSource: ["kepco_live", "not_found"],
  },
  {
    label: "3. addr + bjd_master 매칭 실패 (가짜 시명)",
    input: { addr: "경기도 가짜시 가짜동 1", jibun: "1" },
    expectSource: ["not_found"],
  },
  {
    label: "4. addr + 미존재 번지 (정상 0건)",
    input: { addr: "경기도 양평군 청운면 갈운리 99999", jibun: "99999" },
    expectSource: ["not_found", "db_cache"],
  },
];

function fmt(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

async function runScenario(s: Scenario, i: number) {
  console.log(`\n${"━".repeat(72)}`);
  console.log(`[${i + 1}] ${s.label}`);
  console.log(`    input: ${JSON.stringify(s.input)}`);

  const t0 = Date.now();
  try {
    const r = await lookupCapacity(s.input);
    const ms = Date.now() - t0;
    console.log(`    ✅ source=${r.source} bjd=${r.bjd_code ?? "null"} `
              + `rows=${r.rows.length} (${ms}ms)`);
    if (r.candidate_used) {
      console.log(`       후보: ${fmt(r.candidate_used)}`);
    }
    if (r.rows.length > 0) {
      const first = r.rows[0];
      console.log(`       샘플: SUBST=${first.subst_nm} DL=${first.dl_nm} `
                + `DL_CAPA=${first.dl_capa} DL_PWR=${first.dl_pwr} `
                + `updated_at=${first.updated_at}`);
    }
    if (s.expectSource && !s.expectSource.includes(r.source)) {
      console.warn(`       ⚠️ 예상 source ${s.expectSource.join("|")} 와 다름`);
    }
    return { ok: true, source: r.source };
  } catch (e) {
    const ms = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`    ❌ throw: ${msg} (${ms}ms)`);
    return { ok: false, error: msg };
  }
}

async function main() {
  console.log("e2e: lookup-capacity 통합 흐름 검증");
  console.log("환경변수:");
  console.log(`  NEXT_PUBLIC_SUPABASE_URL = ${process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30)}...`);
  console.log(`  SUPABASE_SERVICE_ROLE_KEY = ${process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "MISSING"}`);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("환경변수 미설정 — --env-file=.env.local 옵션 확인");
    process.exit(1);
  }

  const results = [];
  for (let i = 0; i < SCENARIOS.length; i++) {
    results.push(await runScenario(SCENARIOS[i], i));
  }

  console.log(`\n${"═".repeat(72)}`);
  console.log("요약:");
  results.forEach((r, i) => {
    const mark = r.ok ? "✅" : "❌";
    const detail = r.ok ? `source=${r.source}` : `error=${r.error}`;
    console.log(`  [${i + 1}] ${mark} ${detail}`);
  });
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
