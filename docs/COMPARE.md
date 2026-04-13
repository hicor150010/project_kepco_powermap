# 변화 추적 (비교) 시스템

> 최종 수정: 2026-04-12

---

## 1. 개요

기준 시점(ref)의 여유 상태를 보존하고, 현재 데이터와 비교하여 변화를 감지하는 시스템.
기존 `kepco_capa_history`(트리거 기반, 7일 보존)를 삭제하고 ref + changelog 방식으로 전환.

---

## 2. 핵심 개념

```
kepco_capa_ref    — 각 지번의 최초 기록 시점 여유 상태 (불변)
kepco_capa        — 현재 데이터 (크롤링마다 갱신)
kepco_capa_changelog — ref 대비 변화 이력 (일별)

비교 = ref(고정) vs capa(현재) → 변화 감지 → changelog 기록
```

---

## 3. DB 테이블

### 3.1 kepco_capa_ref (기준 스냅샷)

```sql
CREATE TABLE kepco_capa_ref (
  capa_id      BIGINT PRIMARY KEY,   -- kepco_capa.id
  snapshot_at  DATE NOT NULL,         -- 최초 기록 시점
  subst_ok     BOOLEAN NOT NULL,      -- 변전소 여유 상태
  mtr_ok       BOOLEAN NOT NULL,      -- 주변압기 여유 상태
  dl_ok        BOOLEAN NOT NULL       -- 배전선로 여유 상태
);
```

- **불변 원칙**: 한번 기록되면 절대 수정/삭제되지 않음 (관리자 리셋 제외)
- 새 지번이 추가될 때만 INSERT, 기존 행은 `ON CONFLICT DO NOTHING`

### 3.2 kepco_capa_changelog (변화 이력)

```sql
CREATE TABLE kepco_capa_changelog (
  id            BIGSERIAL PRIMARY KEY,
  capa_id       BIGINT NOT NULL,
  changed_date  DATE NOT NULL,
  subst_ok      BOOLEAN NOT NULL,
  mtr_ok        BOOLEAN NOT NULL,
  dl_ok         BOOLEAN NOT NULL,
  CONSTRAINT changelog_unique UNIQUE (capa_id, changed_date)
);
```

- **하루 단위 정밀도**: 같은 날 같은 지번은 1건만 기록
- `ON CONFLICT DO NOTHING`: 같은 날 첫 감지만 보존, 이후 변화(원복 포함)는 무시
- 3개월 보존 권장

---

## 4. 여유 판정 공식

각 시설별 여유 판정은 **2개 조건 AND**:

```
변전소:  (subst_capa - subst_pwr > 0) AND (subst_capa - g_subst_capa > 0)
주변압기: (mtr_capa - mtr_pwr > 0)     AND (mtr_capa - g_mtr_capa > 0)
배전선로: (dl_capa - dl_pwr > 0)       AND (dl_capa - g_dl_capa > 0)
```

- `true` = 여유 있음, `false` = 여유 없음
- NULL 값은 COALESCE로 0 처리

---

## 5. RPC 함수

### 5.1 sync_capa_ref(capa_ids BIGINT[] DEFAULT NULL)

**용도**: 새 지번을 ref에 추가
**호출 시점**: 크롤러 flush 후 (5단계)

```
capa_ids 전달 시 → 해당 ID만 처리 (flush 최적화)
capa_ids = NULL  → 전체 kepco_capa 처리 (관리자 리셋용)
ON CONFLICT DO NOTHING → 기존 행 절대 안 건드림
```

### 5.2 detect_changes(capa_ids BIGINT[])

**용도**: ref 대비 여유 판정 변화를 changelog에 기록
**호출 시점**: 크롤러 flush 후 (6단계)

```
1. capa_ids로 kepco_capa 조회 (flush된 것만)
2. kepco_capa_ref와 JOIN (ref가 있는 것만)
3. IS DISTINCT FROM으로 여유 판정 비교
4. 변화 있는 것만 INSERT
5. ON CONFLICT DO NOTHING → 같은 날 첫 감지만 유지
```

**반환값**: 기록된 행 수 (INTEGER)

### 5.3 reset_capa_ref()

**용도**: 관리자가 기준 스냅샷을 현재 상태로 리셋
**동작**: TRUNCATE ref → sync_capa_ref(NULL) 호출

### 5.4 compare_changelog(target_date, subst_filter, mtr_filter, dl_filter)

**용도**: UI에서 특정 날짜 이후의 변화 조회
**필터**: any / gained(없음→있음) / lost(있음→없음)

### 5.5 compare_with_ref(subst_filter, mtr_filter, dl_filter)

**용도**: ref vs 현재 kepco_capa 직접 비교 (날짜 무관)
**필터**: any / same / gained / lost

### 5.6 get_ref_info()

**용도**: UI 표시용 기준일 정보
**반환**: snapshot_date (최초 기준일), total_count (총 ref 행 수)

---

## 6. 크롤러 flush 흐름

```
flush() — 100건 버퍼 소진 시 실행
│
├─ 1단계: kepco_addr UPSERT
│   - _addr_id_cache에 없는 주소만 UPSERT
│   - return=representation으로 id 받아서 캐시 저장
│   - 이후 flush에서는 캐시 히트 → DB 호출 스킵
│
├─ 2단계: kepco_capa UPSERT
│   - 캐시에서 addr_id 조회 (DB 호출 없음)
│   - addr_id 붙여서 kepco_capa에 UPSERT
│   - return=representation으로 upserted_ids 수집
│
├─ 3단계: 지오코딩
│   - 새 주소만 (geocode_done 캐시로 중복 방지)
│   - geocode_cache → 카카오 API → fallback(리 제거)
│
├─ 4단계: MV 새로고침
│   - refresh_kepco_summary RPC 호출
│
├─ 5단계: ref 스냅샷 동기화
│   - sync_capa_ref(upserted_ids) 호출
│   - upserted_ids 중 ref에 없는 것만 INSERT
│   - ON CONFLICT DO NOTHING
│
└─ 6단계: 변화 감지
    - detect_changes(upserted_ids) 호출
    - ref와 현재 판정이 다른 것만 changelog INSERT
    - ON CONFLICT DO NOTHING (같은 날 첫 감지만)
```

### 비용 특성 (Supabase)

| 단계 | egress | 비고 |
|------|--------|------|
| 1~2 | write (무료) | UPSERT |
| 3 | read (유료) | geocode_cache 조회 — 새 주소만 |
| 4 | 서버 내부 | MV refresh — egress 없음 |
| 5 | 서버 내부 | RPC — egress 없음 |
| 6 | 서버 내부 | RPC — egress 없음 |

---

## 7. 특정 시점 데이터 복원 방법

비교 기능의 핵심은 **과거 특정 시점의 여유 상태를 복원**하여 현재와 비교하는 것.

### 복원 원리

```
changelog = ref 대비 변화가 있을 때만 기록됨
→ changelog에 해당 날짜가 없다 = 그 시점에 ref와 동일하다
```

### 복원 순서 (특정 날짜 + 특정 지번)

```
1. changelog에서 해당 지번의 해당 날짜를 정확히 검색
2. 있으면 → 그 값 (ref와 달라진 상태)
3. 없으면 → ref 확인
   - ref.snapshot_at <= 특정날짜 → ref 값 (ref와 동일한 상태)
   - ref.snapshot_at >  특정날짜 → None (그 시점에 데이터 자체가 없음)
```

### 시나리오 예시

```
ref:       capa_id=101, snapshot_at=04-05, (T, T, F)
changelog: capa_id=101, changed_date=04-08, (F, T, F)
           capa_id=101, changed_date=04-12, (F, F, T)
```

| 복원 시점 | 결과 | 근거 |
|-----------|------|------|
| 04-03 | None | changelog 없음 → ref(04-05) > 04-03 → 데이터 없음 |
| 04-05 | T,T,F | changelog 없음 → ref(04-05) ≤ 04-05 → ref 값 |
| 04-07 | T,T,F | changelog 없음 → ref(04-05) ≤ 04-07 → ref 값 |
| 04-08 | F,T,F | changelog에 04-08 있음 → 그 값 |
| 04-10 | T,T,F | changelog에 04-10 없음 → ref(04-05) ≤ 04-10 → ref 값 |
| 04-12 | F,F,T | changelog에 04-12 있음 → 그 값 |

### 주의: changelog 없음 ≠ 직전 changelog 값

- changelog에 해당 날짜가 **없다**는 것은 **ref와 동일하다**는 뜻이지, 직전 changelog 값을 이어받는 게 아님
- 예: 04-10에 changelog 없음 → 04-08의 (F,T,F)가 아니라 ref의 (T,T,F)가 정답
- detect_changes는 항상 **ref 대비** 변화만 감지하므로, changelog가 없으면 ref로 돌아간 것

### 비교 기능 = 복원 + 비교

```
모드 1 (과거 vs 현재): 복원(date_a)  vs  현재 kepco_capa 실시간 계산값
모드 2 (과거 vs 과거): 복원(date_a)  vs  복원(date_b)
```

- date_b 생략 또는 오늘 → 모드 1 (현재값 사용)
- date_b 지정 → 모드 2 (양쪽 모두 동일한 복원 로직)

---

## 8. 설계 결정 사항

### changelog 없음 = ref와 동일
- detect_changes는 **ref 대비** 변화만 기록
- changelog에 특정 날짜가 없으면 → 그 시점에 ref와 같았다는 뜻
- 직전 changelog 값을 이어받는 것이 **아님** (이 점 헷갈리기 쉬움)

### 하루 단위 정밀도
- `changed_date`는 DATE 타입 (시간 없음)
- 같은 날 여러 번 flush해도 첫 감지만 기록
- KEPCO 여유용량이 같은 날 변했다가 원복되는 경우는 드묾

### DO NOTHING vs DO UPDATE
- **DO NOTHING 채택**: 같은 날 첫 감지만 유지
- DO UPDATE는 원복 시 거짓 양성 문제 발생 (변화 없는데 changelog에 남음)
- DO NOTHING도 첫 변화→원복 시 거짓 양성 가능하나, 하루 단위에서 허용 범위

### sync_capa_ref 파라미터화
- 기존: 파라미터 없이 kepco_capa 전체 스캔 (매 flush마다)
- 변경: capa_ids 파라미터 전달 → flush된 ID만 처리
- DEFAULT NULL로 reset_capa_ref() 호환 유지
- DB 연산 부하: 수만 행 → ~100건으로 감소

---

## 9. 마이그레이션 파일

| 파일 | 내용 |
|------|------|
| `db/migrations/014_compare_ref.sql` | ref 테이블 + sync/reset/compare_with_ref/get_ref_info RPC |
| `db/migrations/016_changelog.sql` | changelog 테이블 + detect_changes/compare_changelog RPC |
| `db/migrations/017_compare_at.sql` | **시점 복원 기반 비교** — compare_at RPC |

### Supabase 적용 순서
1. `014_compare_ref.sql` 실행 → ref 테이블 + 초기 스냅샷 생성
2. `016_changelog.sql` 실행 → changelog 테이블 + 감지 함수
3. `017_compare_at.sql` 실행 → 시점 복원 비교 함수

---

## 10. RPC — compare_at (시점 복원 비교)

```sql
compare_at(
  date_a       DATE,              -- 시점 A (필수)
  date_b       DATE DEFAULT NULL, -- 시점 B (NULL이면 현재값)
  subst_filter TEXT DEFAULT 'any',
  mtr_filter   TEXT DEFAULT 'any',
  dl_filter    TEXT DEFAULT 'any'
)
```

- date_b = NULL → 현재 kepco_capa에서 여유 판정 실시간 계산
- date_b = 날짜 → 해당 날짜의 복원값
- 필터: any / gained(없음→있음) / lost(있음→없음)
- 기존 compare_changelog, compare_with_ref는 호환용으로 유지

---

## 11. 웹 API

| 엔드포인트 | 용도 |
|------------|------|
| `GET /api/compare/dates` | ref 기준일 조회 |
| `GET /api/compare?date_a=&date_b=&subst=&mtr=&dl=` | 시점 복원 비교 (date_b 생략=현재) |
| `POST /api/compare/reset` | 관리자 ref 리셋 |

---

## 12. UI (CompareFilterPanel)

### 1단계: 조건 설정
- 시점 A / 시점 B 날짜 입력 (date input)
- 시점 B 기본값 = 오늘 (현재값 사용), 과거 날짜 선택 가능
- 시설별 변화 유형 필터 (전체/없음→있음/있음→없음)
- "변화 있는 곳만 보기" 토글

### 2단계: 지역 필터링 + 결과
- 시/도, 시, 구/군, 동/면, 리 카스케이딩 필터
- 마을 단위 결과 목록 (방향 배지 + 시설별 변화)
- 클릭 → 지도 이동 + 오버레이
- 펼침 → 지번별 변화 상세

---

## 12. 관리자 기능

### ref 리셋
- 누적 변화가 너무 많아졌을 때 사용
- 현재 상태를 새 기준으로 재설정
- TRUNCATE ref → sync_capa_ref(NULL) → changelog는 유지

---

## 13. 변경 이력

- 2026-04-12: ref + changelog 시스템 신규 구축
- 2026-04-12: sync_capa_ref에 capa_ids 파라미터 추가 (전체 스캔 제거)
- 2026-04-12: detect_changes ON CONFLICT DO NOTHING으로 변경 (거짓 양성 방지)
- 2026-04-12: 기존 kepco_capa_history 트리거 기반 시스템 삭제
- 2026-04-13: compare_at RPC 추가 (시점 복원 기반 비교, 두 시점 비교 지원)
- 2026-04-13: API date → date_a/date_b 파라미터 변경
- 2026-04-13: UI — changelog 드롭다운 → date input 2개로 변경
