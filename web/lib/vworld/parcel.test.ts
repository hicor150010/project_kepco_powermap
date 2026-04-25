/**
 * VWorld LX 편집지적도(`lt_c_landinfobasemap`) 응답 파싱 단위 테스트.
 *
 * 2026-04-25: lp_pa_cbnd_bubun(VWorld 자체) → lt_c_landinfobasemap(LX) 교체에 따라
 * schema 전면 변경. 본번/부번 필드명도 bonbun/bubun → mnnm/slno 로 바뀜.
 * 단, splitParcelFeature 는 이미 `jibun` 필드("179장")를 직접 정규화하므로
 * mnnm/slno 는 응답에 포함되지만 실제 사용 안 함.
 */

import { describe, it, expect } from "vitest";
import {
  parseJimok,
  splitParcelFeature,
  normalizeJibun,
} from "./parcel";

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
// splitParcelFeature — LX WFS Feature → JibunInfo + ParcelGeometry
// 실제 LX 응답 mock 으로 통합 시나리오 검증
// ───────────────────────────────────────────
describe("splitParcelFeature (LX 편집지적도)", () => {
  interface MockProps {
    pnu?: string;
    jibun?: string;
    jimok?: string;
    mnnm?: string;
    slno?: string;
    gbn_cd?: string;
    sido_nm?: string;
    sgg_nm?: string;
    emd_nm?: string;
    ri_nm?: string | null;
    jiga_ilp?: string;
  }

  const mockFeature = (props: MockProps) =>
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
        jimok: props.jimok ?? "",
        mnnm: props.mnnm ?? "0000",
        slno: props.slno ?? "0000",
        gbn_cd: props.gbn_cd ?? "1",
        gbn_nm: props.gbn_cd === "2" ? "임야대장" : "토지대장",
        sido_nm: props.sido_nm ?? "",
        sgg_nm: props.sgg_nm ?? "",
        emd_nm: props.emd_nm ?? "",
        ri_nm: props.ri_nm ?? null,
        jiga_ilp: props.jiga_ilp ?? "0",
        parea: "100",
      },
    }) as Parameters<typeof splitParcelFeature>[0];

  it("도시 일반 필지 (강남 삼성동, ri_nm=null)", () => {
    const r = splitParcelFeature(
      mockFeature({
        pnu: "1168010500101480011",
        jibun: "148-11대",
        jimok: "대",
        mnnm: "0148",
        slno: "0011",
        sido_nm: "서울특별시",
        sgg_nm: "강남구",
        emd_nm: "삼성동",
        ri_nm: null,
        jiga_ilp: "13770000",
      }),
    );
    expect(r.jibun.jibun).toBe("148-11");
    expect(r.jibun.isSan).toBe(false);
    expect(r.geometry.jimok).toBe("대");
    expect(r.geometry.jiga).toBe(13770000);
    expect(r.jibun.ctp_nm).toBe("서울특별시");
    expect(r.jibun.li_nm).toBe("");
    expect(r.jibun.addr).toBe("서울특별시 강남구 삼성동 148-11");
  });

  it("시골 일반 필지 (리 포함, jimok 풀명칭)", () => {
    const r = splitParcelFeature(
      mockFeature({
        pnu: "4183025026101590002",
        jibun: "159-2대",
        jimok: "대",
        mnnm: "0159",
        slno: "0002",
        sido_nm: "경기도",
        sgg_nm: "양평군",
        emd_nm: "양평읍",
        ri_nm: "대흥리",
      }),
    );
    expect(r.jibun.jibun).toBe("159-2");
    expect(r.geometry.jimok).toBe("대");
    expect(r.jibun.li_nm).toBe("대흥리");
    expect(r.jibun.addr).toBe("경기도 양평군 양평읍 대흥리 159-2");
  });

  it("산 지번 (gbn_cd=2 → isSan true, jimok 풀명칭)", () => {
    const r = splitParcelFeature(
      mockFeature({
        jibun: "산23-4임",
        jimok: "임야",
        mnnm: "0023",
        slno: "0004",
        gbn_cd: "2",
      }),
    );
    expect(r.jibun.jibun).toBe("산23-4");
    expect(r.jibun.isSan).toBe(true);
    expect(r.geometry.jimok).toBe("임야"); // LX 는 풀명칭
  });

  it("부번 없는 지번 (slno=0000)", () => {
    const r = splitParcelFeature(
      mockFeature({
        jibun: "159답",
        jimok: "답",
        mnnm: "0159",
        slno: "0000",
      }),
    );
    expect(r.jibun.jibun).toBe("159");
    expect(r.geometry.jimok).toBe("답");
  });

  it("공시지가 없음 (jiga_ilp 빈값)", () => {
    const r = splitParcelFeature(
      mockFeature({
        jibun: "1-1대",
        jimok: "대",
        mnnm: "0001",
        slno: "0001",
        jiga_ilp: "",
      }),
    );
    expect(r.geometry.jiga).toBeNull();
  });

  it("LX jimok 빈값일 때 jibun 끝 한글 fallback", () => {
    const r = splitParcelFeature(
      mockFeature({
        jibun: "100전",
        jimok: "", // LX 가 빈값 응답하는 케이스
        mnnm: "0100",
      }),
    );
    expect(r.geometry.jimok).toBe("전");
  });

  it("도로 지번 (jimok='도로')", () => {
    const r = splitParcelFeature(
      mockFeature({
        jibun: "870도",
        jimok: "도로",
        mnnm: "0870",
        slno: "0000",
      }),
    );
    expect(r.jibun.jibun).toBe("870");
    expect(r.geometry.jimok).toBe("도로");
  });
});
