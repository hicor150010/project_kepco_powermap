---
name: 크롤 2중 제어 모델 — intent/status 분리 + 방어선 통합
description: 2026-04-23 재설계. 사용자 의도(intent)와 실제(status)를 DB 컬럼으로 분리. cron 안전망 제거
type: feedback
---

## 핵심 규칙

**DB `crawl_jobs` 에는 2개 레이어가 공존한다:**

| 레이어 | 컬럼 | 누가 수정 | 의미 |
|--------|------|----------|------|
| 의도 (desired) | `intent` (run/cancel), `requested_by` | UI/API 만 | "사용자가 원한 것" |
| 관측 (actual) | `status` (pending/running/completed/cancelled/failed), `github_run_id`, `last_heartbeat` | 크롤러/Worker/API 만 | "실제로 일어난 것" |

**UI 는 관측 레이어만 표시, 의도 레이어는 Worker/크롤러가 읽는 지시문.**

## Why (이 모델이 있는 이유)

**2026-04-21 ~ 04-23 실제 겪은 문제 3종 세트:**

1. **유령 Job 부활**: 9일 전 pending 이 `*/5 * * * *` cron 안전망에 자동 픽업됨 (`--job-id=0` 무조건 선택)
2. **사용자 cancel 무시**: recurring 한 사이클 완료 시점에 auto_continue 가 사용자 의도 확인 없이 다음 사이클 dispatch
3. **크롤러 돌연사 방치**: heartbeat 끊겨도 "running" 으로 남아 사용자가 새 수집 시작 못함

세 문제 모두 **"의도와 실제가 분리되지 않은 단일 status 컬럼"** 탓.

## How to apply (미래 비슷한 상황)

### ✅ 유지해야 할 것

- **cron 안전망 없는 상태 유지.** GitHub Actions 의 `schedule` + `--job-id=0` 자동 픽업은 재도입 금지.
  - 크롤링은 오직 **명시적 의도** 에서 출발해야 한다: UI 클릭 / auto_continue / 수동 재개.
- **크롤러의 `check_cancel_intent()` self-check 유지.** 10건마다 DB intent 읽어서 self-stop.
- **PATCH API 의 3분 heartbeat 좀비 즉시 처분 유지.**

### 🛑 하지 말아야 할 것

- `inputs.thread || '1'` 같은 방어 fallback 을 "단순화" 명목으로 제거 금지 (4c638c8 커밋 사고 참조).
- `status='stop_requested'`, `status='stopped'` 같은 중간 상태 재도입 금지. 의도는 intent, 관측은 status 로 분리.
- Worker (`/api/reconcile`) 가 GitHub 을 **읽는** 경로 추가 금지. DB 만 읽고 GitHub 에 쓰기만. (크롤러가 자기 상태 정직하게 쓴다는 계약을 신뢰.)

### 📖 참고 파일

- 마이그레이션: [db/migrations/029_crawl_jobs_redesign.sql](../../db/migrations/029_crawl_jobs_redesign.sql)
- 크롤러 intent 체크: [crawler/run_crawl.py](../../crawler/run_crawl.py) `check_cancel_intent`
- API PATCH 분기: [web/app/api/admin/crawl/route.ts](../../web/app/api/admin/crawl/route.ts)
- Worker: [web/app/api/reconcile/route.ts](../../web/app/api/reconcile/route.ts) (수동, pg_cron 은 추후)
- 아키텍처 문서: [docs/CRAWLING.md](../../docs/CRAWLING.md) §5, §6, §9

## 재발 신호

다음 증상 보이면 2중 제어 원칙이 깨진 것:
- UI "정지" 눌렀는데 배지가 영원히 "정지 요청 중"
- 사용자가 안 시작한 Job 이 자동으로 돎
- `status='running'` 인데 heartbeat 이 과거 시각
- crawl_jobs 가 `stopped`/`stop_requested` 상태값 쓰기 시작함

대응: 이 메모리 + [feedback_crawl_zombie_jobs.md](feedback_crawl_zombie_jobs.md) 의 "원인 추정" 섹션 읽고 구조 점검.