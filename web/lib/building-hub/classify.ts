/**
 * 건축물대장 → 영업 의사결정 등급 헬퍼.
 *
 * UI 의 색 신호(go/review/skip) 와 등급 판정을 1곳에 모음.
 * 사용자/의뢰자 피드백으로 분류 기준 변경 시 이 파일만 수정.
 *
 * 분류 근거: 일반 태양광 영업 시점에서의 1차 스크리닝 기준 (추정).
 */

export type PurposeGrade = "go" | "review" | "skip";
export type MaterialGrade = "ideal" | "ok" | "poor" | "unknown";

const GO_PURPOSES = [
  "공장",
  "창고",
  "축사",
  "농막",
  "퇴비사",
  "잠실",
  "버섯재배사",
  "온실",
  "양어장",
  "양계장",
  "축산시설",
  "농업용시설",
];

const SKIP_PURPOSES = [
  "단독주택",
  "다중주택",
  "다가구주택",
  "공동주택",
  "아파트",
  "연립주택",
  "다세대주택",
  "기숙사",
];

/** 용도 → 영업 1차 등급. unknown 케이스는 review 로 보수적 분류. */
export function classifyPurpose(purpose: string): PurposeGrade {
  if (!purpose) return "review";
  if (GO_PURPOSES.some((p) => purpose.includes(p))) return "go";
  if (SKIP_PURPOSES.some((p) => purpose.includes(p))) return "skip";
  return "review";
}

/**
 * 지붕 → 옥상 태양광 적합도.
 * roofCdNm 이 "기타지붕" 이면 etcRoof (실제 자재) 우선 판정.
 */
export function classifyRoof(
  roofCdNm: string | null,
  etcRoof: string | null,
): MaterialGrade {
  const text = [roofCdNm, etcRoof]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text) return "unknown";

  // 이상적: 평슬래브 / 콘크리트 (옥상 평면, 패널 설치 최적)
  if (/슬래브|콘크리트|평지붕|아스팔트|평슬라브/.test(text)) return "ideal";

  // 비추: 슬레이트(석면 위험) / 기와 / 너와 / 함석 (제거 비용 ↑)
  if (/슬레이트|기와|너와|초가/.test(text)) return "poor";

  // 무난: 판넬/샌드위치/금속 (설치 가능, 일부 보강)
  if (/판넬|패널|샌드위치|금속|아연|징크/.test(text)) return "ok";

  return "unknown";
}

/** 구조 → 옥상 하중 견딤 등급. */
export function classifyStructure(strctCdNm: string | null): MaterialGrade {
  if (!strctCdNm) return "unknown";
  const t = strctCdNm;

  if (/철근콘크리트|철골철근|철골콘크리트|프리캐스트|RC/.test(t)) return "ideal";
  if (/철골|경량철골|일반철골/.test(t)) return "ok";
  if (/조적|벽돌|블록/.test(t)) return "poor";
  if (/목조|목구조|흙벽|토벽/.test(t)) return "poor";

  return "unknown";
}

/**
 * 사용승인일 (YYYYMMDD) → 경과년수.
 * 잘못된 형식이면 null.
 */
export function yearsSince(yyyymmdd: string | null): number | null {
  if (!yyyymmdd || !/^\d{8}$/.test(yyyymmdd)) return null;
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  if (!y) return null;
  const apr = new Date(y, (m || 1) - 1, d || 1);
  const now = new Date();
  const diffMs = now.getTime() - apr.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
}

/** YYYYMMDD → "2012.03" (영업 화면 간결 표기) */
export function formatBldgYearMonth(yyyymmdd: string | null): string {
  if (!yyyymmdd || !/^\d{8}$/.test(yyyymmdd)) return "";
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}`;
}

/** ㎡ → 평 (반올림) */
export function toPyeong(m2: number): number {
  return Math.round(m2 * 0.3025);
}

/**
 * 영업 시점 노후 강조 임계값 (사용승인일 기준).
 * 30년 이상이면 옥상 구조 안전성 추가 검토 신호.
 */
export const NOTEWORTHY_OLD_YEARS = 30;

/**
 * 노지·캐노피 추가 검토 hint 임계 (건폐율 %).
 * 건폐율이 이 값보다 낮으면 마당 여유가 매우 커서 옥상 외 추가 영업 잠재력 ↑
 */
export const LAND_SOLAR_HINT_BCRAT = 20;
