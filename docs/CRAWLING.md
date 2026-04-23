# 크롤링 시스템 아키텍처

> 최종 수정: 2026-04-23 (2중 제어 모델 재설계 반영)

---

## 1. 개요

KEPCO 배전선로 여유용량 데이터를 자동으로 수집하는 시스템.
GitHub Actions에서 크롤러를 실행하고, Supabase에 데이터를 저장한다.

---

## 2. 멀티스레드 구조

```
crawl.yml (워크플로우 1개, workflow_dispatch 전용)
  ├─ "KEPCO Crawl (스레드 1)" → concurrency: kepco-crawl-1
  ├─ "KEPCO Crawl (스레드 2)" → concurrency: kepco-crawl-2
  ├─ "KEPCO Crawl (스레드 3)" → concurrency: kepco-crawl-3
  ├─ "KEPCO Crawl (스레드 4)" → concurrency: kepco-crawl-4
  └─ "KEPCO Crawl (스레드 5)" → concurrency: kepco-crawl-5

각 스레드 → python run_crawl.py --thread=N --job-id=X  (--job-id 필수)
             (같은 코드, 같은 크롤러)
```

- **5개 독립 스레드** — 동시 실행 가능
- 각 스레드는 독립적인 crawl_jobs row를 가짐
- concurrency group이 분리되어 서로 간섭 없음
- GitHub Actions 동시 실행 한도: 20개 (우리는 최대 5개 사용)

### 모드

| 모드 | 설명 | 타이머 | 완료 후 |
|------|------|--------|---------|
| `single` | 1회 수집 후 종료 | 5시간 50분 | 끝 (checkpoint 있으면 auto_continue 로 이어받음) |
| `recurring` | 무한 순환 수집 | 5시간 50분 | auto_continue 가 다음 사이클 시작 |

---

## 3. 데이터 흐름

```
KEPCO API → 크롤러 (crawler.py)
    ↓ (100건 버퍼)
1. kepco_addr UPSERT (주소 마스터)
    ↓
2. kepco_capa UPSERT (용량 데이터, addr_id FK)
    ↓
3. 지오코딩 (카카오 REST API) → lat/lng 업데이트
    ↓
4. MV 새로고침 (kepco_map_summary)
    ↓
체크포인트 저장 (crawl_jobs.checkpoint)
```

### flush 사이클 (100건마다)

1. kepco_addr UPSERT (캐시 miss인 주소만, 응답으로 addr_id 캐시)
2. kepco_capa UPSERT (addr_id 붙여서, return=minimal)
3. Materialized View 새로고침 (1시간 간격, 웹 새로고침 버튼으로도 수동 가능)

> **좌표 채우기**: 2026-04-22 부터 크롤러는 주소만 저장. lat/lng 는 별도 배치 워커 (`crawler/fill_kepco_coords.py`, VWorld + PNU) 담당.

> **2026-04-22**: 기존 5·6단계(ref 스냅샷 동기화 + 변화 감지)는 비교 기능 리팩토링으로 제거됨.
> 폐기된 설계 기록은 [COMPARE.md](./COMPARE.md) 참조.

---

## 4. 핵심 파일

| 파일 | 역할 |
|------|------|
| `.github/workflows/crawl.yml` | GitHub Actions 워크플로우 (workflow_dispatch 전용, 스레드 1~5 matrix) |
| `crawler/run_crawl.py` | 엔트리포인트 (Job 관리, 타이머, 체이닝, check_cancel_intent) |
| `crawler/crawler.py` | KEPCO API 크롤링 로직 |
| `crawler/api_client.py` | HTTP 클라이언트 (세션, 재시도, 차단 우회) |
| `crawler/crawl_to_db.py` | DB UPSERT + 지오코딩 + MV 새로고침 |
| `web/app/api/admin/crawl/route.ts` | Job CRUD API (intent 기반 POST/PATCH/DELETE) |
| `web/app/api/reconcile/route.ts` | **Worker (수동, pg_cron 추후)** — intent/status 불일치 보정 |
| `web/lib/crawler.ts` | CrawlJob 타입 + displayStatus helper (intent-aware 배지) |
| `web/components/admin/CrawlManager.tsx` | 관리 UI (탭, 폼) |
| `web/components/admin/ActiveJobCard.tsx` | 실행 중 상세 카드 + 정지 버튼 |

---

## 5. DB 스키마 (crawl_jobs)

**2026-04-23 재설계**: 2중 제어 모델 — 의도(`intent`) 와 관측(`status`) 분리.  
상세 DDL: [db/migrations/029_crawl_jobs_redesign.sql](../db/migrations/029_crawl_jobs_redesign.sql)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL | PK |
| sido, si, gu, dong, li | TEXT | 수집 대상 지역 |
| **intent** | **TEXT** | **`run` (실행/계속) \| `cancel` (정지)** — UI/API 만 수정 |
| **status** | **TEXT** | **`pending` → `running` → (`completed` \| `cancelled` \| `failed`)** — 크롤러/Worker 만 수정 |
| thread | INT | 스레드 번호 (1~5) |
| mode | TEXT | single / recurring |
| cycle_count | INT | 현재 순환 횟수 |
| max_cycles | INT | 최대 순환 (null=무제한) |
| progress | JSONB | 실시간 진행 상황 |
| checkpoint | JSONB | 재개용 체크포인트 (null=처음부터) |
| options | JSONB | delay, flush_size 등 |
| last_heartbeat | TIMESTAMPTZ | 좀비 감지용 (3분+ 끊기면 좀비) |
| github_run_id | BIGINT | Actions run ID (cancel API 호출에 필요) |
| error_message | TEXT | 실패 시 에러 / cancel 사유 |
| requested_by | UUID | 요청 관리자 |
| created_at, started_at, completed_at | TIMESTAMPTZ | 시간 |

**상태값 2개 제거**: `stopped` (타임아웃 재개) → `completed + checkpoint` 로 통합, `stop_requested` → `intent='cancel'` 로 대체.

---

## 6. 안전장치

| 항목 | 방법 | 위치 |
|------|------|------|
| 스레드 내 동시 실행 방지 | concurrency group | crawl.yml |
| DB 충돌 방지 | UPSERT (merge-duplicates) | crawl_to_db.py |
| **사용자 cancel 의도 존중** | `intent='cancel'` 컬럼, 크롤러가 10건마다 `check_cancel_intent()` | run_crawl.py |
| **좀비 Job 감지** | **heartbeat 3분+ 끊김 → PATCH 에서 즉시 `status='cancelled'`** | route.ts PATCH |
| **정지 타이밍 허점 방지** | API 가 GH cancel await + 202 응답 시 `status='cancelled'` 직접 마킹 | route.ts PATCH |
| 체이닝 (타임아웃 재개) | crawler 자신이 auto_continue → 새 Job + dispatch | run_crawl.py auto_continue() |
| 트리거 실패 복구 | 3회 재시도 + intent='cancel' 재확인 | run_crawl.py |
| 반복 무한루프 방지 | max_cycles 설정 | run_crawl.py |
| KEPCO 차단 방지 | 세션 재생성, UA 랜덤, 점진적 백오프 | api_client.py |
| 주소 목록 수신 실패 복구 | 세션 재생성 + 5/15/30초 점진 대기 재시도 (§10) | crawler.py `_safe_get_addr_list` |
| 체크포인트 일관성 | 레벨 진입 시 하위 인덱스 리셋 (§10) | crawler.py `_reset_progress_below` |
| MV 새로고침 부하 방지 | 1시간 간격 제한 (time.time() 기반) | crawl_to_db.py |
| **(선택) Worker 재조정** | `/api/reconcile` 엔드포인트 — 현재 수동, pg_cron 붙이면 자동 | app/api/reconcile/route.ts |

### ❌ 제거된 안전장치 (2026-04-23)

| 항목 | 제거 이유 |
|------|---------|
| cron `*/5 * * * *` 안전망 | "유령 Job 부활" 의 원인 — 9일 된 pending 을 무단 픽업, 사용자 cancel 의도 무시 |
| `cleanup_zombie_jobs()` (크롤러 시작 시) | Worker 엔드포인트로 역할 이관 (수동 호출 가능) |
| `find_next_job()` (`--job-id=0` 자동 픽업) | cron 안전망과 세트였음 — 이제 모든 크롤러 실행은 명시적 `--job-id` 필수 |

---

## 7. 타임아웃 & 체이닝

```
Job 시작 → 타이머 설정 (single: 5h50m, recurring: 2h50m)
    ↓
크롤링 진행... (100건마다 체크포인트 저장)
    ↓
타이머 발동 → crawler.stop()
    ↓
체크포인트 저장 → 새 Job 생성 → GitHub Actions 트리거
    ↓
새 Job이 체크포인트에서 이어서 시작
```

### 반복 모드 순환

```
순환 1: 전라남도 시작 → ... → 타임아웃 → 이어서 → ... → 완료
    ↓ cycle_count++ (restart_count 리셋)
순환 2: 전라남도 처음부터 → ... → 타임아웃 → 이어서 → ... → 완료
    ↓ cycle_count++
순환 3: ...
```

---

## 8. GitHub Secrets

| 시크릿 | 용도 |
|--------|------|
| SUPABASE_URL | Supabase API URL |
| SUPABASE_SERVICE_KEY | Supabase service role 키 |
| KAKAO_REST_KEY | 카카오 지오코딩 API |
| GH_PAT | GitHub Actions 자동 트리거 (workflow 스코프 필요) |

---

## 9. 트리거 모델 (2026-04-23~)

**cron 안전망 제거됨.** `crawl.yml` 은 오직 `workflow_dispatch` 만 수락.

### 3가지 실제 트리거 경로

```
① 사용자 "시작" 클릭
       ↓ POST /api/admin/crawl
   GitHub workflow_dispatch

② 크롤러 자신 (auto_continue)
   — 타임아웃 임박(5시간 50분) 시 새 Job 생성 + 자신의 후속 dispatch
   — recurring 모드 한 사이클 완료 시 다음 사이클 dispatch
       ↓ POST https://api.github.com/.../dispatches

③ 사용자 "재개" 클릭 (실패/취소 이력에서 checkpoint 로)
       ↓ POST /api/admin/crawl (checkpoint 포함)
   GitHub workflow_dispatch
```

→ **모든 트리거가 명시적 의도 기반.** 유령 부활 원천 차단.

### (선택) Worker = `/api/reconcile`

- 2중 제어의 "안전망" 엔드포인트로 `app/api/reconcile/route.ts` 에 구현됨
- 현재 **자동 호출 안 됨** (pg_cron 생략). 필요 시 Supabase `pg_cron` 으로 1분 주기 활성화 가능
- 역할: intent/status 불일치 복구 — 예: dispatch 실패된 pending 재시도, 오래된 heartbeat failed 처리, recurring 다음 사이클 재개
- 수동 호출 지원: `curl -X POST https://sunlap.kr/api/reconcile -H "Authorization: Bearer <CRON_SECRET>"`

---

## 10. 주소 목록 수신 실패 복구 (2026-04-19 추가)

### 배경 — Job #180 사례

대구광역시 전체 크롤링 중 **소보면 평호리 산86까지 정상 처리 (13,842건) → 우보면 리 목록 요청 시 일시적 API 실패** → 크롤러가 예외를 조용히 삼키고 "completed" 로 오판. 군위군 2/9 이후 **전부 누락**됨에도 UI에는 완료로 표시.

체크포인트 분석 결과 두 개의 연쇄 버그 발견:
1. `crawl()` 의 `except Exception` 이 예외를 삼켜 `_stop_event` 도 set 안 되고 `completed` 판정
2. 레벨 진입 시 하위 progress (li/jibun) 가 리셋되지 않아 체크포인트 불일치 (dong_name="우보면" + li_name="평호리(소보면 것)")

### 에러 유형 구분

| 유형 | 예시 | 기존 처리 | 비고 |
|---|---|---|---|
| **A. 번지 검색 실패** (`search_capacity`) | 소보면 평호리 834-1 조회 실패 | `_failed_addresses` 에 적재 → 리 단위 재시도 → 실패 시 `progress.errors` 카운트 | "미수집 지번"으로 UI 표시. 계속 진행 |
| **B. 주소 목록 실패** (`get_addr_list`) | 우보면 리 목록 전체 실패 | try/except 없음 → 예외 전파 → 삼켜짐 | **수정 전: 크롤링 조용히 중단** |

### 복구 전략 (2단계)

```
[1단계: 현장 복구]
  get_addr_list 실패
    → 5초 대기 + 세션 재생성 → 재시도 #1
    → 15초 대기 + 세션 재생성 → 재시도 #2
    → 30초 대기 + 세션 재생성 → 재시도 #3
  → 일시 장애 대부분 여기서 흡수

[2단계: 안전 종료 + 자동 재개]
  3회 모두 실패 → crawler._error 세팅
    → run_crawl.py: final_status = "stopped"
    → 체크포인트 저장 (하위 레벨 리셋된 상태)
    → auto_continue → 새 Job + GitHub Actions 재기동
    → 새 프로세스/세션으로 "이어서 시작"
```

### 핵심 구현

#### `crawler/crawler.py`
- `_safe_get_addr_list(**kwargs)` — get_addr_list 래퍼, 5/15/30초 점진 대기 + 세션 재생성 재시도 (3회)
- `_reset_progress_below(level)` — 해당 레벨 하위 progress 인덱스/총계/이름 초기화 (do/si/gu/dong/li)
- 5곳의 `self.client.get_addr_list(...)` 호출 → `self._safe_get_addr_list(...)` 로 교체
- 5곳의 레벨 루프에서 current/name 설정 직후 `_reset_progress_below(...)` 호출
- `self._error: Optional[Exception] = None` — crawl 중 삼켜지지 않는 예외 보존
- `crawl()` 의 `except TooManyErrorsException` / `except Exception` 에서 `self._error = e` 기록 (기존 `_stop_event.set()` 제거)

#### `crawler/run_crawl.py`
- 판정 로직 변경:
  ```python
  if timeout_triggered.is_set():       final_status = "stopped"
  elif crawler._error is not None:     final_status = "stopped"  # 재개 대상
  elif crawler.is_stopped():           final_status = "cancelled"
  else:                                final_status = "completed"
  ```
- `crawler._error` 가 있으면 `crawl_jobs.error_message` 에 저장

### 상태 의미 재정의

| 상태 | 의미 | 재개 |
|---|---|---|
| `completed` | 정상 완료 | 해당 없음 |
| `stopped` | **타임아웃 또는 예외로 중단** (확장됨) | ✅ 자동 재개 |
| `cancelled` | 사용자 명시적 취소 (`stop_requested` → `_stop_event.set()`) | ❌ |
| `failed` | crawl 외부에서 예외 발생 (DB 쓰기 등) | ❌ |

### 테스트 커버리지

`scripts/test_kepco_resume/`:
- `test_retry_logic.mjs` — `_safe_get_addr_list` + `_reset_progress_below` 단위 테스트 (42/42 통과)
- `test_uibomyeon_next.mjs` — 실제 KEPCO API 정상 경로 회귀 테스트
- `test_repeat.mjs` — 다양한 세션 조건 반복 호출 (Phase 1~3)
- `test_sobomyeon.mjs` — Job #180 체크포인트 불일치 가설 검증 스크립트

---

## 11. 변경 이력

- 2026-04-22: 비교 기능 전면 리팩토링 — ref/changelog 기반 flush 5·6단계 제거, `sync_ref`/`detect_changes` 메서드 삭제, upserted_ids 수집 로직 간소화 (return=minimal). 폐기 이력은 [COMPARE.md](./COMPARE.md)
- 2026-04-19: 주소 목록 수신 실패 복구 추가 — `_safe_get_addr_list` 세션 재생성 재시도 + 체크포인트 일관성 `_reset_progress_below` (Job #180 사례 대응, §10)
- 2026-04-12: 변화 감지 시스템 전환 — 트리거 → ref + changelog 방식 ([COMPARE.md](./COMPARE.md)) — **2026-04-22 폐기**
- 2026-04-12: sync_capa_ref 파라미터화 (전체 스캔 → flush ID만) — **2026-04-22 폐기**
- 2026-04-12: detect_changes ON CONFLICT DO NOTHING (하루 첫 감지만 기록) — **2026-04-22 폐기**
- 2026-04-10: 멀티스레드 시스템 도입 (3개 독립 스레드, 반복 모드)
- 2026-04-10: 에러 상세 로그 (recent_errors + all_errors)
- 2026-04-09: 차단 우회 강화 (세션 재생성, UA 랜덤, 점진적 백오프)
- 2026-04-09: GitHub Actions 자동 크롤링 + 실시간 지오코딩
