"""
Test B-4 (신규) — intent-cancel flow end-to-end.

2중 제어 모델의 핵심 계약:
  API 가 intent='cancel' 을 DB 에 쓰면,
  크롤러의 check_cancel_intent(job_id) 가 True 를 반환해야 한다.

검증:
  1. 임시 Job 생성 (intent='run', status='running')
  2. check_cancel_intent → False 여야 함 (아직 정지 의도 없음)
  3. DB 에 intent='cancel' PATCH
  4. check_cancel_intent → True 여야 함
  5. 정리
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

from run_crawl import check_cancel_intent  # noqa: E402

HDR = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}

PASS = "✅"
FAIL = "❌"


print("=" * 60)
print("Test B-4 — intent-cancel flow (API ↔ 크롤러)")
print("=" * 60)

# 1) 임시 Job 생성 (intent='run', status='running')
resp = requests.post(
    f"{URL}/rest/v1/crawl_jobs",
    json={
        "sido": "TEST_INTENT_CANCEL_FLOW",
        "status": "running",
        "intent": "run",
        "mode": "single",
        "thread": 5,
        "cycle_count": 0,
    },
    headers={**HDR, "Prefer": "return=representation"},
    timeout=30,
)
assert resp.status_code in (200, 201), f"INSERT 실패: {resp.text}"
job_id = resp.json()[0]["id"]
print(f"\n[1] 임시 Job #{job_id} 생성 (intent=run, status=running)")

passed = 0
failed = 0

try:
    # 2) 초기 상태 check — False 여야 함
    print(f"\n[2] check_cancel_intent({job_id}) 직전 상태")
    r1 = check_cancel_intent(job_id)
    ok1 = r1 is False
    print(f"    {PASS if ok1 else FAIL} 기대 False, 실제 {r1}")
    passed += 1 if ok1 else 0
    failed += 0 if ok1 else 1

    # 3) API PATCH 시뮬레이션 — intent='cancel' 기록
    print(f"\n[3] DB 에 intent='cancel' PATCH (API 가 하는 일 재현)")
    resp = requests.patch(
        f"{URL}/rest/v1/crawl_jobs",
        params={"id": f"eq.{job_id}"},
        json={"intent": "cancel"},
        headers={**HDR, "Prefer": "return=minimal"},
        timeout=30,
    )
    assert resp.status_code in (200, 204)

    # 4) 이제 크롤러가 체크하면 True 여야 함
    print(f"\n[4] check_cancel_intent({job_id}) 재호출")
    r2 = check_cancel_intent(job_id)
    ok2 = r2 is True
    print(f"    {PASS if ok2 else FAIL} 기대 True, 실제 {r2}")
    passed += 1 if ok2 else 0
    failed += 0 if ok2 else 1

    # 5) 추가 검증 — 다른 job_id 로 False
    print(f"\n[5] 존재하지 않는 job_id=99999999 로 check_cancel_intent")
    r3 = check_cancel_intent(99999999)
    ok3 = r3 is False
    print(f"    {PASS if ok3 else FAIL} 기대 False, 실제 {r3}")
    passed += 1 if ok3 else 0
    failed += 0 if ok3 else 1

    print()
    print("=" * 60)
    print(f"결과: {passed} 통과 / {failed} 실패 / 총 3")
    print("=" * 60)

finally:
    # 6) 정리
    requests.delete(
        f"{URL}/rest/v1/crawl_jobs",
        params={"id": f"eq.{job_id}"},
        headers=HDR,
        timeout=30,
    )
    print(f"\n[cleanup] 임시 Job #{job_id} 삭제")

sys.exit(0 if failed == 0 else 1)
