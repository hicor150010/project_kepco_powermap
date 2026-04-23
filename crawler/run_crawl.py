"""
KEPCO 크롤링 엔트리포인트 (GitHub Actions 용, 2중 제어 모델)

- 멀티스레드 지원 (스레드 1~5 독립 실행)
- 1회 / 반복 모드
- API/Worker 가 생성한 pending Job 을 --job-id 로 받아 실행
- 100건마다 checkpoint 저장 + cancel 의도 체크 (intent='cancel')
- 타임아웃 임박 시 auto_continue 로 새 Job 생성 + 자기 자신 넘김

설계 원칙:
  - API 와 UI 는 "의도(intent)" 만 기록하고, 본 크롤러는 그 의도를 읽어 self-stop.
  - 좀비 정리 / cron 픽업은 여기서 하지 않음 (Worker = /api/reconcile 담당).
"""
import argparse
import logging
import os
import sys
import threading
import time

import requests

from crawl_to_db import CrawlDbWriter
from crawler import CrawlProgress, CrawlResult, KepcoСrawler  # С = U+0421

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── 환경 변수 ──
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# ── 상수 ──
PROGRESS_INTERVAL = 10     # progress 업데이트 간격 (건)
FLUSH_SIZE = 100           # DB flush 간격 (건)

# 모드별 타임아웃
MODE_TIMEOUT = {
    "single": 5 * 3600,               # 5시간
    "recurring": 5 * 3600,             # 5시간
}

MAX_AUTO_RESTARTS = 50  # 반복 모드는 이 제한 내에서 체이닝


# ══════════════════════════════════════════════
# Supabase 헬퍼 (PostgREST 직접 호출)
# ══════════════════════════════════════════════

def _headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def read_job(job_id: int) -> dict | None:
    """crawl_jobs에서 작업 정보 읽기"""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/crawl_jobs",
        params={"id": f"eq.{job_id}", "select": "*"},
        headers=_headers(),
        timeout=30,
    )
    rows = resp.json()
    return rows[0] if rows else None


def _sanitize_json(obj):
    """lone surrogate 제거 — DB 저장 전 단일 방어선.

    Python 은 `"\\udceb"` 같은 lone surrogate 를 str 로 허용하지만,
    이 상태로 requests.patch(json=...) 에 전달되면 PostgREST/JSONB 까지
    그대로 저장되어 이후 재시도·복사 루프에서 증식한다.
    UTF-8 round-trip 으로 정화하여 surrogate 는 '?' 치환, 정상 문자는 보존.
    """
    if isinstance(obj, str):
        return obj.encode("utf-8", "replace").decode("utf-8", "replace")
    if isinstance(obj, dict):
        return {k: _sanitize_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_json(x) for x in obj]
    return obj


def update_job(job_id: int, data: dict):
    """crawl_jobs 업데이트 (PATCH). 저장 전 _sanitize_json 으로 surrogate 제거."""
    try:
        requests.patch(
            f"{SUPABASE_URL}/rest/v1/crawl_jobs",
            params={"id": f"eq.{job_id}"},
            json=_sanitize_json(data),
            headers={**_headers(), "Prefer": "return=minimal"},
            timeout=30,
        )
    except requests.exceptions.RequestException as e:
        logger.warning(f"Job 업데이트 실패: {e}")


def check_cancel_intent(job_id: int) -> bool:
    """사용자가 cancel 의도를 DB 에 기록했는가 (2중 제어 모델).

    status 가 아닌 intent 컬럼을 본다. 사용자의 "정지" 클릭은
    route.ts PATCH 에서 intent='cancel' 로 기록되므로, 이 플래그만 보면
    크롤러가 깔끔하게 self-stop 가능.
    """
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/crawl_jobs",
            params={"id": f"eq.{job_id}", "select": "intent"},
            headers=_headers(),
            timeout=10,
        )
        rows = resp.json()
        return bool(rows) and rows[0].get("intent") == "cancel"
    except requests.exceptions.RequestException:
        return False


# ══════════════════════════════════════════════
# 체크포인트 빌드
# ══════════════════════════════════════════════

def build_checkpoint(progress: CrawlProgress) -> dict:
    """CrawlProgress → checkpoint dict (재개용)"""
    return {
        "position": {
            "do_idx": progress.do_current - 1,
            "do_name": progress.do_name,
            "do_total": progress.do_total,
            "si_idx": progress.si_current - 1,
            "si_name": progress.si_name,
            "si_total": progress.si_total,
            "gu_idx": progress.gu_current - 1,
            "gu_name": progress.gu_name,
            "gu_total": progress.gu_total,
            "dong_idx": progress.dong_current - 1,
            "dong_name": progress.dong_name,
            "dong_total": progress.dong_total,
            "li_idx": progress.li_current - 1,
            "li_name": progress.li_name,
            "li_total": progress.li_total,
            "jibun_idx": progress.jibun_current - 1,
            "jibun_name": progress.jibun_name,
            "jibun_total": progress.jibun_total,
        },
        "stats": {
            "processed": progress.processed,
            "found": progress.found,
            "errors": progress.errors,
        },
    }


def build_progress_json(progress: CrawlProgress, geocoded: int = 0) -> dict:
    """CrawlProgress → progress JSONB (모니터링용)"""
    result = {
        "processed": progress.processed,
        "found": progress.found,
        "errors": progress.errors,
        "geocoded": geocoded,
        "current_address": progress.current_address,
        "phase": progress.phase,
        "addr_parts": {
            "sido": progress.do_name,
            "si": progress.si_name,
            "gu": progress.gu_name,
            "dong": progress.dong_name,
            "li": progress.li_name,
            "jibun": progress.jibun_name,
        },
        "indices": {
            "do": [progress.do_current, progress.do_total],
            "si": [progress.si_current, progress.si_total],
            "gu": [progress.gu_current, progress.gu_total],
            "dong": [progress.dong_current, progress.dong_total],
            "li": [progress.li_current, progress.li_total],
            "jibun": [progress.jibun_current, progress.jibun_total],
        },
    }
    if progress.recent_errors:
        result["recent_errors"] = progress.recent_errors
    return result


# ══════════════════════════════════════════════
# 자동 재시작 (타임아웃 / 반복 모드)
# ══════════════════════════════════════════════

GITHUB_PAT = os.environ.get("GH_PAT", "")
GITHUB_REPO = os.environ.get("GITHUB_REPO", "")

def auto_continue(job: dict, checkpoint: dict | None, thread: int):
    """새 Job 생성 + GitHub Actions 자동 트리거 (3회 재시도).

    [심층 방어] 호출 직전에 thread 의 최신 cancel 의도를 한 번 더 확인.
    run() 에서 이미 체크하지만 호출과 POST 사이 race 가 있을 수 있음.
    """
    mode = job.get("mode", "single")
    cycle_count = job.get("cycle_count", 0)
    parent_job_id = job.get("id")

    # 부모 Job 의 intent 재확인 (race 방어선)
    if parent_job_id and check_cancel_intent(parent_job_id):
        logger.info(f"auto_continue 취소: 부모 Job #{parent_job_id} 에 cancel 의도 감지")
        return

    logger.info(f"자동 재시작: mode={mode}, cycle={cycle_count}")

    try:
        # 1. 새 crawl_jobs row 생성 (intent 는 DEFAULT 'run' 사용)
        new_job = {
            "sido": job["sido"],
            "si": job.get("si"),
            "gu": job.get("gu"),
            "dong": job.get("dong"),
            "li": job.get("li"),
            "options": job.get("options") or {},
            "checkpoint": checkpoint,
            "requested_by": job.get("requested_by"),
            "thread": thread,
            "mode": mode,
            "cycle_count": cycle_count,
            "max_cycles": job.get("max_cycles"),
        }
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/crawl_jobs",
            json=_sanitize_json(new_job),
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            timeout=30,
        )
        if resp.status_code not in (200, 201):
            logger.error(f"자동 재시작 실패 — Job 생성 오류: {resp.text[:300]}")
            return

        created = resp.json()
        new_id = created[0]["id"] if isinstance(created, list) else created["id"]
        logger.info(f"새 Job #{new_id} 생성 완료 (thread={thread})")

        # 2. GitHub Actions 트리거 (3회 재시도)
        if not GITHUB_PAT or not GITHUB_REPO:
            logger.warning("GITHUB_PAT/GITHUB_REPO 없음 — 수동으로 이어서 추출해주세요")
            return

        for attempt in range(1, 4):
            try:
                gh_resp = requests.post(
                    f"https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/crawl.yml/dispatches",
                    json={
                        "ref": "main",
                        "inputs": {
                            "job_id": str(new_id),
                            "thread": str(thread),
                        },
                    },
                    headers={
                        "Authorization": f"token {GITHUB_PAT}",
                        "Accept": "application/vnd.github.v3+json",
                    },
                    timeout=30,
                )
                if gh_resp.status_code == 204:
                    logger.info(f"GitHub Actions 트리거 성공 (시도 {attempt}/3) — Job #{new_id}")
                    return
                logger.warning(f"트리거 실패 (시도 {attempt}/3, HTTP {gh_resp.status_code})")
            except requests.exceptions.RequestException as e:
                logger.warning(f"트리거 네트워크 오류 (시도 {attempt}/3): {e}")
            time.sleep(5 * attempt)  # 5, 10, 15초 대기

        logger.warning("GitHub Actions 트리거 3회 실패 — cron이 자동 픽업하거나 수동으로 이어서 추출해주세요")

    except Exception as e:
        logger.error(f"자동 재시작 중 예외: {e}")
        logger.warning("웹 UI에서 수동으로 이어서 추출해주세요")


# ══════════════════════════════════════════════
# 메인 실행
# ══════════════════════════════════════════════

def run(job: dict, thread: int):
    """크롤링 실행"""
    job_id = job["id"]
    mode = job.get("mode", "single")
    cycle_count = job.get("cycle_count", 0)
    max_cycles = job.get("max_cycles")
    logger.info(f"=== Job #{job_id} 시작: {job['sido']} (thread={thread}, mode={mode}, cycle={cycle_count}) ===")

    # 옵션 파싱
    options = job.get("options") or {}
    delay = options.get("delay", 0.5)
    fetch_step = options.get("fetch_step_data", False)
    flush_size = options.get("flush_size", FLUSH_SIZE)
    progress_interval = options.get("progress_interval", PROGRESS_INTERVAL)

    # 체크포인트 (재개용)
    checkpoint = job.get("checkpoint")
    resume_from = checkpoint.get("position") if checkpoint else None
    resume_stats = checkpoint.get("stats") if checkpoint else None

    if resume_from:
        logger.info(f"체크포인트에서 재개: {resume_from.get('do_name', '')} "
                     f"{resume_from.get('si_name', '')} ...")

    # 모드별 타임아웃
    timeout_seconds = MODE_TIMEOUT.get(mode, MODE_TIMEOUT["single"])

    # GitHub Actions run ID 기록
    github_run_id = os.environ.get("GITHUB_RUN_ID")
    update_job(job_id, {
        "status": "running",
        "started_at": "now()",
        "last_heartbeat": "now()",
        **({"github_run_id": int(github_run_id)} if github_run_id else {}),
    })

    # 크롤러 + DB Writer
    db_writer = CrawlDbWriter(SUPABASE_URL, SUPABASE_KEY, flush_size=flush_size)
    crawler = KepcoСrawler(
        delay=delay,
        fetch_step_data=fetch_step,
        on_log=lambda msg: logger.info(msg),
    )

    # 타임아웃 타이머
    timeout_triggered = threading.Event()

    def on_timeout():
        logger.warning(f"타임아웃 ({timeout_seconds}초) — 크롤링을 중지합니다.")
        timeout_triggered.set()
        crawler.stop()

    timer = threading.Timer(timeout_seconds, on_timeout)
    timer.daemon = True
    timer.start()

    # ── 콜백 ──
    call_count = [0]

    def on_progress(progress: CrawlProgress):
        """경량 — 매 progress_interval건마다 실행"""
        call_count[0] += 1
        if call_count[0] % progress_interval == 0:
            update_job(job_id, {
                "progress": build_progress_json(progress, db_writer.get_stats().get("geocoded", 0)),
                "last_heartbeat": "now()",
            })
            if check_cancel_intent(job_id):
                logger.info("cancel 의도 감지 — 크롤링을 중지합니다.")
                crawler.stop()

    def on_result(result: CrawlResult):
        """무거움 — flush 시 UPSERT + 지오코딩 + MV + checkpoint"""
        flushed = db_writer.add(result)
        if flushed:
            update_job(job_id, {
                "progress": build_progress_json(crawler.progress, db_writer.get_stats().get("geocoded", 0)),
                "checkpoint": build_checkpoint(crawler.progress),
                "last_heartbeat": "now()",
            })

    crawler.on_progress = on_progress
    crawler.on_result = on_result

    # 크롤링 실행
    try:
        crawler.crawl(
            addr_do=job.get("sido"),
            addr_si=job.get("si"),
            addr_gu=job.get("gu"),
            addr_dong=job.get("dong"),
            addr_li=job.get("li"),
            resume_from=resume_from,
            resume_stats=resume_stats,
        )
    except Exception as e:
        logger.error(f"크롤링 중 예외: {e}")
        db_writer.flush()
        fail_progress = build_progress_json(crawler.progress)
        if crawler.progress.all_errors:
            fail_progress["all_errors"] = crawler.progress.all_errors
        update_job(job_id, {
            "status": "failed",
            "error_message": str(e)[:1000],
            "progress": fail_progress,
            "checkpoint": build_checkpoint(crawler.progress),
            "completed_at": "now()",
        })
        timer.cancel()
        return

    # 잔여 버퍼 flush
    db_writer.flush()

    # MV 새로고침
    db_writer.refresh_mv()

    # ── 최종 상태 결정 (2중 제어 모델) ──
    #   failed    = 크롤 중 예외 발생 → Worker 가 재개 여부 판단
    #   cancelled = 사용자 cancel 의도 감지 (crawler.is_stopped() 호출됨, timeout 아님)
    #   completed = 정상 완료 또는 타임아웃 (checkpoint 유무로 "전체 끝" vs "이어받기" 구별)
    if crawler._error is not None:
        final_status = "failed"
    elif timeout_triggered.is_set():
        # 타임아웃 → completed. auto_continue 가 checkpoint 로 이어받음.
        final_status = "completed"
    elif crawler.is_stopped():
        # check_cancel_intent 로 인해 stop() 호출된 경우
        final_status = "cancelled"
    else:
        final_status = "completed"

    checkpoint = build_checkpoint(crawler.progress)
    stats = db_writer.get_stats()
    logger.info(f"=== Job #{job_id} 종료: status={final_status}, "
                f"upserted={stats['upserted']}, errors={stats['errors']}, "
                f"geocoded={stats.get('geocoded', 0)} ===")

    final_progress = build_progress_json(crawler.progress)
    if crawler.progress.all_errors:
        final_progress["all_errors"] = crawler.progress.all_errors

    update_data = {
        "status": final_status,
        "progress": final_progress,
        "checkpoint": checkpoint,
        "completed_at": "now()",
    }
    if crawler._error is not None:
        update_data["error_message"] = str(crawler._error)[:1000]
    update_job(job_id, update_data)

    timer.cancel()

    # ── 자동 재시작 (2중 제어 모델) ──
    # cancelled/failed → 절대 재시작 안 함
    # completed → (timeout 이면 이어받기 / recurring 이면 다음 사이클)
    # 단, 그 사이 사용자가 cancel 의도 냈으면 무조건 스킵
    if final_status in ("cancelled", "failed"):
        logger.info(f"{final_status} — 자동 재시작 없음")
        return

    # [최후의 안전장치] 크롤 종료와 cancel 클릭이 경쟁할 수 있으므로 재확인
    if check_cancel_intent(job_id):
        logger.info("cancel 의도 감지 — 자동 재시작 스킵")
        return

    restart_count = (job.get("options") or {}).get("_restart_count", 0)

    if timeout_triggered.is_set():
        # 타임아웃 → 체크포인트에서 이어서 (single/recurring 공통)
        if checkpoint and restart_count < MAX_AUTO_RESTARTS:
            next_options = dict(options)
            next_options["_restart_count"] = restart_count + 1
            next_job = {**job, "options": next_options, "cycle_count": cycle_count}
            auto_continue(next_job, checkpoint, thread)
        elif restart_count >= MAX_AUTO_RESTARTS:
            logger.warning(f"자동 재시작 한도 도달 ({MAX_AUTO_RESTARTS}회)")

    elif mode == "recurring":
        # 정상 완료 + 반복 모드 → 다음 순환 시작
        new_cycle = cycle_count + 1
        if max_cycles and new_cycle >= max_cycles:
            logger.info(f"반복 모드: 최대 순환 횟수 도달 ({max_cycles}회) — 종료")
        else:
            logger.info(f"반복 모드: 순환 {new_cycle}회차 시작")
            next_options = dict(options)
            next_options["_restart_count"] = 0  # 새 순환은 restart_count 리셋
            next_job = {**job, "options": next_options, "cycle_count": new_cycle}
            auto_continue(next_job, None, thread)  # checkpoint=None → 처음부터


def main():
    """
    2중 제어 모델 진입점.
    - --job-id 는 필수. API 또는 auto_continue 가 만든 pending Job 의 id 를 받음.
    - 과거의 --job-id=0 자동 픽업 경로는 제거됨 (cron 안전망과 세트였음).
    - 좀비 정리는 Worker (/api/reconcile) 가 담당.
    """
    parser = argparse.ArgumentParser(description="KEPCO 크롤링 실행")
    parser.add_argument("--job-id", type=int, required=True,
                        help="crawl_jobs ID (필수)")
    parser.add_argument("--thread", type=int, default=1,
                        help="스레드 번호 (1~5)")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("SUPABASE_URL, SUPABASE_SERVICE_KEY 환경 변수가 필요합니다.")
        sys.exit(1)

    if args.job_id <= 0:
        logger.error("--job-id 필수 (자동 픽업 경로는 제거됨). Worker 또는 UI 에서 Job 을 먼저 만드세요.")
        sys.exit(1)

    thread = args.thread
    job = read_job(args.job_id)
    if not job:
        logger.error(f"Job #{args.job_id}을(를) 찾을 수 없습니다.")
        sys.exit(1)

    # 실행 전 의도 확인 — cancel 이면 즉시 종료
    if job.get("intent") == "cancel":
        logger.info(f"Job #{args.job_id} 은 cancel 의도 상태 — 실행하지 않습니다.")
        sys.exit(0)

    # pending 만 실행 대상. running/completed/failed/cancelled 는 부적격.
    if job["status"] != "pending":
        logger.error(f"Job #{args.job_id} 상태가 '{job['status']}' — pending 만 실행 가능.")
        sys.exit(1)

    logger.info(f"스레드 {thread}: Job #{job['id']} 선택: {job['sido']} (status={job['status']})")
    run(job, thread)


if __name__ == "__main__":
    main()
