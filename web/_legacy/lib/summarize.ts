import type { LocationData } from "./types";

export interface FacilityStat {
  /** 시설 이름 (변전소/주변압기/배전선로) */
  name: string;
  /** 해당 시설에 묶인 데이터 건수 */
  count: number;
  /** 여유 있음 / 없음 */
  hasCapacity: boolean;
  /** 기준 용량 (kW) */
  baseCapacity: number;
  /** 접수 기준 (kW) */
  receivedCapacity: number;
  /** 계획 반영 (kW) */
  plannedCapacity: number;
  /** 잔여 여유 (kW) — 기준 - 접수. 음수면 초과 */
  remaining: number;
  /** STEP 합계 (있을 때만) */
  step1?: { cnt: number; pwr: number };
  step2?: { cnt: number; pwr: number };
  step3?: { cnt: number; pwr: number };
}

export interface LocationSummary {
  total: number;
  substations: FacilityStat[];
  transformers: FacilityStat[];
  distributionLines: FacilityStat[];
  substNoCapPct: number;
  mtrNoCapPct: number;
  dlNoCapPct: number;
  hasStepData: boolean;
}

const hasCap = (v: string) => v === "여유용량 있음";

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = parseInt(String(v).replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

interface AggKeys {
  nameKey: keyof LocationData;
  volKey: keyof LocationData;
  capaKey: keyof LocationData;
  pwrKey: keyof LocationData;
  gCapaKey: keyof LocationData;
  prefix?: string;
}

function aggregate(items: LocationData[], k: AggKeys): FacilityStat[] {
  const map = new Map<string, FacilityStat>();
  let hasStep = false;

  items.forEach((it) => {
    const raw = String(it[k.nameKey] ?? "");
    if (!raw) return;
    const name = (k.prefix ?? "") + raw;

    let entry = map.get(name);
    if (!entry) {
      // 첫 등장 시 — 용량 수치는 같은 시설에서 동일하므로 첫 값 사용
      entry = {
        name,
        count: 0,
        hasCapacity: hasCap(String(it[k.volKey] ?? "")),
        baseCapacity: num(it[k.capaKey] as string),
        receivedCapacity: num(it[k.pwrKey] as string),
        plannedCapacity: num(it[k.gCapaKey] as string),
        remaining: 0,
      };
      entry.remaining = entry.baseCapacity - entry.receivedCapacity;
      map.set(name, entry);
    }
    entry.count++;

    // STEP 데이터 (시설별 첫 값 사용 — KEPCO 데이터 특성상 시설별로 동일)
    if (it.step1_cnt !== undefined || it.step1_pwr !== undefined) {
      hasStep = true;
      if (!entry.step1) {
        entry.step1 = { cnt: num(it.step1_cnt), pwr: num(it.step1_pwr) };
        entry.step2 = { cnt: num(it.step2_cnt), pwr: num(it.step2_pwr) };
        entry.step3 = { cnt: num(it.step3_cnt), pwr: num(it.step3_pwr) };
      }
    }
  });

  const arr = Array.from(map.values()).sort((a, b) => b.count - a.count);
  // hasStep flag는 외부에서 추출 — 일단 stat에 flag로 attach
  (arr as any)._hasStep = hasStep;
  return arr;
}

export function summarizeLocation(items: LocationData[]): LocationSummary {
  const total = items.length;
  const substations = aggregate(items, {
    nameKey: "subst_nm",
    volKey: "vol_subst",
    capaKey: "subst_capa",
    pwrKey: "subst_pwr",
    gCapaKey: "g_subst_capa",
  });
  const transformers = aggregate(items, {
    nameKey: "mtr_no",
    volKey: "vol_mtr",
    capaKey: "mtr_capa",
    pwrKey: "mtr_pwr",
    gCapaKey: "g_mtr_capa",
    prefix: "#",
  });
  const distributionLines = aggregate(items, {
    nameKey: "dl_nm",
    volKey: "vol_dl",
    capaKey: "dl_capa",
    pwrKey: "dl_pwr",
    gCapaKey: "g_dl_capa",
  });

  const noCap = (stats: FacilityStat[]) => {
    const noCapCount = stats
      .filter((s) => !s.hasCapacity)
      .reduce((sum, s) => sum + s.count, 0);
    return total > 0 ? Math.round((noCapCount / total) * 100) : 0;
  };

  const hasStepData =
    (substations as any)._hasStep ||
    (transformers as any)._hasStep ||
    (distributionLines as any)._hasStep;

  return {
    total,
    substations,
    transformers,
    distributionLines,
    substNoCapPct: noCap(substations),
    mtrNoCapPct: noCap(transformers),
    dlNoCapPct: noCap(distributionLines),
    hasStepData,
  };
}

/** kW 포맷팅: 1000kW 이상이면 MW로 */
export function formatPower(kw: number): string {
  const abs = Math.abs(kw);
  if (abs >= 1000) {
    return `${(kw / 1000).toFixed(2)} MW`;
  }
  return `${kw.toLocaleString()} kW`;
}
