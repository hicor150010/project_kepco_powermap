---
name: 크롤 좀비 job — recurring 모드 cancel 경쟁 조건 [RESOLVED 2026-04-23]
description: (해결) recurring cancel 경쟁조건 + 유령 Job 부활. 2중 제어 모델(intent/status 분리)로 근본 제거
type: feedback
---

> **✅ 해결됨 (2026-04-23)**: 2중 제어 모델 재설계로 근본 원인 제거.
> 아래 "근본 해결 (미구현, 차후 과제)" 섹션의 모든 항목이 현재 구현됨.
> 자세한 내용은 [feedback_2tier_control_model.md](feedback_2tier_control_model.md) 참고.
> 아래 기록은 사고 복기 + 향후 비슷한 문제 진단용으로 보존.

## 증상

2026-04-21 관측: 5개 thread 를 동시에 cancel 한 직후, **이전 사이클의 recurring job (#77, #81, #92)** 이 `status='running'` 으로 재활성화되어 UI 에서 "스레드 N 에 이미 실행 중" 에러 발생.

- 실제 GitHub Actions 워크플로는 이미 죽은 상태
- DB 만 `running` 으로 남은 좀비
- `last_heartbeat` 이 수십 분~수 시간 전에 멈춰있음
- `completed_at` 이 시작일보다 이전 날짜로 남아있는 게 지표

## 원인 추정

`mode='recurring'` 의 auto-continue 로직이 현재 사이클 cancel 과 경쟁:
1. 사용자가 cancel 요청
2. 현재 job (cycle N) 이 cancel 처리됨
3. 그런데 recurring 루프가 이전 사이클 (N-1) job 의 `started_at` 을 갱신하며 "재시작" 처럼 동작
4. 결과: old job 이 `running` 상태로 되살아남

관련 교훈: [docs/개발계획.md §4-1](../../docs/개발계획.md) "재시작 경로는 미완료=stopped 로 통일"

## 대응

### 즉시 대응 (좀비 발견 시)
```
PATCH /rest/v1/crawl_jobs?status=in.(running,stop_requested)
  body: { "status": "cancelled" }
```
또는 Supabase SQL:
```sql
UPDATE crawl_jobs SET status = 'cancelled'
WHERE status IN ('running', 'stop_requested')
  AND last_heartbeat < NOW() - INTERVAL '5 minutes';
```

### 좀비 판별 기준
- `status IN ('running', 'stop_requested')` AND
- `last_heartbeat < NOW() - INTERVAL '5 minutes'` (heartbeat 끊긴지 5분+)
- 또는 `completed_at < started_at` (완료일이 시작일보다 이전 — 명백히 이상)

### 근본 해결 (미구현, 차후 과제)
- cancel RPC 를 만들어 **같은 thread 의 모든 running job 을 원자적으로 cancel**
- recurring 모드의 job 갱신 로직에서 **cancel 요청 체크** 추가
- 또는 watchdog cron 으로 heartbeat 끊긴 좀비 자동 정리 (예: 5분마다 체크)

**Why:** 2026-04-21 VACUUM 작업 중 크롤러 중단했을 때 실제 발생한 버그. recurring 모드 + 동시 5개 cancel 의 경쟁 조건. UI 가 좀비 job 을 "실행 중" 으로 잘못 인식해 새 수집 시작 차단.

**How to apply:**
- 크롤러 cancel 후 UI 에 "실행 중" 에러가 사라지지 않으면 좀비 의심
- `crawl_jobs` 에서 `last_heartbeat` 확인 → 5분+ 끊겼으면 좀비 확정
- PATCH 로 일괄 cancel 처리
- 차후 cleanup.yml 에 좀비 정리 스텝 추가 검토 (VACUUM cron 작업 재개 시 함께 구현)
