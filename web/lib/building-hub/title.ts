/**
 * 건축HUB 표제부 (getBrTitleInfo) 호출.
 *
 * 한 지번 위에 지어진 메인 건물(들)의 영업 결정 정보.
 * (총괄표제부·층별·전유부 등 나머지 6개 operation 은 미래 확장 시 별도 파일.)
 *
 * 입력 = PNU 19자리. 산구분 자동 처리.
 * 출력 = BuildingTitleInfo[] (0건도 정상 — 빈 땅이거나 미등록).
 *
 * PNU → 건축HUB 5필드 매핑:
 *   PNU[0:5]   → sigunguCd
 *   PNU[5:10]  → bjdongCd
 *   PNU[10]    → platGbCd  (PNU 1=일반→0, 2=산→1)
 *   PNU[11:15] → bun
 *   PNU[15:19] → ji
 *
 * 발췌 정책: 응답 78개 필드 중 영업 가치 있는 ~22개만 정규화 (추가 호출 0).
 */

const ENDPOINT =
  "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";
const KEY = process.env.DATA_GO_KR_KEY || "";

export interface BuildingTitleInfo {
  // ── 식별 / TL;DR
  bldNm: string | null; // 건물명 (대부분 빈 값)
  mainPurpsCdNm: string; // 주용도 ("공장", "단독주택", ...)
  regstrKindCdNm: string | null; // 건축물 종류 ("일반건축물", "집합건축물")
  mainAtchGbCdNm: string | null; // "주건축물" / "부속건축물"
  useAprDay: string | null; // 사용승인일 YYYYMMDD
  pmsDay: string | null; // 허가일 YYYYMMDD
  stcnsDay: string | null; // 착공일 YYYYMMDD

  // ── 옥상 태양광 핵심
  archArea: number | null; // 건축면적 ㎡ (≈ 옥상 가용)
  totArea: number; // 연면적 ㎡
  roofCdNm: string | null; // 지붕 ("평슬래브", "기타지붕" 등)
  etcRoof: string | null; // 기타지붕일 때 실제 자재 ("판넬", "슬레이트" 등)
  strctCdNm: string | null; // 구조 ("일반철골구조", "철근콘크리트구조" 등)
  heit: number | null; // 건축물 높이 m
  grndFlrCnt: number; // 지상층수
  ugrndFlrCnt: number; // 지하층수

  // ── 부지 · 확장
  platArea: number | null; // 대지면적 ㎡
  bcRat: number | null; // 건폐율 %
  vlRat: number | null; // 용적률 %
  atchBldCnt: number; // 부속건물 수
  atchBldArea: number; // 부속건물 합계 면적 ㎡

  // ── 조건부 (있을 때만)
  hhldCnt: number; // 세대수 (주택만)
  fmlyCnt: number; // 가구수
  hoCnt: number; // 호수
  oudrAutoUtcnt: number; // 옥외주차 대수

  // ── 주소 (헤더 중복이지만 대장 권위 출처용)
  newPlatPlc: string | null;
  platPlc: string | null;
}

interface BrTitleItem {
  bldNm?: string;
  mainPurpsCdNm?: string;
  regstrKindCdNm?: string;
  mainAtchGbCdNm?: string;
  useAprDay?: string;
  pmsDay?: string;
  stcnsDay?: string;
  archArea?: string;
  totArea?: string;
  roofCdNm?: string;
  etcRoof?: string;
  strctCdNm?: string;
  heit?: string;
  grndFlrCnt?: string;
  ugrndFlrCnt?: string;
  platArea?: string;
  bcRat?: string;
  vlRat?: string;
  atchBldCnt?: string;
  atchBldArea?: string;
  hhldCnt?: string;
  fmlyCnt?: string;
  hoCnt?: string;
  oudrAutoUtcnt?: string;
  newPlatPlc?: string;
  platPlc?: string;
}

interface BrTitleResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      // items 가 정상이면 객체, 결과 0건일 때 빈 문자열로 오는 케이스 둘 다 방어
      items?: { item?: BrTitleItem | BrTitleItem[] } | string;
      totalCount?: string | number;
    };
  };
}

export async function getBuildingTitleByPnu(
  pnu: string,
): Promise<BuildingTitleInfo[]> {
  if (!/^\d{19}$/.test(pnu)) return [];
  if (!KEY) throw new Error("DATA_GO_KR_KEY 환경변수가 등록되지 않았습니다.");

  const sigunguCd = pnu.slice(0, 5);
  const bjdongCd = pnu.slice(5, 10);
  const platGbCd = pnu[10] === "2" ? "1" : "0";
  const bun = pnu.slice(11, 15);
  const ji = pnu.slice(15, 19);

  const params = new URLSearchParams({
    serviceKey: KEY,
    sigunguCd,
    bjdongCd,
    platGbCd,
    bun,
    ji,
    _type: "json",
    numOfRows: "100",
    pageNo: "1",
  });

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`건축HUB HTTP ${res.status}`);

  const data = (await res.json()) as BrTitleResponse;
  const code = data.response?.header?.resultCode;
  if (code && code !== "00") {
    throw new Error(
      `건축HUB ${code}: ${data.response?.header?.resultMsg ?? ""}`,
    );
  }

  const items = data.response?.body?.items;
  if (!items || typeof items !== "object") return [];
  const raw = items.item;
  if (!raw) return [];
  const arr: BrTitleItem[] = Array.isArray(raw) ? raw : [raw];
  return arr.map(normalize);
}

function normalize(it: BrTitleItem): BuildingTitleInfo {
  return {
    bldNm: clean(it.bldNm),
    mainPurpsCdNm: clean(it.mainPurpsCdNm) ?? "",
    regstrKindCdNm: clean(it.regstrKindCdNm),
    mainAtchGbCdNm: clean(it.mainAtchGbCdNm),
    useAprDay: clean(it.useAprDay),
    pmsDay: clean(it.pmsDay),
    stcnsDay: clean(it.stcnsDay),

    archArea: numOrNull(it.archArea),
    totArea: num(it.totArea),
    roofCdNm: clean(it.roofCdNm),
    etcRoof: clean(it.etcRoof),
    strctCdNm: clean(it.strctCdNm),
    heit: numOrNull(it.heit),
    grndFlrCnt: num(it.grndFlrCnt),
    ugrndFlrCnt: num(it.ugrndFlrCnt),

    platArea: numOrNull(it.platArea),
    bcRat: numOrNull(it.bcRat),
    vlRat: numOrNull(it.vlRat),
    atchBldCnt: num(it.atchBldCnt),
    atchBldArea: num(it.atchBldArea),

    hhldCnt: num(it.hhldCnt),
    fmlyCnt: num(it.fmlyCnt),
    hoCnt: num(it.hoCnt),
    oudrAutoUtcnt: num(it.oudrAutoUtcnt),

    newPlatPlc: clean(it.newPlatPlc),
    platPlc: clean(it.platPlc),
  };
}

function clean(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
