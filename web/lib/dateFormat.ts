/**
 * KST(Asia/Seoul) 안전 변환 유틸.
 *
 * 핵심 원칙:
 *   - 입력은 PostgREST 가 반환하는 ISO 8601 + offset 문자열
 *     (예: "2026-04-25T05:33:00+00:00", DB 저장은 UTC).
 *   - 표시 포맷은 사용자 OS 타임존과 무관하게 항상 Asia/Seoul.
 *   - `toLocaleString()` 단독 사용 금지 — OS 타임존을 그대로 따라가기 때문.
 *   - `Intl.DateTimeFormat({ timeZone: 'Asia/Seoul' }).formatToParts()` 로
 *     KST 파트를 직접 추출 후 조립.
 *
 * 상대 시각은 `Date.now() - new Date(iso).getTime()` 로 계산 (millis 차이는
 * 타임존과 무관하므로 안전).
 */

const KST_DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const KST_FULL_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function partsObj(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const p of parts) o[p.type] = p.value;
  return o;
}

/**
 * 상대 시각 표기 (하이브리드).
 *   - 미래 / <1시간: "방금 확인"
 *   - <24시간:      "N시간 전"
 *   - <7일:         "N일 전"
 *   - 그 이상:      KST 날짜 ("2026-04-25")
 *
 * null / 빈 문자열 / 잘못된 ISO → 빈 문자열 (호출부에서 분기).
 */
export function formatRelativeKst(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return "";

  const diffMs = Date.now() - d.getTime();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  if (diffMs < HOUR) return "방금 확인";
  if (diffMs < DAY) return `${Math.floor(diffMs / HOUR)}시간 전`;
  if (diffMs < 7 * DAY) return `${Math.floor(diffMs / DAY)}일 전`;

  const p = partsObj(KST_DATE_PARTS.formatToParts(d));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * 절대 시각 표기 (tooltip 용).
 *   "2026-04-25 14:33 KST"
 *
 * null / 빈 문자열 / 잘못된 ISO → 빈 문자열.
 */
export function formatAbsoluteKst(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return "";

  const p = partsObj(KST_FULL_PARTS.formatToParts(d));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} KST`;
}
