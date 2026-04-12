"""
KEPCO 좌표 변환 워커 (GitHub Actions용)
- kepco_addr에서 lat IS NULL인 주소 조회
- geocode_cache에서 캐시 조회
- 캐시 miss → 카카오/VWorld API로 좌표 변환
- 결과를 geocode_cache + kepco_addr에 업데이트
- Materialized View 새로고침
"""
import logging
import os
import sys
import time
import urllib.parse

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── 환경 변수 ──
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
KAKAO_REST_KEY = os.environ.get("KAKAO_REST_KEY", "")
VWORLD_KEY = os.environ.get("VWORLD_KEY", "")

# ── 상수 ──
BATCH_SIZE = 100       # 한 번에 처리할 주소 수
VWORLD_DELAY = 0.2     # VWorld API 호출 간 딜레이 (초)


def _headers(prefer: str = "") -> dict:
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


# ══════════════════════════════════════════════
# 1. 좌표 없는 주소 조회
# ══════════════════════════════════════════════

def get_null_coord_addresses() -> list[str]:
    """kepco_addr에서 lat IS NULL인 geocode_address 목록"""
    addresses = []
    offset = 0
    limit = 1000

    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/kepco_addr",
            params={
                "select": "geocode_address",
                "lat": "is.null",
                "order": "geocode_address",
                "limit": str(limit),
                "offset": str(offset),
            },
            headers=_headers(),
            timeout=30,
        )
        rows = resp.json()
        if not rows:
            break
        addresses.extend(r["geocode_address"] for r in rows)
        offset += limit

    logger.info(f"좌표 없는 주소: {len(addresses)}개")
    return addresses


# ══════════════════════════════════════════════
# 2. geocode_cache 조회
# ══════════════════════════════════════════════

def lookup_cache(addresses: list[str]) -> dict[str, tuple[float, float]]:
    """geocode_cache에서 좌표 조회. {address: (lat, lng)}"""
    cached = {}
    for i in range(0, len(addresses), 100):
        chunk = addresses[i : i + 100]
        # PostgREST IN 쿼리
        addr_list = ",".join(f'"{a}"' for a in chunk)
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/geocode_cache",
            params={
                "address": f"in.({addr_list})",
                "select": "address,lat,lng",
            },
            headers=_headers(),
            timeout=30,
        )
        for row in resp.json():
            cached[row["address"]] = (row["lat"], row["lng"])
    return cached


# ══════════════════════════════════════════════
# 3. VWorld API 호출
# ══════════════════════════════════════════════

def geocode_kakao(address: str) -> tuple[float, float] | None:
    """카카오 지오코딩 (메인) — REST API 키 인증, 해외 IP에서도 동작"""
    if not KAKAO_REST_KEY:
        return None
    try:
        resp = requests.get(
            "https://dapi.kakao.com/v2/local/search/address.json",
            params={"query": address},
            headers={"Authorization": f"KakaoAK {KAKAO_REST_KEY}"},
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning(f"Kakao HTTP {resp.status_code}: {address}")
            return None
        docs = resp.json().get("documents", [])
        if not docs:
            return None
        return (float(docs[0]["y"]), float(docs[0]["x"]))
    except Exception as e:
        logger.warning(f"Kakao 예외: {address}: {e}")
        return None


def geocode_vworld(address: str) -> tuple[float, float] | None:
    """VWorld 지오코딩 (fallback) — 한국 IP에서만 동작"""
    if not VWORLD_KEY:
        return None
    for addr_type in ("road", "parcel"):
        try:
            url = (
                "https://api.vworld.kr/req/address"
                f"?service=address&request=getCoord"
                f"&version=2.0&crs=EPSG:4326&format=json"
                f"&type={addr_type}"
                f"&address={urllib.parse.quote(address)}"
                f"&key={VWORLD_KEY}"
            )
            resp = requests.get(url, timeout=15)
            if resp.status_code != 200:
                continue
            data = resp.json()
            if data.get("response", {}).get("status") != "OK":
                continue
            point = data["response"]["result"]["point"]
            return (float(point["y"]), float(point["x"]))
        except Exception:
            continue
    return None


def geocode(address: str) -> tuple[float, float] | None:
    """카카오 메인 → VWorld fallback → 리 제거 fallback"""
    result = geocode_kakao(address)
    if result:
        return result
    result = geocode_vworld(address)
    if result:
        logger.info(f"VWorld fallback 성공: {address}")
        return result

    # "동+리" 조합이 카카오/VWorld에 없는 경우 — 리 제거 후 재시도
    parts = address.split()
    if len(parts) >= 3:
        fallback_addr = " ".join(parts[:-1])
        result = geocode_kakao(fallback_addr)
        if not result:
            result = geocode_vworld(fallback_addr)
        if result:
            logger.info(f"리 제거 fallback 성공: {address} → {fallback_addr}")
    return result


# ══════════════════════════════════════════════
# 4. DB 업데이트
# ══════════════════════════════════════════════

def upsert_cache(address: str, lat: float, lng: float):
    """geocode_cache에 좌표 저장"""
    requests.post(
        f"{SUPABASE_URL}/rest/v1/geocode_cache",
        json={"address": address, "lat": lat, "lng": lng, "source": "vworld"},
        headers=_headers("resolution=merge-duplicates,return=minimal"),
        timeout=15,
    )


def update_kepco_coords(geocode_address: str, lat: float, lng: float):
    """kepco_addr에서 해당 geocode_address의 좌표 업데이트"""
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/kepco_addr",
        params={"geocode_address": f"eq.{geocode_address}", "lat": "is.null"},
        json={"lat": lat, "lng": lng},
        headers=_headers("return=minimal"),
        timeout=15,
    )


def refresh_mv():
    """Materialized View 새로고침"""
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/refresh_kepco_summary",
        json={},
        headers=_headers(),
        timeout=120,
    )
    if resp.status_code == 200:
        logger.info("Materialized View 새로고침 완료")
    else:
        logger.warning(f"MV 새로고침 실패: {resp.status_code}")


# ══════════════════════════════════════════════
# 메인
# ══════════════════════════════════════════════

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("SUPABASE_URL, SUPABASE_SERVICE_KEY 환경 변수가 필요합니다.")
        sys.exit(1)
    if not VWORLD_KEY:
        logger.error("VWORLD_KEY 환경 변수가 필요합니다.")
        sys.exit(1)

    # 1. 좌표 없는 주소 가져오기
    addresses = get_null_coord_addresses()
    if not addresses:
        logger.info("좌표 변환이 필요한 주소가 없습니다.")
        return

    # 2. 캐시 조회
    cached = lookup_cache(addresses)
    cache_hits = 0
    api_calls = 0
    api_success = 0

    # 3. 배치 처리
    for i, address in enumerate(addresses):
        if address in cached:
            # 캐시 히트 → kepco_data만 업데이트
            lat, lng = cached[address]
            update_kepco_coords(address, lat, lng)
            cache_hits += 1
        else:
            # 캐시 miss → 카카오(메인) → VWorld(fallback)
            api_calls += 1
            result = geocode(address)
            if result:
                lat, lng = result
                upsert_cache(address, lat, lng)
                update_kepco_coords(address, lat, lng)
                api_success += 1
            time.sleep(VWORLD_DELAY)

        # 진행률 로그
        if (i + 1) % 50 == 0:
            logger.info(f"진행: {i + 1}/{len(addresses)} "
                        f"(캐시: {cache_hits}, API: {api_success}/{api_calls})")

    logger.info(f"=== 완료: 총 {len(addresses)}건, "
                f"캐시 히트 {cache_hits}, API 성공 {api_success}/{api_calls} ===")

    # 4. MV 새로고침
    refresh_mv()


if __name__ == "__main__":
    main()
