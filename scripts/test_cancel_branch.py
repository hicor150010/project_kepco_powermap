"""
Test B-2 — 취소 API PATCH 분기 로직 검증.

route.ts 의 새 분기 로직 (3케이스) 을 Python 으로 재현 + 실 DB roundtrip 으로
각 케이스가 기대대로 전환되는지 end-to-end 검증.

참고: 이 스크립트는 route.ts 를 HTTP 호출하지 않고 동일 로직을 Python 으로
재현하는 형태. 배포 전 단계에서 로직 자체를 증명하기 위함.
배포 후에는 관리자 UI 에서 실제 취소 버튼으로 최종 확인 필요.

절차:
  1. status=pending / running / stop_requested 3개 fake Job 생성
  2. 각각에 대해 simulate_cancel(status) → 기대 새 상태 계산
  3. 실제 Supabase update 적용
  4. 다시 읽어서 실제 상태 변경 검증
  5. 임시 Job 3개 DELETE
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

PASS = "✅"
FAIL = "❌"


# ─── route.ts 의 새 분기 로직 Python 재현 ───
def simulate_cancel(current_status: str) -> tuple[str | None, bool]:
    """
    route.ts PATCH 핸들러의 새 분기 로직 재현.
    반환: (new_status or None, completed_at 도 설정해야 하는지 여부)
    """
    if current_status == "running":
        return ("stop_requested", False)
    if current_status in ("pending", "stop_requested"):
        return ("cancelled", True)
    return (None, False)


# ─── 테스트 ───

print("=" * 60)
print("Test B-2 — 취소 API 분기 로직 (실 DB roundtrip)")
print("=" * 60)

cases = [
    # (초기 상태, 기대 새 상태, 기대 completed_at 설정 여부)
    ("pending",        "cancelled",     True),
    ("running",        "stop_requested", False),
    ("stop_requested", "cancelled",     True),
    ("completed",      None,            False),  # no-op
]

created_ids: list[int] = []
try:
    # 1) 각 케이스별 fake Job 생성
    for initial_status, _, _ in cases:
        resp = requests.post(
            f"{URL}/rest/v1/crawl_jobs",
            json={
                "sido": f"TEST_CANCEL_BRANCH_{initial_status}",
                "status": initial_status,
                "mode": "single",
                "thread": 5,
                "cycle_count": 0,
                # running 이면 heartbeat 있어야 좀비로 분류 안 됨
                **({"last_heartbeat": "now()"} if initial_status == "running" else {}),
            },
            headers={**HDR, "Prefer": "return=representation"},
            timeout=30,
        )
        assert resp.status_code in (200, 201), resp.text
        tmp_id = resp.json()[0]["id"]
        created_ids.append(tmp_id)
        print(f"[준비] {initial_status} → Job #{tmp_id} 생성")

    # 2) 각각 취소 시뮬레이션 + 적용 + 검증
    passed = 0
    failed = 0
    for i, (initial_status, expected_status, expect_completed) in enumerate(cases):
        tmp_id = created_ids[i]
        print(f"\n[Test] Job #{tmp_id} (초기={initial_status}) → 기대={expected_status!r}")

        new_status, set_completed = simulate_cancel(initial_status)
        if new_status != expected_status:
            print(f"    {FAIL} 분기 로직 불일치: simulate={new_status!r}, 기대={expected_status!r}")
            failed += 1
            continue

        if new_status is None:
            # no-op 케이스
            print(f"    {PASS} no-op 분기 (current={initial_status})")
            passed += 1
            continue

        # Supabase 에 실제 update 적용
        payload = {"status": new_status}
        if set_completed:
            payload["completed_at"] = "now()"
        resp = requests.patch(
            f"{URL}/rest/v1/crawl_jobs",
            params={"id": f"eq.{tmp_id}"},
            json=payload,
            headers={**HDR, "Prefer": "return=minimal"},
            timeout=30,
        )
        if resp.status_code not in (200, 204):
            print(f"    {FAIL} PATCH 실패: HTTP {resp.status_code}")
            failed += 1
            continue

        # 재조회
        resp = requests.get(
            f"{URL}/rest/v1/crawl_jobs",
            params={"id": f"eq.{tmp_id}", "select": "status,completed_at"},
            headers=HDR,
            timeout=30,
        )
        row = resp.json()[0]
        actual_status = row["status"]
        actual_completed = row["completed_at"]

        ok_status = actual_status == expected_status
        ok_completed = (actual_completed is not None) if expect_completed else True
        # (expect_completed=False 면 굳이 검증 안 함 — 기존에 null 일 수도 있으니)

        if ok_status and ok_completed:
            print(f"    {PASS} status: {initial_status} → {actual_status}"
                  + (f" + completed_at 기록됨" if expect_completed else ""))
            passed += 1
        else:
            print(f"    {FAIL} status={actual_status} (기대 {expected_status}),"
                  f" completed_at={actual_completed}")
            failed += 1

    print()
    print("=" * 60)
    print(f"결과: {passed} 통과 / {failed} 실패 / 총 {len(cases)}")
    print("=" * 60)

finally:
    # 3) 정리
    for tmp_id in created_ids:
        requests.delete(
            f"{URL}/rest/v1/crawl_jobs",
            params={"id": f"eq.{tmp_id}"},
            headers=HDR,
            timeout=30,
        )
    print(f"\n[cleanup] 임시 Job {len(created_ids)}개 삭제")

sys.exit(0 if failed == 0 else 1)
