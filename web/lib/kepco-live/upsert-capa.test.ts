/**
 * upsert-capa 단위 테스트.
 *
 * KEPCO 응답 → DB row 변환 룰 검증 (parseIntSafe / emptyToNull / toCapaRow).
 * upsertKepcoCapa 자체는 supabase 클라이언트 호출이라 e2e 에서 검증.
 */

import { describe, it, expect } from "vitest";
import {
  parseIntSafe,
  emptyToNull,
  toCapaRow,
} from "./upsert-capa";
import type { KepcoCapacityRow } from "./kepco-client";

describe("parseIntSafe — 숫자 파싱", () => {
  it("number 입력 그대로", () => {
    expect(parseIntSafe(0)).toBe(0);
    expect(parseIntSafe(13000)).toBe(13000);
    expect(parseIntSafe(-5)).toBe(-5);
  });

  it("string 숫자 → int", () => {
    expect(parseIntSafe("0")).toBe(0);
    expect(parseIntSafe("13000")).toBe(13000);
  });

  it("콤마 제거", () => {
    expect(parseIntSafe("13,000")).toBe(13000);
    expect(parseIntSafe("1,234,567")).toBe(1234567);
  });

  it("빈 문자열 / null / undefined → null", () => {
    expect(parseIntSafe("")).toBeNull();
    expect(parseIntSafe(null)).toBeNull();
    expect(parseIntSafe(undefined)).toBeNull();
    expect(parseIntSafe("   ")).toBeNull();
  });

  it("비숫자 문자열 → null", () => {
    expect(parseIntSafe("abc")).toBeNull();
    expect(parseIntSafe("12abc")).toBeNull();
  });

  it("소수 → 정수 (truncate)", () => {
    expect(parseIntSafe(13.7)).toBe(13);
    expect(parseIntSafe("13.7")).toBe(13);
  });
});

describe("emptyToNull — 문자열 정리", () => {
  it("정상 문자열 그대로 (trim)", () => {
    expect(emptyToNull("hello")).toBe("hello");
    expect(emptyToNull("  hello  ")).toBe("hello");
  });

  it("빈 문자열 / null / undefined → null", () => {
    expect(emptyToNull("")).toBeNull();
    expect(emptyToNull("   ")).toBeNull();
    expect(emptyToNull(null)).toBeNull();
    expect(emptyToNull(undefined)).toBeNull();
  });
});

describe("toCapaRow — KEPCO 응답 → DB row 변환", () => {
  const sample: KepcoCapacityRow = {
    SUBST_NM: "서홍천",
    SUBST_CD: "D337",
    MTR_NO: "4",
    DL_NM: "산음",
    DL_CD: "04",
    SUBST_CAPA: 0,
    SUBST_PWR: "0",
    G_SUBST_CAPA: "0",
    MTR_CAPA: 60000,
    MTR_PWR: "1260",
    G_MTR_CAPA: "0",
    DL_CAPA: 12000,
    DL_PWR: 1260,
    G_DL_CAPA: "0",
  };

  it("핵심 필드 매핑", () => {
    const row = toCapaRow("4127032029", "24-1", sample);
    expect(row).toMatchObject({
      bjd_code: "4127032029",
      addr_jibun: "24-1",
      subst_nm: "서홍천",
      mtr_no: "4",
      dl_nm: "산음",
      subst_capa: 0,
      mtr_capa: 60000,
      mtr_pwr: 1260,
      dl_capa: 12000,
      dl_pwr: 1260,
    });
  });

  it("MTR_NO 가 number 여도 string 처리", () => {
    const row = toCapaRow("X", "1", { ...sample, MTR_NO: 4 as unknown as string });
    expect(row.mtr_no).toBe("4");
  });

  it("addr_jibun 빈 문자열 → null", () => {
    const row = toCapaRow("4127032029", "", sample);
    expect(row.addr_jibun).toBeNull();
  });

  it("KEPCO 콤마 포함 숫자 응답 처리", () => {
    const row = toCapaRow("X", "1", { ...sample, DL_CAPA: "12,000" });
    expect(row.dl_capa).toBe(12000);
  });

  it("빈 응답 필드 → null", () => {
    const row = toCapaRow("X", "1", {
      ...sample,
      SUBST_NM: "",
      DL_PWR: "",
    });
    expect(row.subst_nm).toBeNull();
    expect(row.dl_pwr).toBeNull();
  });

  it("STEP 컬럼은 row 에 포함되지 않음 — UPSERT 시 PostgREST 가 자동 보존", () => {
    const row = toCapaRow("X", "1", sample) as unknown as Record<string, unknown>;
    expect("step1_cnt" in row).toBe(false);
    expect("step1_pwr" in row).toBe(false);
    expect("step2_cnt" in row).toBe(false);
    expect("step3_pwr" in row).toBe(false);
  });
});
