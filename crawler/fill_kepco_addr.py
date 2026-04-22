"""
KEPCO 드롭다운 풀스캔 → kepco_addr 채우기 (지번 제외)

목적:
  현재 kepco_addr 는 크롤러가 용량 데이터와 함께 들어올 때만 INSERT 됨.
  KEPCO 드롭다운 전체를 1회 순회해서 "KEPCO 가 가진 모든 리" 를 미리 채워둔다.

범위:
  gbn=0 (시) → gbn=1 (구/군) → gbn=2 (동/면) → gbn=3 (리) 까지만.
  gbn=4 (지번) 은 **하지 않음** — 본 스크립트 대상 아님.

동작 방식:
  - 상위 계층 API 응답이 빈 배열이면 해당 단계값 = "-기타지역" (SKIP_VALUE)
    → 기존 크롤러(crawler.py) 동작과 동일 (빈 응답 = 기타지역으로 저장)
  - geocode_address 는 기존 헬퍼 _build_geocode_address 재활용
    → "-기타지역" 은 표시 문자열에서 제외
  - kepco_addr UPSERT 는 Prefer: resolution=ignore-duplicates
    → 기존 행의 lat/lng 을 **덮어쓰지 않음** (중요)
  - 재개 가능 — 이미 INSERT 된 행은 자동 스킵 (geocode_address UNIQUE + ignore)

실행:
  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python fill_kepco_addr.py

테스트 모드 (시/도 1개만):
  KEPCO_TEST_DO="제주특별자치도" python fill_kepco_addr.py
"""
import json
import logging
import os
import sys
import time
from datetime import datetime

import requests

from api_client import KepcoApiClient
from crawl_to_db import _build_geocode_address, _empty_to_none
from crawler import SKIP_VALUE

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# 버퍼 FLUSH 크기 (리 단위 행 수)
FLUSH_SIZE = 200


def _headers(prefer: str = "") -> dict:
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def _safe_get(client: KepcoApiClient, **kwargs) -> list[str]:
    """get_addr_list 재시도 래퍼 — 3회 실패 시 예외 전파"""
    delays = [5, 15, 30]
    last_err: Exception | None = None
    for attempt, wait in enumerate(delays, 1):
        try:
            return client.get_addr_list(**kwargs)
        except Exception as e:
            last_err = e
            logger.warning(f"[주소 목록 실패 {attempt}/3] {e} — {wait}초 대기 후 재시도")
            time.sleep(wait)
            try:
                client._init_session()
            except Exception:
                pass
    assert last_err is not None
    raise last_err


def _flush(buffer: list[dict]) -> tuple[int, int]:
    """버퍼를 kepco_addr 에 UPSERT. (성공 행 수, 기존 스킵 수 추정치) 반환.

    Prefer: resolution=ignore-duplicates
      → 충돌 시 DO NOTHING. 기존 lat/lng/기타 컬럼 보존.
    return=representation
      → 실제 INSERT 된 행만 반환 (충돌 스킵은 제외)
    """
    if not buffer:
        return 0, 0
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/kepco_addr?on_conflict=geocode_address",
            json=buffer,
            headers=_headers("resolution=ignore-duplicates,return=representation"),
            timeout=60,
        )
        if resp.status_code in (200, 201):
            inserted = len(resp.json())
            skipped = len(buffer) - inserted
            return inserted, skipped
        else:
            logger.error(
                f"kepco_addr UPSERT 실패 (HTTP {resp.status_code}): {resp.text[:500]}"
            )
            return 0, 0
    except requests.exceptions.RequestException as e:
        logger.error(f"kepco_addr 네트워크 오류: {e}")
        return 0, 0


def _make_row(do: str, si: str, gu: str, dong: str, li: str) -> dict:
    """5개 단계 값 → kepco_addr row dict.

    기존 크롤러 동일 규칙:
      - "-기타지역" 은 그대로 저장 (DB 일관성)
      - geocode_address 는 "-기타지역" 을 제외하고 공백 join
      - 빈 문자열은 None (UNIQUE 제약 NULL 일관성)
    """
    return {
        "addr_do": do or None,
        "addr_si": _empty_to_none(si),
        "addr_gu": _empty_to_none(gu),
        "addr_dong": _empty_to_none(dong),
        "addr_li": _empty_to_none(li),
        "geocode_address": _build_geocode_address(do, si, gu, dong, li),
    }


def fill(delay: float = 0.5):
    """KEPCO 드롭다운 풀스캔."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수 필수")
        sys.exit(1)

    client = KepcoApiClient(delay=delay)
    client._on_log = lambda msg: logger.info(msg)

    buffer: list[dict] = []
    stats = {"inserted": 0, "skipped": 0, "api_calls": 0, "visited_li": 0}
    errors: list[dict] = []  # 오류 수집 (레벨/부모경로/메시지)
    started = time.time()

    def _log_err(level: str, parent: str, err: Exception):
        errors.append({
            "level": level,
            "parent": parent,
            "error": str(err)[:500],
        })
        logger.error(f"[오류/{level}] {parent} — {err}")

    # ─────────────────────────────────────────────
    # gbn=0: 시/도 목록 (테스트 모드 지원)
    # ─────────────────────────────────────────────
    test_do = os.environ.get("KEPCO_TEST_DO", "").strip()
    if test_do:
        do_list = [test_do]
        logger.info(f"[테스트 모드] 시/도 1개만 처리: {test_do}")
    else:
        do_list = client.get_sido_list()
        stats["api_calls"] += 1
        logger.info(f"시/도 {len(do_list)}개 — 시작")

    for do_idx, do in enumerate(do_list, 1):
        logger.info(f"\n{'='*60}")
        logger.info(f"[{do_idx}/{len(do_list)}] 시/도: {do}")
        logger.info(f"{'='*60}")

        # gbn=0: 시 목록
        try:
            si_list = _safe_get(client, gbn=0, addr_do=do)
            stats["api_calls"] += 1
        except Exception as e:
            _log_err("시", do, e)
            continue  # 이 시/도 전체 스킵
        if not si_list:
            si_list = [SKIP_VALUE]

        for si_idx, si in enumerate(si_list, 1):
            si_display = si if si != SKIP_VALUE else "(기타)"
            logger.info(f"  [{si_idx}/{len(si_list)}] 시: {si_display}")

            # gbn=1: 구/군 목록
            try:
                gu_list = _safe_get(client, gbn=1, addr_do=do, addr_si=si)
                stats["api_calls"] += 1
            except Exception as e:
                _log_err("구/군", f"{do} / {si}", e)
                continue  # 이 시 전체 스킵
            if not gu_list:
                gu_list = [SKIP_VALUE]

            for gu_idx, gu in enumerate(gu_list, 1):
                gu_display = gu if gu != SKIP_VALUE else "(기타)"

                # gbn=2: 동/면 목록
                try:
                    dong_list = _safe_get(
                        client, gbn=2, addr_do=do, addr_si=si, addr_gu=gu
                    )
                    stats["api_calls"] += 1
                except Exception as e:
                    _log_err("동/면", f"{do} / {si} / {gu}", e)
                    continue  # 이 구 전체 스킵
                if not dong_list:
                    dong_list = [SKIP_VALUE]

                logger.info(
                    f"    [{gu_idx}/{len(gu_list)}] 구/군: {gu_display} "
                    f"— 동/면 {len(dong_list)}개"
                )

                for dong in dong_list:
                    # gbn=3: 리 목록
                    try:
                        li_list = _safe_get(
                            client,
                            gbn=3,
                            addr_do=do,
                            addr_si=si,
                            addr_gu=gu,
                            addr_lidong=dong,
                        )
                        stats["api_calls"] += 1
                    except Exception as e:
                        _log_err("리", f"{do} / {si} / {gu} / {dong}", e)
                        continue  # 이 동 스킵
                    if not li_list:
                        li_list = [SKIP_VALUE]

                    for li in li_list:
                        buffer.append(_make_row(do, si, gu, dong, li))
                        stats["visited_li"] += 1

                        if len(buffer) >= FLUSH_SIZE:
                            ins, skp = _flush(buffer)
                            stats["inserted"] += ins
                            stats["skipped"] += skp
                            buffer.clear()
                            elapsed = time.time() - started
                            logger.info(
                                f"      [FLUSH] 누적 리 {stats['visited_li']} "
                                f"/ INSERT {stats['inserted']} / SKIP {stats['skipped']} "
                                f"/ API {stats['api_calls']}회 / 경과 {elapsed:.0f}s"
                            )

    # 남은 버퍼 비우기
    if buffer:
        ins, skp = _flush(buffer)
        stats["inserted"] += ins
        stats["skipped"] += skp
        buffer.clear()

    elapsed = time.time() - started
    logger.info("\n" + "=" * 60)
    logger.info("풀스캔 완료")
    logger.info(
        f"총 리 방문 {stats['visited_li']} / "
        f"신규 INSERT {stats['inserted']} / "
        f"기존 SKIP {stats['skipped']} / "
        f"API 호출 {stats['api_calls']}회 / "
        f"소요 {elapsed/60:.1f}분"
    )

    # 오류 리포트
    if errors:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        err_file = f"fill_addr_errors_{ts}.json"
        with open(err_file, "w", encoding="utf-8") as f:
            json.dump(errors, f, ensure_ascii=False, indent=2)
        logger.warning(f"\n⚠️ 오류 {len(errors)}건 발생 — {err_file} 에 저장")
        # 레벨별 집계
        by_level: dict[str, int] = {}
        for e in errors:
            by_level[e["level"]] = by_level.get(e["level"], 0) + 1
        for lv, cnt in by_level.items():
            logger.warning(f"  {lv}: {cnt}건")
    else:
        logger.info("✅ 오류 없음")


if __name__ == "__main__":
    fill(delay=float(os.environ.get("KEPCO_DELAY", "0.5")))
