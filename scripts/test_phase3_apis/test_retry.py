# -*- coding: utf-8 -*-
"""
Phase 3 — 실패 API 재시도 (원인별 보정)

④ VWorld 공시지가: attrFilter 문법 다양하게 + 대체 API
⑥ 태양광 허가: HTTPS/User-Agent/다른 param 재시도
⑦ 법제처 조례: 다른 OC + 다른 URL 패턴
"""
import sys
import io
import json
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

VWORLD_KEY = "ABF4A6BE-8E7E-3106-8BFA-1885DF3B54DB"
BLDG_KEY_DEC = "CWsYAfYYh5I6XFXULGd0/aP6i25mvT6QyAhNyEBPd0GYr6JYMemZBGORK0MwJ1Nx9IUIFd/zR2WpBenPqk+3zg=="
BLDG_KEY_ENC = "CWsYAfYYh5I6XFXULGd0%2FaP6i25mvT6QyAhNyEBPd0GYr6JYMemZBGORK0MwJ1Nx9IUIFd%2FzR2WpBenPqk%2B3zg%3D%3D"

SAMPLE_BJD = "1168010500"  # 서울 강남구 삼성동
SAMPLE_BJD2 = "4613025022"  # 전남 여수시 돌산읍 신복리


def pp(label, data):
    print(f"  [{label}]")
    if isinstance(data, dict):
        print("    " + json.dumps(data, ensure_ascii=False)[:500])
    else:
        print("    " + str(data)[:500])


# ═════════ ④ VWorld 공시지가 ─ 다양한 접근 ═════════
print("\n" + "=" * 60)
print("④ VWorld 공시지가 재시도")
print("=" * 60)

# 시도 1: attrFilter 대소문자 보정 (LIKE → like)
r = requests.get(
    "https://api.vworld.kr/req/data",
    params={
        "service": "data",
        "request": "GetFeature",
        "data": "LP_PA_CBND_BUBUN",
        "key": VWORLD_KEY,
        "format": "json",
        "size": "3",
        "attrFilter": f"pnu:like:{SAMPLE_BJD}%",
    },
    timeout=10,
)
pp(f"1. LIKE lowercase (status={r.status_code})", r.text[:500])

# 시도 2: geomFilter (bbox) 로 접근 — bjd_master lat/lng 사용
# 강남 삼성동 중심 좌표 기반 bbox
r = requests.get(
    "https://api.vworld.kr/req/data",
    params={
        "service": "data",
        "request": "GetFeature",
        "data": "LP_PA_CBND_BUBUN",
        "key": VWORLD_KEY,
        "format": "json",
        "size": "3",
        "geomFilter": "BOX(127.055,37.510,127.060,37.515)",  # 삼성동 일부
    },
    timeout=10,
)
pp(f"2. geomFilter BOX (status={r.status_code})", r.text[:500])

# 시도 3: geometry=true 추가
r = requests.get(
    "https://api.vworld.kr/req/data",
    params={
        "service": "data",
        "request": "GetFeature",
        "data": "LP_PA_CBND_BUBUN",
        "key": VWORLD_KEY,
        "format": "json",
        "size": "3",
        "geometry": "false",
        "attrFilter": f"pnu:like:{SAMPLE_BJD}%",
    },
    timeout=10,
)
pp(f"3. geometry=false (status={r.status_code})", r.text[:500])

# 시도 4: domain 헤더 추가 (VWorld 검증)
r = requests.get(
    "https://api.vworld.kr/req/data",
    params={
        "service": "data",
        "request": "GetFeature",
        "data": "LP_PA_CBND_BUBUN",
        "key": VWORLD_KEY,
        "format": "json",
        "size": "3",
        "domain": "localhost",
        "attrFilter": f"pnu:like:{SAMPLE_BJD}%",
    },
    timeout=10,
)
pp(f"4. domain=localhost (status={r.status_code})", r.text[:600])

# 시도 5: 다른 레이어 — LP_PA_CBND (부번 없는 통합)
r = requests.get(
    "https://api.vworld.kr/req/data",
    params={
        "service": "data",
        "request": "GetFeature",
        "data": "LP_PA_CBND",
        "key": VWORLD_KEY,
        "format": "json",
        "size": "3",
        "domain": "localhost",
        "attrFilter": f"pnu:like:{SAMPLE_BJD}%",
    },
    timeout=10,
)
pp(f"5. LP_PA_CBND layer (status={r.status_code})", r.text[:500])

# ═════════ ⑥ 태양광 허가 재시도 ═════════
print("\n" + "=" * 60)
print("⑥ 태양광 허가 재시도")
print("=" * 60)

# 시도 1: HTTPS
try:
    r = requests.get(
        "https://api.data.go.kr/openapi/tn_pubr_public_solar_gen_flct_api",
        params={
            "serviceKey": BLDG_KEY_DEC,
            "pageNo": "1",
            "numOfRows": "5",
            "type": "json",
            "sido_nm": "전라남도",
        },
        timeout=15,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    pp(f"1. HTTPS (status={r.status_code})", r.text[:600])
except Exception as e:
    pp("1. HTTPS exception", str(e))

# 시도 2: ENCODED 키
try:
    url = f"http://api.data.go.kr/openapi/tn_pubr_public_solar_gen_flct_api?serviceKey={BLDG_KEY_ENC}&pageNo=1&numOfRows=5&type=json"
    r = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
    pp(f"2. ENCODED key url (status={r.status_code})", r.text[:600])
except Exception as e:
    pp("2. ENCODED exception", str(e))

# 시도 3: 엔드포인트 이름 변형 — getInfo 서픽스
try:
    r = requests.get(
        "https://api.data.go.kr/1613000/tn_pubr_public_solar_gen_flct_api/getSolar",
        params={"serviceKey": BLDG_KEY_DEC, "pageNo": "1", "numOfRows": "3", "type": "json"},
        timeout=15,
    )
    pp(f"3. 1613000 prefix (status={r.status_code})", r.text[:400])
except Exception as e:
    pp("3. 1613000 exception", str(e))

# 시도 4: 파라미터 없이
try:
    r = requests.get(
        "http://api.data.go.kr/openapi/tn_pubr_public_solar_gen_flct_api",
        params={"serviceKey": BLDG_KEY_DEC, "pageNo": "1", "numOfRows": "3", "type": "json"},
        timeout=15,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    pp(f"4. no filter (status={r.status_code})", r.text[:600])
except Exception as e:
    pp("4. no filter exception", str(e))

# ═════════ ⑦ 법제처 조례 재시도 ═════════
print("\n" + "=" * 60)
print("⑦ 법제처 조례 재시도")
print("=" * 60)

# open.law.go.kr 는 OC (구독자 ID) 별도 발급 필요. 등록 없이 시도해서 에러 포맷 확인
# 시도 1: 다른 OC 값
for oc in ["test", "admin", "hicor0803", "law"]:
    try:
        r = requests.get(
            "http://www.law.go.kr/DRF/lawSearch.do",
            params={"OC": oc, "target": "ordin", "type": "JSON", "query": "태양광", "display": "3"},
            timeout=10,
        )
        pp(f"OC={oc} (status={r.status_code})", r.text[:300])
    except Exception as e:
        pp(f"OC={oc} exception", str(e))

# 시도 2: 아예 자치법규 일반 API (조문 검색)
try:
    r = requests.get(
        "http://www.law.go.kr/DRF/lawSearch.do",
        params={"OC": "guest", "target": "law", "type": "JSON", "query": "태양광 이격거리", "display": "3"},
        timeout=10,
    )
    pp(f"target=law, guest (status={r.status_code})", r.text[:400])
except Exception as e:
    pp("target=law exception", str(e))

print("\n" + "=" * 60)
print("재시도 완료")
print("=" * 60)
