# -*- coding: utf-8 -*-
"""
VWorld 실측 — domain=* 로 정상 호출 (범인 확정 후)
- ④ 공시지가: LP_PA_CBND_BUBUN (bjd=10자리 LIKE)
- ⑧-1 도로: 여러 레이어 테스트
- ⑧-2 취락/용도지구: LT_C_UQ128 등
"""
import sys, io, json, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

KEY = "ABF4A6BE-8E7E-3106-8BFA-1885DF3B54DB"
BASE = {"service": "data", "request": "GetFeature", "key": KEY, "format": "json", "domain": "*", "size": "5"}

SAMPLES = [
    {"bjd": "1168010500", "label": "서울 강남구 삼성동", "box": "127.050,37.505,127.065,37.520"},
    {"bjd": "4683025031", "label": "전남 영암군 영암읍 송평리", "box": "126.690,34.795,126.710,34.815"},
    {"bjd": "4613025022", "label": "전남 여수시 돌산읍 신복리", "box": "127.760,34.670,127.780,34.690"},
]


def call(data, attr=None, geom=None):
    p = dict(BASE); p["data"] = data
    if attr: p["attrFilter"] = attr
    if geom: p["geomFilter"] = geom
    r = requests.get("https://api.vworld.kr/req/data", params=p, timeout=15)
    try:
        return r.json().get("response", {})
    except Exception:
        return {"raw": r.text[:300]}


def show(title, resp):
    st = resp.get("status")
    if st != "OK":
        err = resp.get("error", {})
        print(f"   🔴 {title}: {st} | {err.get('code')} | {err.get('text','')[:80]}")
        return None
    total = resp.get("record", {}).get("total", 0)
    feats = resp.get("result", {}).get("featureCollection", {}).get("features", [])
    print(f"   🟢 {title}: total={total}, 반환={len(feats)}")
    if feats:
        return feats[0].get("properties", {})
    return None


# ═════════ ④ 공시지가 ═════════
print("=" * 60)
print("④ 공시지가 — LP_PA_CBND_BUBUN")
print("=" * 60)
for s in SAMPLES:
    print(f"\n─── bjd={s['bjd']} | {s['label']}")
    resp = call("LP_PA_CBND_BUBUN", attr=f"pnu:LIKE:{s['bjd']}%")
    props = show("LIKE", resp)
    if props:
        print(f"     샘플: pnu={props.get('pnu')}, 지번={props.get('jibun')}, 주소={props.get('addr')}")
        jiga = props.get('jiga')
        try:
            jiga_fmt = f"{int(jiga):,}원/㎡" if jiga else "jiga 없음"
        except Exception:
            jiga_fmt = f"{jiga}"
        print(f"     공시지가(jiga)={jiga_fmt}")
        print(f"     공시일={props.get('gosi_year')}.{props.get('gosi_month')}")


# ═════════ ⑧-1 도로 레이어들 ═════════
print("\n\n" + "=" * 60)
print("⑧-1 도로 레이어")
print("=" * 60)
road_layers = [
    ("LT_L_AEROADLINK", "항공사진 도로링크"),
    ("LT_L_MOCT_ROAD", "국토부 도로"),
    ("LT_L_SPRD_MANAGE", "도로중심선 (차선수 포함)"),
    ("LT_L_SPRD_INTRVLRO", "도로구간"),
    ("LT_L_AERORPSE", "도로표지"),
    ("LT_L_SPBD_INTRVL", "도로폭원"),
]
for layer, desc in road_layers:
    print(f"\n─── {layer} ({desc}) — 강남 근처 BOX")
    resp = call(layer, geom=f"BOX({SAMPLES[0]['box']})")
    props = show("", resp)
    if props:
        print(f"     필드키: {list(props.keys())[:15]}")
        print(f"     샘플값: {dict(list(props.items())[:6])}")


# ═════════ ⑧-2 취락지구 / 용도지구 ═════════
print("\n\n" + "=" * 60)
print("⑧-2 용도지구 / 취락")
print("=" * 60)
zone_layers = [
    ("LT_C_UQ128", "용도지구/취락"),
    ("LT_C_UQA110", "용도지역"),
    ("LT_C_UQA430", "취락지구"),
    ("LT_C_LHBLK", "주거지구"),
    ("LT_C_UQ111", "용도지역 상세"),
    ("LT_C_DAMYOJ", "농업진흥/보호구역"),
    ("LT_C_UQ162", "개발제한구역"),
]
for layer, desc in zone_layers:
    print(f"\n─── {layer} ({desc}) — 영암읍 근처")
    resp = call(layer, geom=f"BOX({SAMPLES[1]['box']})")
    props = show("", resp)
    if props:
        print(f"     필드키: {list(props.keys())[:15]}")
        print(f"     샘플값: {dict(list(props.items())[:6])}")


# ═════════ ⑧-3 건물 경계 / 도로명주소 도로구간 ═════════
print("\n\n" + "=" * 60)
print("⑧-3 기타 — 건물 / 도로명주소")
print("=" * 60)
etc_layers = [
    ("LT_C_ADEMD_INFO", "법정동경계"),
    ("LT_P_MOCTBUD", "건물경계"),
    ("LT_C_SPBD_BULD", "건물 도형"),
]
for layer, desc in etc_layers:
    print(f"\n─── {layer} ({desc}) — 강남")
    resp = call(layer, geom=f"BOX({SAMPLES[0]['box']})")
    props = show("", resp)
    if props:
        print(f"     필드키: {list(props.keys())[:15]}")

print("\n" + "=" * 60)
print("완료")
print("=" * 60)
