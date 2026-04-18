/**
 * 체크포인트 분석:
 *   우보면(6/8) 평호리(14/14) 산86(159/159) — 이라고 저장됨
 * 실제 API 응답 (Step 3):
 *   우보면 리 = 9개 (평호리 없음)
 *
 * 가설: 체크포인트 dong_name 이 잘못 저장됨. 실제로는 "소보면 평호리 산86" 이었을 것.
 * 검증: 소보면의 리가 14개이고, 그 14번째가 평호리이며, 평호리의 번지가 159개이고 마지막이 산86인지 확인.
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

async function initSession() {
  const r = await fetch(`${BASE_URL}/EWM092D00`, { headers: HEADERS });
  const setCookie = r.headers.getSetCookie?.() || [];
  cookieJar = setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function post(path, body) {
  const headers = { ...HEADERS };
  if (cookieJar) headers["Cookie"] = cookieJar;
  const r = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

async function getAddrList({ gbn, addr_do = "", addr_si = "", addr_gu = "", addr_lidong = "", addr_li = "" }) {
  const data = await post("/ew/cpct/retrieveAddrGbn", {
    dma_addrGbn: { gbn: String(gbn), addr_do, addr_si, addr_gu, addr_lidong, addr_li, addr_jibun: "" },
  });
  const keyMap = { 0: "ADDR_SI", 1: "ADDR_GU", 2: "ADDR_LIDONG", 3: "ADDR_LI", 4: "ADDR_JIBUN" };
  return (data.dlt_addrGbn || []).map((it) => it[keyMap[gbn]]).filter(Boolean);
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function main() {
  await initSession();

  console.log("═══ 가설 검증: 체크포인트의 '우보면' 은 실제로 '소보면' 이었을 것 ═══\n");

  console.log("▶ 1. 소보면 리 목록");
  const soboLi = await getAddrList({
    gbn: 3, addr_do: "대구광역시", addr_si: "-기타지역", addr_gu: "군위군", addr_lidong: "소보면",
  });
  console.log(`  리 ${soboLi.length}개 (체크포인트 li_total=14):`);
  soboLi.forEach((l, i) => console.log(`    ${i + 1}. ${l}${l === "평호리" ? "  ← 체크포인트 14/14" : ""}`));
  const pyeongIdx = soboLi.indexOf("평호리");
  console.log(`  → 평호리 위치: ${pyeongIdx + 1}/${soboLi.length}`);

  await sleep(500);

  console.log("\n▶ 2. 소보면 평호리 번지 목록 (마지막 10개)");
  const jibun = await getAddrList({
    gbn: 4, addr_do: "대구광역시", addr_si: "-기타지역", addr_gu: "군위군",
    addr_lidong: "소보면", addr_li: "평호리",
  });
  console.log(`  번지 ${jibun.length}개 (체크포인트 jibun_total=159):`);
  jibun.slice(-10).forEach((j, i) => {
    const idx = jibun.length - 10 + i + 1;
    console.log(`    ${idx}. ${j}${j === "산86" ? "  ← 체크포인트 159/159" : ""}`);
  });
  const san86 = jibun.indexOf("산86");
  console.log(`  → 산86 위치: ${san86 + 1}/${jibun.length}`);

  await sleep(500);

  console.log("\n▶ 3. 군위군의 모든 동/면 별 리 개수 (dong_total=8 매칭 확인)");
  const gunwiDong = await getAddrList({
    gbn: 2, addr_do: "대구광역시", addr_si: "-기타지역", addr_gu: "군위군",
  });
  for (const d of gunwiDong) {
    try {
      const liList = await getAddrList({
        gbn: 3, addr_do: "대구광역시", addr_si: "-기타지역", addr_gu: "군위군", addr_lidong: d,
      });
      const hasPyeongho = liList.includes("평호리") ? "  ✓ 평호리 있음" : "";
      console.log(`  ${d}: ${liList.length}개 리${hasPyeongho}`);
      await sleep(300);
    } catch (e) {
      console.log(`  ${d}: ✘ ${e.message}`);
    }
  }

  console.log("\n═══ 완료 ═══");
}

main().catch((e) => { console.error(e); process.exit(1); });
