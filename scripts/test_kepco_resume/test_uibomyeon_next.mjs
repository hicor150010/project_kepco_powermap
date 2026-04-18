/**
 * KEPCO API 재현 테스트
 *
 * Job #180 체크포인트: 대구광역시 > -기타지역 > 군위군(1/9) > 우보면(6/8) > 평호리(14/14) > 산86(159/159)
 * 미수집: 대구광역시 -기타지역 군위군 소보면 평호리 834-1, 837-2
 *
 * 확인 목표:
 *  1. 군위군 동/면 목록 (우보면이 6/8 인지)
 *  2. 우보면 리 목록 (평호리가 14/14 마지막인지)
 *  3. 평호리 번지 목록 (산86이 159/159 마지막인지)
 *  4. 우보면 다음 동/면(7번째) 의 리 목록 가져오기 — 여기서 에러 발생하는지
 *  5. 군위군 다음 구/군(2/9) 의 동/면 목록 가져오기
 *  6. search_capacity 호출 — 실제 크롤링 단계 재현
 */

const BASE_URL = "https://online.kepco.co.kr";

const HEADERS = {
  "Content-Type": "application/json",
  "Referer": "https://online.kepco.co.kr/EWM092D00",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Origin": "https://online.kepco.co.kr",
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

let cookieJar = "";

// 세션 초기화 — 쿠키 획득
async function initSession() {
  const r = await fetch(`${BASE_URL}/EWM092D00`, { headers: HEADERS });
  const setCookie = r.headers.getSetCookie?.() || [];
  cookieJar = setCookie.map((c) => c.split(";")[0]).join("; ");
  console.log(`[세션 초기화] status=${r.status}, cookies=${cookieJar.slice(0, 80)}...`);
}

async function post(path, body) {
  const headers = { ...HEADERS };
  if (cookieJar) headers["Cookie"] = cookieJar;
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
  }
  return await r.json();
}

// 주소 계층 조회
async function getAddrList({ gbn, addr_do = "", addr_si = "", addr_gu = "", addr_lidong = "", addr_li = "" }) {
  const body = {
    dma_addrGbn: {
      gbn: String(gbn),
      addr_do,
      addr_si,
      addr_gu,
      addr_lidong,
      addr_li,
      addr_jibun: "",
    },
  };
  const data = await post("/ew/cpct/retrieveAddrGbn", body);
  const keyMap = { 0: "ADDR_SI", 1: "ADDR_GU", 2: "ADDR_LIDONG", 3: "ADDR_LI", 4: "ADDR_JIBUN" };
  const key = keyMap[gbn];
  return (data.dlt_addrGbn || []).map((it) => it[key]).filter(Boolean);
}

async function searchCapacity({ addr_do, addr_si = "", addr_gu = "", addr_lidong = "", addr_li = "", addr_jibun = "" }) {
  const body = {
    dma_reqParam: {
      searchCondition: "address",
      do: addr_do,
      si: addr_si,
      gu: addr_gu,
      lidong: addr_lidong,
      li: addr_li,
      jibun: addr_jibun,
    },
  };
  const data = await post("/ew/cpct/retrieveMeshNo", body);
  return data.dlt_resultList || [];
}

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// ══════════════════════════════════════════════

async function main() {
  await initSession();

  console.log("\n═══ Step 1. 대구광역시 시/구/군 목록 (si=-기타지역) ═══");
  const guList = await getAddrList({ gbn: 1, addr_do: "대구광역시", addr_si: "-기타지역" });
  console.log(`  구/군 총 ${guList.length}개:`);
  guList.forEach((g, i) => console.log(`    ${i + 1}. ${g}${g === "군위군" ? "  ← 체크포인트 1/9" : ""}`));

  await sleep(500);

  console.log("\n═══ Step 2. 군위군 동/면 목록 ═══");
  const dongList = await getAddrList({
    gbn: 2,
    addr_do: "대구광역시",
    addr_si: "-기타지역",
    addr_gu: "군위군",
  });
  console.log(`  동/면 총 ${dongList.length}개:`);
  dongList.forEach((d, i) => console.log(`    ${i + 1}. ${d}${d === "우보면" ? "  ← 체크포인트 6/8" : ""}`));

  const uiboIdx = dongList.indexOf("우보면");
  console.log(`  → 우보면 위치: ${uiboIdx + 1}/${dongList.length}`);

  await sleep(500);

  console.log("\n═══ Step 3. 우보면 리 목록 ═══");
  const liList = await getAddrList({
    gbn: 3,
    addr_do: "대구광역시",
    addr_si: "-기타지역",
    addr_gu: "군위군",
    addr_lidong: "우보면",
  });
  console.log(`  리 총 ${liList.length}개:`);
  liList.forEach((l, i) => console.log(`    ${i + 1}. ${l}${l === "평호리" ? "  ← 체크포인트 14/14" : ""}`));

  const pyeongIdx = liList.indexOf("평호리");
  console.log(`  → 평호리 위치: ${pyeongIdx + 1}/${liList.length}`);

  await sleep(500);

  console.log("\n═══ Step 4. 평호리 번지 목록 ═══");
  const jibunList = await getAddrList({
    gbn: 4,
    addr_do: "대구광역시",
    addr_si: "-기타지역",
    addr_gu: "군위군",
    addr_lidong: "우보면",
    addr_li: "평호리",
  });
  console.log(`  번지 총 ${jibunList.length}개 (마지막 5개):`);
  jibunList.slice(-5).forEach((j, i) => {
    const realIdx = jibunList.length - 5 + i + 1;
    console.log(`    ${realIdx}. ${j}${j === "산86" ? "  ← 체크포인트 159/159" : ""}`);
  });

  const san86Idx = jibunList.indexOf("산86");
  console.log(`  → 산86 위치: ${san86Idx + 1}/${jibunList.length}`);

  await sleep(500);

  console.log("\n═══ Step 5. 산86 검색 (마지막 정상 처리된 번지) ═══");
  try {
    const res = await searchCapacity({
      addr_do: "대구광역시",
      addr_si: "-기타지역",
      addr_gu: "군위군",
      addr_lidong: "우보면",
      addr_li: "평호리",
      addr_jibun: "산86",
    });
    console.log(`  → ${res.length}건 검색됨`);
  } catch (e) {
    console.log(`  ✘ 오류: ${e.message}`);
  }

  await sleep(500);

  console.log("\n═══ Step 6. ★핵심★ 우보면 다음 동/면(7번째) 처리 시뮬레이션 ═══");
  if (uiboIdx + 1 < dongList.length) {
    const nextDong = dongList[uiboIdx + 1];
    console.log(`  다음 동/면: ${nextDong} (${uiboIdx + 2}/${dongList.length})`);
    try {
      const nextLiList = await getAddrList({
        gbn: 3,
        addr_do: "대구광역시",
        addr_si: "-기타지역",
        addr_gu: "군위군",
        addr_lidong: nextDong,
      });
      console.log(`  → 리 ${nextLiList.length}개: ${nextLiList.slice(0, 5).join(", ")}${nextLiList.length > 5 ? " ..." : ""}`);
    } catch (e) {
      console.log(`  ✘ 오류: ${e.message}`);
    }
  } else {
    console.log(`  ※ 우보면이 마지막 동/면 (다음 없음)`);
  }

  await sleep(500);

  console.log("\n═══ Step 7. ★핵심★ 군위군 다음 구/군(2번째) 처리 시뮬레이션 ═══");
  const gunwiIdx = guList.indexOf("군위군");
  if (gunwiIdx + 1 < guList.length) {
    const nextGu = guList[gunwiIdx + 1];
    console.log(`  다음 구/군: ${nextGu} (${gunwiIdx + 2}/${guList.length})`);
    try {
      const nextDongList = await getAddrList({
        gbn: 2,
        addr_do: "대구광역시",
        addr_si: "-기타지역",
        addr_gu: nextGu,
      });
      console.log(`  → 동/면 ${nextDongList.length}개: ${nextDongList.slice(0, 5).join(", ")}${nextDongList.length > 5 ? " ..." : ""}`);
    } catch (e) {
      console.log(`  ✘ 오류: ${e.message}`);
    }
  }

  await sleep(500);

  console.log("\n═══ Step 8. 미수집 재시도 실패 지번 재현 ═══");
  for (const j of ["834-1", "837-2"]) {
    try {
      const res = await searchCapacity({
        addr_do: "대구광역시",
        addr_si: "-기타지역",
        addr_gu: "군위군",
        addr_lidong: "소보면",
        addr_li: "평호리",
        addr_jibun: j,
      });
      console.log(`  소보면 평호리 ${j}: ${res.length}건`);
    } catch (e) {
      console.log(`  소보면 평호리 ${j}: ✘ ${e.message}`);
    }
    await sleep(300);
  }

  console.log("\n═══ 완료 ═══");
}

main().catch((e) => {
  console.error("치명적 오류:", e);
  process.exit(1);
});
