"""
경기도의 군 단위 처리 방식 확인.
KEPCO 의 시 목록에 양평군이 없음 → 추측: addr_si='-기타지역' 아래 addr_gu 로 들어감.
"""
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "crawler"))

from api_client import KepcoApiClient  # noqa: E402

import json

client = KepcoApiClient(delay=0.8)

print("=" * 70)
print("Probe 1: 경기도 -기타지역 → 구/군 목록 (gbn=1)")
print("=" * 70)
gus = client.get_addr_list(gbn=1, addr_do="경기도", addr_si="-기타지역")
print(f"  총 {len(gus)} 개")
for g in gus:
    print(f"  - '{g}'")
양평_in_gu = [g for g in gus if "양평" in g]
print(f"\n  '양평' 매칭: {양평_in_gu}")

if 양평_in_gu:
    addr_gu = 양평_in_gu[0]
    print("\n" + "=" * 70)
    print(f"Probe 2: 경기도 -기타지역 {addr_gu} → 동/면 목록 (gbn=2)")
    print("=" * 70)
    lidongs = client.get_addr_list(
        gbn=2, addr_do="경기도", addr_si="-기타지역", addr_gu=addr_gu,
    )
    print(f"  총 {len(lidongs)} 개")
    for d in lidongs:
        print(f"  - '{d}'")
    청운 = [d for d in lidongs if "청운" in d]
    print(f"\n  '청운' 매칭: {청운}")

    if 청운:
        addr_lidong = 청운[0]
        print("\n" + "=" * 70)
        print(f"Probe 3: 리 목록 (gbn=3) — addr_si='-기타지역', addr_gu='{addr_gu}', addr_lidong='{addr_lidong}'")
        print("=" * 70)
        lis = client.get_addr_list(
            gbn=3, addr_do="경기도", addr_si="-기타지역",
            addr_gu=addr_gu, addr_lidong=addr_lidong,
        )
        print(f"  총 {len(lis)} 개")
        for li in lis:
            print(f"  - '{li}'")
        갈운 = [li for li in lis if "갈운" in li]
        print(f"\n  '갈운' 매칭: {갈운}")

        if 갈운:
            addr_li = 갈운[0]
            print("\n" + "=" * 70)
            print(f"Probe 4: 번지 목록 (gbn=4) — '{addr_li}'")
            print("=" * 70)
            jibuns = client.get_addr_list(
                gbn=4, addr_do="경기도", addr_si="-기타지역",
                addr_gu=addr_gu, addr_lidong=addr_lidong, addr_li=addr_li,
            )
            print(f"  총 {len(jibuns)} 건")
            hits24 = [j for j in jibuns if j.startswith("24")][:30]
            print(f"  '24'로 시작 (앞 30개): {hits24}")
            test_jibun = next((j for j in jibuns if j.startswith("24-")), None) \
                or next((j for j in jibuns if j.startswith("24")), None) \
                or "24-1"

            print("\n" + "=" * 70)
            print(f"Probe 5: search_capacity")
            print("=" * 70)
            print(f"  do='경기도' si='-기타지역' gu='{addr_gu}' "
                  f"lidong='{addr_lidong}' li='{addr_li}' jibun='{test_jibun}'")
            results = client.search_capacity(
                addr_do="경기도",
                addr_si="-기타지역",
                addr_gu=addr_gu,
                addr_lidong=addr_lidong,
                addr_li=addr_li,
                addr_jibun=test_jibun,
            )
            print(f"\n  결과 {len(results)} 건:")
            for r in results:
                print(f"    {json.dumps(r, ensure_ascii=False)}")
