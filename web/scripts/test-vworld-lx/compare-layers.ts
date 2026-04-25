export {};
/**
 * VWorld 두 지적도 레이어 직접 비교 — 정확도 / 응답 schema 검증.
 *
 *   - lp_pa_cbnd_bubun       (현재 사용 중, VWorld 자체 연속지적도 추정)
 *   - lt_c_landinfobasemap   (LX 편집지적도, 토지이음 / 일사편리와 같은 출처 추정)
 *
 * 같은 PNU 로 두 레이어 호출 → 응답 properties / polygon bbox / 좌표 개수 비교.
 *
 * 실행:
 *   cd web && npx tsx --env-file=.env.local scripts/test-vworld-lx/compare-layers.ts
 */

const VWORLD_KEY = process.env.VWORLD_KEY ?? "";
const WFS_URL = "https://api.vworld.kr/req/wfs";
const TIMEOUT_MS = 5000;

interface TestCase {
  pnu: string;
  note: string;
}

const CASES: TestCase[] = [
  { pnu: "4783035035201290002", note: "직리 산129-2 (산 지번 — gbn_cd 검증용)" },
  { pnu: "4783035035200690001", note: "직리 산69-1 (산 지번 추가)" },
];

const LAYERS = [
  { name: "lp_pa_cbnd_bubun", label: "VWorld 자체 (현재 사용)" },
  { name: "lt_c_landinfobasemap", label: "LX 편집지적도 (토지이음 출처 추정)" },
];

async function callWfs(layer: string, pnu: string) {
  const filter =
    `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0">` +
    `<fes:PropertyIsEqualTo>` +
    `<fes:ValueReference>pnu</fes:ValueReference>` +
    `<fes:Literal>${pnu}</fes:Literal>` +
    `</fes:PropertyIsEqualTo>` +
    `</fes:Filter>`;
  const params = new URLSearchParams({
    key: VWORLD_KEY,
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typename: layer,
    output: "application/json",
    srsName: "EPSG:4326",
    FILTER: filter,
  });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${WFS_URL}?${params.toString()}`, {
      signal: ctl.signal,
      headers: { Referer: "https://sublab.kr" },
    });
    if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
    const text = await res.text();
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return { ok: false, error: "JSON parse 실패", body: text.slice(0, 300) };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

interface Summary {
  count: number;
  geomType?: string;
  coordCount?: number;
  propsKeys?: string[];
  pnu?: string;
  bonbun?: string;
  bubun?: string;
  bchk?: string;
  jibun?: string;
  addr?: string;
  jiga?: string;
  bboxLng?: [number, number];
  bboxLat?: [number, number];
  center?: { lng: number; lat: number };
}

function summarize(data: { features?: Array<{ properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } }> } | undefined): Summary {
  if (!data?.features || data.features.length === 0) return { count: 0 };
  const f = data.features[0];
  const props = (f.properties ?? {}) as Record<string, string>;
  const geom = f.geometry;
  let coords: number[][] = [];
  if (geom?.type === "Polygon") {
    coords = (geom.coordinates as number[][][])[0] ?? [];
  } else if (geom?.type === "MultiPolygon") {
    coords = (geom.coordinates as number[][][][])[0]?.[0] ?? [];
  }
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  return {
    count: data.features.length,
    geomType: geom?.type,
    coordCount: coords.length,
    propsKeys: Object.keys(props).sort(),
    pnu: props.pnu,
    bonbun: props.bonbun,
    bubun: props.bubun,
    bchk: props.bchk,
    jibun: props.jibun,
    addr: props.addr,
    jiga: props.jiga,
    bboxLng: [minLng, maxLng],
    bboxLat: [minLat, maxLat],
    center: { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 },
  };
}

async function main() {
  if (!VWORLD_KEY) {
    console.error("❌ VWORLD_KEY 미설정 — --env-file=.env.local 옵션 확인");
    process.exit(1);
  }
  console.log(`VWORLD_KEY 있음 (${VWORLD_KEY.slice(0, 6)}…)`);

  for (const c of CASES) {
    console.log("\n" + "━".repeat(80));
    console.log(`[${c.pnu}] ${c.note}`);

    const summaries: Record<string, Summary> = {};
    for (const l of LAYERS) {
      console.log(`\n  ► ${l.label} (${l.name})`);
      const r = await callWfs(l.name, c.pnu);
      if (!r.ok) {
        console.log(`    ❌ ${r.status ?? r.error}`);
        if (r.body) console.log(`       body: ${r.body.slice(0, 200)}`);
        continue;
      }
      const s = summarize(r.data);
      summaries[l.name] = s;
      if (s.count === 0) {
        console.log(`    ⚠️ features=0 (해당 PNU 로 검색 결과 없음)`);
        continue;
      }
      console.log(`    ✅ features=${s.count}  geom=${s.geomType}  coordCount=${s.coordCount}`);
      console.log(`       props keys: ${s.propsKeys?.join(", ")}`);
      console.log(`       pnu=${s.pnu}  bonbun=${s.bonbun}  bubun=${s.bubun}  bchk=${s.bchk}`);
      console.log(`       jibun=${s.jibun}  jiga=${s.jiga}`);
      console.log(`       addr=${s.addr}`);
      console.log(`       bbox lng=[${s.bboxLng?.[0].toFixed(6)}, ${s.bboxLng?.[1].toFixed(6)}]`);
      console.log(`            lat=[${s.bboxLat?.[0].toFixed(6)}, ${s.bboxLat?.[1].toFixed(6)}]`);
      console.log(`       center lng=${s.center?.lng.toFixed(6)} lat=${s.center?.lat.toFixed(6)}`);
    }

    // 두 레이어 위치 비교
    const a = summaries["lp_pa_cbnd_bubun"];
    const b = summaries["lt_c_landinfobasemap"];
    if (a?.center && b?.center) {
      const dLng = Math.abs(a.center.lng - b.center.lng);
      const dLat = Math.abs(a.center.lat - b.center.lat);
      const dMeters = Math.sqrt(dLng * dLng + dLat * dLat) * 111000;
      console.log(`\n  📐 두 레이어 center 거리: ${dMeters.toFixed(1)}m`);
      if (dMeters > 5) {
        console.log(`     → 두 레이어가 같은 PNU 에 ${dMeters.toFixed(0)}m 떨어진 위치를 응답 (다른 데이터)`);
      } else {
        console.log(`     → 두 레이어 위치 거의 일치 (5m 이내)`);
      }
    }
  }
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
