"""
Test B-3 — auto_continue POST 경로 sanitize 검증.

Job #244 의 실제 번식 메커니즘 재현:
 - 이전 Job 의 깨진 sido/checkpoint 가 dict 복사되어
   auto_continue 에서 새 Job 으로 POST 될 때 sanitize 적용되는가.

절차:
 1. 깨진 sido + checkpoint 가 있는 "이전 Job" 모의 dict 준비
 2. auto_continue 가 하는 것과 동일한 POST 페이로드 구성 + _sanitize_json 통과
 3. 실 Supabase 에 POST → 생성된 새 Job 의 sido/checkpoint 검증
 4. 정리
"""
import os
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "crawler"))


def _load() -> tuple[str, str]:
    text = (ROOT / "docs" / "SECRETS.local.md").read_text(encoding="utf-8")
    url = re.search(r"^(?:NEXT_PUBLIC_)?SUPABASE_URL\s*=\s*(https?://\S+)", text, re.MULTILINE).group(1)
    key = re.search(r"^SUPABASE_SERVICE_ROLE_KEY\s*=\s*(\S+)", text, re.MULTILINE).group(1)
    return url, key


URL, KEY = _load()
os.environ["SUPABASE_URL"] = URL
os.environ["SUPABASE_SERVICE_KEY"] = KEY

from run_crawl import _sanitize_json  # noqa: E402

HDR = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}

PASS = "✅"
FAIL = "❌"


def has_surrogate(s) -> bool:
    if not isinstance(s, str):
        return False
    return any(0xD800 <= ord(c) <= 0xDFFF for c in s)


def walk_all_strings(obj):
    """dict/list 재귀 순회하며 모든 str 반환"""
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from walk_all_strings(v)
    elif isinstance(obj, list):
        for x in obj:
            yield from walk_all_strings(x)


print("=" * 60)
print("Test B-3 — auto_continue POST roundtrip")
print("=" * 60)

# Job #244 의 실제 깨진 필드들 재현
CORRUPT_PREV_JOB = {
    "sido": "경\udceb상\udced남\udceb도",
    "si": None,
    "gu": None,
    "dong": None,
    "li": None,
    "options": {"_restart_count": 5, "delay": 0.5},
    "requested_by": None,
    "mode": "recurring",
    "cycle_count": 0,
    "max_cycles": None,
}
CORRUPT_CHECKPOINT = {
    "position": {
        "do_name": "경\udceb상\udced남\udceb도",
        "si_name": "정상_문자열",
        "gu_name": "\udceb\udceb군",
        "dong_name": "우\ud800보면",
    },
    "stats": {"processed": 100, "found": 50, "errors": 0},
}

# auto_continue() 가 만드는 것과 동일한 new_job 구조
new_job = {
    "sido": CORRUPT_PREV_JOB["sido"],
    "si": CORRUPT_PREV_JOB.get("si"),
    "gu": CORRUPT_PREV_JOB.get("gu"),
    "dong": CORRUPT_PREV_JOB.get("dong"),
    "li": CORRUPT_PREV_JOB.get("li"),
    "options": CORRUPT_PREV_JOB.get("options") or {},
    "checkpoint": CORRUPT_CHECKPOINT,
    "requested_by": CORRUPT_PREV_JOB.get("requested_by"),
    "thread": 5,
    "mode": CORRUPT_PREV_JOB.get("mode", "single"),
    "cycle_count": CORRUPT_PREV_JOB.get("cycle_count", 0),
    "max_cycles": CORRUPT_PREV_JOB.get("max_cycles"),
}

# sanitize 통과 후 POST
payload = _sanitize_json(new_job)
print(f"\n[1] sanitize 후 payload.sido = {payload['sido']!r}")
print(f"[2] sanitize 후 checkpoint.gu_name = {payload['checkpoint']['position']['gu_name']!r}")

# 그래도 status 는 cancelled 로 박아서 Actions 에 걸리지 않게
payload["status"] = "cancelled"

resp = requests.post(
    f"{URL}/rest/v1/crawl_jobs",
    json=payload,
    headers={**HDR, "Prefer": "return=representation"},
    timeout=30,
)
assert resp.status_code in (200, 201), f"POST 실패: {resp.status_code} {resp.text[:500]}"
new_id = resp.json()[0]["id"]
print(f"\n[3] 새 Job #{new_id} 생성됨")

try:
    # DB 에서 다시 읽기
    resp = requests.get(
        f"{URL}/rest/v1/crawl_jobs",
        params={"id": f"eq.{new_id}", "select": "sido,checkpoint,options"},
        headers=HDR,
        timeout=30,
    )
    row = resp.json()[0]
    print(f"\n[4] DB 재조회 결과:")
    print(f"    sido: {row['sido']!r}")
    print(f"    checkpoint.gu_name: {row['checkpoint']['position']['gu_name']!r}")
    print(f"    checkpoint.si_name: {row['checkpoint']['position']['si_name']!r}")

    # 전 필드 재귀 surrogate 검사
    all_strings = list(walk_all_strings(row))
    offenders = [s for s in all_strings if has_surrogate(s)]

    checks = [
        ("sido 에 surrogate 0", not has_surrogate(row["sido"])),
        ("sido 에 '?' 치환 증거", "?" in row["sido"]),
        ("checkpoint.do_name surrogate 0",
         not has_surrogate(row["checkpoint"]["position"]["do_name"])),
        ("checkpoint.si_name 정상 한글 보존",
         row["checkpoint"]["position"]["si_name"] == "정상_문자열"),
        ("options.delay 숫자 보존",
         row["options"].get("delay") == 0.5),
        ("전체 구조 surrogate 0",
         len(offenders) == 0),
    ]

    passed = 0
    failed = 0
    for name, ok in checks:
        mark = PASS if ok else FAIL
        print(f"    {mark} {name}")
        if ok:
            passed += 1
        else:
            failed += 1

    if offenders:
        print(f"\n    🚨 surrogate 남은 필드: {offenders}")

    print()
    print("=" * 60)
    print(f"결과: {passed} 통과 / {failed} 실패 / 총 {len(checks)}")
    print("=" * 60)

finally:
    requests.delete(
        f"{URL}/rest/v1/crawl_jobs",
        params={"id": f"eq.{new_id}"},
        headers=HDR, timeout=30,
    )
    print(f"\n[cleanup] 임시 Job #{new_id} 삭제")

sys.exit(0 if failed == 0 else 1)
