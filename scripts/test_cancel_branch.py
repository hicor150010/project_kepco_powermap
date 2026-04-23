"""
Test B-2 — 취소 API PATCH 분기 로직 검증 (2중 제어 모델).

새 PATCH 동작 (web/app/api/admin/crawl/route.ts):
  1. pending                         → status='cancelled' 즉시 확정
  2. running + heartbeat 3분+ (좀비) → status='cancelled' 즉시 확정
  3. running + heartbeat 정상        → intent='cancel' 만 기록 (크롤러 self-check)
  4. 이미 종료 상태 (completed/failed/cancelled) → skip

검증 방식:
  - route.ts 의 분기 로직을 Python 으로 재현
  - 실 Supabase 에 roundtrip 으로 각 시나리오 검증
"""
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import requests

ROOT = Path(__file__).resolve().parent.parent


def _load_from_secrets() -> tuple[str, str]:
    secrets = ROOT / "docs" / "SECRETS.local.md"
    text = secrets.read_text(encoding="utf-8")
    url_m = re.search(r"^(?:NEXT_PUBLIC_)?SUPABASE_URL\s*=\s*(https?://\S+)", text, re.MULTILINE)
    key_m = re.search(r"^SUPABASE_SERVICE_ROLE_KEY\s*=\s*(\S+)", text, re.MULTILINE)
    return url_m.group(1), key_m.group(1)


URL, KEY = _load_from_secrets()
HDR = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}
HEARTBEAT_ZOMBIE_MS = 3 * 60 * 1000

PASS = "✅"
FAIL = "❌"


# ─── route.ts PATCH 의 새 분기 로직 Python 재현 ───
def simulate_patch(job: dict) -> dict:
    """
    입력: job row (최소 status/intent/last_heartbeat)
    반환: {
        new_status: str | None,      # status 즉시 변경 여부
        new_intent: str | None,      # intent 변경 여부
        set_completed_at: bool,
        branch: str,                 # 디버그용
    }
    """
    status = job["status"]
    if status in ("completed", "cancelled", "failed"):
        return {"new_status": None, "new_intent": None, "set_completed_at": False, "branch": "already_terminal"}

    if status == "pending":
        return {
            "new_status": "cancelled",
            "new_intent": "cancel",
            "set_completed_at": True,
            "branch": "pending_immediate_cancel",
        }

    # status == 'running'
    last_hb = job.get("last_heartbeat")
    if last_hb is None:
        age_ms = float("inf")
    else:
        age_ms = (datetime.now(timezone.utc) - datetime.fromisoformat(last_hb.replace("Z", "+00:00"))).total_seconds() * 1000

    if age_ms > HEARTBEAT_ZOMBIE_MS:
        return {
            "new_status": "cancelled",
            "new_intent": "cancel",
            "set_completed_at": True,
            "branch": "zombie_immediate_cancel",
        }

    return {
        "new_status": None,
        "new_intent": "cancel",
        "set_completed_at": False,
        "branch": "normal_intent_cancel",
    }


print("=" * 60)
print("Test B-2 — 취소 API PATCH 분기 (실 DB roundtrip)")
print("=" * 60)

# heartbeat 타임스탬프 (5분 전 = 좀비)
ZOMBIE_HB = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
FRESH_HB = datetime.now(timezone.utc).isoformat()

cases = [
    # (초기 상태, last_heartbeat, 기대 branch, 기대 new_status)
    ("pending", None, "pending_immediate_cancel", "cancelled"),
    ("running", ZOMBIE_HB, "zombie_immediate_cancel", "cancelled"),
    ("running", FRESH_HB, "normal_intent_cancel", "running"),  # status 안 바뀜
    ("completed", None, "already_terminal", "completed"),
]

created_ids: list[int] = []
passed = 0
failed = 0

try:
    for i, (init_status, init_hb, expected_branch, expected_final_status) in enumerate(cases):
        # 1) 테스트 Job 생성
        post_body = {
            "sido": f"TEST_CANCEL_{init_status}_{i}",
            "status": init_status,
            "mode": "single",
            "thread": 5,
            "cycle_count": 0,
            "intent": "run",
        }
        if init_hb:
            post_body["last_heartbeat"] = init_hb

        resp = requests.post(
            f"{URL}/rest/v1/crawl_jobs",
            json=post_body,
            headers={**HDR, "Prefer": "return=representation"},
            timeout=30,
        )
        assert resp.status_code in (200, 201), f"INSERT 실패: {resp.text}"
        job = resp.json()[0]
        created_ids.append(job["id"])
        print(f"\n[{i+1}] Job #{job['id']} (init={init_status}, hb={'zombie' if init_hb == ZOMBIE_HB else ('fresh' if init_hb else 'null')})")

        # 2) simulate_patch 로 기대값 계산
        decision = simulate_patch(job)
        branch_ok = decision["branch"] == expected_branch
        mark = PASS if branch_ok else FAIL
        print(f"    {mark} branch={decision['branch']} (기대 {expected_branch})")
        if branch_ok:
            passed += 1
        else:
            failed += 1
            continue

        # 3) 실제 PATCH 시뮬레이션 — DB 에 적용
        if decision["branch"] == "already_terminal":
            # skip — 아무것도 안 함
            pass
        else:
            update_body = {}
            if decision["new_intent"]:
                update_body["intent"] = decision["new_intent"]
            if decision["new_status"]:
                update_body["status"] = decision["new_status"]
                update_body["error_message"] = f"테스트 — {decision['branch']}"
            if decision["set_completed_at"]:
                update_body["completed_at"] = datetime.now(timezone.utc).isoformat()

            resp = requests.patch(
                f"{URL}/rest/v1/crawl_jobs",
                params={"id": f"eq.{job['id']}"},
                json=update_body,
                headers={**HDR, "Prefer": "return=minimal"},
                timeout=30,
            )
            assert resp.status_code in (200, 204), f"PATCH 실패: {resp.text}"

        # 4) DB 재조회 + 최종 status 검증
        resp = requests.get(
            f"{URL}/rest/v1/crawl_jobs",
            params={"id": f"eq.{job['id']}", "select": "status,intent"},
            headers=HDR,
            timeout=30,
        )
        after = resp.json()[0]
        status_ok = after["status"] == expected_final_status
        mark = PASS if status_ok else FAIL
        print(f"    {mark} DB status: {after['status']} (기대 {expected_final_status}), intent={after['intent']}")
        if status_ok:
            passed += 1
        else:
            failed += 1

    print()
    print("=" * 60)
    print(f"결과: {passed} 통과 / {failed} 실패 / 총 {len(cases) * 2}")
    print("=" * 60)

finally:
    for tid in created_ids:
        requests.delete(
            f"{URL}/rest/v1/crawl_jobs",
            params={"id": f"eq.{tid}"},
            headers=HDR,
            timeout=30,
        )
    print(f"\n[cleanup] 임시 Job {len(created_ids)}개 삭제")

sys.exit(0 if failed == 0 else 1)
