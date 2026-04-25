# -*- coding: utf-8 -*-
"""
⑦ 조례 4차 — 이격거리가 실제 숨어있는 키워드 조사
- "개발행위허가"
- "도시계획조례"
- "신재생에너지"
"""
import sys, io, json, time, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")


def search(keyword, display=50):
    for a in range(3):
        try:
            r = requests.get(
                "http://www.law.go.kr/DRF/lawSearch.do",
                params={"OC": "law", "target": "ordin", "type": "JSON", "query": keyword, "display": str(display), "page": "1"},
                timeout=20,
            )
            return r.json().get("OrdinSearch", {})
        except Exception as e:
            print(f"   {keyword} 재시도 {a+1}: {e}")
            time.sleep(2)
    return {}


for kw in ["개발행위허가", "도시계획", "신재생에너지", "이격거리"]:
    print(f"\n─── query='{kw}'")
    res = search(kw, display=5)
    total = res.get("totalCnt", 0)
    items = res.get("law", [])
    if isinstance(items, dict):
        items = [items]
    print(f"   전체={total}건, 샘플 상위 5건:")
    for it in items[:5]:
        print(f"   • {it.get('자치법규명')} | {it.get('지자체기관명')}")


# 영암군/여수시 조례만 전체 조회 (자치법규명에 지자체 들어가는 건 매우 제한적이므로)
# 실제로는 지자체 기준 조회 파라미터 필요
print("\n\n─── 영암군 전체 조례 (query=영암군)")
res = search("영암군", display=10)
items = res.get("law", [])
if isinstance(items, dict):
    items = [items]
print(f"   전체={res.get('totalCnt', 0)}건, 샘플:")
for it in items[:10]:
    name = it.get("자치법규명", "")
    # '개발행위' 또는 '도시계획' 포함된 것만 강조
    mark = "⭐" if any(k in name for k in ["개발행위", "도시계획", "태양광", "신재생"]) else "  "
    print(f"   {mark} {name}")

print("\n─── 여수시 전체 조례 (query=여수시)")
res = search("여수시", display=10)
items = res.get("law", [])
if isinstance(items, dict):
    items = [items]
print(f"   전체={res.get('totalCnt', 0)}건")
for it in items[:10]:
    name = it.get("자치법규명", "")
    mark = "⭐" if any(k in name for k in ["개발행위", "도시계획", "태양광", "신재생"]) else "  "
    print(f"   {mark} {name}")

# 영암군 도시계획조례 전문 읽기 시도
print("\n\n─── 영암군 '도시계획' 조례 찾아서 본문 확인")
res = search("영암군 도시계획", display=5)
items = res.get("law", [])
if isinstance(items, dict):
    items = [items]
print(f"   {res.get('totalCnt', 0)}건")
target_mst = None
for it in items:
    name = it.get("자치법규명", "")
    if "영암군" in name and "도시계획" in name:
        target_mst = it.get("자치법규일련번호")
        target_name = name
        break
if target_mst:
    print(f"   대상: {target_name} (MST={target_mst})")
    r = requests.get(
        "http://www.law.go.kr/DRF/lawService.do",
        params={"OC": "law", "target": "ordin", "MST": target_mst, "type": "JSON"},
        timeout=20,
    )
    try:
        data = r.json()
        text = json.dumps(data, ensure_ascii=False)
        print(f"   전문 길이: {len(text):,}자")
        # 이격거리 수치 추출 시도
        import re
        # 1) "도로 경계로부터 200미터" 같은 패턴
        m1 = re.findall(r"(도로|주택|주거|취락).{0,30}?(\d{1,4})\s*(미터|m)", text)
        print(f"   거리수치 패턴: {m1[:10]}")
        # 2) '이격' 포함 문장
        idx = text.find("이격")
        if idx >= 0:
            print(f"   '이격' 주변 문맥:\n   ...{text[max(0,idx-80):idx+150]}...")
        else:
            print("   '이격' 키워드 없음")

        # 3) '태양광' 언급 횟수
        sol_count = text.count("태양광")
        print(f"   '태양광' 언급 횟수: {sol_count}")

    except Exception as e:
        print(f"   🔴 {e}")
else:
    print("   영암군 도시계획 조례 검색 결과 없음")
