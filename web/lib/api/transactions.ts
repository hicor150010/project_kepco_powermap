/**
 * Client-side fetch wrapper — 실거래가 atomic endpoint (kind 분기).
 *
 * 컴포넌트는 이 파일의 함수만 호출 (vendor 추상화 — RTMS 모름).
 *
 * 캐시:
 *   - 모듈 scope Map (페이지 라이프타임)
 *   - 키 = `${bjd_code}:${months}:${kind}` — 종류별로 독립
 *   - 0건 결과도 캐시 (재호출 방지)
 *
 * Endpoint ↔ 함수:
 *   /api/transactions/by-bjd?kind=land ↔ fetchLandTransactionsByBjd
 *   /api/transactions/by-bjd?kind=nrg  ↔ fetchNrgTransactionsByBjd
 */
import type { LandTransaction } from "@/lib/rtms/land-trade";
import type { NrgTransaction } from "@/lib/rtms/nrg-trade";
import type { TradeStats } from "@/lib/rtms/trade-stats";

export type TransactionKind = "land" | "nrg";

interface ApiResponseLand {
  ok: boolean;
  bjd_code?: string;
  kind?: "land";
  months?: number;
  rows?: LandTransaction[];
  stats?: TradeStats;
  error?: string;
}

interface ApiResponseNrg {
  ok: boolean;
  bjd_code?: string;
  kind?: "nrg";
  months?: number;
  rows?: NrgTransaction[];
  stats?: TradeStats;
  error?: string;
}

interface FetchOptions {
  signal?: AbortSignal;
}

export interface LandTransactionsResult {
  rows: LandTransaction[];
  stats: TradeStats;
  months: number;
}

export interface NrgTransactionsResult {
  rows: NrgTransaction[];
  stats: TradeStats;
  months: number;
}

const cache = new Map<string, LandTransactionsResult | NrgTransactionsResult>();

function key(bjd: string, months: number, kind: TransactionKind): string {
  return `${bjd}:${months}:${kind}`;
}

async function fetchByKind(
  bjdCode: string,
  months: number,
  kind: TransactionKind,
  options?: FetchOptions,
): Promise<unknown> {
  const url = `/api/transactions/by-bjd?bjd_code=${encodeURIComponent(
    bjdCode,
  )}&months=${months}&kind=${kind}`;
  const res = await fetch(url, { signal: options?.signal });
  return res.json();
}

/** /api/transactions/by-bjd?kind=land — 시군구 단위 토지 실거래가 + 통계. */
export async function fetchLandTransactionsByBjd(
  bjdCode: string,
  months: number = 12,
  options?: FetchOptions,
): Promise<LandTransactionsResult> {
  const k = key(bjdCode, months, "land");
  const cached = cache.get(k) as LandTransactionsResult | undefined;
  if (cached) return cached;

  const data = (await fetchByKind(
    bjdCode,
    months,
    "land",
    options,
  )) as ApiResponseLand;
  if (!data.ok) throw new Error(data.error || "토지 실거래가 조회 실패");
  const result: LandTransactionsResult = {
    rows: data.rows ?? [],
    stats: data.stats as TradeStats,
    months: data.months ?? months,
  };
  cache.set(k, result);
  return result;
}

/** /api/transactions/by-bjd?kind=nrg — 시군구 단위 상업·업무용 매매 + 통계. */
export async function fetchNrgTransactionsByBjd(
  bjdCode: string,
  months: number = 12,
  options?: FetchOptions,
): Promise<NrgTransactionsResult> {
  const k = key(bjdCode, months, "nrg");
  const cached = cache.get(k) as NrgTransactionsResult | undefined;
  if (cached) return cached;

  const data = (await fetchByKind(
    bjdCode,
    months,
    "nrg",
    options,
  )) as ApiResponseNrg;
  if (!data.ok) throw new Error(data.error || "상업업무용 실거래가 조회 실패");
  const result: NrgTransactionsResult = {
    rows: data.rows ?? [],
    stats: data.stats as TradeStats,
    months: data.months ?? months,
  };
  cache.set(k, result);
  return result;
}

export function clearTransactionsCache(): void {
  cache.clear();
}

export type { LandTransaction, NrgTransaction, TradeStats };
