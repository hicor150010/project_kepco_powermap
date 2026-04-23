"""
행안부 법정동코드 CSV → bjd_master 테이블 upsert.

Input:
  data/행정표준코드/법정동코드 전체자료(YYYY-MM-DD).txt
    - 인코딩 CP949, TAB 구분, CRLF
    - 컬럼: 법정동코드 \\t 법정동명 \\t 폐지여부
    - 존재 행만 import (현재 20,560건)

Output:
  bjd_master 테이블 upsert
    - bjd_code (PK)
    - sep_1~5 파싱
    - lat/lng 은 건드리지 않음 (재실행 시 좌표 보존)

sep_1~5 파싱 규칙 (토큰 접미사 기반):
  sep_1 = 첫 토큰 (항상 시/도)
  sep_5 ← "~리"
  sep_4 ← "~읍" / "~면" / "~동" / "~가"
  sep_3 ← "~구" / "~군"
  sep_2 ← "~시"

환경변수:
  SUPABASE_URL           필수
  SUPABASE_SERVICE_KEY   필수
  BJD_CSV_PATH           선택. 기본: data/행정표준코드/법정동코드 전체자료(2026-04-23).txt
  BJD_CHUNK              선택. upsert 청크 크기 기본 1000

실행:
  export SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
  python crawler/import_bjd_master.py
"""
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

# Windows cp949 회피
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
CSV_PATH = os.environ.get(
    "BJD_CSV_PATH",
    "data/행정표준코드/법정동코드 전체자료(2026-04-23).txt",
)
CHUNK = int(os.environ.get("BJD_CHUNK", "1000"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("bjd_import")


# ─────────────────────────────────────────────
# 파싱
# ─────────────────────────────────────────────
def split_sep5(full_name: str) -> tuple:
    """'경기도 수원시 장안구 연무동' → (sep_1..5)."""
    tokens = full_name.split()
    sep_1 = tokens[0] if tokens else None
    sep_2 = sep_3 = sep_4 = sep_5 = None

    for t in tokens[1:]:
        if t.endswith("리"):
            sep_5 = t
        elif t.endswith(("읍", "면", "동", "가")):
            sep_4 = t
        elif t.endswith(("구", "군")):
            sep_3 = t
        elif t.endswith("시"):
            sep_2 = t
        else:
            # 세종특별자치시 본청 등 예외 (sep_4 → sep_5 순서로 채움)
            if sep_4 is None:
                sep_4 = t
            else:
                sep_5 = t
    return sep_1, sep_2, sep_3, sep_4, sep_5


def parse_csv(path: str) -> list:
    rows = []
    dropped = 0
    with open(path, "r", encoding="cp949") as f:
        next(f)  # 헤더
        for ln in f:
            parts = ln.rstrip("\r\n").split("\t")
            if len(parts) != 3:
                dropped += 1
                continue
            code, name, status = parts
            if status != "존재":
                continue
            sep = split_sep5(name)
            if not sep[0]:
                dropped += 1
                continue
            rows.append({
                "bjd_code": code,
                "sep_1": sep[0],
                "sep_2": sep[1],
                "sep_3": sep[2],
                "sep_4": sep[3],
                "sep_5": sep[4],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
    if dropped:
        log.warning(f"파싱 제외 {dropped}행 (포맷 이상)")
    return rows


# ─────────────────────────────────────────────
# Supabase upsert
# ─────────────────────────────────────────────
def upsert_chunk(chunk: list) -> int:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/bjd_master?on_conflict=bjd_code",
        headers=headers,
        json=chunk,
        timeout=60,
    )
    if r.status_code not in (200, 201, 204):
        log.error(f"upsert 실패 {r.status_code}: {r.text[:400]}")
        return 0
    return len(chunk)


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수 필수")
        sys.exit(1)
    if not Path(CSV_PATH).exists():
        log.error(f"CSV 파일 없음: {CSV_PATH}")
        sys.exit(1)

    started = time.time()
    log.info(f"CSV 읽기: {CSV_PATH}")
    rows = parse_csv(CSV_PATH)
    log.info(f"존재 행: {len(rows):,}개 (청크 {CHUNK})")

    # sep 파싱 검증 리포트
    null_sep1 = sum(1 for r in rows if not r["sep_1"])
    by_filled = {}
    for r in rows:
        sig = "".join("1" if r[f"sep_{i}"] else "0" for i in range(1, 6))
        by_filled[sig] = by_filled.get(sig, 0) + 1
    log.info(f"sep_1 누락: {null_sep1}")
    log.info("sep 채움 패턴 분포:")
    for sig, cnt in sorted(by_filled.items(), key=lambda x: -x[1]):
        log.info(f"  {sig} : {cnt:>6,}")

    # upsert
    total = 0
    t0 = time.time()
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        n = upsert_chunk(chunk)
        total += n
        pct = total / len(rows) * 100
        log.info(f"  [{total:>6,}/{len(rows):,}] {pct:5.1f}%")

    elapsed = time.time() - started
    log.info(f"완료. {total:,}건 upsert, 소요 {elapsed:.1f}초")


if __name__ == "__main__":
    main()
