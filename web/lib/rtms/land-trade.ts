/**
 * 국토부 RTMS 토지 매매 실거래가 호출.
 *
 * 외부 API: getRTMSDataSvcLandTrade
 *   - 시군구(LAWD_CD 5) + 거래월(DEAL_YMD YYYYMM) 단위로만 조회 가능
 *   - 따라서 N개월 = N회 외부 호출 (서버 fan-out, 사용자→서버는 1회)
 *   - 응답 포맷 = XML 고정 (`_type=json` 무시됨)
 *   - User-Agent 헤더 필수 (없으면 WAF 가 400 Request Blocked)
 *
 * 입력 = bjd_code 10자리 → LAWD_CD = 앞 5자리
 * 출력 = LandTransaction[] (날짜 내림차순, 빈 월/실패 월은 무시)
 *
 * 발췌 정책: 응답 raw 필드 중 영업가치 있는 항목만 정규화.
 * 거래금액(만원→원), 평당가, 거래월, 지번, 지목, 면적, 용도지역.
 *
 * 지번 마스킹 주의: 응답 jibun 은 개인정보 보호 위해 끝자리 마스킹 ("3*", "10*").
 * 따라서 클릭 지번과의 정확 매칭 불가 — UI 는 시군구 단위 통계로만 활용.
 */
import { XMLParser } from "fast-xml-parser";

const ENDPOINT =
  "https://apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade";
const KEY = process.env.DATA_GO_KR_KEY || "";
const M2_PER_PYEONG = 0.3025;

/** WAF 우회용 — User-Agent 없으면 400 Request Blocked. */
const USER_AGENT = "Mozilla/5.0 (compatible; SUNLAP/1.0; +https://sunlap.kr)";

export interface LandTransaction {
  /** 거래월 "YYYY-MM" */
  dealYmd: string;
  /** 거래일 (있을 때만) "YYYY-MM-DD" */
  dealDate: string | null;
  /** 지번 — 개인정보 보호 끝자리 마스킹 ("3*", "10*", "산5*") */
  jibun: string;
  /** 지목 ("전", "답", "임야", "대" 등) */
  jimok: string;
  /** 거래면적 ㎡ */
  area_m2: number;
  /** 거래금액 원 (raw 만원 단위 → 원 변환) */
  price_won: number;
  /** 평당가 원/평 (계산값) */
  pricePerPyeong: number;
  /** 용도지역 ("계획관리지역" 등). RTMS 응답 필드명 = landUse */
  zoning: string | null;
  /** 거래유형 ("직거래"/"중개"). raw 보존, UI 미노출 */
  dealType: string | null;
  /** 읍면동명 ("개진면" 등) */
  umdNm: string;
}

/**
 * RTMS 응답 item — 2026-04-25 강남구 라이브 호출로 검증한 실측 필드명.
 * 새 필드 발견 시 normalize() 만 보정.
 */
interface RtmsItem {
  dealAmount?: string; // "10,307,864" (만원, 콤마 포함)
  dealYear?: string; // "2026"
  dealMonth?: string; // "2"
  dealDay?: string; // "27"
  dealArea?: string; // "4374" (㎡)
  jibun?: string; // "3*" (마스킹)
  jimok?: string; // "대"
  landUse?: string; // "용도미지정"
  umdNm?: string; // "자곡동"
  dealingGbn?: string; // "직거래"
  // 기타 응답에 포함되지만 미사용: cdealDay, cdealType, sggCd, sggNm,
  // estateAgentSggNm, shareDealingType
  [key: string]: unknown;
}

interface RtmsResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: { item?: RtmsItem | RtmsItem[] } | string;
      totalCount?: string | number;
    };
  };
}

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // 모든 값 string 으로 — 정규화 단계에서 일관 변환
  trimValues: true,
});

/**
 * bjd_code(10) + months → 직전 N개월 토지 거래 합쳐서 반환.
 *
 * - 부분 실패 허용: 일부 월 호출 실패 시 해당 월만 빈 배열 (전체 실패 X)
 * - resultCode "00" 또는 "000" 모두 정상 (서비스마다 다름)
 * - resultCode "03" (NO_DATA) = 거래 0건 정상
 * - 0건 반환도 정상 (UI 가 "최근 N개월 거래 없음" 표시)
 */
export async function getLandTradesByBjd(
  bjdCode: string,
  months: number = 12,
): Promise<LandTransaction[]> {
  if (!/^\d{10}$/.test(bjdCode)) return [];
  if (!KEY) throw new Error("DATA_GO_KR_KEY 환경변수가 등록되지 않았습니다.");

  const lawdCd = bjdCode.slice(0, 5);
  const yms = recentYearMonths(months);

  const results = await Promise.all(
    yms.map((ym) =>
      fetchOneMonth(lawdCd, ym).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[RTMS Land] ${lawdCd} ${ym} 호출 실패:`, msg);
        return [] as LandTransaction[];
      }),
    ),
  );

  const flat = results.flat();
  flat.sort((a, b) => {
    const cmp = b.dealYmd.localeCompare(a.dealYmd);
    if (cmp !== 0) return cmp;
    return (b.dealDate ?? "").localeCompare(a.dealDate ?? "");
  });
  return flat;
}

/**
 * 직전 N개월의 YYYYMM 배열 (최신 → 과거).
 * 예: months=3, 오늘=2026-04-25 → ["202604","202603","202602"]
 */
export function recentYearMonths(months: number): string[] {
  const safe = Math.max(1, Math.min(24, Math.floor(months)));
  const now = new Date();
  const yms: string[] = [];
  for (let i = 0; i < safe; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    yms.push(`${y}${m}`);
  }
  return yms;
}

async function fetchOneMonth(
  lawdCd: string,
  dealYmd: string,
): Promise<LandTransaction[]> {
  const params = new URLSearchParams({
    serviceKey: KEY,
    LAWD_CD: lawdCd,
    DEAL_YMD: dealYmd,
    numOfRows: "100",
    pageNo: "1",
  });

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    cache: "no-store",
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`HTTP ${res.status}`);
  }

  const text = await res.text();
  const data = xmlParser.parse(text) as RtmsResponse;
  const code = data.response?.header?.resultCode;
  if (code && code !== "00" && code !== "000") {
    if (code === "03") return []; // NO_DATA — 거래 0건 정상
    throw new Error(`RTMS ${code}: ${data.response?.header?.resultMsg ?? ""}`);
  }

  const items = data.response?.body?.items;
  if (!items || typeof items !== "object") return [];
  const raw = items.item;
  if (!raw) return [];
  const arr: RtmsItem[] = Array.isArray(raw) ? raw : [raw];

  return arr
    .map(normalize)
    .filter((x): x is LandTransaction => x !== null);
}

function normalize(it: RtmsItem): LandTransaction | null {
  const year = clean(it.dealYear);
  const month = clean(it.dealMonth);
  if (!year || !month) return null;
  const dealYmd = `${year}-${month.padStart(2, "0")}`;

  const day = clean(it.dealDay);
  const dealDate = day ? `${dealYmd}-${day.padStart(2, "0")}` : null;

  const price_won = parsePrice(it.dealAmount);
  const area_m2 = Number(clean(it.dealArea) ?? "0");
  if (price_won <= 0 || !Number.isFinite(area_m2) || area_m2 <= 0) return null;

  const pricePerPyeong = Math.round(price_won / (area_m2 * M2_PER_PYEONG));

  return {
    dealYmd,
    dealDate,
    jibun: clean(it.jibun) ?? "",
    jimok: clean(it.jimok) ?? "",
    area_m2,
    price_won,
    pricePerPyeong,
    zoning: clean(it.landUse),
    dealType: clean(it.dealingGbn),
    umdNm: clean(it.umdNm) ?? "",
  };
}

function clean(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

/** "10,307,864" (만원) → 103_078_640_000 (원) */
function parsePrice(s: unknown): number {
  if (s == null) return 0;
  const n = Number(String(s).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return 0;
  return n * 10000;
}
