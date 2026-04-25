/**
 * 토지·상업업무용 실거래가 통계 헬퍼 — 영업담당자 시점의 의사결정 지표.
 *
 * UI(PriceTab) 가 직접 계산하지 않고 이 모듈만 import.
 * 통계 정의 변경(중앙값 vs 평균, 추세 산정 기간 등) 시 이 파일만 수정.
 *
 * 모든 함수는 0건/부분 데이터에서도 안전 (null 또는 0 반환).
 *
 * 토지(`computeLandStats`) — 카테고리 = 지목(전/답/임/대)
 * 건물(`computeNrgStats`) — 카테고리 = buildingUse(업무/근린생활/판매/숙박)
 */

import type { LandTransaction } from "./land-trade";
import { recentYearMonths } from "./land-trade";
import type { NrgTransaction } from "./nrg-trade";

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
  /** 카테고리별 집계 (count 내림차순) — 토지=지목 / 건물=용도 */
  byCategory: CategoryStats[];
  /** 월별 거래 건수 (sparkline 용, 과거 → 최신 정렬) */
  monthly: MonthlyCount[];
}

export interface CategoryStats {
  category: string;
  count: number;
  medianPricePerPyeong: number;
}

export interface MonthlyCount {
  /** "YYYY-MM" */
  ym: string;
  count: number;
}

interface BaseTradeRow {
  dealYmd: string;
  pricePerPyeong: number;
}

/** 토지 거래 → 영업담당자 통계 (지목별) */
export function computeLandStats(
  rows: LandTransaction[],
  months: number,
): TradeStats {
  return computeStatsImpl(rows, months, (r) => r.jimok || "(미상)");
}

/** 상업·업무용 거래 → 영업담당자 통계 (buildingUse 별) */
export function computeNrgStats(
  rows: NrgTransaction[],
  months: number,
): TradeStats {
  return computeStatsImpl(rows, months, (r) => r.buildingUse || "(미상)");
}

function computeStatsImpl<T extends BaseTradeRow>(
  rows: T[],
  months: number,
  categoryOf: (row: T) => string,
): TradeStats {
  const total = rows.length;

  if (total === 0) {
    return {
      total: 0,
      medianPricePerPyeong: null,
      trend: null,
      byCategory: [],
      monthly: emptyMonthly(months),
    };
  }

  const medianPricePerPyeong = median(rows.map((r) => r.pricePerPyeong));
  const trend = computeTrend(rows, months);
  const byCategory = computeByCategory(rows, categoryOf);
  const monthly = computeMonthly(rows, months);

  return { total, medianPricePerPyeong, trend, byCategory, monthly };
}

/**
 * 후반 절반(최근) vs 전반 절반 평당가 중앙값 비교.
 * - 양쪽 모두 거래 1건 이상 필요
 * - ±1% 미만 = flat (의미 있는 변화로 보지 않음)
 */
function computeTrend<T extends BaseTradeRow>(
  rows: T[],
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

function computeByCategory<T extends BaseTradeRow>(
  rows: T[],
  categoryOf: (row: T) => string,
): CategoryStats[] {
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const key = categoryOf(r);
    const list = map.get(key);
    if (list) list.push(r.pricePerPyeong);
    else map.set(key, [r.pricePerPyeong]);
  }
  return Array.from(map.entries())
    .map(([category, prices]) => ({
      category,
      count: prices.length,
      medianPricePerPyeong: median(prices),
    }))
    .sort((a, b) => b.count - a.count);
}

function computeMonthly<T extends BaseTradeRow>(
  rows: T[],
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
