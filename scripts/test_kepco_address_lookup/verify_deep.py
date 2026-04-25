"""
심층 검증 4 그룹

A. 동분할 룰 확정
   - 전주 효자동1가 직접 호출 → 동분할 후보가 정답인지 확인
   - 광주 동구 / 대전 서구 / 부산 해운대구 / 서울 강남구 등의 동 목록 전체 출력
   - 사용자 입력 동명에 대해 1동/2동/3동/1가/2가/3가/'동' 자체 5종 후보 자동 시도

B. 17개 시도 시 목록 매트릭스
   - 광역시/특별자치시/특별자치도/일반도 패턴 정리

C. 응답 안정성 (멱등성)
   - 같은 입력 3회 반복 호출 → 결과 동일?
   - 응답시간 분포

D. 동표기 변종 광범위
   - 다양한 도시의 동 분할 패턴 분포 (1동/N가/단순동)
"""
import json
import sys
import time
from collections import Counter
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "crawler"))

from api_client import KepcoApiClient  # noqa: E402

client = KepcoApiClient(delay=0.5)
client._on_log = lambda msg: None


def section(title):
    print(f"\n{'=' * 75}\n{title}\n{'=' * 75}")


# ════════════════════════════════════════════════════════
# A. 동분할 룰 확정
# ════════════════════════════════════════════════════════

section("A1. 전주 완산구 효자동1가 직접 search_capacity (동분할 후보 검증)")
# 먼저 효자동1가의 번지 1개 확보 → search_capacity
ji = client.get_addr_list(
    gbn=4, addr_do="전북특별자치도", addr_si="전주시",
    addr_gu="완산구", addr_lidong="효자동1가", addr_li="",
)
print(f"  효자동1가 번지 {len(ji)} 건, 첫 5: {ji[:5]}")
if ji:
    res = client.search_capacity(
        addr_do="전북특별자치도", addr_si="전주시", addr_gu="완산구",
        addr_lidong="효자동1가", addr_li="", addr_jibun=ji[0],
    )
    print(f"  search_capacity('{ji[0]}') → {len(res)} 건")
    if res:
        r = res[0]
        print(f"    SUBST={r.get('SUBST_NM','')} DL={r.get('DL_NM','')}")

section("A2. 대전 서구 동 목록 25개 전체 — 둔산이 정말 없는지")
dongs = client.get_addr_list(
    gbn=2, addr_do="대전광역시", addr_si="-기타지역", addr_gu="서구",
)
print(f"  총 {len(dongs)} 개:")
for d in dongs:
    print(f"    - '{d}'")
둔산 = [d for d in dongs if "둔산" in d]
print(f"  '둔산' 매칭: {둔산}")

section("A3. 서울 강남구 동 목록 전체 — 역삼동이 분할되어 있는지")
dongs = client.get_addr_list(
    gbn=2, addr_do="서울특별시", addr_si="-기타지역", addr_gu="강남구",
)
print(f"  총 {len(dongs)} 개:")
for d in dongs:
    print(f"    - '{d}'")
역삼 = [d for d in dongs if "역삼" in d]
print(f"  '역삼' 매칭: {역삼}")

section("A4. 부산 해운대구 동 목록 — 우동이 분할되어 있는지")
dongs = client.get_addr_list(
    gbn=2, addr_do="부산광역시", addr_si="-기타지역", addr_gu="해운대구",
)
print(f"  총 {len(dongs)} 개")
우 = [d for d in dongs if d.startswith("우") or "우동" in d]
print(f"  '우' 시작: {우}")

section("A5. 동분할 자동 후보 5종 일괄 시도 (효자동 케이스로 입증)")
candidates = ["효자동", "효자동1가", "효자동2가", "효자동3가",
              "효자1동", "효자2동", "효자3동", "효자4동"]
hits = []
for cand in candidates:
    try:
        ji = client.get_addr_list(
            gbn=4, addr_do="전북특별자치도", addr_si="전주시",
            addr_gu="완산구", addr_lidong=cand, addr_li="",
        )
    except Exception:
        ji = []
    n = len(ji)
    mark = "✅" if n > 0 else "❌"
    print(f"  {mark} '{cand}' → 번지 {n}건")
    if n > 0:
        hits.append(cand)
print(f"\n  실제 매칭: {hits}")

# ════════════════════════════════════════════════════════
# B. 17개 시도 매트릭스
# ════════════════════════════════════════════════════════

section("B. 17개 시도 시 목록 매트릭스")
sidos = client.get_sido_list()
sido_pattern = {}
for sido in sidos:
    try:
        sis = client.get_addr_list(gbn=0, addr_do=sido)
    except Exception as e:
        sido_pattern[sido] = f"예외: {e}"
        continue
    has_other = "-기타지역" in sis
    cnt = len(sis)
    others = [s for s in sis if s != "-기타지역"][:3]
    sido_pattern[sido] = {
        "총수": cnt,
        "기타지역포함": has_other,
        "샘플": others,
    }
    print(f"  {sido:<15} | {cnt:>3}개 | -기타지역={has_other} | {others}")

# 패턴 분류
print("\n  ── 패턴 분류 ──")
광역시_only_other = [s for s, v in sido_pattern.items()
                   if isinstance(v, dict) and v["총수"] == 1]
광역시_with_시 = [s for s, v in sido_pattern.items()
                if isinstance(v, dict) and v["총수"] > 1 and "광역시" in s]
print(f"  -기타지역 단일: {광역시_only_other}")
print(f"  광역시+시 혼재: {광역시_with_시}")

# ════════════════════════════════════════════════════════
# C. 응답 안정성 (멱등성)
# ════════════════════════════════════════════════════════

section("C. 같은 입력 3회 반복 — 응답 동일성 + 응답시간")
trials = []
for i in range(3):
    t0 = time.time()
    res = client.search_capacity(
        addr_do="경기도", addr_si="-기타지역", addr_gu="양평군",
        addr_lidong="청운면", addr_li="갈운리", addr_jibun="24-1",
    )
    elapsed = (time.time() - t0) * 1000
    sig = json.dumps(res, sort_keys=True, ensure_ascii=False)[:100]
    trials.append({"n": len(res), "elapsed_ms": round(elapsed, 0), "sig_prefix": sig})
    print(f"  #{i+1}: {len(res)}건, {elapsed:.0f}ms, sig={sig[:60]}...")
all_same = len({t["sig_prefix"] for t in trials}) == 1
print(f"\n  → 응답 동일: {all_same}")
print(f"  → 응답시간: min={min(t['elapsed_ms'] for t in trials):.0f}ms, "
      f"max={max(t['elapsed_ms'] for t in trials):.0f}ms")

# ════════════════════════════════════════════════════════
# D. 동표기 변종 분포
# ════════════════════════════════════════════════════════

section("D. KEPCO 동 표기 변종 분포 (서울/부산/광주의 모든 구 동명 통계)")

def collect_dongs(do, si, gus):
    counter = Counter()
    samples = {"단순동": [], "N가": [], "N동": [], "기타": []}
    for gu in gus:
        try:
            dongs = client.get_addr_list(
                gbn=2, addr_do=do, addr_si=si, addr_gu=gu,
            )
        except Exception:
            continue
        for d in dongs:
            # 분류
            if d.endswith("가") and any(c.isdigit() for c in d):
                cat = "N가"
            elif "동" in d and any(c.isdigit() for c in d.replace("동", "")):
                cat = "N동"
            elif d.endswith("동"):
                cat = "단순동"
            else:
                cat = "기타"
            counter[cat] += 1
            if len(samples[cat]) < 5:
                samples[cat].append(d)
    return counter, samples

# 서울 5개 구만 샘플링
서울_구 = client.get_addr_list(gbn=1, addr_do="서울특별시", addr_si="-기타지역")
sample_gus = 서울_구[:5]
print(f"  서울특별시 샘플 구 {sample_gus}")
cnt, smp = collect_dongs("서울특별시", "-기타지역", sample_gus)
print(f"  분포: {dict(cnt)}")
for cat, items in smp.items():
    print(f"    {cat} 샘플: {items}")
