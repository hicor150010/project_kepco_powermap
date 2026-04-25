"""
실패 원인 정확히 분리:

A. 5필드 매칭은 정확하지만 지번이 KEPCO DB 에 없는 케이스 (정상 0건)
   → 5필드 + jibun='' 또는 jibun=마을대표번지 호출 → 마을 결과 나오면 5필드는 OK

B. KEPCO 시도 표기가 한글주소와 다른 케이스 (정규화 부족)
   → 광역시 시 목록 probe + 정규 시 (청주시) 시 목록 위치 확인
"""
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "crawler"))

from api_client import KepcoApiClient  # noqa: E402

client = KepcoApiClient(delay=0.8)


def section(title):
    print(f"\n{'=' * 70}\n{title}\n{'=' * 70}")


# ── A. 마을 단위 호출 (5필드 검증) ───────────────────────────
section("A1. 충북 청주시 흥덕구 가경동 → 마을 시설 목록 (jibun='')")
res = client.search_capacity(
    addr_do="충청북도", addr_si="청주시", addr_gu="흥덕구",
    addr_lidong="가경동", addr_li="", addr_jibun="",
)
print(f"  결과 {len(res)} 건 (앞 3개)")
for r in res[:3]:
    print(f"    SUBST={r.get('SUBST_NM','')} DL={r.get('DL_NM','')}")

section("A2. 가경동 번지 목록 (gbn=4) — 1502 가 실제 있는지")
ji = client.get_addr_list(
    gbn=4, addr_do="충청북도", addr_si="청주시",
    addr_gu="흥덕구", addr_lidong="가경동", addr_li="",
)
print(f"  총 {len(ji)} 건")
hits = [j for j in ji if "1502" in j or "150" in j[:3]][:20]
print(f"  '150' 시작 (앞 20개): {hits}")

section("A3. 제주시 노형동 → 마을 시설 목록")
res = client.search_capacity(
    addr_do="제주특별자치도", addr_si="제주시", addr_gu="",
    addr_lidong="노형동", addr_li="", addr_jibun="",
)
print(f"  결과 {len(res)} 건 (앞 3개)")
for r in res[:3]:
    print(f"    SUBST={r.get('SUBST_NM','')} DL={r.get('DL_NM','')}")

section("A4. 강원 춘천시 효자동 → 마을 시설 목록")
res = client.search_capacity(
    addr_do="강원특별자치도", addr_si="춘천시", addr_gu="",
    addr_lidong="효자동", addr_li="", addr_jibun="",
)
print(f"  결과 {len(res)} 건 (앞 3개)")
for r in res[:3]:
    print(f"    SUBST={r.get('SUBST_NM','')} DL={r.get('DL_NM','')}")

# ── B. 광역시 패턴 확인 ───────────────────────────────────
section("B1. 서울특별시 → 시 목록 (gbn=0)")
sis = client.get_addr_list(gbn=0, addr_do="서울특별시")
print(f"  총 {len(sis)} 개")
for s in sis[:30]:
    print(f"    - '{s}'")
강남 = [s for s in sis if "강남" in s]
print(f"  '강남' 매칭: {강남}")

section("B2. 부산광역시 → 시 목록 (gbn=0)")
sis = client.get_addr_list(gbn=0, addr_do="부산광역시")
print(f"  총 {len(sis)} 개")
for s in sis[:30]:
    print(f"    - '{s}'")
기장 = [s for s in sis if "기장" in s]
print(f"  '기장' 매칭: {기장}")

# ── C. 강원/제주 시 목록 ──────────────────────────────────
section("C1. 강원특별자치도 → 시 목록 (gbn=0)")
sis = client.get_addr_list(gbn=0, addr_do="강원특별자치도")
print(f"  총 {len(sis)} 개: {sis[:25]}")
춘천 = [s for s in sis if "춘천" in s]
print(f"  '춘천' 매칭: {춘천}")

section("C2. 제주특별자치도 → 시 목록 (gbn=0)")
sis = client.get_addr_list(gbn=0, addr_do="제주특별자치도")
print(f"  총 {len(sis)} 개: {sis}")

section("C3. 충청북도 → 시 목록 (gbn=0)")
sis = client.get_addr_list(gbn=0, addr_do="충청북도")
print(f"  총 {len(sis)} 개: {sis}")
청주 = [s for s in sis if "청주" in s]
print(f"  '청주' 매칭: {청주}")
