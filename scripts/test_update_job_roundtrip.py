"""
Test B-1 — update_job end-to-end roundtrip.

목표: "깨진 문자열을 update_job() 에 넘겨도 DB 에 그대로 저장되지 않는다" 증명.

절차:
  1. 임시 Job row 를 INSERT (status=cancelled, 깨끗한 sido)
  2. update_job(tmp_id, {"error_message": lone-surrogate 섞인 문자열}) 호출
  3. DB 에서 다시 읽어 error_message 검증
     - surrogate 0건이어야 통과
  4. 정리: 임시 row DELETE

사전 조건:
  - SUPABASE_URL, SUPABASE_SERVICE_KEY 환경변수 또는 docs/SECRETS.local.md 파싱
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

# 환경변수 우선, 없으면 SECRETS.local.md 파싱
def _load_from_secrets() -> tuple[str, str]:
    secrets = ROOT / "docs" / "SECRETS.local.md"
    if not secrets.exists():
        raise RuntimeError("SECRETS.local.md 없음")
    text = secrets.read_text(encoding="utf-8")
    # env 스타일 라인만 파싱 (KEY=VALUE)
    url_m = re.search(
        r"^(?:NEXT_PUBLIC_)?SUPABASE_URL\s*=\s*(https?://\S+)",
        text, re.MULTILINE,
    )
    key_m = re.search(
        r"^SUPABASE_SERVICE_ROLE_KEY\s*=\s*(\S+)",
        text, re.MULTILINE,
    )
    if not url_m or not key_m:
        raise RuntimeError("SECRETS.local.md 에서 URL/키 파싱 실패")
    return url_m.group(1), key_m.group(1)


if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_KEY"):
    url, key = _load_from_secrets()
    os.environ["SUPABASE_URL"] = url
    os.environ["SUPABASE_SERVICE_KEY"] = key

from run_crawl import update_job, SUPABASE_URL, SUPABASE_KEY  # noqa: E402

PASS = "✅"
FAIL = "❌"


def _headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def has_surrogate(s: str) -> bool:
    if not isinstance(s, str):
        return False
    return any(0xD800 <= ord(c) <= 0xDFFF for c in s)


print("=" * 60)
print("Test B-1 — update_job roundtrip (실 DB)")
print("=" * 60)

# 1) 임시 Job 생성
CORRUPT = "경\udceb상\udced남\udceb도"  # 복수 lone surrogate 혼재
CLEAN_SIDO = "TEST_SANITIZE_ROUNDTRIP"

print(f"\n[1] 임시 Job 생성 (sido={CLEAN_SIDO})")
resp = requests.post(
    f"{SUPABASE_URL}/rest/v1/crawl_jobs",
    json={
        "sido": CLEAN_SIDO,
        "status": "cancelled",
        "mode": "single",
        "thread": 5,  # status=cancelled 이므로 find_next_job 이 안 잡음
        "cycle_count": 0,
    },
    headers={**_headers(), "Prefer": "return=representation"},
    timeout=30,
)
if resp.status_code not in (200, 201):
    print(f"{FAIL} 임시 Job 생성 실패: HTTP {resp.status_code}")
    print(resp.text)
    sys.exit(1)
tmp_id = resp.json()[0]["id"]
print(f"    임시 Job id={tmp_id}")

try:
    # 2) update_job 호출 — lone surrogate 섞인 payload
    print(f"\n[2] update_job({tmp_id}, error_message={CORRUPT!r}, checkpoint=...)")
    update_job(tmp_id, {
        "error_message": CORRUPT,
        "checkpoint": {
            "position": {
                "do_name": CORRUPT,
                "si_name": "정상_문자열",
                "gu_name": "\udceb\udceb\udceb",
            },
            "stats": {"processed": 100, "found": 50, "errors": 0},
        },
    })

    # 3) DB 에서 다시 읽어 검증
    print(f"\n[3] DB 재조회 후 surrogate 검출")
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/crawl_jobs",
        params={
            "id": f"eq.{tmp_id}",
            "select": "id,error_message,checkpoint",
        },
        headers=_headers(),
        timeout=30,
    )
    row = resp.json()[0]
    stored_msg = row["error_message"] or ""
    stored_cp = row["checkpoint"] or {}

    print(f"    stored error_message: {stored_msg!r}")
    print(f"    stored checkpoint.do: {stored_cp.get('position', {}).get('do_name')!r}")
    print(f"    stored checkpoint.si: {stored_cp.get('position', {}).get('si_name')!r}")
    print(f"    stored checkpoint.gu: {stored_cp.get('position', {}).get('gu_name')!r}")

    # 검증: surrogate 0
    checks = [
        ("error_message surrogate 0", not has_surrogate(stored_msg)),
        ("error_message 에 '?' 포함 (치환 증거)", "?" in stored_msg),
        ("checkpoint.do_name surrogate 0",
         not has_surrogate(stored_cp.get("position", {}).get("do_name", ""))),
        ("checkpoint.si_name 정상 한글 보존",
         stored_cp.get("position", {}).get("si_name") == "정상_문자열"),
        ("checkpoint.stats 숫자 필드 정상",
         stored_cp.get("stats", {}).get("processed") == 100),
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

    print()
    print("=" * 60)
    print(f"결과: {passed} 통과 / {failed} 실패 / 총 {len(checks)}")
    print("=" * 60)

finally:
    # 4) 정리 — 임시 Job 삭제
    requests.delete(
        f"{SUPABASE_URL}/rest/v1/crawl_jobs",
        params={"id": f"eq.{tmp_id}"},
        headers=_headers(),
        timeout=30,
    )
    print(f"\n[cleanup] 임시 Job #{tmp_id} 삭제")

sys.exit(0 if failed == 0 else 1)
