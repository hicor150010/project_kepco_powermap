# -*- coding: utf-8 -*-
"""
VWorld 데이터 API 활성화 직후 재테스트
- ④ 공시지가: LP_PA_CBND_BUBUN
- ⑧-1 도로: LT_L_AEROADLINK (또는 다른 도로 레이어)
- ⑧-2 취락지구/토지이용규제: LT_C_UQ128
"""
import sys, io, json, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

VWORLD_KEY = "ABF4A6BE-8E7E-3106-8BFA-1885DF3B54DB"


def call(data_name, attr_filter=None, geom_filter=None, extra=None):
    params = {
        "service": "data",
        "request": "GetFeature",
        "data": data_name,
        "key": VWORLD_KEY,
        "format": "json",
        "size": "5",
        "domain": "localhost",
    }
    if attr_filter:
        params["attrFilter"] = attr_filter
    if geom_filter:
        params["geomFilter"] = geom_filter
    if extra:
        params.update(extra)
    r = requests.get("https://api.vworld.kr/req/data", params=params, timeout=15)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {"raw": r.text[:500]}


def summarize(title, status, data):
    print(f"\n─── {title}")
    print(f"   HTTP={status}")
    resp = data.get("response", {})
    st = resp.get("status")
    if st != "OK":
        err = resp.get("error", {})
        print(f"   🔴 {st} | code={err.get('code')} | text={err.get('text')}")
        return None
    total = resp.get("record", {}).get("total", 0)
    feats = resp.get("result", {}).get("featureCollection", {}).get("features", [])
    print(f"   🟢 total={total}, 반환={len(feats)}")
    if feats:
        props = feats[0].get("properties", {})
        print(f"   첫 피처 속성키: {list(props.keys())}")
        # 유용한 필드 미리보기
        preview_keys = ["pnu", "jibun", "jimok", "jiga", "ld_code_nm", "sgg_nm", "emd_nm", "area", "lanes", "road_name", "kmc_nm", "uq128_nm"]
        preview = {k: props.get(k) for k in preview_keys if k in props}
        if preview:
            print(f"   주요 필드: {json.dumps(preview, ensure_ascii=False)}")
        else:
            # 모든 속성 처음 몇개
            sample_props = {k: v for i, (k, v) in enumerate(props.items()) if i < 8}
            print(f"   속성 샘플: {json.dumps(sample_props, ensure_ascii=False)[:300]}")
    return feats


# ═════════ ④ 공시지가 — 강남 삼성동 bjd=1168010500 ═════════
print("=" * 60)
print("④ 공시지가 — 강남 삼성동 (pnu LIKE 1168010500%)")
print("=" * 60)

# 시도 1: pnu LIKE
status, data = call("LP_PA_CBND_BUBUN", attr_filter="pnu:like:1168010500%")
summarize("attrFilter pnu:like:1168010500%", status, data)

# 시도 2: 다른 bjd — 영암읍 송평리 4683025031
status, data = call("LP_PA_CBND_BUBUN", attr_filter="pnu:like:4683025031%")
feats = summarize("영암읍 송평리 (4683025031)", status, data)

# 시도 3: 여수 돌산읍 신복리 4613025022
status, data = call("LP_PA_CBND_BUBUN", attr_filter="pnu:like:4613025022%")
summarize("여수 돌산읍 신복리 (4613025022)", status, data)

# ═════════ ⑧-1 도로 레이어 ═════════
print("\n\n" + "=" * 60)
print("⑧-1 도로 레이어")
print("=" * 60)

# 삼성동 근처 bbox
BOX_GANGNAM = "BOX(127.050,37.505,127.065,37.520)"
# 영암읍 근처 bbox (대충 중심좌표 기반, 약 1km)
BOX_YEONGAM = "BOX(126.695,34.795,126.715,34.815)"

# 시도 1: LT_L_AEROADLINK (항공사진 도로링크)
status, data = call("LT_L_AEROADLINK", geom_filter=BOX_GANGNAM)
summarize("LT_L_AEROADLINK (강남)", status, data)

# 시도 2: LT_L_MOCT_ROAD (국토부 도로)
status, data = call("LT_L_MOCT_ROAD", geom_filter=BOX_GANGNAM)
summarize("LT_L_MOCT_ROAD (강남)", status, data)

# 시도 3: LT_L_SPRD_MANAGE (도로중심선)
status, data = call("LT_L_SPRD_MANAGE", geom_filter=BOX_GANGNAM)
summarize("LT_L_SPRD_MANAGE 도로중심선 (강남)", status, data)

# 시도 4: LT_L_FRSTCLIMB (그냥 확인)
# status, data = call("LT_L_FRSTCLIMB", geom_filter=BOX_GANGNAM)
# summarize("LT_L_FRSTCLIMB 테스트", status, data)

# ═════════ ⑧-2 토지이용규제 (취락지구) ═════════
print("\n\n" + "=" * 60)
print("⑧-2 토지이용규제 / 취락지구")
print("=" * 60)

# LT_C_UQ128 - 용도지역지구
status, data = call("LT_C_UQ128", geom_filter=BOX_GANGNAM)
summarize("LT_C_UQ128 (강남)", status, data)

# LT_C_UQA430 - 취락지구 (gb 필터 가능)
status, data = call("LT_C_UQ128", geom_filter=BOX_YEONGAM)
summarize("LT_C_UQ128 (영암읍 근처)", status, data)

# LT_C_UQA110 - 용도지구
status, data = call("LT_C_UQA110", geom_filter=BOX_GANGNAM)
summarize("LT_C_UQA110 용도지구 (강남)", status, data)

# LT_C_LHBLK - 주거지구
status, data = call("LT_C_LHBLK", geom_filter=BOX_GANGNAM)
summarize("LT_C_LHBLK (강남)", status, data)


# ═════════ ④ 개별 필지 — PNU 정확 매칭 ═════════
print("\n\n" + "=" * 60)
print("④ 개별 필지 조회 — PNU 19자리")
print("=" * 60)

# 강남 삼성동 159번지 (무역회관) PNU
# 1168010500 + 1 + 0159 + 0000 = 1168010500100159 0000
# 실제 PNU 19자리 = 1168010500 1 0159 0000
TEST_PNU = "1168010500100159" + "0000"  # 20자리가 될 수도, 19자리 기준 수정
# 사실 PNU 19자리 = bjd(10) + 구분(1) + 본번(4) + 부번(4) = 19자리
TEST_PNU = "1168010500" + "1" + "0159" + "0000"  # 19자리
print(f"   테스트 PNU: {TEST_PNU} (길이 {len(TEST_PNU)})")

status, data = call("LP_PA_CBND_BUBUN", attr_filter=f"pnu:=:{TEST_PNU}")
feats = summarize(f"PNU = {TEST_PNU}", status, data)
if feats:
    props = feats[0].get("properties", {})
    print(f"   📍 전체 속성: {json.dumps(props, ensure_ascii=False, indent=2)}")

print("\n" + "=" * 60)
print("테스트 완료")
print("=" * 60)
