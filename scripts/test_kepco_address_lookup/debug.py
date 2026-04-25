"""
KEPCO API 가 실제로 인식하는 양평군/청운면/갈운리 표기를 단계별로 확인.

api_client.py gbn 정의:
  gbn=0 → 시도+addr_do → 시/군 목록
  gbn=1 → +addr_si → 구 목록
  gbn=2 → +addr_gu → 동/면 목록
  gbn=3 → +addr_lidong → 리 목록
  gbn=4 → +addr_li → 번지 목록
"""
import json
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "crawler"))

from api_client import KepcoApiClient  # noqa: E402


def main():
    client = KepcoApiClient(delay=0.8)

    print("=" * 70)
    print("Step 1: 시/도 목록")
    print("=" * 70)
    sidos = client.get_sido_list()
    for s in sidos:
        print(f"  - '{s}'")

    print("\n" + "=" * 70)
    print("Step 2: 경기도 → 시/군 목록 (gbn=0, addr_do='경기도')")
    print("=" * 70)
    sis = client.get_addr_list(gbn=0, addr_do="경기도")
    print(f"  총 {len(sis)} 개")
    for s in sis:
        print(f"  - '{s}'")
    양평 = [s for s in sis if "양평" in s]
    print(f"\n  '양평' 매칭: {양평}")

    if not 양평:
        print("\n양평 매칭 실패 — 종료")
        return
    addr_si = 양평[0]

    print("\n" + "=" * 70)
    print(f"Step 3: 경기도 {addr_si} → 구 목록 (gbn=1)")
    print("=" * 70)
    gus = client.get_addr_list(gbn=1, addr_do="경기도", addr_si=addr_si)
    print(f"  총 {len(gus)} 개")
    for g in gus:
        print(f"  - '{g}'")
    addr_gu = gus[0] if gus else ""
    if addr_gu:
        print(f"  → 사용할 addr_gu: '{addr_gu}'")

    print("\n" + "=" * 70)
    print(f"Step 4: 경기도 {addr_si} ['{addr_gu}'] → 동/면 목록 (gbn=2)")
    print("=" * 70)
    lidongs = client.get_addr_list(
        gbn=2, addr_do="경기도", addr_si=addr_si, addr_gu=addr_gu,
    )
    print(f"  총 {len(lidongs)} 개")
    for d in lidongs:
        print(f"  - '{d}'")
    청운 = [d for d in lidongs if "청운" in d]
    print(f"\n  '청운' 매칭: {청운}")

    if not 청운:
        print("\n청운 매칭 실패 — 종료")
        return
    addr_lidong = 청운[0]

    print("\n" + "=" * 70)
    print(f"Step 5: 경기도 {addr_si} {addr_lidong} → 리 목록 (gbn=3)")
    print("=" * 70)
    lis = client.get_addr_list(
        gbn=3, addr_do="경기도", addr_si=addr_si,
        addr_gu=addr_gu, addr_lidong=addr_lidong,
    )
    print(f"  총 {len(lis)} 개")
    for li in lis:
        print(f"  - '{li}'")
    갈운 = [li for li in lis if "갈운" in li]
    print(f"\n  '갈운' 매칭: {갈운}")

    if not 갈운:
        print("\n갈운 매칭 실패 — 종료")
        return
    addr_li = 갈운[0]

    print("\n" + "=" * 70)
    print(f"Step 6: 경기도 {addr_si} {addr_lidong} {addr_li} → 번지 목록 (gbn=4)")
    print("=" * 70)
    jibuns = client.get_addr_list(
        gbn=4, addr_do="경기도", addr_si=addr_si,
        addr_gu=addr_gu, addr_lidong=addr_lidong, addr_li=addr_li,
    )
    print(f"  총 {len(jibuns)} 건")
    hits24 = [j for j in jibuns if j.startswith("24")][:30]
    print(f"  '24'로 시작 (앞 30개): {hits24}")
    test_jibun = next((j for j in jibuns if j.startswith("24-")), None) or (jibuns[0] if jibuns else "24-1")

    print("\n" + "=" * 70)
    print(f"Step 7: search_capacity (KEPCO 정규화 표기 사용)")
    print("=" * 70)
    print(f"  do='경기도' si='{addr_si}' gu='{addr_gu}' "
          f"lidong='{addr_lidong}' li='{addr_li}' jibun='{test_jibun}'")
    results = client.search_capacity(
        addr_do="경기도",
        addr_si=addr_si,
        addr_gu=addr_gu,
        addr_lidong=addr_lidong,
        addr_li=addr_li,
        addr_jibun=test_jibun,
    )
    print(f"\n  결과 {len(results)} 건:")
    for r in results:
        print(f"    {json.dumps(r, ensure_ascii=False)}")


if __name__ == "__main__":
    main()
