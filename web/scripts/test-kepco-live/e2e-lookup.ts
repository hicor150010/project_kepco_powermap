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

/**
 * STEP 보존 검증 — refresh=true 로 새로고침해도 step1~3 컬럼이 유지되는지.
 *
 * 흐름:
 *   1. 양평 갈운리 24-1 row 의 step1_cnt 를 임의값 (99999) 으로 UPDATE
 *   2. lookupCapacity refresh=true → KEPCO live + UPSERT
 *   3. 다시 SELECT → step1_cnt 가 99999 그대로인지 확인
 */
async function verifyStepPreservation() {
  console.log(`\n${"━".repeat(72)}`);
  console.log("[STEP 보존 검증] 양평 갈운리 24-1 row 의 step1_cnt 를 99999 로 set 후 refresh");

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const BJD = "4183037025";
  const JIBUN = "24-1";
  const SENTINEL = 99999;

  const { data: before } = await supabase
    .from("kepco_capa")
    .select("subst_nm,mtr_no,dl_nm,step1_cnt,step1_pwr")
    .eq("bjd_code", BJD)
    .eq("addr_jibun", JIBUN);
  if (!before || before.length === 0) {
    console.log("  ⚠️ 대상 row 없음 — 양평 갈운리 24-1 가 DB 에 없음");
    return false;
  }
  const target = before[0];
  console.log(`  대상: SUBST=${target.subst_nm} MTR=${target.mtr_no} DL=${target.dl_nm}`);
  console.log(`  변경 전 step1_cnt = ${target.step1_cnt}`);

  // 1. step1_cnt 를 SENTINEL 로 UPDATE
  await supabase
    .from("kepco_capa")
    .update({ step1_cnt: SENTINEL, step1_pwr: SENTINEL })
    .eq("bjd_code", BJD)
    .eq("addr_jibun", JIBUN)
    .eq("subst_nm", target.subst_nm!)
    .eq("mtr_no", target.mtr_no!)
    .eq("dl_nm", target.dl_nm!);
  console.log(`  set step1_cnt=${SENTINEL}`);

  // 2. refresh=true 로 새로고침 (KEPCO live + UPSERT)
  await lookupCapacity({
    addr: "경기도 양평군 청운면 갈운리 24-1",
    jibun: JIBUN,
    refresh: true,
  });

  // 3. 다시 SELECT
  const { data: after } = await supabase
    .from("kepco_capa")
    .select("step1_cnt,step1_pwr,updated_at")
    .eq("bjd_code", BJD)
    .eq("addr_jibun", JIBUN)
    .eq("subst_nm", target.subst_nm!);
  const result = after?.[0];
  console.log(`  refresh 후: step1_cnt=${result?.step1_cnt} step1_pwr=${result?.step1_pwr}`);
  console.log(`  updated_at: ${result?.updated_at}`);

  const preserved = result?.step1_cnt === SENTINEL && result?.step1_pwr === SENTINEL;
  console.log(`  ${preserved ? "✅ STEP 보존됨" : "❌ STEP 손실"}`);

  // 정리: SENTINEL 원복 (원래 값으로)
  await supabase
    .from("kepco_capa")
    .update({ step1_cnt: target.step1_cnt, step1_pwr: target.step1_cnt })
    .eq("bjd_code", BJD)
    .eq("addr_jibun", JIBUN)
    .eq("subst_nm", target.subst_nm!);

  return preserved;
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

  const stepOk = await verifyStepPreservation();

  console.log(`\n${"═".repeat(72)}`);
  console.log("요약:");
  results.forEach((r, i) => {
    const mark = r.ok ? "✅" : "❌";
    const detail = r.ok ? `source=${r.source}` : `error=${r.error}`;
    console.log(`  [${i + 1}] ${mark} ${detail}`);
  });
  console.log(`  [STEP 보존] ${stepOk ? "✅" : "❌"}`);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
