# -*- coding: utf-8 -*-
"""
Phase 3 — 2차 재시도 + ⑧ 도로/취락지구 조사

⑦ 법제처 조례: OC=law 로 샘플 3개 전수 테스트 + 조문 전문 읽기
⑧ 도로:
  - VWorld WFS 도로 레이어 (권한 이슈 동일한지 확인용)
  - 국토부 도로 SHP 다운로드 (공공데이터포털) — 파일 크기만 확인
⑧ 취락지구:
  - VWorld WFS LT_C_UQ128 (토지이용규제 레이어)
"""
import sys
import io
import json
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# ═════════ ⑦ 법제처 조례 전수 테스트 ═════════
print("=" * 60)
print("⑦ 법제처 자치법규 — OC=law 로 3개 샘플 전수 테스트")
print("=" * 60)

SAMPLES = [
    {"sido": "서울특별시", "sigungu": "강남구"},
    {"sido": "전라남도", "sigungu": "영암군"},
    {"sido": "전라남도", "sigungu": "여수시"},
]


def fetch_ordinances(sigungu, sido):
    params = {
        "OC": "law",
        "target": "ordin",
        "type": "JSON",
        "query": f"{sigungu} 태양광",
        "display": "10",
    }
    r = requests.get("http://www.law.go.kr/DRF/lawSearch.do", params=params, timeout=15)
    try:
        data = r.json()
    except Exception:
        return {"ok": False, "raw": r.text[:400]}
    result = data.get("OrdinSearch", {})
    total = result.get("totalCnt", "0")
    items = result.get("law", [])
    if isinstance(items, dict):
        items = [items]
    return {
        "ok": True,
        "total": total,
        "count": len(items),
        "items": items,
    }


all_ord_results = []
for s in SAMPLES:
    print(f"\n─── {s['sido']} {s['sigungu']}")
    res = fetch_ordinances(s["sigungu"], s["sido"])
    if res["ok"]:
        print(f"   🟢 total={res['total']}, 반환={res['count']}건")
        # 해당 시군구명을 포함하는 조례만 필터
        matched = [
            it for it in res["items"]
            if it.get("자치법규명") and s["sigungu"] in it.get("자치법규명", "")
        ]
        other = [it for it in res["items"] if it not in matched]
        print(f"   ─ '{s['sigungu']}' 명시 조례: {len(matched)}건")
        for it in matched[:5]:
            print(f"     • {it.get('자치법규명')} (기관={it.get('지자체기관명')})")
        print(f"   ─ 기타 (주변/타지역): {len(other)}건")
        for it in other[:3]:
            print(f"     • {it.get('자치법규명')} (기관={it.get('지자체기관명')})")
    else:
        print(f"   🔴 fail: {res.get('raw')}")
    all_ord_results.append({"addr": s, "res": res})


# 조문 전문 읽기 테스트 (매칭된 첫 조례)
print("\n─── 조문 전문 읽기 테스트 (lawService.do)")
first_matched_mst = None
for item in all_ord_results:
    if item["res"].get("ok"):
        for it in item["res"]["items"]:
            if "태양광" in it.get("자치법규명", ""):
                first_matched_mst = it.get("자치법규일련번호")
                first_matched_name = it.get("자치법규명")
                break
        if first_matched_mst:
            break

if first_matched_mst:
    print(f"   대상: {first_matched_name} (일련번호={first_matched_mst})")
    r = requests.get(
        "http://www.law.go.kr/DRF/lawService.do",
        params={"OC": "law", "target": "ordin", "MST": first_matched_mst, "type": "JSON"},
        timeout=15,
    )
    try:
        data = r.json()
        # 구조: {"자치법규": {...조문...}}
        keys = list(data.keys())
        print(f"   🟢 응답 최상위 키: {keys}")
        full_text = json.dumps(data, ensure_ascii=False)
        # "이격" 또는 숫자+m 같은 키워드 포함 여부
        has_gap = "이격" in full_text
        has_m = "미터" in full_text or "m " in full_text.lower()
        print(f"   ─ 전문 길이: {len(full_text):,}자")
        print(f"   ─ '이격' 포함: {has_gap}, '미터'/'m' 포함: {has_m}")
        # 첫 500자 미리보기
        print(f"   ─ 미리보기: {full_text[:500]}")
    except Exception as e:
        print(f"   🔴 파싱 실패: {e}, raw={r.text[:300]}")
else:
    print("   ⚠️ 매칭 조례 없음 — 전문 읽기 스킵")


# ═════════ ⑧ 도로 / 취락지구 ═════════
print("\n\n" + "=" * 60)
print("⑧ 도로 / 취락지구 API 조사")
print("=" * 60)

VWORLD_KEY = "ABF4A6BE-8E7E-3106-8BFA-1885DF3B54DB"

# 1) VWorld WFS 도로 레이어 (권한 이슈 재확인)
print("\n─── ⑧-1 VWorld WFS 도로 (LT_L_AEROADLINK)")
r = requests.get(
    "https://api.vworld.kr/req/data",
    params={
        "service": "data",
        "request": "GetFeature",
        "data": "LT_L_AEROADLINK",
        "key": VWORLD_KEY,
        "format": "json",
        "size": "3",
        "geomFilter": "BOX(127.055,37.510,127.060,37.515)",
        "domain": "localhost",
    },
    timeout=10,
)
print(f"  status={r.status_code}")
print(f"  body: {r.text[:400]}")

# 2) VWorld WFS 취락지구 (LT_C_UQ128 토지이용규제)
print("\n─── ⑧-2 VWorld WFS 토지이용규제 (LT_C_UQ128)")
r = requests.get(
    "https://api.vworld.kr/req/data",
    params={
        "service": "data",
        "request": "GetFeature",
        "data": "LT_C_UQ128",
        "key": VWORLD_KEY,
        "format": "json",
        "size": "3",
        "geomFilter": "BOX(127.055,37.510,127.060,37.515)",
        "domain": "localhost",
    },
    timeout=10,
)
print(f"  status={r.status_code}")
print(f"  body: {r.text[:400]}")

# 3) 공공데이터포털 — 도로명주소 기반 도로 목록 API
# 국토교통부 도로명주소 도로정보 조회: https://business.juso.go.kr
print("\n─── ⑧-3 도로명주소 도로 REST API (juso.go.kr)")
# API key 없이는 안 됨. 별도 신청 필요 확인
r = requests.get(
    "https://business.juso.go.kr/addrlink/addrLinkApi.do",
    params={
        "confmKey": "U01TX0FVVEgyMDI0MDQxNjE1MDAwMDExNDU5MDk=",  # 가상키
        "currentPage": "1", "countPerPage": "3",
        "keyword": "여수시 돌산읍 신복리",
        "resultType": "json",
    },
    timeout=10,
)
print(f"  status={r.status_code}")
print(f"  body: {r.text[:400]}")

# 4) 국토교통부 도로현황 (SHP) 메타 — data.go.kr/data/15125057
#    실제 파일 다운로드 대신 파일정보만 조회
print("\n─── ⑧-4 국토부 도로현황 (SHP) — 공공데이터포털 메타")
print("    SHP 파일 기반 (REST API 아님). 실제 다운로드는 수동으로.")
print("    URL: https://www.data.go.kr/data/15125057/fileData.do")
print("    형태: 월간 ZIP 전국 도로 Shape (~수백MB 추정)")

# 5) 도로중심선 shp 는 https://www.data.go.kr/data/15146878 — 차선수 포함 가능
print("\n─── ⑧-5 도로중심선 (차선수 포함) 확인")
print("    URL: https://www.data.go.kr/data/15146878/fileData.do")
print("    SHP + 차선수(LANES) 필드 포함 — 실제 API 없음")

# 6) VWorld geocoder API 는 현재 작동하니 "WFS 는 별도 권한" 이라는 점 확정 위해
#    검색 API 한번 호출해서 키 자체는 유효함을 증명
print("\n─── 참고: VWorld 검색 API (현재 유효함 확인)")
r = requests.get(
    "https://api.vworld.kr/req/address",
    params={
        "service": "address",
        "request": "getCoord",
        "address": "서울특별시 강남구 삼성동",
        "type": "PARCEL",
        "key": VWORLD_KEY,
        "format": "json",
    },
    timeout=10,
)
print(f"  status={r.status_code}")
print(f"  body: {r.text[:400]}")

print("\n" + "=" * 60)
print("2차 테스트 완료")
print("=" * 60)
