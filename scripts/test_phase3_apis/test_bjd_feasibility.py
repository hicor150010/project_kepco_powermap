# -*- coding: utf-8 -*-
"""
Phase 3 데이터 연계 가능성 — bjd_code 기준 실측 테스트

대상:
  ④ 공시지가 (VWorld 토지특성 getLandCharacteristics)
  ⑤ 건축물대장 (getBrRecapTitleInfo — bjd 단위 목록조회)
  ⑥ 태양광 허가 (tn_pubr_public_solar_gen_flct_api)
  ⑦ 법제처 자치법규 조례 API

샘플 bjd_code (3개):
  1168010500 — 서울 강남구 삼성동 (컨트롤, 건축물대장 검증됨)
  4683025031 — 전남 신안군 (농촌 리 단위)
  4613025022 — 전남 (농촌 리 단위)
"""
import sys
import io
import json
import urllib.parse
import requests

# Windows cp949 콘솔에서 UTF-8 출력
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# ═══════ 키 ═══════
VWORLD_KEY = "ABF4A6BE-8E7E-3106-8BFA-1885DF3B54DB"
BLDG_KEY_ENC = "CWsYAfYYh5I6XFXULGd0%2FaP6i25mvT6QyAhNyEBPd0GYr6JYMemZBGORK0MwJ1Nx9IUIFd%2FzR2WpBenPqk%2B3zg%3D%3D"
BLDG_KEY_DEC = "CWsYAfYYh5I6XFXULGd0/aP6i25mvT6QyAhNyEBPd0GYr6JYMemZBGORK0MwJ1Nx9IUIFd/zR2WpBenPqk+3zg=="

# 샘플
SAMPLES = [
    {"bjd": "1168010500", "label": "서울 강남구 삼성동 (컨트롤)"},
    {"bjd": "4683025031", "label": "전남 신안군 지도읍 (농촌)"},
    {"bjd": "4613025022", "label": "전남 농촌 리"},
]


def split_bjd(bjd10):
    """10자리 bjd_code → sigunguCd(5) + bjdongCd(5)"""
    return bjd10[:5], bjd10[5:]


def log(title, ok, detail=""):
    icon = "🟢" if ok else "🔴"
    print(f"   {icon} {title}: {detail}")


# ═══════════════════════════════════════════════
# ④ 공시지가 — VWorld 토지특성 (getLandCharacteristics)
# ═══════════════════════════════════════════════
def test_landprice(bjd):
    """VWorld 토지특성 API - 개별공시지가 포함"""
    # pnu 19자리 = bjd(10) + 필지구분(1) + 본번(4) + 부번(4)
    # bjd 만으로는 안 되고 필지별이어야 함. 먼저 검색 API 로 공시지가 필드 확인
    # 토지특성조회 API: https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN
    # 실제 공시지가는 LP_PA_CBND_BUBUN 레이어에 "JIGA" 필드
    # bjd 단위 조회: attrFilter 사용
    url = "https://api.vworld.kr/req/data"
    params = {
        "service": "data",
        "request": "GetFeature",
        "data": "LP_PA_CBND_BUBUN",
        "key": VWORLD_KEY,
        "format": "json",
        "size": "3",
        "attrFilter": f"pnu:LIKE:{bjd}%",
    }
    try:
        r = requests.get(url, params=params, timeout=10)
        if r.status_code != 200:
            return {"ok": False, "status": r.status_code, "body": r.text[:200]}
        data = r.json()
        resp = data.get("response", {})
        if resp.get("status") != "OK":
            return {"ok": False, "vworld_status": resp.get("status"), "detail": resp.get("record", {})}
        features = resp.get("result", {}).get("featureCollection", {}).get("features", [])
        if not features:
            return {"ok": False, "reason": "no features", "total": resp.get("record", {}).get("total", 0)}
        # 첫 필지 정보
        props = features[0].get("properties", {})
        return {
            "ok": True,
            "count": len(features),
            "total": resp.get("record", {}).get("total"),
            "sample_fields": list(props.keys()),
            "sample_jiga": props.get("jiga"),
            "sample_pnu": props.get("pnu"),
            "sample_jimok": props.get("jimok"),
            "sample_area": props.get("area"),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ═══════════════════════════════════════════════
# ⑤ 건축물대장 — getBrRecapTitleInfo (bjd 단위 목록)
# ═══════════════════════════════════════════════
def test_bldg_register(bjd):
    """건축물대장 총괄표제부 - bjd 단위 목록 조회 (본번/부번 없이)"""
    sigunguCd, bjdongCd = split_bjd(bjd)
    url = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo"
    params = {
        "serviceKey": BLDG_KEY_DEC,
        "sigunguCd": sigunguCd,
        "bjdongCd": bjdongCd,
        "numOfRows": "5",
        "pageNo": "1",
        "_type": "json",
    }
    try:
        r = requests.get(url, params=params, timeout=15)
        if r.status_code != 200:
            return {"ok": False, "status": r.status_code, "body": r.text[:300]}
        # 간혹 XML 반환되니 감지
        if r.text.strip().startswith("<"):
            return {"ok": False, "reason": "XML returned", "body": r.text[:300]}
        data = r.json()
        body = data.get("response", {}).get("body", {})
        total = body.get("totalCount", 0)
        items = body.get("items", {}).get("item", [])
        if isinstance(items, dict):
            items = [items]
        if not items:
            return {"ok": False, "total": total, "reason": "no items"}
        first = items[0]
        return {
            "ok": True,
            "total": total,
            "returned": len(items),
            "sample_plc": first.get("platPlc") or first.get("newPlatPlc"),
            "sample_mainPurps": first.get("mainPurpsCdNm"),
            "sample_archArea": first.get("archArea"),
            "field_keys": list(first.keys())[:15],
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ═══════════════════════════════════════════════
# ⑥ 태양광 허가 API — tn_pubr_public_solar_gen_flct_api
# ═══════════════════════════════════════════════
def test_solar_permit(bjd, sep1, sep3):
    """태양광 허가 API — bjd 파라미터 지원 여부 + sido/sigungu 필터 실측"""
    # 공공데이터포털 15107742
    # endpoint: http://api.data.go.kr/openapi/tn_pubr_public_solar_gen_flct_api
    url = "http://api.data.go.kr/openapi/tn_pubr_public_solar_gen_flct_api"
    # 일반적으로 sido_nm, sigungu_nm 필터 지원
    params = {
        "serviceKey": BLDG_KEY_DEC,
        "pageNo": "1",
        "numOfRows": "5",
        "type": "json",
    }
    # sido 시도 절반값 (전라남도 → 전남으로 줄일지 판단)
    if sep1:
        params["sido_nm"] = sep1
    if sep3:
        params["sigungu_nm"] = sep3
    try:
        r = requests.get(url, params=params, timeout=15)
        if r.status_code != 200:
            return {"ok": False, "status": r.status_code, "body": r.text[:300]}
        if r.text.strip().startswith("<"):
            return {"ok": False, "reason": "XML/HTML returned", "body": r.text[:300]}
        data = r.json()
        # 공공데이터포털 표준 응답 여러 포맷 가능
        resp = data.get("response", data)
        body = resp.get("body", resp)
        items = body.get("items", [])
        if isinstance(items, dict):
            items = items.get("item", [])
        if isinstance(items, dict):
            items = [items]
        total = body.get("totalCount", len(items) if isinstance(items, list) else 0)
        if not items:
            return {"ok": False, "total": total, "reason": "no items", "raw": str(data)[:300]}
        first = items[0] if isinstance(items, list) else items
        return {
            "ok": True,
            "total": total,
            "returned": len(items) if isinstance(items, list) else 1,
            "field_keys": list(first.keys()) if isinstance(first, dict) else [],
            "sample": first if isinstance(first, dict) else str(first)[:200],
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ═══════════════════════════════════════════════
# ⑦ 법제처 자치법규 조례 API
# ═══════════════════════════════════════════════
def test_ordinance(sep1, sep3):
    """법제처 자치법규 조회 — 지자체명으로 '태양광' 관련 조례 검색"""
    # data.go.kr/data/15058294
    # 자치법규 목록: http://www.law.go.kr/DRF/lawSearch.do?OC=[ID]&target=ordin&type=XML&query=...
    # OC 는 본인 이메일 앞부분 사용 (별도 인증키 없음 — 이 점 자체가 테스트 포인트)
    # 공식 자치법규 API: https://open.law.go.kr/LSO/openApi/
    #   OC = 구독자 ID (공공데이터포털 가입 이메일 앞부분)
    oc = "hicor150010"
    url = "http://www.law.go.kr/DRF/lawSearch.do"
    # 지자체 + 태양광 키워드
    query = f"{sep3 or sep1} 태양광"
    params = {
        "OC": oc,
        "target": "ordin",
        "type": "JSON",
        "query": query,
        "display": "5",
    }
    try:
        r = requests.get(url, params=params, timeout=15)
        if r.status_code != 200:
            return {"ok": False, "status": r.status_code, "body": r.text[:300]}
        # JSON 인지 확인
        body_text = r.text.strip()
        if body_text.startswith("<") and "html" in body_text[:100].lower():
            return {"ok": False, "reason": "HTML returned (auth?)", "body": body_text[:400]}
        try:
            data = r.json()
        except Exception:
            return {"ok": False, "reason": "not JSON", "body": body_text[:300]}
        # 응답 구조: OrdinSearch
        result = data.get("OrdinSearch", data)
        total = result.get("totalCnt", 0)
        items = result.get("ordin", [])
        if isinstance(items, dict):
            items = [items]
        if not items:
            return {"ok": False, "total": total, "reason": "no ordinances", "raw": str(data)[:300]}
        first = items[0]
        return {
            "ok": True,
            "total": int(total) if str(total).isdigit() else total,
            "returned": len(items),
            "field_keys": list(first.keys()) if isinstance(first, dict) else [],
            "sample_name": first.get("자치법규명"),
            "sample_gov": first.get("지자체기관명"),
            "sample_date": first.get("공포일자"),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ═══════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════
def main():
    # 샘플에 sep_1, sep_3 채우기 (DB 조회)
    print("=" * 60)
    print("Phase 3 API 데이터 연계 실측 테스트")
    print("=" * 60)

    # DB 에서 각 샘플의 sep_* 가져오기
    SUPA_URL = "https://wtbwgjejfrrwgbzgcdjd.supabase.co/rest/v1/bjd_master"
    SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0YndnamVqZnJyd2diemdjZGpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNTU5MCwiZXhwIjoyMDkxMjAxNTkwfQ.MBFwuKwfL6BJd1UCV8Gcr6S7gL6nmIpPshDZS6NsjK0"
    h = {"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}"}
    for s in SAMPLES:
        r = requests.get(
            SUPA_URL,
            headers=h,
            params={"select": "sep_1,sep_2,sep_3,sep_4,sep_5", "bjd_code": f"eq.{s['bjd']}"},
        )
        rows = r.json()
        if rows:
            s.update(rows[0])

    all_results = []

    for s in SAMPLES:
        bjd = s["bjd"]
        label = s["label"]
        sep1 = s.get("sep_1", "")
        sep3 = s.get("sep_3") or s.get("sep_2") or ""
        sep4 = s.get("sep_4", "")
        sep5 = s.get("sep_5") or ""
        full_addr = f"{sep1} {sep3} {sep4} {sep5}".strip()
        print(f"\n━━━ bjd={bjd} | {label}")
        print(f"    주소: {full_addr}")

        result = {"bjd": bjd, "label": label, "addr": full_addr}

        # ④ 공시지가
        print(" [④ 공시지가 VWorld LP_PA_CBND_BUBUN]")
        r4 = test_landprice(bjd)
        result["4_landprice"] = r4
        if r4.get("ok"):
            log("success", True, f"필지 {r4.get('total')}개, 샘플 공시지가={r4.get('sample_jiga')}, 필드={r4.get('sample_fields')}")
        else:
            log("fail", False, json.dumps(r4, ensure_ascii=False)[:200])

        # ⑤ 건축물대장
        print(" [⑤ 건축물대장 getBrRecapTitleInfo]")
        r5 = test_bldg_register(bjd)
        result["5_bldg"] = r5
        if r5.get("ok"):
            log("success", True, f"{r5.get('total')}동, 샘플용도={r5.get('sample_mainPurps')}, 면적={r5.get('sample_archArea')}")
        else:
            log("fail", False, json.dumps(r5, ensure_ascii=False)[:200])

        # ⑥ 태양광 허가
        print(" [⑥ 태양광 허가 tn_pubr_public_solar_gen_flct_api]")
        r6 = test_solar_permit(bjd, sep1, sep3)
        result["6_solar"] = r6
        if r6.get("ok"):
            log("success", True, f"{r6.get('total')}건, 필드={r6.get('field_keys')[:10]}")
            print(f"      샘플: {json.dumps(r6.get('sample'), ensure_ascii=False)[:250]}")
        else:
            log("fail", False, json.dumps(r6, ensure_ascii=False)[:400])

        # ⑦ 조례
        print(" [⑦ 법제처 자치법규 조례]")
        r7 = test_ordinance(sep1, sep3)
        result["7_ordinance"] = r7
        if r7.get("ok"):
            log("success", True, f"{r7.get('total')}건, 샘플='{r7.get('sample_name')}' ({r7.get('sample_gov')})")
        else:
            log("fail", False, json.dumps(r7, ensure_ascii=False)[:300])

        all_results.append(result)

    # 결과 저장
    out = "scripts/test_phase3_apis/result.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\n\n✅ 결과 저장: {out}")


if __name__ == "__main__":
    main()
