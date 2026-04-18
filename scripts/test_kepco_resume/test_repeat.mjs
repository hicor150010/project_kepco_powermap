/**
 * 우보면 리 목록 조회 반복 테스트
 * 목적: 어떤 상황에서 실패하는지 패턴 파악
 *
 * Phase 1: 새 세션 + 30회 연속 반복 (빠른 연속 호출)
 * Phase 2: 누적 500 요청 만든 후 우보면 리 목록 10회
 * Phase 3: 군위군 내 동/면 순차 순회 (실제 크롤링 흐름 재현)
 * Phase 4: 동일 세션 오래 쓰고 (30분 대기 대신 단축) 우보면 리 목록
 */

const BASE_URL = "https://online.kepco.co.kr";
const HEADERS = {
  "Content-Type": "application/json",
  "Referer": "https://online.kepco.co.kr/EWM092D00",
  "Accept": "application/json, text/plain, */*",
  "Origin": "https://online.kepco.co.kr",
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

let cookieJar = "";
let reqCount = 0;

async function initSession() {
  const r = await fetch(`${BASE_URL}/EWM092D00`, { headers: HEADERS });
  const setCookie = r.headers.getSetCookie?.() || [];
  cookieJar = setCookie.map((c) => c.split(";")[0]).join("; ");
  reqCount = 0;
  console.log(`  [세션 초기화] status=${r.status}`);
}

async function post(path, body) {
  reqCount += 1;
  const headers = { ...HEADERS };
  if (cookieJar) headers["Cookie"] = cookieJar;
  const start = Date.now();
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const ms = Date.now() - start;
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    return { ok: false, status: r.status, ms, text: text.slice(0, 200) };
  }
  try {
    const data = await r.json();
    return { ok: true, status: r.status, ms, data };
  } catch (e) {
    return { ok: false, status: r.status, ms, text: `JSON parse: ${e.message}` };
  }
}

async function getUiboLiList() {
  const body = {
    dma_addrGbn: {
      gbn: "3",
      addr_do: "대구광역시",
      addr_si: "-기타지역",
      addr_gu: "군위군",
      addr_lidong: "우보면",
      addr_li: "",
      addr_jibun: "",
    },
  };
  return await post("/ew/cpct/retrieveAddrGbn", body);
}

async function getAddrList(gbn, { addr_do = "", addr_si = "", addr_gu = "", addr_lidong = "", addr_li = "" } = {}) {
  return await post("/ew/cpct/retrieveAddrGbn", {
    dma_addrGbn: { gbn: String(gbn), addr_do, addr_si, addr_gu, addr_lidong, addr_li, addr_jibun: "" },
  });
}

async function searchCapacity(args) {
  return await post("/ew/cpct/retrieveMeshNo", { dma_reqParam: { searchCondition: "address", ...args } });
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function summarize(results, label) {
  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  const msList = results.map((r) => r.ms);
  const avg = Math.round(msList.reduce((a, b) => a + b, 0) / msList.length);
  const max = Math.max(...msList);
  console.log(`  [${label}] ✓${ok} ✘${fail}  avg=${avg}ms  max=${max}ms`);
  if (fail > 0) {
    results.forEach((r, i) => {
      if (!r.ok) console.log(`    실패 #${i + 1}: status=${r.status} text=${r.text?.slice(0, 150)}`);
    });
  }
  return { ok, fail };
}

// ══════════════════════════════════════════════

async function phase1() {
  console.log("\n════ Phase 1: 새 세션 + 우보면 리 목록 30회 연속 (0.3s 간격) ════");
  await initSession();
  const results = [];
  for (let i = 0; i < 30; i++) {
    const r = await getUiboLiList();
    results.push(r);
    const liCount = r.ok ? (r.data?.dlt_addrGbn || []).length : "?";
    process.stdout.write(`${r.ok ? "." : "X"}(${liCount})`);
    await sleep(300);
  }
  console.log();
  summarize(results, "Phase 1");
}

async function phase2() {
  console.log("\n════ Phase 2: 같은 세션에서 500 요청 누적 후 우보면 리 목록 10회 ════");
  await initSession();
  console.log("  워밍업 (다른 주소 요청 500회)...");
  // 워밍업: 다양한 주소 계층 요청
  const warmupDoList = ["서울특별시", "부산광역시", "인천광역시", "대전광역시", "광주광역시"];
  let warmupFailed = 0;
  for (let i = 0; i < 500; i++) {
    const d = warmupDoList[i % warmupDoList.length];
    const r = await getAddrList(0, { addr_do: d });
    if (!r.ok) warmupFailed++;
    if ((i + 1) % 100 === 0) process.stdout.write(`  누적 ${i + 1}/500 (실패 ${warmupFailed})\n`);
    await sleep(100);
  }
  console.log(`  워밍업 완료 (총 ${reqCount}건, 실패 ${warmupFailed}건)`);
  await sleep(500);

  const results = [];
  for (let i = 0; i < 10; i++) {
    const r = await getUiboLiList();
    results.push(r);
    const liCount = r.ok ? (r.data?.dlt_addrGbn || []).length : "?";
    process.stdout.write(`${r.ok ? "." : "X"}(${liCount})`);
    await sleep(500);
  }
  console.log();
  summarize(results, "Phase 2");
}

async function phase3() {
  console.log("\n════ Phase 3: 군위군 내 동/면 순차 순회 (크롤링 흐름 재현) ════");
  await initSession();

  // 군위군 동/면 목록
  const dongRes = await getAddrList(2, { addr_do: "대구광역시", addr_si: "-기타지역", addr_gu: "군위군" });
  if (!dongRes.ok) {
    console.log("  ✘ 동/면 목록 실패");
    return;
  }
  const dongs = (dongRes.data?.dlt_addrGbn || []).map((it) => it.ADDR_LIDONG);
  console.log(`  군위군 동/면 ${dongs.length}개: ${dongs.join(", ")}`);

  // 우보면 전까지 각 동/면 리 목록만 호출 (지번 순회는 skip, 시간 절약)
  const uiboIdx = dongs.indexOf("우보면");
  let failed = 0;
  for (let i = 0; i < uiboIdx; i++) {
    const d = dongs[i];
    const r = await getAddrList(3, { addr_do: "대구광역시", addr_si: "-기타지역", addr_gu: "군위군", addr_lidong: d });
    const liCount = r.ok ? (r.data?.dlt_addrGbn || []).length : "?";
    console.log(`  ${i + 1}/${dongs.length} ${d}: 리 ${liCount}개 ${r.ok ? "✓" : "✘"}`);
    if (!r.ok) failed++;
    // 각 동/면마다 3개 리의 번지 목록만 호출 (실제 크롤링 흐름 일부 재현)
    if (r.ok && (r.data?.dlt_addrGbn || []).length > 0) {
      const liSample = (r.data.dlt_addrGbn || []).slice(0, 3).map((it) => it.ADDR_LI);
      for (const li of liSample) {
        const jibunRes = await getAddrList(4, {
          addr_do: "대구광역시", addr_si: "-기타지역", addr_gu: "군위군", addr_lidong: d, addr_li: li,
        });
        if (!jibunRes.ok) failed++;
        // 첫 번지만 search
        const jibuns = (jibunRes.data?.dlt_addrGbn || []).slice(0, 1).map((it) => it.ADDR_JIBUN);
        for (const j of jibuns) {
          const s = await searchCapacity({
            do: "대구광역시", si: "-기타지역", gu: "군위군", lidong: d, li, jibun: j,
          });
          if (!s.ok) failed++;
          await sleep(200);
        }
        await sleep(200);
      }
    }
    await sleep(300);
  }
  console.log(`  누적 요청 ${reqCount}건, 실패 ${failed}건`);

  console.log("\n  ★ 우보면 리 목록 요청 (실패했던 지점) — 5회 반복");
  const results = [];
  for (let i = 0; i < 5; i++) {
    const r = await getUiboLiList();
    results.push(r);
    const liCount = r.ok ? (r.data?.dlt_addrGbn || []).length : "?";
    console.log(`    #${i + 1}: ${r.ok ? "✓" : "✘"} ${liCount}개 (${r.ms}ms)`);
    await sleep(500);
  }
  summarize(results, "Phase 3 (우보면 리 목록)");
}

async function phase4() {
  console.log("\n════ Phase 4: 3분 세션 유휴 후 우보면 리 목록 ════");
  await initSession();
  // 첫 요청
  const first = await getUiboLiList();
  console.log(`  초기 호출: ${first.ok ? "✓" : "✘"} (${first.ms}ms)`);

  console.log("  3분 유휴...");
  await sleep(180_000);

  const results = [];
  for (let i = 0; i < 5; i++) {
    const r = await getUiboLiList();
    results.push(r);
    const liCount = r.ok ? (r.data?.dlt_addrGbn || []).length : "?";
    console.log(`    #${i + 1}: ${r.ok ? "✓" : "✘"} ${liCount}개 (${r.ms}ms)`);
    await sleep(500);
  }
  summarize(results, "Phase 4");
}

async function main() {
  const args = process.argv.slice(2);
  const only = args[0];  // "1" | "2" | "3" | "4" | 없으면 전부

  if (!only || only === "1") await phase1();
  if (!only || only === "2") await phase2();
  if (!only || only === "3") await phase3();
  if (only === "4") await phase4();  // 시간 오래 걸리므로 명시 지정 시에만

  console.log("\n═══ 전체 완료 ═══");
}

main().catch((e) => {
  console.error("치명적 오류:", e);
  process.exit(1);
});
