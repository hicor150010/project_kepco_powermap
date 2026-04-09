/**
 * KEPCO 엑셀 헤더 자동 탐지 + 컬럼 매핑
 *
 * KEPCO 양식 (확인 완료 — 2026-04-08):
 *   Row 0: 타이틀 + 추출일시
 *   Row 1: 그룹 헤더 (병합셀)
 *   Row 2: 컬럼 헤더 21개 (필수)
 *   Row 3+: 데이터
 *
 * 헤더 위치가 미래에 바뀔 수 있어 1~10행 안에서 "시/도"를 찾아 자동 탐지.
 */

/** 필수 컬럼 (21개) */
export const REQUIRED_HEADERS = [
  "시/도",
  "시",
  "구/군",
  "동/면",
  "리",
  "상세번지",
  "변전소명",
  "주변압기",
  "배전선로명",
  "변전소여유용량",
  "주변압기여유용량",
  "배전선로여유용량",
  "변전소 접속기준용량(kW)",
  "변전소 접수기준접속용량(kW)",
  "변전소 접속계획반영접속용량(kW)",
  "주변압기 접속기준용량(kW)",
  "주변압기 접수기준접속용량(kW)",
  "주변압기 접속계획반영접속용량(kW)",
  "배전선로 접속기준용량(kW)",
  "배전선로 접수기준접속용량(kW)",
  "배전선로 접속계획반영접속용량(kW)",
] as const;

/** 옵셔널 STEP 컬럼 (6개) */
export const OPTIONAL_STEP_HEADERS = [
  "접수 건수",
  "접수 용량(kW)",
  "공용망보강 건수",
  "공용망보강 용량(kW)",
  "접속공사 건수",
  "접속공사 용량(kW)",
] as const;

export type RequiredHeader = (typeof REQUIRED_HEADERS)[number];
export type StepHeader = (typeof OPTIONAL_STEP_HEADERS)[number];

export interface HeaderMap {
  /** 헤더 행의 0-indexed 위치 (4행이면 3) */
  headerRow: number;
  /** 필수 컬럼 인덱스 (모두 존재) */
  required: Record<RequiredHeader, number>;
  /** STEP 컬럼 인덱스 (없으면 -1) */
  step: Record<StepHeader, number>;
  /** STEP 데이터가 있는지 */
  hasStep: boolean;
}

export class ExcelFormatError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = "ExcelFormatError";
  }
}

/**
 * 헤더 행 자동 탐지 + 매핑
 * - 1~10행 중 "시/도"가 있는 행을 헤더로 인식
 * - 필수 21개 컬럼이 모두 있는지 검증
 * - STEP 6개는 옵셔널 (있으면 매핑, 없으면 -1)
 */
export function detectHeaderMap(rows: any[][]): HeaderMap {
  const SCAN_DEPTH = Math.min(10, rows.length);

  let headerRow = -1;
  for (let i = 0; i < SCAN_DEPTH; i++) {
    const row = rows[i];
    if (Array.isArray(row) && row.includes("시/도")) {
      headerRow = i;
      break;
    }
  }

  if (headerRow === -1) {
    throw new ExcelFormatError(
      "KEPCO 표준 양식이 아닙니다. 헤더 행에서 '시/도' 컬럼을 찾을 수 없습니다."
    );
  }

  const headers = rows[headerRow] as any[];
  const headerStrings = headers.map((h) => String(h ?? "").trim());

  // 필수 컬럼 매핑
  const required = {} as Record<RequiredHeader, number>;
  const missing: string[] = [];

  for (const name of REQUIRED_HEADERS) {
    const idx = headerStrings.indexOf(name);
    if (idx === -1) missing.push(name);
    required[name] = idx;
  }

  if (missing.length > 0) {
    throw new ExcelFormatError(
      `KEPCO 표준 양식이 아닙니다. 다음 필수 컬럼이 없습니다: ${missing.join(", ")}`
    );
  }

  // STEP 컬럼 매핑 (옵셔널)
  const step = {} as Record<StepHeader, number>;
  let hasStep = false;
  for (const name of OPTIONAL_STEP_HEADERS) {
    const idx = headerStrings.indexOf(name);
    step[name] = idx;
    if (idx !== -1) hasStep = true;
  }

  // STEP은 6개가 모두 있거나 모두 없거나 둘 중 하나여야 함
  if (hasStep) {
    const missingStep = OPTIONAL_STEP_HEADERS.filter((n) => step[n] === -1);
    if (missingStep.length > 0 && missingStep.length < OPTIONAL_STEP_HEADERS.length) {
      throw new ExcelFormatError(
        `STEP 컬럼이 일부만 존재합니다. 다음 컬럼이 누락: ${missingStep.join(", ")}`
      );
    }
  }

  return { headerRow, required, step, hasStep };
}
