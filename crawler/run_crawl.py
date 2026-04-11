"""
KEPCO 크롤링 엔트리포인트 (GitHub Actions용)
- 멀티스레드 지원 (스레드 1/2/3 독립 실행)
- 1회/반복 모드
- crawl_jobs 테이블에서 작업 읽기
- 스트리밍 flush (100건 단위)
- 10건마다 progress 업데이트
- 100건마다 checkpoint 저장 + stop 체크
- 타임아웃 보호 (모드별 상이)
"""
import argparse
import json
import logging
import os
import signal
import sys
import threading
import time
from datetime import datetime, timedelta, timezone

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


def find_next_job(thread: int) -> dict | None:
    """해당 스레드의 다음 작업 찾기 (우선순위: pending > stopped+checkpoint)"""
    # 1) pending 우선
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/crawl_jobs",
        params={
            "status": "eq.pending",
            "thread": f"eq.{thread}",
            "order": "created_at.asc",
            "limit": "1",
            "select": "*",
        },
        headers=_headers(),
        timeout=30,
    )
    rows = resp.json()
    if rows:
        return rows[0]

    # 2) stopped + checkpoint 있는 것 (타임아웃 재개)
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/crawl_jobs",
        params={
            "status": "eq.stopped",
            "thread": f"eq.{thread}",
            "checkpoint": "not.is.null",
            "order": "created_at.asc",
            "limit": "1",
            "select": "*",
        },
        headers=_headers(),
        timeout=30,
    )
    rows = resp.json()
    return rows[0] if rows else None


def update_job(job_id: int, data: dict):
    """crawl_jobs 업데이트 (PATCH)"""
    try:
        requests.patch(
            f"{SUPABASE_URL}/rest/v1/crawl_jobs",
            params={"id": f"eq.{job_id}"},
            json=data,
            headers={**_headers(), "Prefer": "return=minimal"},
            timeout=30,
        )
    except requests.exceptions.RequestException as e:
        logger.warning(f"Job 업데이트 실패: {e}")


def check_stop_requested(job_id: int) -> bool:
    """stop_requested 상태인지 확인"""
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/crawl_jobs",
            params={"id": f"eq.{job_id}", "select": "status"},
            headers=_headers(),
            timeout=10,
        )
        rows = resp.json()
        return rows and rows[0].get("status") == "stop_requested"
    except requests.exceptions.RequestException:
        return False


# ══════════════════════════════════════════════
# 좀비 Job 정리
# ══════════════════════════════════════════════

def cleanup_zombie_jobs(thread: int):
    """running인데 heartbeat가 30분 이상 없는 Job을 failed로 전환"""
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/crawl_jobs",
            params={
                "status": "eq.running",
                "thread": f"eq.{thread}",
                "last_heartbeat": f"lt.{cutoff}",
                "select": "id",
            },
            headers=_headers(),
            timeout=30,
        )
        zombies = resp.json()
        for z in zombies:
            logger.warning(f"좀비 Job #{z['id']} 감지 — failed로 전환")
            update_job(z["id"], {
                "status": "failed",
                "error_message": "좀비 Job 감지: heartbeat 30분 이상 없음",
                "completed_at": "now()",
            })
    except Exception as e:
        logger.warning(f"좀비 정리 중 오류: {e}")


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
    """새 Job 생성 + GitHub Actions 자동 트리거 (3회 재시도)"""
    mode = job.get("mode", "single")
    cycle_count = job.get("cycle_count", 0)
    logger.info(f"자동 재시작: mode={mode}, cycle={cycle_count}")

    try:
        # 1. 새 crawl_jobs row 생성
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
            json=new_job,
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
            if check_stop_requested(job_id):
                logger.info("중단 요청 감지 — 크롤링을 중지합니다.")
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

    # 최종 상태 결정
    if timeout_triggered.is_set():
        final_status = "stopped"
    elif crawler.is_stopped():
        final_status = "stopped"
    else:
        final_status = "completed"

    checkpoint = build_checkpoint(crawler.progress)
    stats = db_writer.get_stats()
    logger.info(f"=== Job #{job_id} 완료: status={final_status}, "
                f"upserted={stats['upserted']}, errors={stats['errors']}, "
                f"geocoded={stats.get('geocoded', 0)} ===")

    final_progress = build_progress_json(crawler.progress)
    if crawler.progress.all_errors:
        final_progress["all_errors"] = crawler.progress.all_errors

    update_job(job_id, {
        "status": final_status,
        "progress": final_progress,
        "checkpoint": checkpoint,
        "completed_at": "now()",
    })

    timer.cancel()

    # ── 자동 재시작 로직 (모드별) ──
    restart_count = (job.get("options") or {}).get("_restart_count", 0)

    if mode == "single":
        # 1회 모드: 타임아웃 시에만 체이닝 (기존 로직)
        if timeout_triggered.is_set() and checkpoint and restart_count < MAX_AUTO_RESTARTS:
            next_options = dict(options)
            next_options["_restart_count"] = restart_count + 1
            next_job = {**job, "options": next_options}
            auto_continue(next_job, checkpoint, thread)
        elif timeout_triggered.is_set() and restart_count >= MAX_AUTO_RESTARTS:
            logger.warning(f"자동 재시작 한도 도달 ({MAX_AUTO_RESTARTS}회)")

    elif mode == "recurring":
        if final_status == "stopped" and not timeout_triggered.is_set():
            # 사용자가 수동 중단 → 체이닝 안 함
            logger.info("반복 모드: 사용자 중단 — 체이닝 중지")
        elif timeout_triggered.is_set():
            # 타임아웃: 체크포인트에서 이어서 재시작
            if restart_count < MAX_AUTO_RESTARTS:
                next_options = dict(options)
                next_options["_restart_count"] = restart_count + 1
                next_job = {**job, "options": next_options, "cycle_count": cycle_count}
                auto_continue(next_job, checkpoint, thread)
        elif final_status == "completed":
            # 한 바퀴 완료: 다음 순환
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
    parser = argparse.ArgumentParser(description="KEPCO 크롤링 실행")
    parser.add_argument("--job-id", type=int, default=0,
                        help="crawl_jobs ID (0=자동 선택)")
    parser.add_argument("--thread", type=int, default=1,
                        help="스레드 번호 (1/2/3)")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("SUPABASE_URL, SUPABASE_SERVICE_KEY 환경 변수가 필요합니다.")
        sys.exit(1)

    thread = args.thread

    # 좀비 Job 정리
    cleanup_zombie_jobs(thread)

    # Job 찾기
    if args.job_id > 0:
        job = read_job(args.job_id)
        if not job:
            logger.error(f"Job #{args.job_id}을(를) 찾을 수 없습니다.")
            sys.exit(1)
        if job["status"] not in ("pending", "stopped"):
            logger.error(f"Job #{args.job_id} 상태가 '{job['status']}'입니다. "
                         f"pending 또는 stopped만 실행 가능합니다.")
            sys.exit(1)
    else:
        job = find_next_job(thread)
        if not job:
            logger.info(f"스레드 {thread}: 실행할 작업이 없습니다.")
            sys.exit(0)

    logger.info(f"스레드 {thread}: Job #{job['id']} 선택: {job['sido']} (status={job['status']})")
    run(job, thread)


if __name__ == "__main__":
    main()
