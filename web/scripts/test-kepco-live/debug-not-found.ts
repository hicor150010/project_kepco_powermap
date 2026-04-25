/**
 * not_found 진단 — 사용자가 클릭한 지번이 진짜 KEPCO 에 없는지 vs 우리 룰 매칭 실패인지.
 *
 * 흐름:
 *   1. bjd_code → bjd_master 에서 sep_1~5 가져오기
 *   2. parseKoreanAddress (sep + jibun)
 *   3. buildKepcoCandidates 로 후보 N개 생성
 *   4. 후보별로 KEPCO callKepcoSearch + gbn=4 (번지 목록) 출력
 *
 * 실행: cd web && npx tsx --env-file=.env.local scripts/test-kepco-live/debug-not-found.ts
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { parseKoreanAddress } from "@/lib/kepco-live/parse-address";
import { buildKepcoCandidates } from "@/lib/kepco-live/build-candidates";
import { callKepcoSearch } from "@/lib/kepco-live/kepco-client";

const CASES = [
  { bjd_code: "5273032028", jibun: "177", note: "전북 — 사용자 보고 #1" },
  { bjd_code: "5272038027", jibun: "293-2", note: "전북 — 사용자 보고 #2" },
  { bjd_code: "5271040021", jibun: "100-1", note: "전북 — 사용자 보고 #3" },
];

const BASE_URL = "https://online.kepco.co.kr";

async function getAddrList(fields: { do: string; si: string; gu: string; lidong: string; li: string }) {
  const body = {
    dma_addrGbn: {
      gbn: "4",
      addr_do: fields.do,
      addr_si: fields.si,
      addr_gu: fields.gu,
      addr_lidong: fields.lidong,
      addr_li: fields.li,
      addr_jibun: "",
    },
  };
  try {
    const r = await fetch(`${BASE_URL}/ew/cpct/retrieveAddrGbn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: `${BASE_URL}/EWM092D00`,
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    const items = json.dlt_addrGbn ?? [];
    return items.map((i: { ADDR_JIBUN?: string }) => i.ADDR_JIBUN ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

async function main() {
  const supabase = createAdminClient();

  for (const c of CASES) {
    console.log(`\n${"━".repeat(75)}`);
    console.log(`[${c.bjd_code}] jibun='${c.jibun}'  (${c.note})`);

    // 1. bjd_master sep
    const { data: bjd } = await supabase
      .from("bjd_master")
      .select("sep_1,sep_2,sep_3,sep_4,sep_5")
      .eq("bjd_code", c.bjd_code)
      .maybeSingle();
    if (!bjd) {
      console.log(`  ❌ bjd_master 에 없음`);
      continue;
    }
    const addr = [bjd.sep_1, bjd.sep_2, bjd.sep_3, bjd.sep_4, bjd.sep_5, c.jibun]
      .filter(Boolean)
      .join(" ");
    console.log(`  주소: ${addr}`);
    console.log(`  sep:  ${JSON.stringify(bjd)}`);

    // 2. parsed + 후보
    const parsed = parseKoreanAddress(addr);
    const candidates = buildKepcoCandidates(parsed);
    console.log(`  후보 ${candidates.length}개`);

    // 3. 각 후보별 search_capacity + gbn=4
    for (const cand of candidates) {
      const fields = {
        do: cand.do, si: cand.si, gu: cand.gu, lidong: cand.lidong, li: cand.li,
      };
      const search = await callKepcoSearch(fields, c.jibun);
      const jibuns = await getAddrList(fields);

      const has24 = jibuns.includes(c.jibun);
      const sample = jibuns.slice(0, 5);
      const mark = search.length > 0 ? "✅" : has24 ? "🟡" : "❌";

      console.log(
        `    ${mark} [${cand.reason}] ` +
        `si='${cand.si}' gu='${cand.gu}' lidong='${cand.lidong}' li='${cand.li}'`,
      );
      console.log(
        `       search_capacity → ${search.length}건  ` +
        `gbn=4 번지목록 → ${jibuns.length}건 ` +
        `('${c.jibun}' 존재? ${has24 ? "✅" : "❌"})`,
      );
      if (sample.length > 0) {
        console.log(`       앞 5번지: ${JSON.stringify(sample)}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
