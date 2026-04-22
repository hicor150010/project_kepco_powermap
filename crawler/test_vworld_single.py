"""
VWorld 단일 주소 호출 진단용.

같은 주소를 로컬 / GitHub Actions 에서 똑같이 호출해 결과 비교.
- 로컬 성공 + Actions 실패 → IP/환경 차단 확정
- 둘 다 동일 → 환경 차이 없음 (주소 자체 문제)

실행:
  VWORLD_KEY=... python test_vworld_single.py
"""
import json
import os
import sys
import urllib.parse

import requests

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

VWORLD_KEY = os.environ.get("VWORLD_KEY", "")
if not VWORLD_KEY:
    print("VWORLD_KEY 필수")
    sys.exit(1)

# 3가지 케이스 비교
TESTS = [
    ("정상 주소 #1", "제주특별자치도 제주시 노형동"),
    ("정상 주소 #2", "제주특별자치도 서귀포시 성산읍 시흥리"),
    ("깨진 주소", "전라남도 여수시 V남면 유송리"),
]


def call_vworld(address: str) -> dict:
    """VWorld 호출 후 진단 정보 반환."""
    params = {
        "service": "search",
        "request": "search",
        "version": "2.0",
        "crs": "EPSG:4326",
        "size": "5",
        "page": "1",
        "query": address,
        "type": "address",
        "category": "parcel",
        "format": "json",
        "errorformat": "json",
        "key": VWORLD_KEY,
    }
    try:
        r = requests.get(
            "https://api.vworld.kr/req/search",
            params=params,
            headers={"Referer": "https://sunlap.kr"},
            timeout=15,
        )
        return {
            "ok": True,
            "status_code": r.status_code,
            "body_preview": r.text[:500],
            "parsed": r.json() if r.ok else None,
        }
    except Exception as e:
        return {
            "ok": False,
            "error_type": type(e).__name__,
            "error_msg": str(e),
        }


print("=" * 70)
print(f"VWORLD_KEY set: yes ({VWORLD_KEY[:8]}...)")
print(f"실행 환경 확인: {sys.platform} {sys.version.split()[0]}")
print("=" * 70)

for label, addr in TESTS:
    print(f"\n[{label}] {addr}")
    print("-" * 70)
    result = call_vworld(addr)
    if result["ok"]:
        print(f"  HTTP {result['status_code']}")
        if result["parsed"]:
            resp = result["parsed"].get("response", {})
            status = resp.get("status")
            items = resp.get("result", {}).get("items", [])
            print(f"  VWorld status: {status}")
            print(f"  items count: {len(items)}")
            if items:
                first = items[0]
                print(f"  첫 item: pnu={first.get('id')} "
                      f"point=({first.get('point', {}).get('y')},{first.get('point', {}).get('x')})")
        else:
            print(f"  body (500자): {result['body_preview']}")
    else:
        print(f"  ERROR: {result['error_type']}")
        print(f"  MSG: {result['error_msg']}")

print("\n" + "=" * 70)
print("완료. 위 결과를 로컬/Actions 환경에서 비교하세요.")
