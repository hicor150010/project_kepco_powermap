// 실제 건물이 있는 주소로 4개 오퍼레이션 모두 호출

const KEY_ENC =
  "CWsYAfYYh5I6XFXULGd0%2FaP6i25mvT6QyAhNyEBPd0GYr6JYMemZBGORK0MwJ1Nx9IUIFd%2FzR2WpBenPqk%2B3zg%3D%3D";

// 검증된 주소들 (실제 건물 존재 확실)
const ADDRS = [
  // 서울 시청 (중구 태평로1가 31)
  { sigunguCd: "11140", bjdongCd: "10100", platGbCd: "0", bun: "0001", ji: "0031",
    label: "서울 중구 태평로1가 1-31 (시청)" },
  // 청와대 (종로구 세종로 1)
  { sigunguCd: "11110", bjdongCd: "11500", platGbCd: "0", bun: "0001", ji: "0000",
    label: "서울 종로구 세종로 1 (청와대)" },
  // 강남구 삼성동 무역센터 (159)
  { sigunguCd: "11680", bjdongCd: "10500", platGbCd: "0", bun: "0159", ji: "0000",
    label: "서울 강남구 삼성동 159 (무역센터)" },
  // 봉남리 6-2 (참고)
  { sigunguCd: "46730", bjdongCd: "25025", platGbCd: "0", bun: "0006", ji: "0002",
    label: "전남 구례군 구례읍 봉남리 6-2 (참고)" },
];

const BASE = "https://apis.data.go.kr/1613000/BldRgstHubService";
const OPS = ["getBrRecapTitleInfo", "getBrTitleInfo", "getBrFlrOulnInfo", "getBrBasisOulnInfo"];

function buildUrl(op, a) {
  return (
    `${BASE}/${op}?serviceKey=${KEY_ENC}` +
    `&sigunguCd=${a.sigunguCd}&bjdongCd=${a.bjdongCd}&platGbCd=${a.platGbCd}` +
    `&bun=${a.bun}&ji=${a.ji}&_type=json&numOfRows=20&pageNo=1`
  );
}

async function call(op, addr) {
  const url = buildUrl(op, addr);
  try {
    const resp = await fetch(url);
    const raw = await resp.text();
    if (resp.status !== 200) {
      console.log(`  [${op}] ❌ HTTP ${resp.status} — ${raw.slice(0, 80)}`);
      return null;
    }
    let data;
    try { data = JSON.parse(raw); } catch { return { error: "json_parse", raw: raw.slice(0,300) }; }
    const total = data.response?.body?.totalCount;
    let items = data.response?.body?.items?.item;
    if (!items) {
      console.log(`  [${op}] totalCount=${total} (items 없음)`);
      return { total, items: [] };
    }
    if (!Array.isArray(items)) items = [items];
    console.log(`  [${op}] totalCount=${total}, 반환 ${items.length}건`);
    return { total, items };
  } catch (e) {
    console.log(`  [${op}] [ERR] ${e.message}`);
    return null;
  }
}

const sqmToPyong = (m2) => (Number(m2) / 3.305785).toFixed(1);

for (const addr of ADDRS) {
  console.log(`\n${"█".repeat(70)}`);
  console.log(`📍 ${addr.label}`);
  console.log(`${"█".repeat(70)}`);

  const recap = await call("getBrRecapTitleInfo", addr);
  const title = await call("getBrTitleInfo", addr);
  const flr   = await call("getBrFlrOulnInfo",   addr);
  const basis = await call("getBrBasisOulnInfo", addr);

  // 첫 번째 표제부 핵심 정보 출력
  if (title?.items?.length) {
    const t = title.items[0];
    console.log(`\n  ─── 표제부 핵심 (1번째 동) ───`);
    console.log(`  주소: ${t.platPlc || "-"}`);
    console.log(`  도로명: ${t.newPlatPlc || "-"}`);
    console.log(`  건물명: ${t.bldNm || "-"}`);
    console.log(`  주용도: ${t.mainPurpsCdNm || "-"} (기타용도: ${t.etcPurps || "-"})`);
    console.log(`  구조: ${t.strctCdNm || "-"} (기타: ${t.etcStrct || "-"})`);
    console.log(`  지붕: ${t.roofCdNm || "-"} (기타: ${t.etcRoof || "-"})`);
    if (t.totArea) console.log(`  연면적: ${t.totArea}㎡ (약 ${sqmToPyong(t.totArea)}평)`);
    if (t.archArea) console.log(`  건축면적: ${t.archArea}㎡ (약 ${sqmToPyong(t.archArea)}평)`);
    if (t.platArea) console.log(`  대지면적: ${t.platArea}㎡ (약 ${sqmToPyong(t.platArea)}평)`);
    console.log(`  층수: 지상 ${t.grndFlrCnt || "-"} / 지하 ${t.ugrndFlrCnt || "-"}`);
    console.log(`  사용승인일: ${t.useAprDay || "-"}`);
  }
  if (recap?.items?.length) {
    const r = recap.items[0];
    console.log(`\n  ─── 총괄표제부 ───`);
    if (r.totArea) console.log(`  총 연면적: ${r.totArea}㎡ (약 ${sqmToPyong(r.totArea)}평)`);
    if (r.archArea) console.log(`  총 건축면적: ${r.archArea}㎡ (약 ${sqmToPyong(r.archArea)}평)`);
    console.log(`  주용도: ${r.mainPurpsCdNm || "-"}`);
    if (r.atchBldArea) console.log(`  부속건물 면적: ${r.atchBldArea}㎡`);
    if (r.engrEpi) console.log(`  에너지효율등급: ${r.engrEpi}`);
  }
}