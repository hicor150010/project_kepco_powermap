/**
 * VWorld parcel 파싱 단위 테스트.
 *
 * 과거 버그: VWorld `jibun` 문자열만 보고 공백 split 하다가 지역별 포맷 차이로 실패.
 * → `bonbun`/`bubun`/`bchk` 필드 직접 사용하는 방식으로 교체. 이 테스트가 재발 방지 막이.
 */

import { describe, it, expect } from "vitest";
import {
  buildJibunNumber,
  parseJimok,
  pickBestParcelMatch,
  splitParcelFeature,
  normalizeJibun,
} from "./parcel";

// ───────────────────────────────────────────
// buildJibunNumber — bonbun/bubun/bchk → 지번 번호
// ───────────────────────────────────────────
describe("buildJibunNumber", () => {
  it("일반 지번 (부번 있음)", () => {
    expect(buildJibunNumber("148", "11", "1")).toBe("148-11");
    expect(buildJibunNumber("159", "2", "1")).toBe("159-2");
    expect(buildJibunNumber("100", "1", "1")).toBe("100-1");
  });

  it("부번 없음 (bubun='0' or '')", () => {
    expect(buildJibunNumber("159", "0", "1")).toBe("159");
    expect(buildJibunNumber("159", "", "1")).toBe("159");
    expect(buildJibunNumber("42", "0", "1")).toBe("42");
  });

  it("산 지번 (bchk='2') — KEPCO 포맷과 일치하도록 공백 없음", () => {
    expect(buildJibunNumber("23", "4", "2")).toBe("산23-4");
    expect(buildJibunNumber("100", "0", "2")).toBe("산100");
    expect(buildJibunNumber("1", "1", "2")).toBe("산1-1");
  });

  it("공백 제거 (입력에 trailing 공백)", () => {
    expect(buildJibunNumber(" 148 ", " 11 ", "1")).toBe("148-11");
  });

  it("부번에 지목 섞여 들어온 VWorld 이상 데이터 방어", () => {
    // 실제 발생 케이스: 양평 대흥리 189-5 (지목=도로) → VWorld 가 bubun="5도" 반환
    expect(buildJibunNumber("189", "5도", "1")).toBe("189-5");
    expect(buildJibunNumber("23", "4임", "2")).toBe("산23-4");
    expect(buildJibunNumber("100", "1대", "1")).toBe("100-1");
  });
});

// ───────────────────────────────────────────
// normalizeJibun — canonical form 방어막
// ───────────────────────────────────────────
describe("normalizeJibun", () => {
  it("공백 제거", () => {
    expect(normalizeJibun("산 1-1")).toBe("산1-1");
    expect(normalizeJibun("189 - 5")).toBe("189-5");
    expect(normalizeJibun("  42  ")).toBe("42");
  });

  it("끝에 붙은 한글(지목) 제거", () => {
    expect(normalizeJibun("189-5도")).toBe("189-5");
    expect(normalizeJibun("42잡종지")).toBe("42");
    expect(normalizeJibun("산23-4임")).toBe("산23-4");
  });

  it("공백 + 지목 동시", () => {
    expect(normalizeJibun("189 - 5 도")).toBe("189-5");
    expect(normalizeJibun("산 1-1 전")).toBe("산1-1");
  });

  it("이미 canonical 이면 변경 없음", () => {
    expect(normalizeJibun("189-5")).toBe("189-5");
    expect(normalizeJibun("산1-1")).toBe("산1-1");
    expect(normalizeJibun("42")).toBe("42");
  });

  it("빈 값 처리", () => {
    expect(normalizeJibun("")).toBe("");
  });
});

// ───────────────────────────────────────────
// parseJimok — jibun 문자열에서 지목만 추출
// ───────────────────────────────────────────
describe("parseJimok", () => {
  it("공백 구분 (서울 스타일)", () => {
    expect(parseJimok("148-11 대")).toBe("대");
    expect(parseJimok("산 23-4 임")).toBe("임");
    expect(parseJimok("42 잡종지")).toBe("잡종지");
  });

  it("공백 없음 (지역 일부)", () => {
    expect(parseJimok("159-2대")).toBe("대");
    expect(parseJimok("산23-4임")).toBe("임");
    expect(parseJimok("42잡종지")).toBe("잡종지");
  });

  it("긴 지목 (4글자)", () => {
    expect(parseJimok("100 공장용지")).toBe("공장용지");
    expect(parseJimok("50-2주차장")).toBe("주차장");
  });

  it("지목 없음 (숫자만)", () => {
    expect(parseJimok("159")).toBe("");
    expect(parseJimok("159-2")).toBe("");
  });

  it("빈 입력", () => {
    expect(parseJimok("")).toBe("");
    expect(parseJimok("   ")).toBe("");
  });
});

// ───────────────────────────────────────────
// splitParcelFeature — WFS Feature → JibunInfo + ParcelGeometry
// 통합 시나리오 (실제 VWorld 응답 mock)
// ───────────────────────────────────────────
describe("splitParcelFeature", () => {
  const mockFeature = (props: Record<string, string>) =>
    ({
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [127.0561, 37.5116],
            [127.0565, 37.5117],
            [127.0566, 37.5115],
            [127.0562, 37.5114],
            [127.0561, 37.5116],
          ],
        ],
      },
      properties: {
        pnu: props.pnu ?? "1168010500101480011",
        jibun: props.jibun ?? "",
        bonbun: props.bonbun ?? "",
        bubun: props.bubun ?? "0",
        bchk: props.bchk ?? "1",
        addr: props.addr ?? "",
        ctp_nm: props.ctp_nm ?? "",
        sig_nm: props.sig_nm ?? "",
        emd_nm: props.emd_nm ?? "",
        li_nm: props.li_nm ?? "",
        jiga: props.jiga ?? "0",
      },
    }) as Parameters<typeof splitParcelFeature>[0];

  it("강남 삼성동 (공백 있는 포맷)", () => {
    const r = splitParcelFeature(
      mockFeature({
        pnu: "1168010500101480011",
        jibun: "148-11 대",
        bonbun: "148",
        bubun: "11",
        bchk: "1",
        addr: "서울특별시 강남구 삼성동 148-11",
        ctp_nm: "서울특별시",
        sig_nm: "강남구",
        emd_nm: "삼성동",
        jiga: "13770000",
      }),
    );
    expect(r.jibun.jibun).toBe("148-11");
    expect(r.jibun.isSan).toBe(false);
    expect(r.geometry.jimok).toBe("대");
    expect(r.geometry.jiga).toBe(13770000);
    expect(r.jibun.ctp_nm).toBe("서울특별시");
  });

  it("양평 대흥리 (공백 없는 포맷 — 과거 버그 재발 방지)", () => {
    const r = splitParcelFeature(
      mockFeature({
        pnu: "4183025026101590002",
        jibun: "159-2대",
        bonbun: "159",
        bubun: "2",
        bchk: "1",
        addr: "경기도 양평군 양평읍 대흥리 159-2",
        ctp_nm: "경기도",
        sig_nm: "양평군",
        emd_nm: "양평읍",
        li_nm: "대흥리",
      }),
    );
    expect(r.jibun.jibun).toBe("159-2"); // ← 버그: ""이 나오면 안 됨
    expect(r.geometry.jimok).toBe("대");
    expect(r.jibun.li_nm).toBe("대흥리");
  });

  it("산 지번 (KEPCO 포맷 = 공백 없음)", () => {
    const r = splitParcelFeature(
      mockFeature({
        jibun: "산 23-4 임",
        bonbun: "23",
        bubun: "4",
        bchk: "2",
      }),
    );
    expect(r.jibun.jibun).toBe("산23-4"); // ← 공백 없어야 KEPCO 와 매칭
    expect(r.jibun.isSan).toBe(true);
    expect(r.geometry.jimok).toBe("임");
  });

  it("부번 없는 지번", () => {
    const r = splitParcelFeature(
      mockFeature({
        jibun: "159답",
        bonbun: "159",
        bubun: "0",
        bchk: "1",
      }),
    );
    expect(r.jibun.jibun).toBe("159");
    expect(r.geometry.jimok).toBe("답");
  });

  it("공시지가 없음", () => {
    const r = splitParcelFeature(
      mockFeature({
        jibun: "1-1 대",
        bonbun: "1",
        bubun: "1",
        bchk: "1",
        jiga: "",
      }),
    );
    expect(r.geometry.jiga).toBeNull();
  });
});

// ───────────────────────────────────────────
// pickBestParcelMatch — BBOX 응답 후보 중 1개 선택
// 핵심: 점이 여러 폴리곤에 동시 포함될 때 면적 작은 것 우선
// (직리 116-2 깔때기 케이스 회귀 방지)
// ───────────────────────────────────────────
describe("pickBestParcelMatch", () => {
  type WfsFeature = Parameters<typeof splitParcelFeature>[0];

  function mockFeatureWithPolygon(
    bonbun: string,
    polygon: number[][][],
  ): WfsFeature {
    return {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: polygon },
      properties: {
        pnu: `123456789012345${bonbun.padStart(4, "0")}`,
        jibun: "",
        bonbun,
        bubun: "0",
        bchk: "1",
        addr: "",
        ctp_nm: "",
        sig_nm: "",
        emd_nm: "",
        li_nm: "",
        jiga: "0",
      },
    } as WfsFeature;
  }

  // 작은 폴리곤 (약 22m × 22m), 클릭 점 (37.5, 127.0) 포함
  const polygonSmall: number[][][] = [
    [
      [126.9999, 37.4999],
      [127.0001, 37.4999],
      [127.0001, 37.5001],
      [126.9999, 37.5001],
      [126.9999, 37.4999],
    ],
  ];

  // 큰 폴리곤 (약 1.1km × 1.1km), 같은 클릭 점 포함
  const polygonBig: number[][][] = [
    [
      [126.995, 37.495],
      [127.005, 37.495],
      [127.005, 37.505],
      [126.995, 37.505],
      [126.995, 37.495],
    ],
  ];

  // 다른 위치 폴리곤 (클릭 점 미포함)
  const polygonOffset: number[][][] = [
    [
      [127.01, 37.51],
      [127.012, 37.51],
      [127.012, 37.512],
      [127.01, 37.512],
      [127.01, 37.51],
    ],
  ];

  it("빈 배열 → null", () => {
    expect(pickBestParcelMatch([], 37.5, 127.0)).toBeNull();
  });

  it("1개 + 점이 폴리곤 안 → 그것 반환", () => {
    const f = mockFeatureWithPolygon("100", polygonSmall);
    const r = pickBestParcelMatch([f], 37.5, 127.0);
    expect(r?.properties.bonbun).toBe("100");
  });

  it("1개 + 점이 폴리곤 밖 → null", () => {
    const f = mockFeatureWithPolygon("100", polygonOffset);
    expect(pickBestParcelMatch([f], 37.5, 127.0)).toBeNull();
  });

  it("2개 + 점이 한쪽에만 → 그쪽 반환 (위치 정확 매칭)", () => {
    const small = mockFeatureWithPolygon("100", polygonSmall);
    const offset = mockFeatureWithPolygon("200", polygonOffset);
    const r = pickBestParcelMatch([offset, small], 37.5, 127.0);
    expect(r?.properties.bonbun).toBe("100");
  });

  it("핵심: 둘 다 점 포함 (큰 깔때기 + 작은 일반 필지) → 작은 것 우선", () => {
    const big = mockFeatureWithPolygon("116", polygonBig);
    const small = mockFeatureWithPolygon("63", polygonSmall);
    const r = pickBestParcelMatch([big, small], 37.5, 127.0);
    expect(r?.properties.bonbun).toBe("63");
  });

  it("응답 순서 무관: 작은 것이 먼저여도 동일 결과", () => {
    const big = mockFeatureWithPolygon("116", polygonBig);
    const small = mockFeatureWithPolygon("63", polygonSmall);
    const r = pickBestParcelMatch([small, big], 37.5, 127.0);
    expect(r?.properties.bonbun).toBe("63");
  });

  it("점이 큰 폴리곤만 안 (작은 후보가 점 미포함) → 큰 것 반환", () => {
    const big = mockFeatureWithPolygon("200", polygonBig);
    const offsetSmall = mockFeatureWithPolygon("100", polygonOffset);
    const r = pickBestParcelMatch([offsetSmall, big], 37.5, 127.0);
    expect(r?.properties.bonbun).toBe("200");
  });
});
