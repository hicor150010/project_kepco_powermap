---
name: 크롤러 Job surrogate 파손 — 원인과 방어선
description: crawl_jobs 의 한글 필드에 lone surrogate(`\udXXX`) 가 섞여 저장되는 문제. 근본 원인 + 단일 방어선 위치
type: feedback
---

## 증상 (2번째 발생 2026-04-22, 그 전 1회 이상)

Job 의 `sido`, `checkpoint.position.*_name`, `error_message` 필드에 `\udceb`, `\udced` 같은
lone UTF-16 surrogate 가 섞여 저장됨. 증상:
- 관리자 UI "취소" 버튼 무응답 (아래 별도 문제 참조)
- `auto_continue` 가 깨진 checkpoint 를 복사 → 무한 재시작 (restart_count 15회)
- Python 크롤러는 lone surrogate 를 str 로 허용하므로 **조용히 번식**

## 근본 원인

**Python + JSON + PostgREST 세 구간 어디에도 "lone surrogate 는 비정상" 방어가 없음.**

1. Python str 은 surrogate pair 없이 lone surrogate 도 허용 (C/Go/Rust 와 다른 특성)
2. `requests.patch(json=data)` 내부의 `json.dumps(ensure_ascii=True)` 가 `"\udceb"` → `'"\\udceb"'` 로 그대로 이스케이프
3. PostgREST/JSONB 는 JSON 스펙상 `"\udceb"` 를 유효로 취급 → DB 저장 성공
4. `auto_continue` 가 job dict 통째 복사 → 번식

**최초 파손 원인**은 재현 불가 (외부 입력: KEPCO API 응답 / GitHub Actions env). 추적보다 방어가 경제적.

## 방어선 — **단 한 점**

**Why:** 필드 단위 개별 sanitize 는 덕지덕지. 모든 DB 쓰기가 `update_job()` 한 함수를 거치므로 여기서 정화하면 끝.
**How to apply:**
- `crawler/run_crawl.py` 의 `_sanitize_json(obj)` 헬퍼가 str/dict/list 재귀 순회
- `obj.encode("utf-8", "replace").decode("utf-8", "replace")` 로 surrogate → `?` 치환
- **crawl_jobs 쓰기 2경로 모두** 통과 필수:
  - `update_job(job_id, data)` → `json=_sanitize_json(data)` (PATCH)
  - `auto_continue(job, checkpoint, thread)` → `json=_sanitize_json(new_job)` (POST)
  - 이 2경로가 번식의 출입구. 빠뜨리면 재시작 루프로 오염 전파
- kepco_addr/kepco_capa 쓰기는 번식 경로 없음 (매 flush 때 KEPCO 응답 재수신) → 방어 선택

재발 시 대응:
1. 이 파일 열어서 "update_job 한 점" 방어가 살아있는지 확인
2. 깨진 Job id 확인 → `scripts/test_update_job_roundtrip.py` 재실행으로 경로 건강 검증
3. 새 경로에서 파손 발생 중이면 그 경로도 `_sanitize_json` 통과시키기 (예: 다른 PATCH 호출)

## 연관 문제 — 취소 API 분기

`/api/admin/crawl` PATCH 가 `.eq("status","running")` 조건만 두면 pending/stop_requested 는
조용히 무시됨 → 사용자가 정지 못 함.
**Why:** pending Job 은 GitHub Actions 에 트리거 못 된 상태라 크롤러가 깨울 수 없음. DB status 만
바꾸면 됨.
**How to apply:**
- `running` → `stop_requested` (크롤러가 감지하여 정리)
- `pending` / `stop_requested` → 즉시 `cancelled` + `completed_at` 기록
- 그 외 (completed/failed/cancelled) → no-op 응답

## 테스트 커버리지

- `scripts/test_sanitize.py` — sanitize 단위 (9 케이스)
- `scripts/test_update_job_roundtrip.py` — 실 DB PATCH end-to-end (5 검증)
- `scripts/test_cancel_branch.py` — 취소 분기 4 상태 roundtrip
- `scripts/test_auto_continue_roundtrip.py` — 번식 경로 POST end-to-end (6 검증)

재발 의심 시 네 스크립트 모두 재실행 — 전부 통과해야 함.
