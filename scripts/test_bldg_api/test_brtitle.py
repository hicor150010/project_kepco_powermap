"""
건축HUB 건축물대장 표제부(getBrTitleInfo) 테스트

대상: 전라남도 구례군 구례읍 봉남리 6-2
- 시군구코드(sigunguCd): 46730 (전남 구례군)
- 법정동코드(bjdongCd): 25021 (구례읍 봉남리)  ※ 추후 검증 필요
- platGbCd: 0 (대지)
- bun: 0006
- ji: 0002
"""
import urllib.request
import urllib.parse
import json
import sys

# 한국어 출력 깨짐 방지
sys.stdout.reconfigure(encoding="utf-8")

SERVICE_KEY_DECODED = "CWsYAfYYh5I6XFXULGd0/aP6i25mvT6QyAhNyEBPd0GYr6JYMemZBGORK0MwJ1Nx9IUIFd/zR2WpBenPqk+3zg=="
END_POINT = "https://apis.data.go.kr/1613000/BldRgstHubService"


def call(operation: str, params: dict) -> dict:
    """API 호출 (JSON)"""
    qs = urllib.parse.urlencode(
        {
            "serviceKey": SERVICE_KEY_DECODED,
            "_type": "json",
            "numOfRows": 10,
            "pageNo": 1,
            **params,
        },
        quote_via=urllib.parse.quote,
    )
    url = f"{END_POINT}/{operation}?{qs}"
    print(f"\n[REQUEST] {operation}")
    print(f"  params: {params}")
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
    except Exception as e:
        print(f"  [ERROR] {e}")
        return {}

    # XML 응답일 가능성 체크
    if raw.lstrip().startswith("<"):
        print("  [응답이 XML 입니다 — 앞 600자 출력]")
        print(raw[:600])
        return {}

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        print("  [JSON 파싱 실패 — 앞 600자]")
        print(raw[:600])
        return {}


def show(operation: str, params: dict):
    data = call(operation, params)
    if not data:
        return
    # 표준 응답 구조 탐색
    try:
        body = data["response"]["body"]
        items = body.get("items")
        total = body.get("totalCount", "?")
        print(f"  [RESPONSE] totalCount={total}")
        if isinstance(items, dict):
            item_list = items.get("item", [])
            if isinstance(item_list, dict):
                item_list = [item_list]
            for i, it in enumerate(item_list, 1):
                print(f"\n  --- Item {i} ---")
                for k, v in it.items():
                    if v not in (None, "", " "):
                        print(f"    {k}: {v}")
        elif items in ("", None):
            print("  [items 비어있음]")
        else:
            print(f"  [items raw] {items}")
    except KeyError:
        print(f"  [예상치 못한 응답] {json.dumps(data, ensure_ascii=False)[:500]}")


# ============================================================
# 테스트 1: 봉남리 6-2 (전남 구례군 구례읍)
# ============================================================
print("=" * 60)
print("테스트 1: 봉남리 6-2 표제부")
print("=" * 60)
show("getBrTitleInfo", {
    "sigunguCd": "46730",   # 전남 구례군
    "bjdongCd":  "25021",   # 봉남리 (추정)
    "platGbCd":  "0",
    "bun":       "0006",
    "ji":        "0002",
})

# ============================================================
# 테스트 2: 같은 주소 총괄표제부 (연면적 확인)
# ============================================================
print("\n" + "=" * 60)
print("테스트 2: 봉남리 6-2 총괄표제부")
print("=" * 60)
show("getBrRecapTitleInfo", {
    "sigunguCd": "46730",
    "bjdongCd":  "25021",
    "platGbCd":  "0",
    "bun":       "0006",
    "ji":        "0002",
})

# ============================================================
# 테스트 3: 폴백 - 안전한 주소 (서울 청와대, 종로구 세종로 1-1)
# ============================================================
print("\n" + "=" * 60)
print("테스트 3 (폴백): 서울 종로구 세종로 1-1 표제부")
print("=" * 60)
show("getBrTitleInfo", {
    "sigunguCd": "11110",
    "bjdongCd":  "11200",   # 세종로
    "platGbCd":  "0",
    "bun":       "0001",
    "ji":        "0001",
})