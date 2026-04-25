# -*- coding: utf-8 -*-
"""
Phase 3 — ⑦ 조례 API 3차: query=태양광 단일 키워드 + 클라이언트 필터링
"""
import sys
import io
import json
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

print("=" * 60)
print("⑦ 법제처 조례 3차 — query=태양광 단일 키워드")
print("=" * 60)


def fetch_all_ordinance(keyword="태양광"):
    """전국 태양광 조례 전수조사"""
    import time
    all_items = []
    page = 1
    total = 0
    while True:
        for attempt in range(3):
            try:
                r = requests.get(
                    "http://www.law.go.kr/DRF/lawSearch.do",
                    params={
                        "OC": "law",
                        "target": "ordin",
                        "type": "JSON",
                        "query": keyword,
                        "display": "50",
                        "page": str(page),
                    },
                    timeout=20,
                )
                break
            except Exception as e:
                print(f"   page={page} attempt={attempt+1} 실패: {e}, 1초 후 재시도")
                time.sleep(1)
        else:
            print(f"   page={page} 3회 모두 실패")
            return total, all_items
        try:
            data = r.json()
        except Exception:
            print(f"   page={page} JSON 파싱 실패: {r.text[:200]}")
            break
        result = data.get("OrdinSearch", {})
        total = int(result.get("totalCnt", "0"))
        items = result.get("law", [])
        if isinstance(items, dict):
            items = [items]
        if not items:
            break
        all_items.extend(items)
        print(f"   page={page}: {len(items)}건 누적 / 전체 {total}")
        if len(all_items) >= total:
            break
        page += 1
        if page > 10:  # safety
            break
    return total, all_items


total, items = fetch_all_ordinance("태양광")
print(f"\n🟢 전국 '태양광' 조례 총 {total}건 수집 ({len(items)}건 실제)")

# 샘플 지자체별 매칭 확인
for target in ["강남구", "영암군", "여수시", "해남군", "신안군", "고창군"]:
    matched = [it for it in items if target in (it.get("자치법규명", "") + it.get("지자체기관명", ""))]
    print(f"\n─── {target} 매칭: {len(matched)}건")
    for it in matched[:5]:
        print(f"   • {it.get('자치법규명')} | {it.get('지자체기관명')} | 공포={it.get('공포일자')}")

# 조문 전문 (MST) 수동 샘플
print("\n─── 조문 전문 테스트 — '태양광' 포함 첫 조례")
if items:
    first = items[0]
    mst = first.get("자치법규일련번호")
    name = first.get("자치법규명")
    gov = first.get("지자체기관명")
    print(f"   대상: {name} ({gov}) 일련번호={mst}")
    r = requests.get(
        "http://www.law.go.kr/DRF/lawService.do",
        params={"OC": "law", "target": "ordin", "MST": mst, "type": "JSON"},
        timeout=15,
    )
    try:
        data = r.json()
        full_text = json.dumps(data, ensure_ascii=False)
        print(f"   🟢 전문 길이: {len(full_text):,}자")

        # 주요 키워드 포함 여부
        keywords = ["이격", "200m", "200미터", "이백미터", "500m", "500미터", "오백미터", "도로", "주택"]
        hits = [kw for kw in keywords if kw in full_text]
        print(f"   키워드 포함: {hits}")

        # 조문 추출 시도 (법제처 응답 구조: 자치법규/조문/조/항)
        # 여러 스키마 가능성 있음 — 키 탐색
        top_keys = list(data.keys())
        print(f"   최상위 키: {top_keys}")
        for k, v in data.items():
            if isinstance(v, dict):
                print(f"   {k} 하위 키: {list(v.keys())[:10]}")
                break

        # 미리보기 700자
        print(f"   미리보기(700자): {full_text[:700]}")

    except Exception as e:
        print(f"   🔴 {e}, raw={r.text[:300]}")


# 전국 시도/시군구별 집계 요약
print("\n" + "=" * 60)
print("전국 태양광 조례 지자체별 집계 (top 20)")
print("=" * 60)
from collections import Counter
gov_counter = Counter()
for it in items:
    gov = it.get("지자체기관명", "").strip()
    if gov:
        gov_counter[gov] += 1
for gov, cnt in gov_counter.most_common(20):
    print(f"   {gov}: {cnt}건")

print(f"\n전체 고유 지자체: {len(gov_counter)}개")

# 결과 저장
with open("scripts/test_phase3_apis/ordinance_result.json", "w", encoding="utf-8") as f:
    json.dump({"total": total, "count": len(items), "items": items}, f, ensure_ascii=False, indent=2)
print(f"\n✅ 저장: scripts/test_phase3_apis/ordinance_result.json")
