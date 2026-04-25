/**
 * 토지 실거래가 통계 헬퍼 — 영업담당자 시점의 의사결정 지표.
 *
 * UI(PriceTab) 가 직접 계산하지 않고 이 모듈만 import.
 * 통계 정의 변경(중앙값 vs 평균, 추세 산정 기간 등) 시 이 파일만 수정.
 *
 * 모든 함수는 0건/부분 데이터에서도 안전 (null 또는 0 반환).
 */

import type { LandTransaction } from "./land-trade";
import { recentYearMonths } from "./land-trade";

export type TrendDirection = "up" | "down" | "flat";

export interface TradeStats {
  /** 전체 거래 건수 */
  total: number;
  /** 전체 평당가 중앙값 (원/평). 0건 시 null */
  medianPricePerPyeong: number | null;
  /**
   * 추세 — 후반 절반 vs 전반 절반 평당가 변화율.
   * 양쪽 모두 거래 있을 때만 계산. 부족하면 null.
   */
  trend: { pct: number; direction: TrendDirection } | null;
  /** 지목별 집계 (count 내림차순) */
  byJimok: JimokStats[];
  /** 월별 거래 건수 (sparkline 용, 과거 → 최신 정렬) */
  monthly: MonthlyCount[];
}

export interface JimokStats {
  jimok: string;
  count: number;
  medianPricePerPyeong: number;
}

export interface MonthlyCount {
  /** "YYYY-MM" */
  ym: string;
  count: number;
}

/**
 * rows + months → 영업담당자가 한눈에 볼 수 있는 통계 묶음.
 * months 는 sparkline 0 채우기 + 추세 분할 기준에 사용.
 */
export function computeStats(
  rows: LandTransaction[],
  months: number,
): TradeStats {
  const total = rows.length;

  if (total === 0) {
    return {
      total: 0,
      medianPricePerPyeong: null,
      trend: null,
      byJimok: [],
      monthly: emptyMonthly(months),
    };
  }

  const medianPricePerPyeong = median(rows.map((r) => r.pricePerPyeong));
  const trend = computeTrend(rows, months);
  const byJimok = computeByJimok(rows);
  const monthly = computeMonthly(rows, months);

  return { total, medianPricePerPyeong, trend, byJimok, monthly };
}

/**
 * 후반 절반(최근) vs 전반 절반 평당가 중앙값 비교.
 * - 양쪽 모두 거래 1건 이상 필요
 * - ±1% 미만 = flat (의미 있는 변화로 보지 않음)
 */
function computeTrend(
  rows: LandTransaction[],
  months: number,
): TradeStats["trend"] {
  const half = Math.max(1, Math.floor(months / 2));
  const yms = recentYearMonths(months);
  const recentSet = new Set(
    yms.slice(0, half).map((ym) => `${ym.slice(0, 4)}-${ym.slice(4, 6)}`),
  );

  const recent = rows.filter((r) => recentSet.has(r.dealYmd));
  const older = rows.filter((r) => !recentSet.has(r.dealYmd));
  if (recent.length === 0 || older.length === 0) return null;

  const recentMed = median(recent.map((r) => r.pricePerPyeong));
  const olderMed = median(older.map((r) => r.pricePerPyeong));
  if (olderMed <= 0) return null;

  const pct = ((recentMed - olderMed) / olderMed) * 100;
  const rounded = Math.round(pct * 10) / 10;
  const direction: TrendDirection =
    rounded > 1 ? "up" : rounded < -1 ? "down" : "flat";
  return { pct: rounded, direction };
}

function computeByJimok(rows: LandTransaction[]): JimokStats[] {
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const key = r.jimok || "(미상)";
    const list = map.get(key);
    if (list) list.push(r.pricePerPyeong);
    else map.set(key, [r.pricePerPyeong]);
  }
  return Array.from(map.entries())
    .map(([jimok, prices]) => ({
      jimok,
      count: prices.length,
      medianPricePerPyeong: median(prices),
    }))
    .sort((a, b) => b.count - a.count);
}

function computeMonthly(
  rows: LandTransaction[],
  months: number,
): MonthlyCount[] {
  const yms = recentYearMonths(months);
  const map = new Map<string, number>();
  for (const ym of yms) {
    map.set(`${ym.slice(0, 4)}-${ym.slice(4, 6)}`, 0);
  }
  for (const r of rows) {
    if (map.has(r.dealYmd)) {
      map.set(r.dealYmd, (map.get(r.dealYmd) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([ym, count]) => ({ ym, count }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
}

function emptyMonthly(months: number): MonthlyCount[] {
  return recentYearMonths(months)
    .map((ym) => ({
      ym: `${ym.slice(0, 4)}-${ym.slice(4, 6)}`,
      count: 0,
    }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}
