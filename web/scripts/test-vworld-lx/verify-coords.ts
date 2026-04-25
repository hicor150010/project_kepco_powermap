export {};
/**
 * 진짜 정답 확정 — 두 레이어 center 좌표를 카카오 reverse geocoding 으로 변환.
 *
 * 카카오 reverse 가 응답하는 지번 = 카카오 자체 데이터(USE_DISTRICT 와 같은 출처).
 * 우리 KEPCO 매칭도 카카오 좌표 기반이므로 카카오 응답이 진실에 가까움.
 *
 * 시나리오:
 *   - 직리 179 의 lp_pa_cbnd_bubun center → 카카오 reverse → 무슨 지번?
 *   - 직리 179 의 lt_c_landinfobasemap center → 카카오 reverse → 무슨 지번?
 *   - 응답이 "직리 179" 인 쪽 = 진짜 정답
 *
 * 실행:
 *   cd web && npx tsx --env-file=.env.local scripts/test-vworld-lx/verify-coords.ts
 */

const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY ?? "";

interface CoordCase {
  label: string;
  expectedJibun: string;
  vworldCenter: { lat: number; lng: number };
  lxCenter: { lat: number; lng: number };
}

const CASES: CoordCase[] = [
  {
    label: "직리 179",
    expectedJibun: "179",
    vworldCenter: { lat: 35.717350, lng: 128.325735 },
    lxCenter: { lat: 35.716749, lng: 128.325683 },
  },
  {
    label: "직리 870",
    expectedJibun: "870",
    vworldCenter: { lat: 35.718251, lng: 128.325783 },
    lxCenter: { lat: 35.717649, lng: 128.325744 },
  },
  {
    label: "직리 870-1",
    expectedJibun: "870-1",
    vworldCenter: { lat: 35.717799, lng: 128.326109 },
    lxCenter: { lat: 35.717188, lng: 128.326063 },
  },
  {
    label: "직리 116-2",
    expectedJibun: "116-2",
    vworldCenter: { lat: 35.718437, lng: 128.327124 },
    lxCenter: { lat: 35.717818, lng: 128.327087 },
  },
];

interface KakaoResponse {
  documents?: Array<{
    address?: {
      address_name?: string;
      main_address_no?: string;
      sub_address_no?: string;
      region_3depth_h_name?: string;
      region_3depth_name?: string;
    };
    road_address?: {
      address_name?: string;
    } | null;
  }>;
}

async function kakaoReverse(lat: number, lng: number): Promise<KakaoResponse | { error: string }> {
  const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}&input_coord=WGS84`;
  try {
    const r = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
    });
    if (!r.ok) return { error: `HTTP ${r.status}: ${await r.text()}` };
    return r.json() as Promise<KakaoResponse>;
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function pickJibun(resp: KakaoResponse | { error: string }): string {
  if ("error" in resp) return `❌ ${resp.error}`;
  const doc = resp.documents?.[0];
  if (!doc) return "❌ 응답 없음";
  const addr = doc.address;
  if (!addr) return "❌ address 없음";
  const main = addr.main_address_no ?? "?";
  const sub = addr.sub_address_no && addr.sub_address_no !== "0" ? `-${addr.sub_address_no}` : "";
  const jibun = `${main}${sub}`;
  return `${addr.address_name} (jibun=${jibun})`;
}

async function main() {
  if (!KAKAO_REST_KEY) {
    console.error("❌ KAKAO_REST_KEY 미설정");
    process.exit(1);
  }
  console.log(`KAKAO_REST_KEY 있음 (${KAKAO_REST_KEY.slice(0, 6)}…)`);

  for (const c of CASES) {
    console.log("\n" + "━".repeat(80));
    console.log(`[${c.label}] 예상 지번 = ${c.expectedJibun}`);

    const v = await kakaoReverse(c.vworldCenter.lat, c.vworldCenter.lng);
    const vJibun = pickJibun(v);
    const vMatch = vJibun.includes(c.expectedJibun);
    console.log(`\n  VWorld 자체 center (${c.vworldCenter.lat}, ${c.vworldCenter.lng})`);
    console.log(`     → 카카오: ${vJibun}`);
    console.log(`     → 매칭: ${vMatch ? "✅" : "❌"}`);

    const l = await kakaoReverse(c.lxCenter.lat, c.lxCenter.lng);
    const lJibun = pickJibun(l);
    const lMatch = lJibun.includes(c.expectedJibun);
    console.log(`\n  LX 편집지적도 center (${c.lxCenter.lat}, ${c.lxCenter.lng})`);
    console.log(`     → 카카오: ${lJibun}`);
    console.log(`     → 매칭: ${lMatch ? "✅" : "❌"}`);

    console.log(`\n  📊 결론: ${
      vMatch && !lMatch ? "🟢 VWorld 자체가 정답" :
      lMatch && !vMatch ? "🔵 LX 편집지적도가 정답" :
      vMatch && lMatch ? "⚠️ 둘 다 같은 지번 응답 (구분 안 됨)" :
      "❌ 둘 다 다른 지번 응답"
    }`);
  }
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
