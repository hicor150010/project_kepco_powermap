/**
 * 국토부 RTMS 상업·업무용 부동산 매매 호출.
 *
 * 외부 API: getRTMSDataSvcNrgTrade
 *   - 시군구(LAWD_CD 5) + 거래월(DEAL_YMD YYYYMM) 단위
 *   - 일일 트래픽 한도 10,000회 (토지의 10배)
 *   - 응답 = XML, User-Agent 헤더 필수
 *
 * 대상 = 사무실/상가/빌딩/근린생활시설/숙박/판매시설.
 * 공장·창고는 미포함 (별도 RTMS endpoint 또는 토지매매의 "공장용지" 지목 참조).
 *
 * 마스킹 패턴 (실측):
 *   - buildingType="일반"  → 지번 100% 마스킹 ("1**", "7**")
 *   - buildingType="집합"  → 지번 100% 정확 ("642-9", "908")
 *   집합건축물(빌딩/오피스)은 한 지번에 여러 호수라 개인 식별 어려워 마스킹 X.
 */
import { XMLParser } from "fast-xml-parser";

const ENDPOINT =
  "https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade";
const KEY = process.env.DATA_GO_KR_KEY || "";
const M2_PER_PYEONG = 0.3025;

const USER_AGENT = "Mozilla/5.0 (compatible; SUNLAP/1.0; +https://sunlap.kr)";

export interface NrgTransaction {
  /** 거래월 "YYYY-MM" */
  dealYmd: string;
  /** 거래일 "YYYY-MM-DD" (있을 때) */
  dealDate: string | null;
  /** 지번 — 집합=정확("642-9") / 일반=마스킹("1**") */
  jibun: string;
  /** 건축물 유형: "일반" / "집합" */
  buildingType: string;
  /** 건축물 용도: "업무" / "제2종근린생활" / "제1종근린생활" / "판매" / "숙박" 등 */
  buildingUse: string;
  /** 건물 면적 ㎡ (전유면적 또는 연면적) */
  buildingAr: number;
  /** 거래금액 원 */
  price_won: number;
  /** 평당가 원/평 — 건물면적 기준 (옥상 임대 가치 비교 기준) */
  pricePerPyeong: number;
  /** 준공년도 (옥상 노후도 추정) */
  buildYear: number | null;
  /** 층 (집합건축물만 — "13", "B1") */
  floor: string | null;
  /** 대지면적 ㎡ (일반건축물만 — 집합은 빈값) */
  plottageAr: number | null;
  /** 용도지역 ("일반상업", "제2종일반주거" 등). raw 필드명 = landUse */
  zoning: string | null;
  /** 거래유형 ("직거래"/"중개거래") */
  dealType: string | null;
  /** 매수자 구분 ("법인"/"개인") */
  buyerGbn: string | null;
  /** 매도자 구분 ("법인"/"개인") */
  slerGbn: string | null;
  /** 중개업소 시군구 ("서울 강남구"). 빌딩 매매에서 자주 채워짐 */
  estateAgentSggNm: string | null;
  /** 시군구명 ("강남구") */
  sggNm: string;
  /** 읍면동명 ("역삼동") */
  umdNm: string;
  /** 정정거래일 (정정/해제 시만 채워짐 — 가격 무효 가능) */
  cdealDay: string | null;
  /** 정정유형 ("해제" 등) */
  cdealType: string | null;
  /** 공유거래 유형 — 단독 거래 X 면 평당가 왜곡 가능 */
  shareDealingType: string | null;
}

interface RtmsItem {
  buildYear?: string;
  buildingAr?: string;
  buildingType?: string;
  buildingUse?: string;
  buyerGbn?: string;
  cdealDay?: string;
  cdealType?: string;
  dealAmount?: string;
  dealDay?: string;
  dealMonth?: string;
  dealYear?: string;
  dealingGbn?: string;
  estateAgentSggNm?: string;
  floor?: string;
  jibun?: string;
  landUse?: string;
  plottageAr?: string;
  sggNm?: string;
  shareDealingType?: string;
  slerGbn?: string;
  umdNm?: string;
  // 미사용: sggCd
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
  parseTagValue: false,
  trimValues: true,
});

function recentYearMonths(months: number): string[] {
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

/**
 * bjd_code(10) + months → 직전 N개월 상업·업무용 거래 합쳐서 반환.
 * 토지매매와 동일 패턴 (fan-out + 부분 실패 허용 + NO_DATA 정상 처리).
 */
export async function getNrgTradesByBjd(
  bjdCode: string,
  months: number = 12,
): Promise<NrgTransaction[]> {
  if (!/^\d{10}$/.test(bjdCode)) return [];
  if (!KEY) throw new Error("DATA_GO_KR_KEY 환경변수가 등록되지 않았습니다.");

  const lawdCd = bjdCode.slice(0, 5);
  const yms = recentYearMonths(months);

  const results = await Promise.all(
    yms.map((ym) =>
      fetchOneMonth(lawdCd, ym).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[RTMS Nrg] ${lawdCd} ${ym} 호출 실패:`, msg);
        return [] as NrgTransaction[];
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

async function fetchOneMonth(
  lawdCd: string,
  dealYmd: string,
): Promise<NrgTransaction[]> {
  const params = new URLSearchParams({
    serviceKey: KEY,
    LAWD_CD: lawdCd,
    DEAL_YMD: dealYmd,
    numOfRows: "200",
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
    if (code === "03") return [];
    throw new Error(`RTMS ${code}: ${data.response?.header?.resultMsg ?? ""}`);
  }

  const items = data.response?.body?.items;
  if (!items || typeof items !== "object") return [];
  const raw = items.item;
  if (!raw) return [];
  const arr: RtmsItem[] = Array.isArray(raw) ? raw : [raw];

  return arr
    .map(normalize)
    .filter((x): x is NrgTransaction => x !== null);
}

function normalize(it: RtmsItem): NrgTransaction | null {
  const year = clean(it.dealYear);
  const month = clean(it.dealMonth);
  if (!year || !month) return null;
  const dealYmd = `${year}-${month.padStart(2, "0")}`;

  const day = clean(it.dealDay);
  const dealDate = day ? `${dealYmd}-${day.padStart(2, "0")}` : null;

  const price_won = parsePrice(it.dealAmount);
  const buildingAr = Number(clean(it.buildingAr) ?? "0");
  if (price_won <= 0 || !Number.isFinite(buildingAr) || buildingAr <= 0) {
    return null;
  }

  const pricePerPyeong = Math.round(price_won / (buildingAr * M2_PER_PYEONG));
  const plottageRaw = clean(it.plottageAr);
  const plottageAr = plottageRaw ? Number(plottageRaw) : null;
  const buildYearRaw = clean(it.buildYear);
  const buildYear =
    buildYearRaw && /^\d{4}$/.test(buildYearRaw) ? Number(buildYearRaw) : null;

  return {
    dealYmd,
    dealDate,
    jibun: clean(it.jibun) ?? "",
    buildingType: clean(it.buildingType) ?? "",
    buildingUse: clean(it.buildingUse) ?? "",
    buildingAr,
    price_won,
    pricePerPyeong,
    buildYear,
    floor: clean(it.floor),
    plottageAr:
      plottageAr != null && Number.isFinite(plottageAr) && plottageAr > 0
        ? plottageAr
        : null,
    zoning: clean(it.landUse),
    dealType: clean(it.dealingGbn),
    buyerGbn: clean(it.buyerGbn),
    slerGbn: clean(it.slerGbn),
    estateAgentSggNm: clean(it.estateAgentSggNm),
    sggNm: clean(it.sggNm) ?? "",
    umdNm: clean(it.umdNm) ?? "",
    cdealDay: clean(it.cdealDay),
    cdealType: clean(it.cdealType),
    shareDealingType: clean(it.shareDealingType),
  };
}

function clean(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

function parsePrice(s: unknown): number {
  if (s == null) return 0;
  const n = Number(String(s).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return 0;
  return n * 10000;
}
