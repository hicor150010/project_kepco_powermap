---
name: kepco_capa row_hash 리팩토링 — 추후 진행
description: capa 테이블 5컬럼 unique → MD5 해시 단일 컬럼 unique 전환. 약 40MB DB 절감 예상. 1·2차 안정화 후 진행
type: project
---

## 🎯 목표

`kepco_capa` 의 UPSERT conflict target 을 5컬럼 복합 unique 에서 MD5 해시 단일 컬럼 unique 로 전환하여 **인덱스 약 40MB 절감**.

## 📊 현 상태 (2026-04-21 기준)

- `kepco_capa_ukey` (5컬럼 unique): **61 MB**
  - 컬럼: `addr_id, addr_jibun, subst_nm, mtr_no, dl_nm`
  - 현재 크롤러 UPSERT 가 이 인덱스를 conflict target 으로 사용
- 전환 후 예상: `kepco_capa_row_hash_key` (MD5 32자 단일): **15~20 MB**
- **절감: ~40 MB**

## 📚 이미 검증된 패턴

- 2026-04-11 에 **구 스키마 `kepco_data`** 기준으로 [012_row_hash.sql](../../db/migrations/012_row_hash.sql) 적용
  - 결과: 110 MB → 53 MB (52% 감소)
- 이후 014_compare_ref 에서 스키마 분리 (`kepco_addr` + `kepco_capa`) 되면서 **row_hash 패턴이 capa 로 이식 안 됨**
- 012 마이그레이션을 **capa 전용으로 새로 작성 필요** (단순 재사용 불가)

## 🛠 작업 범위

### DB
- 신규 마이그레이션 `db/migrations/XXX_capa_row_hash.sql` 작성
  - `row_hash` TEXT 컬럼 추가 + 트리거
  - 기존 행 backfill (MD5 계산)
  - 새 unique constraint `kepco_capa_row_hash_key UNIQUE (row_hash)`
  - 기존 `kepco_capa_ukey` DROP
  - `VACUUM FULL kepco_capa` 로 물리 공간 회수
- 해시 컬럼 구성: `md5(addr_id::text || '|' || addr_jibun || '|' || subst_nm || '|' || mtr_no || '|' || dl_nm)`
  - NULL 은 COALESCE(..., '') 처리 필수

### 크롤러
- [crawler/crawl_to_db.py:246](../../crawler/crawl_to_db.py#L246) 수정
  - `?on_conflict=addr_id,addr_jibun,subst_nm,mtr_no,dl_nm`
  - → `?on_conflict=row_hash`
- 트리거가 INSERT/UPDATE 시 자동 계산하므로 크롤러 payload 는 변경 불필요

### 배포 순서 (무중단)
1. 크롤링 중단 (현재 수집 완료 대기 or `cancelled` 처리)
2. 마이그레이션 적용 (Supabase SQL Editor) — row_hash 컬럼 추가 + backfill + 트리거 + 새 unique 생성
3. **기존 unique 는 DROP 하지 않고** 크롤러 코드 배포 먼저
4. 크롤러 1회 성공 확인 후 **기존 unique DROP**
5. `VACUUM FULL kepco_capa` 로 물리 공간 회수

### 원복 플랜
- 012 마이그레이션 주석에 원복 SQL 있음 → 참고 가능
- 문제 시 새 unique DROP → 기존 unique 재생성 → 크롤러 롤백

## ⚠️ 리스크

- **중복 데이터 발견 시 backfill 실패**: UPDATE 로 해시 채울 때 이미 중복된 조합이 있으면 unique 생성 단계에서 실패 → 사전 중복 제거 스크립트 필요 가능
- **크롤러 배포 타이밍**: 새 unique 없는데 크롤러가 `on_conflict=row_hash` 로 요청 → 404. 순서 엄수
- **성능**: MD5 해시는 INSERT 당 연산 추가되지만 100건 배치 기준 무시 가능 (<1ms)

## 📅 적절한 타이밍

- ❌ **지금 (2026-04-21)**: 1차 1단계 완료 직후, 2단계 착수 직전 → 덕지덕지 금지
- ⭕ **1차 2단계 완료 후** (6월 경): 개발 안정화 + 크롤러 영향 격리된 시점
- ⭕ **1·2차 전체 완료 후** (9~10월): 가장 안전하나, 그때까진 DB 15개월치 여유 있어 급하지 않음

## 🎯 예상 공수

- 마이그레이션 작성 + 로컬 테스트: 1시간
- Supabase 적용: 30분 (backfill 시간 포함)
- 크롤러 수정 + 커밋 + 배포: 30분
- 크롤러 1회 검증 + 기존 unique DROP + VACUUM FULL: 30분
- **총 2.5~3시간** (중간 모니터링 포함)

**Why:**
DB 용량 위기 진단 중 (2026-04-21) `kepco_capa_ukey` 가 61MB 로 가장 큰 인덱스임을 확인. 012 패턴을 capa 에 이식하면 40MB 절감 가능. 그러나 1차 1단계 방금 완료 + 2단계 착수 직전에 크롤러 건드리면 테스트 부담 큼 → 미룸.

**How to apply:**
- 1차 2단계 완료 시점에 재검토
- 또는 DB 용량이 다시 75% 넘어가면 우선순위 상향
- 월 1회 정기 VACUUM 이 충분히 커버하면 3차 개발 전후까지 미뤄도 OK
