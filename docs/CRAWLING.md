# 크롤링 시스템 아키텍처

> 최종 수정: 2026-04-10

---

## 1. 개요

KEPCO 배전선로 여유용량 데이터를 자동으로 수집하는 시스템.
GitHub Actions에서 크롤러를 실행하고, Supabase에 데이터를 저장한다.

---

## 2. 멀티스레드 구조

```
crawl.yml (워크플로우 1개)
  ├─ "KEPCO Crawl (스레드 1)" → concurrency: kepco-crawl-1
  ├─ "KEPCO Crawl (스레드 2)" → concurrency: kepco-crawl-2
  └─ "KEPCO Crawl (스레드 3)" → concurrency: kepco-crawl-3

각 스레드 → python run_crawl.py --thread=N --job-id=X
             (같은 코드, 같은 크롤러)
```

- **3개 독립 스레드** — 동시 실행 가능
- 각 스레드는 독립적인 crawl_jobs row를 가짐
- concurrency group이 분리되어 서로 간섭 없음
- GitHub Actions 동시 실행 한도: 20개 (우리는 3개 사용)

### 모드

| 모드 | 설명 | 타이머 | 완료 후 |
|------|------|--------|---------|
| `single` | 1회 수집 후 종료 | 5시간 50분 | 끝 |
| `recurring` | 무한 순환 수집 | 2시간 50분 | 자동 재시작 |

---

## 3. 데이터 흐름

```
KEPCO API → 크롤러 (crawler.py)
    ↓ (100건 버퍼)
UPSERT → kepco_data 테이블
    ↓
지오코딩 (카카오 REST API) → lat/lng 업데이트
    ↓
MV 새로고침 (kepco_map_summary)
    ↓
체크포인트 저장 (crawl_jobs.checkpoint)
    ↓
변화 감지 (DB 트리거 → kepco_data_history)
```

### flush 사이클 (100건마다)

1. 크롤러가 100건 수집
2. Supabase에 UPSERT (merge-duplicates)
3. 새 주소 지오코딩 (카카오 API → geocode_cache → kepco_data.lat/lng)
4. Materialized View 새로고침
5. 체크포인트 저장
6. DB 트리거가 변경된 값 감지 → kepco_data_history에 이전값 기록

---

## 4. 핵심 파일

| 파일 | 역할 |
|------|------|
| `.github/workflows/crawl.yml` | GitHub Actions 워크플로우 (스레드 분리, cron) |
| `crawler/run_crawl.py` | 엔트리포인트 (Job 관리, 타이머, 체이닝) |
| `crawler/crawler.py` | KEPCO API 크롤링 로직 |
| `crawler/api_client.py` | HTTP 클라이언트 (세션, 재시도, 차단 우회) |
| `crawler/crawl_to_db.py` | DB UPSERT + 지오코딩 + MV 새로고침 |
| `web/app/api/admin/crawl/route.ts` | Job CRUD API (생성, 중단, 삭제) |
| `web/components/admin/CrawlManager.tsx` | 관리 UI |

---

## 5. DB 스키마 (crawl_jobs)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL | PK |
| sido, si, gu, dong, li | TEXT | 수집 대상 지역 |
| status | TEXT | pending/running/completed/failed/stopped/stop_requested |
| thread | INT | 스레드 번호 (1, 2, 3) |
| mode | TEXT | single / recurring |
| cycle_count | INT | 현재 순환 횟수 |
| max_cycles | INT | 최대 순환 (null=무제한) |
| progress | JSONB | 실시간 진행 상황 |
| checkpoint | JSONB | 재개용 체크포인트 |
| options | JSONB | delay, flush_size 등 |
| last_heartbeat | TIMESTAMPTZ | 좀비 감지용 |
| github_run_id | BIGINT | Actions run ID |
| error_message | TEXT | 실패 시 에러 |
| created_at, started_at, completed_at | TIMESTAMPTZ | 시간 |

---

## 6. 안전장치

| 항목 | 방법 | 위치 |
|------|------|------|
| 스레드 내 동시 실행 방지 | concurrency group | crawl.yml |
| DB 충돌 방지 | UPSERT (merge-duplicates) | crawl_to_db.py |
| 좀비 Job 감지 | heartbeat 30분 초과 → failed | run_crawl.py |
| 체인 끊김 복구 | cron 매 6시간 | crawl.yml |
| 트리거 실패 복구 | 3회 재시도 | run_crawl.py auto_continue() |
| 반복 무한루프 방지 | max_cycles 설정 | run_crawl.py |
| KEPCO 차단 방지 | 세션 재생성, UA 랜덤, 점진적 백오프 | api_client.py |
| 변화 감지 | DB 트리거 (fn_kepco_history) | 009_history_trigger.sql |

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

## 9. cron 스케줄

```yaml
schedule:
  - cron: '0 */6 * * *'  # 매 6시간
```

cron 실행 시 matrix로 스레드 1/2/3 모두 체크.
각 스레드에서 `find_next_job(thread)`로 할 일이 있는지 확인.
없으면 즉시 종료 (비용 무시할 수준).

---

## 10. 변경 이력

- 2026-04-10: 멀티스레드 시스템 도입 (3개 독립 스레드, 반복 모드)
- 2026-04-10: 변화 감지 시스템 (DB 트리거 + history 테이블 + 비교 UI)
- 2026-04-10: 에러 상세 로그 (recent_errors + all_errors)
- 2026-04-09: 차단 우회 강화 (세션 재생성, UA 랜덤, 점진적 백오프)
- 2026-04-09: GitHub Actions 자동 크롤링 + 실시간 지오코딩
