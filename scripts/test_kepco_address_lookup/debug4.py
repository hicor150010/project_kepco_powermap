"""
최종 검증: 5필드 룰이 정확한지 — 실제 KEPCO DB 에 있는 번지로 재호출.

각 케이스마다:
  Step 1: gbn=4 로 번지 목록 조회 → 실제 존재 번지 1개 추출
  Step 2: 그 번지로 search_capacity 호출 → 1건+ 응답하면 5필드 룰 정확

광역시는 si='-기타지역', gu='구명' 패턴 사용.
정규시는 si='시명', gu='구명' (또는 빈값) 패턴 사용.
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


def probe(label, do, si, gu, lidong, li):
    """gbn=4 로 번지 1개 추출 → search_capacity 호출."""
    print(f"\n[{label}]")
    print(f"  5필드: do='{do}' si='{si}' gu='{gu}' lidong='{lidong}' li='{li}'")

    try:
        ji = client.get_addr_list(
            gbn=4, addr_do=do, addr_si=si, addr_gu=gu,
            addr_lidong=lidong, addr_li=li,
        )
    except Exception as e:
        print(f"  ❌ gbn=4 예외: {e}")
        return
    print(f"  번지 목록 {len(ji)} 건 (앞 5개): {ji[:5]}")

    if not ji:
        print(f"  ⚠️ 번지 목록 0건 — 5필드 매칭 실패 (이 경로는 KEPCO DB 없음)")
        return

    test_jibun = ji[0]
    print(f"  test_jibun: '{test_jibun}'")

    res = client.search_capacity(
        addr_do=do, addr_si=si, addr_gu=gu,
        addr_lidong=lidong, addr_li=li, addr_jibun=test_jibun,
    )
    print(f"  결과 {len(res)} 건")
    for r in res[:2]:
        print(f"    SUBST={r.get('SUBST_NM','')} DL={r.get('DL_NM','')} "
              f"DL_CAPA={r.get('DL_CAPA','')} DL_PWR={r.get('DL_PWR','')}")


# ── A1 양평 갈운리 (이미 검증됨, 비교용) ─────────────────────
section("A1 (검증됨) 경기도 양평군 청운면 갈운리")
probe("A1", "경기도", "-기타지역", "양평군", "청운면", "갈운리")

# ── A2 광역시: 서울 강남구 역삼동 ───────────────────────────
section("A2 서울특별시 강남구 역삼동 — 광역시 패턴")
probe("A2", "서울특별시", "-기타지역", "강남구", "역삼동", "")

# ── A3 광역시-군: 부산 기장군 일광읍 청광리 ────────────────
section("A3 부산광역시 기장군 일광읍 청광리 — 광역시-군 패턴")
probe("A3", "부산광역시", "-기타지역", "기장군", "일광읍", "청광리")

# ── A4 정규시: 충북 청주시 흥덕구 가경동 ───────────────────
section("A4 충북 청주시 흥덕구 가경동 — 정규시 패턴")
probe("A4", "충청북도", "청주시", "흥덕구", "가경동", "")

# ── A6 제주 ─────────────────────────────────────────────
section("A6 제주특별자치도 제주시 노형동")
probe("A6", "제주특별자치도", "제주시", "", "노형동", "")

# ── A7 강원 ─────────────────────────────────────────────
section("A7 강원특별자치도 춘천시 효자동")
probe("A7", "강원특별자치도", "춘천시", "", "효자동", "")

# ── B1 산 번지 검증 ──────────────────────────────────────
section("B1 갈운리 '산' 번지 — KEPCO 형식 ('산 1' vs '산1')")
ji = client.get_addr_list(
    gbn=4, addr_do="경기도", addr_si="-기타지역", addr_gu="양평군",
    addr_lidong="청운면", addr_li="갈운리",
)
산 = [j for j in ji if j.startswith("산") or "산" in j[:2]][:10]
print(f"  '산' 시작 번지 (앞 10개): {산}")
