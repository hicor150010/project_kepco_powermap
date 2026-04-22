"""
kepco_addr 좌표 + bjd_code 채우기 (VWorld 지오코딩)

대상:
  kepco_addr WHERE lat IS NULL (현재 ~15,864 행)

동작:
  각 행의 geocode_address 를 VWorld 검색 API 로 조회 →
  응답의 PNU 19자리에서:
    - 앞 10자리 = bjd_code (법정동코드)
    - point.x/y = 경도/위도
  → UPDATE kepco_addr SET lat, lng, bjd_code WHERE id = ?

Fallback:
  1차 실패 시 "동만" 주소로 재시도 (geocode_fallback_rule.md)
  2차도 실패면 로그 기록하고 skip (lat NULL 유지)

출력 파일 (모두 같은 timestamp 공유):
  fill_coords_run_<ts>.log       — 전체 진행 로그 (파일 핸들러)
  fill_coords_errors_<ts>.jsonl  — 실패 주소 1건당 1줄 (JSONL append, 크래시 안전)
  fill_coords_summary_<ts>.json  — 통계 + 완료 상태 요약

중단 대응:
  SIGTERM/SIGINT 수신 시 현재 반복 마무리 → summary 기록 후 graceful exit
  재실행 시 `WHERE lat IS NULL` 필터로 남은 행만 자동 재개

실행:
  # 전체 실행
  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... VWORLD_KEY=... python fill_kepco_coords.py

  # 테스트 모드 (처음 N개만)
  FILL_LIMIT=10 python fill_kepco_coords.py

  # 딜레이 조정 (기본 0.3초)
  VWORLD_DELAY=0.5 python fill_kepco_coords.py
"""
import json
import logging
import os
import random
import signal
import sys
import time
from datetime import datetime, timezone

import requests

# Windows cp949 회피
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ─────────────────────────────────────────────
# 환경
# ─────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
VWORLD_KEY = os.environ.get("VWORLD_KEY", "")

VWORLD_SEARCH_URL = "https://api.vworld.kr/req/search"
VWORLD_DELAY = float(os.environ.get("VWORLD_DELAY", "0.3"))
FILL_LIMIT = int(os.environ.get("FILL_LIMIT", "0"))  # 0 = 전체

TIMEOUT = 15

# ─────────────────────────────────────────────
# 출력 파일 경로 (실행 시작 시 확정)
# ─────────────────────────────────────────────
RUN_TS = datetime.now().strftime("%Y%m%d_%H%M%S")
LOG_PATH = f"fill_coords_run_{RUN_TS}.log"
ERR_PATH = f"fill_coords_errors_{RUN_TS}.jsonl"
SUM_PATH = f"fill_coords_summary_{RUN_TS}.json"

# ─────────────────────────────────────────────
# 로깅 (stdout + 파일 동시)
# ─────────────────────────────────────────────
logger = logging.getLogger("fill_coords")
logger.setLevel(logging.INFO)
_fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%H:%M:%S")

_ch = logging.StreamHandler(sys.stdout)
_ch.setFormatter(_fmt)
logger.addHandler(_ch)

_fh = logging.FileHandler(LOG_PATH, encoding="utf-8")
_fh.setFormatter(_fmt)
logger.addHandler(_fh)

# ─────────────────────────────────────────────
# 종료 신호 처리 (SIGTERM = GitHub Actions 타임아웃 직전)
# ─────────────────────────────────────────────
_shutdown = False
_shutdown_reason = None


def _handle_term(sig, frame):
    global _shutdown, _shutdown_reason
    _shutdown = True
    _shutdown_reason = "SIGTERM" if sig == signal.SIGTERM else "SIGINT"
    logger.warning(f"[{_shutdown_reason}] 종료 신호 수신 — 현재 반복 종료 후 정리")


signal.signal(signal.SIGTERM, _handle_term)
signal.signal(signal.SIGINT, _handle_term)


# ─────────────────────────────────────────────
# 에러 JSONL append (크래시 안전)
# ─────────────────────────────────────────────
_err_fp = None


def _err_append(entry: dict):
    global _err_fp
    if _err_fp is None:
        _err_fp = open(ERR_PATH, "a", encoding="utf-8")
    _err_fp.write(json.dumps(entry, ensure_ascii=False) + "\n")
    _err_fp.flush()  # OS buffer flush — 크래시 시 손실 최소화


def _err_close():
    global _err_fp
    if _err_fp is not None:
        _err_fp.close()
        _err_fp = None


# ─────────────────────────────────────────────
# Supabase 헬퍼
# ─────────────────────────────────────────────
def _supabase_headers(prefer: str = "") -> dict:
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def fetch_targets(limit: int = 0) -> list[dict]:
    """kepco_addr 에서 lat IS NULL 인 행 조회."""
    rows = []
    page = 1000
    offset = 0
    while True:
        params = {
            "select": "id,geocode_address,addr_do,addr_si,addr_gu,addr_dong,addr_li",
            "lat": "is.null",
            "order": "id",
            "limit": str(page),
            "offset": str(offset),
        }
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/kepco_addr",
            params=params,
            headers=_supabase_headers(),
            timeout=30,
        )
        if r.status_code != 200:
            logger.error(f"DB 조회 실패: {r.status_code} {r.text[:200]}")
            break
        data = r.json()
        if not data:
            break
        rows.extend(data)
        if len(data) < page:
            break
        offset += page
        if limit > 0 and len(rows) >= limit:
            break
    return rows[:limit] if limit > 0 else rows


# ─────────────────────────────────────────────
# VWorld 검색 (주소 → PNU + 좌표)
# ─────────────────────────────────────────────
def vworld_search(address: str) -> dict | None:
    """VWorld 검색 API → {'pnu', 'bjd_code', 'lat', 'lng', 'parcel'} 또는 None."""
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
            VWORLD_SEARCH_URL,
            params=params,
            headers={"Referer": "https://sunlap.kr"},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        if data.get("response", {}).get("status") != "OK":
            return None
        items = data.get("response", {}).get("result", {}).get("items", [])
        if not items:
            return None
        # 입력 주소와 parcel 문자열 완전 일치 우선, 없으면 첫 항목
        exact = None
        for it in items:
            if (it.get("address", {}).get("parcel") or "") == address:
                exact = it
                break
        chosen = exact or items[0]
        pnu = (chosen.get("id") or "").strip()
        point = chosen.get("point") or {}
        lat = float(point.get("y", 0))
        lng = float(point.get("x", 0))
        if not pnu or len(pnu) != 19 or lat == 0 or lng == 0:
            return None
        return {
            "pnu": pnu,
            "bjd_code": pnu[:10],
            "lat": lat,
            "lng": lng,
            "parcel": chosen.get("address", {}).get("parcel", ""),
        }
    except Exception as e:
        logger.warning(f"VWorld 예외 [{address}]: {e}")
        return None


def geocode_with_fallback(row: dict) -> tuple[dict | None, list[str]]:
    """VWorld 조회 + '동만' fallback. (결과, 시도 주소 목록)"""
    attempts: list[str] = []
    addr = row.get("geocode_address") or ""
    if addr:
        attempts.append(addr)
        result = vworld_search(addr)
        if result:
            return result, attempts

    # Fallback: addr_li 제거 → "동만" 재시도 (리가 있는 경우만)
    if row.get("addr_li"):
        parts = [row.get("addr_do"), row.get("addr_si"), row.get("addr_gu"), row.get("addr_dong")]
        clean = [p for p in parts if p and p != "-기타지역"]
        if len(clean) >= 2:
            fallback_addr = " ".join(clean)
            if fallback_addr and fallback_addr not in attempts:
                attempts.append(fallback_addr)
                result = vworld_search(fallback_addr)
                if result:
                    return result, attempts

    return None, attempts


def update_row(row_id: int, lat: float, lng: float, bjd_code: str) -> bool:
    try:
        r = requests.patch(
            f"{SUPABASE_URL}/rest/v1/kepco_addr",
            params={"id": f"eq.{row_id}"},
            json={"lat": lat, "lng": lng, "bjd_code": bjd_code},
            headers=_supabase_headers("return=minimal"),
            timeout=15,
        )
        return r.status_code in (200, 204)
    except Exception as e:
        logger.warning(f"UPDATE 예외 (id={row_id}): {e}")
        return False


def write_summary(stats: dict, target_count: int, processed_count: int,
                  started_iso: str, elapsed: float, status: str):
    summary = {
        "run_ts": RUN_TS,
        "started_at": started_iso,
        "ended_at": datetime.now(timezone.utc).isoformat(),
        "completion_status": status,  # completed / signal_term / signal_int / error
        "target_count": target_count,
        "processed_count": processed_count,
        "elapsed_seconds": int(elapsed),
        "stats": stats,
        "fill_limit": FILL_LIMIT,
        "files": {
            "log": LOG_PATH,
            "errors_jsonl": ERR_PATH,
            "summary": SUM_PATH,
        },
    }
    with open(SUM_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("SUPABASE_URL / SUPABASE_SERVICE_KEY 필수")
        sys.exit(1)
    if not VWORLD_KEY:
        logger.error("VWORLD_KEY 필수")
        sys.exit(1)

    started = time.time()
    started_iso = datetime.now(timezone.utc).isoformat()
    if FILL_LIMIT > 0:
        logger.info(f"[테스트 모드] 처음 {FILL_LIMIT} 건만 처리")

    logger.info(f"로그: {LOG_PATH}")
    logger.info(f"에러 JSONL: {ERR_PATH}")
    logger.info(f"요약: {SUM_PATH}")

    # 대상 조회
    logger.info("kepco_addr 에서 lat IS NULL 행 조회 중...")
    targets = fetch_targets(FILL_LIMIT)
    logger.info(f"대상: {len(targets):,} 건, VWorld 딜레이 {VWORLD_DELAY}초")

    stats = {"success": 0, "fallback_success": 0, "failed": 0, "update_failed": 0}
    processed = 0
    status = "completed"

    try:
        for i, row in enumerate(targets, 1):
            if _shutdown:
                logger.warning(f"[중단] {i-1}/{len(targets)} 까지 처리 후 종료")
                break
            processed = i
            addr = row.get("geocode_address") or "(empty)"
            result, attempts = geocode_with_fallback(row)

            if result:
                ok = update_row(row["id"], result["lat"], result["lng"], result["bjd_code"])
                if ok:
                    if len(attempts) > 1:
                        stats["fallback_success"] += 1
                        logger.info(
                            f"[{i}/{len(targets)}] FALLBACK ok "
                            f"{addr} → {attempts[-1]} "
                            f"bjd={result['bjd_code']} ({result['lat']:.4f},{result['lng']:.4f})"
                        )
                    else:
                        stats["success"] += 1
                        logger.info(
                            f"[{i}/{len(targets)}] ok {addr} "
                            f"bjd={result['bjd_code']} ({result['lat']:.4f},{result['lng']:.4f})"
                        )
                else:
                    stats["update_failed"] += 1
                    _err_append({
                        "id": row["id"],
                        "address": addr,
                        "reason": "UPDATE 실패",
                        "vworld_result": result,
                    })
            else:
                stats["failed"] += 1
                _err_append({
                    "id": row["id"],
                    "address": addr,
                    "reason": "VWorld 조회 실패 (0 items)",
                    "attempts": attempts,
                    "row_context": {
                        "addr_do": row.get("addr_do"),
                        "addr_si": row.get("addr_si"),
                        "addr_gu": row.get("addr_gu"),
                        "addr_dong": row.get("addr_dong"),
                        "addr_li": row.get("addr_li"),
                    },
                })
                logger.warning(f"[{i}/{len(targets)}] FAIL {addr} (attempts={attempts})")

            # VWorld 딜레이 + 약간의 랜덤
            time.sleep(VWORLD_DELAY * random.uniform(0.8, 1.2))

        if _shutdown:
            status = "signal_int" if _shutdown_reason == "SIGINT" else "signal_term"

    except Exception as e:
        status = "error"
        logger.error(f"[예외로 중단] {e}")
        raise
    finally:
        # 요약 + JSONL 파일 닫기
        elapsed = time.time() - started
        write_summary(stats, len(targets), processed, started_iso, elapsed, status)
        _err_close()

        logger.info("\n" + "=" * 60)
        logger.info(f"완료 ({status})")
        logger.info(
            f"대상 {len(targets)} / 처리 {processed} / "
            f"성공 {stats['success']} / fallback 성공 {stats['fallback_success']} / "
            f"실패 {stats['failed']} / UPDATE 실패 {stats['update_failed']} / "
            f"소요 {elapsed/60:.1f}분"
        )
        logger.info(f"요약: {SUM_PATH}")


if __name__ == "__main__":
    main()
