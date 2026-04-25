/**
 * parseKoreanAddress 단위 테스트.
 *
 * 검증 케이스: scripts/test_kepco_address_lookup 의 33개 verify_full + 산지번 보완 케이스.
 * Python crawler/import_bjd_master.split_sep5 와 동일 결과를 내야 한다.
 */

import { describe, it, expect } from "vitest";
import { parseKoreanAddress } from "./parse-address";

describe("parseKoreanAddress — 행정구역 형태별", () => {
  it("도-군-면-리-지번 (양평)", () => {
    expect(parseKoreanAddress("경기도 양평군 청운면 갈운리 24-1")).toMatchObject({
      sep_1: "경기도", sep_2: null, sep_3: "양평군",
      sep_4: "청운면", sep_5: "갈운리", jibun: "24-1",
    });
  });

  it("광역시-구-동 (서울 강남)", () => {
    expect(parseKoreanAddress("서울특별시 강남구 역삼동 736")).toMatchObject({
      sep_1: "서울특별시", sep_2: null, sep_3: "강남구",
      sep_4: "역삼동", sep_5: null, jibun: "736",
    });
  });

  it("광역시-군-읍-리 (부산 기장군)", () => {
    expect(parseKoreanAddress("부산광역시 기장군 일광읍 청광리 108-1")).toMatchObject({
      sep_1: "부산광역시", sep_2: null, sep_3: "기장군",
      sep_4: "일광읍", sep_5: "청광리", jibun: "108-1",
    });
  });

  it("도-시-구-동 (충북 청주)", () => {
    expect(parseKoreanAddress("충청북도 청주시 흥덕구 가경동 1502")).toMatchObject({
      sep_1: "충청북도", sep_2: "청주시", sep_3: "흥덕구",
      sep_4: "가경동", sep_5: null, jibun: "1502",
    });
  });

  it("세종 (시도=시 통합, 구 없음)", () => {
    expect(parseKoreanAddress("세종특별자치시 조치원읍 신흥리 1")).toMatchObject({
      sep_1: "세종특별자치시", sep_2: null, sep_3: null,
      sep_4: "조치원읍", sep_5: "신흥리", jibun: "1",
    });
  });

  it("제주 (도-시-동, 구 없음)", () => {
    expect(parseKoreanAddress("제주특별자치도 제주시 노형동 925")).toMatchObject({
      sep_1: "제주특별자치도", sep_2: "제주시", sep_3: null,
      sep_4: "노형동", sep_5: null, jibun: "925",
    });
  });

  it("강원 특별자치도 (도-시-동)", () => {
    expect(parseKoreanAddress("강원특별자치도 춘천시 효자동 100")).toMatchObject({
      sep_1: "강원특별자치도", sep_2: "춘천시", sep_3: null,
      sep_4: "효자동", sep_5: null, jibun: "100",
    });
  });
});

describe("parseKoreanAddress — 산 지번 분리 (KEPCO 표기 '산1' 정규화)", () => {
  it("'산 1-10' (공백 있음) → '산1-10'", () => {
    expect(parseKoreanAddress("경기도 양평군 청운면 갈운리 산 1-10").jibun)
      .toBe("산1-10");
  });

  it("'산1-10' (공백 없음, KEPCO 형식)", () => {
    expect(parseKoreanAddress("경기도 양평군 청운면 갈운리 산1-10").jibun)
      .toBe("산1-10");
  });

  it("'산1' (단일)", () => {
    expect(parseKoreanAddress("경기도 양평군 청운면 갈운리 산1").jibun)
      .toBe("산1");
  });

  it("'산116' (3자리)", () => {
    expect(parseKoreanAddress("경기도 양평군 청운면 갈운리 산116").jibun)
      .toBe("산116");
  });

  it("산 지번에서도 sep_5 정확히 분리", () => {
    expect(parseKoreanAddress("경기도 양평군 청운면 갈운리 산1-10")).toMatchObject({
      sep_4: "청운면", sep_5: "갈운리", jibun: "산1-10",
    });
  });
});

describe("parseKoreanAddress — 일반 지번", () => {
  it("부번 있는 지번 (24-1)", () => {
    expect(parseKoreanAddress("경기도 양평군 청운면 갈운리 24-1").jibun)
      .toBe("24-1");
  });

  it("본번만 (24)", () => {
    expect(parseKoreanAddress("경기도 양평군 청운면 갈운리 24").jibun)
      .toBe("24");
  });

  it("4자리 본번 (1502)", () => {
    expect(parseKoreanAddress("충청북도 청주시 흥덕구 가경동 1502").jibun)
      .toBe("1502");
  });
});

describe("parseKoreanAddress — 입력 결함", () => {
  it("면 누락 — sep_4=null, 나머지 채움", () => {
    expect(parseKoreanAddress("경기도 양평군 갈운리 24-1")).toMatchObject({
      sep_1: "경기도", sep_2: null, sep_3: "양평군",
      sep_4: null, sep_5: "갈운리", jibun: "24-1",
    });
  });

  it("선두/말미 공백 무시", () => {
    expect(parseKoreanAddress("  경기도 양평군 청운면 갈운리 24-1  ").sep_1)
      .toBe("경기도");
  });

  it("연속 공백 처리", () => {
    expect(parseKoreanAddress("경기도   양평군    청운면 갈운리 24-1").sep_4)
      .toBe("청운면");
  });
});

describe("parseKoreanAddress — original 보존", () => {
  it("원본 그대로 저장", () => {
    const input = "경기도 양평군 청운면 갈운리 24-1";
    expect(parseKoreanAddress(input).original).toBe(input);
  });
});
