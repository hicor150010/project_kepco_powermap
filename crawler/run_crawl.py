"""
KEPCO 크롤링 엔트리포인트 (GitHub Actions용)
- crawl_jobs 테이블에서 작업 읽기
- 스트리밍 flush (500건 단위)
- 10건마다 progress 업데이트
- 500건마다 checkpoint 저장 + stop 체크
- 타임아웃 보호 (5시간 50분)
"""
import argparse
import json
import logging
import os
import signal
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
TIMEOUT_SECONDS = 5 * 3600 + 50 * 60  # 5시간 50분


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


def find_next_job() -> dict | None:
    """자동 실행: 가장 오래된 pending 또는 stopped(checkpoint 있는) job 찾기"""
    # 1) pending 우선
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/crawl_jobs",
        params={
            "status": "eq.pending",
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

    # 2) stopped + checkpoint 있는 것
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/crawl_jobs",
        params={
            "status": "eq.stopped",
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


def build_progress_json(progress: CrawlProgress) -> dict:
    """CrawlProgress → progress JSONB (모니터링용)"""
    return {
        "processed": progress.processed,
        "found": progress.found,
        "errors": progress.errors,
        "current_address": progress.current_address,
        "phase": progress.phase,
    }


# ══════════════════════════════════════════════
# 메인 실행
# ══════════════════════════════════════════════

def run(job: dict):
    """크롤링 실행"""
    job_id = job["id"]
    logger.info(f"=== Job #{job_id} 시작: {job['sido']} ===")

    # 옵션 파싱
    options = job.get("options") or {}
    delay = options.get("delay", 0.5)
    fetch_step = options.get("fetch_step_data", False)
    flush_size = options.get("flush_size", FLUSH_SIZE)

    # 체크포인트 (재개용)
    checkpoint = job.get("checkpoint")
    resume_from = checkpoint.get("position") if checkpoint else None
    resume_stats = checkpoint.get("stats") if checkpoint else None

    if resume_from:
        logger.info(f"체크포인트에서 재개: {resume_from.get('do_name', '')} "
                     f"{resume_from.get('si_name', '')} ...")

    # GitHub Actions run ID 기록
    github_run_id = os.environ.get("GITHUB_RUN_ID")
    update_job(job_id, {
        "status": "running",
        "started_at": "now()",
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
        logger.warning(f"타임아웃 ({TIMEOUT_SECONDS}초) — 크롤링을 중지합니다.")
        timeout_triggered.set()
        crawler.stop()

    timer = threading.Timer(TIMEOUT_SECONDS, on_timeout)
    timer.daemon = True
    timer.start()

    # 결과 카운터 (progress 업데이트 주기 제어)
    result_count = [0]

    def on_result(result: CrawlResult):
        """매 결과마다 호출 — 버퍼 추가 + 주기적 작업"""
        result_count[0] += 1
        flushed = db_writer.add(result)

        # 10건마다 progress 업데이트 (경량)
        if result_count[0] % PROGRESS_INTERVAL == 0:
            update_job(job_id, {
                "progress": build_progress_json(crawler.progress),
            })

        # flush 발생 시 (500건마다): checkpoint + stop 체크
        if flushed:
            update_job(job_id, {
                "progress": build_progress_json(crawler.progress),
                "checkpoint": build_checkpoint(crawler.progress),
            })
            # stop 요청 확인
            if check_stop_requested(job_id):
                logger.info("중단 요청 감지 — 크롤링을 중지합니다.")
                crawler.stop()

    crawler.on_result = on_result

    # 크롤링 실행
    # -기타지역은 크롤러에 그대로 전달 (크롤러 내부에서 처리)
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
        update_job(job_id, {
            "status": "failed",
            "error_message": str(e)[:1000],
            "progress": build_progress_json(crawler.progress),
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
    if timeout_triggered.is_set() or crawler.is_stopped():
        final_status = "stopped"
    else:
        final_status = "completed"

    stats = db_writer.get_stats()
    logger.info(f"=== Job #{job_id} 완료: status={final_status}, "
                f"upserted={stats['upserted']}, errors={stats['errors']} ===")

    update_job(job_id, {
        "status": final_status,
        "progress": build_progress_json(crawler.progress),
        "checkpoint": build_checkpoint(crawler.progress),
        "completed_at": "now()",
    })

    timer.cancel()


def main():
    parser = argparse.ArgumentParser(description="KEPCO 크롤링 실행")
    parser.add_argument("--job-id", type=int, default=0,
                        help="crawl_jobs ID (0=자동 선택)")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("SUPABASE_URL, SUPABASE_SERVICE_KEY 환경 변수가 필요합니다.")
        sys.exit(1)

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
        job = find_next_job()
        if not job:
            logger.info("실행할 작업이 없습니다.")
            sys.exit(0)

    logger.info(f"Job #{job['id']} 선택: {job['sido']} (status={job['status']})")
    run(job)


if __name__ == "__main__":
    main()
