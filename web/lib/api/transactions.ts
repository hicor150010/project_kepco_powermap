/**
 * Client-side fetch wrapper — 토지 실거래가 atomic endpoint.
 *
 * 컴포넌트는 이 파일의 함수만 호출 (vendor 추상화 — 컴포넌트는 RTMS 모름).
 *
 * 캐시:
 *   - by-bjd: 모듈 scope Map (페이지 라이프타임). 같은 (bjd_code, months) 재진입 0회 fetch.
 *   - 0건 결과도 캐시 (재호출 방지, "거래 없음" 즉시 표시)
 *
 * Endpoint ↔ 함수:
 *   /api/transactions/by-bjd ↔ fetchTransactionsByBjd
 */
import type { LandTransaction } from "@/lib/rtms/land-trade";
import type { TradeStats } from "@/lib/rtms/trade-stats";

interface TransactionsApiResponse {
  ok: boolean;
  bjd_code?: string;
  months?: number;
  rows?: LandTransaction[];
  stats?: TradeStats;
  error?: string;
}

interface FetchOptions {
  signal?: AbortSignal;
}

export interface TransactionsResult {
  rows: LandTransaction[];
  stats: TradeStats;
  months: number;
}

const cache = new Map<string, TransactionsResult>();

/**
 * /api/transactions/by-bjd — 시군구 단위 토지 실거래가 + 영업 통계.
 * 캐시 키 = `${bjd_code}:${months}`.
 */
export async function fetchTransactionsByBjd(
  bjdCode: string,
  months: number = 12,
  options?: FetchOptions,
): Promise<TransactionsResult> {
  const key = `${bjdCode}:${months}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const url = `/api/transactions/by-bjd?bjd_code=${encodeURIComponent(
    bjdCode,
  )}&months=${months}`;
  const res = await fetch(url, { signal: options?.signal });
  const data = (await res.json()) as TransactionsApiResponse;
  if (!data.ok) throw new Error(data.error || "토지 실거래가 조회 실패");

  const result: TransactionsResult = {
    rows: data.rows ?? [],
    stats: data.stats as TradeStats,
    months: data.months ?? months,
  };
  cache.set(key, result);
  return result;
}

export function clearTransactionsCache(): void {
  cache.clear();
}

export type { LandTransaction, TradeStats };
