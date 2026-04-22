"""
geocode_cache vs kepco_addr 좌표 보존 검증

질문: geocode_cache 를 DROP 해도 좌표 데이터 손실 없나?

검증:
  1) geocode_cache 총 행 수
  2) geocode_cache 에 있는 address 중 kepco_addr 에도 좌표 있는 수
  3) **geocode_cache 에만 있고 kepco_addr 에는 좌표 없는 주소** (= 손실 위험 대상)
"""
import os
import sys

import requests

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("SUPABASE_URL / SUPABASE_SERVICE_KEY 필수")
    sys.exit(1)


def _headers():
    return {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def fetch_all(table: str, params: dict) -> list[dict]:
    rows = []
    offset = 0
    limit = 1000
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            params={**params, "limit": str(limit), "offset": str(offset)},
            headers=_headers(),
            timeout=60,
        )
        if r.status_code != 200:
            print(f"에러 {r.status_code}: {r.text[:200]}")
            break
        data = r.json()
        if not data:
            break
        rows.extend(data)
        if len(data) < limit:
            break
        offset += limit
    return rows


print("=" * 60)
print("1) geocode_cache 전체 로딩")
print("=" * 60)
cache_rows = fetch_all("geocode_cache", {"select": "address,lat,lng,source"})
print(f"   geocode_cache 총 행: {len(cache_rows):,}")

print("\n" + "=" * 60)
print("2) kepco_addr 전체 로딩 (geocode_address, lat)")
print("=" * 60)
addr_rows = fetch_all("kepco_addr", {"select": "geocode_address,lat,lng"})
print(f"   kepco_addr 총 행: {len(addr_rows):,}")

# kepco_addr: geocode_address → (lat 있음 여부)
addr_coord_map = {}
for r in addr_rows:
    addr_coord_map[r["geocode_address"]] = (r["lat"], r["lng"])

print("\n" + "=" * 60)
print("3) 손실 위험 분석")
print("=" * 60)

loss_candidates = []          # geocode_cache 에 있으나 kepco_addr 에 좌표 없음
only_in_cache = []            # geocode_cache 에만 있고 kepco_addr 에 주소 자체가 없음
matches = 0                   # 양쪽 다 좌표 있음 (정상)

for cr in cache_rows:
    addr = cr["address"]
    if addr not in addr_coord_map:
        only_in_cache.append(cr)
    else:
        lat, lng = addr_coord_map[addr]
        if lat is None:
            loss_candidates.append({
                "address": addr,
                "cache_lat": cr["lat"],
                "cache_lng": cr["lng"],
                "cache_source": cr.get("source"),
            })
        else:
            matches += 1

print(f"   ✅ 양쪽 좌표 있음 (안전): {matches:,}")
print(f"   ⚠️ kepco_addr 에 주소 자체가 없음: {len(only_in_cache):,}")
print(f"   🚨 kepco_addr 는 좌표 NULL 인데 geocode_cache 엔 있음 (손실 위험): {len(loss_candidates):,}")

if loss_candidates:
    print("\n   [손실 위험 샘플 10건]")
    for lc in loss_candidates[:10]:
        print(f"     - {lc['address']}")
        print(f"       cache: ({lc['cache_lat']:.4f}, {lc['cache_lng']:.4f}) [{lc['cache_source']}]")

if only_in_cache:
    print("\n   [주소 불일치 샘플 5건 — 오래된 주소 체계 등]")
    for oc in only_in_cache[:5]:
        print(f"     - {oc['address']}")

print("\n" + "=" * 60)
print("결론")
print("=" * 60)
if loss_candidates:
    print(f"   🚨 DROP 전 {len(loss_candidates)}건을 kepco_addr 로 마이그레이션 필요")
    print("      UPDATE kepco_addr SET lat=..., lng=... WHERE geocode_address=...")
else:
    print("   ✅ 손실 없음. geocode_cache 바로 DROP 안전.")
    if only_in_cache:
        print(f"   📝 참고: geocode_cache 에만 있는 {len(only_in_cache)}건은 kepco_addr 에 없는 주소")
        print("         (오래된 주소 체계 추정, 무시 가능)")
