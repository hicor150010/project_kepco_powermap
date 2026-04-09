# KEPCO Web Map — 전면 재개발 계획서 (v3)

> 작성일: 2026-04-08
> 상태: 합의 완료, Phase 1 진행 예정
> 이전 작업물(메모리 기반)은 테스트용으로 간주, 전면 재작성

---

## 1. 목표

- **Supabase 단일 진실 소스(SoT)** 기반 웹 지도 서비스
- 관리자가 KEPCO 엑셀 업로드 → DB에 누적 → 모든 사용자가 지도 조회
- 지오코딩 결과 영구 캐시 (재호출 방지)
- 인증 + 권한 분리 (admin / viewer)

---

## 2. 핵심 데이터 흐름

### 업로드 (관리자만)
```
엑셀 선택
   ↓
양식 검증 (헤더 자동 탐지, 필수 컬럼 체크)
   ↓
파싱 + 행 검증 (잘못된 행 스킵, 카운트)
   ↓
파일 내 중복 제거 (마지막 값 우선)
   ↓
서버 API:
  1. geocode_cache 조회 (이미 있는 좌표는 재호출 X)
  2. 미스 주소만 VWorld 호출 (병렬 5)
  3. geocode_cache에 저장
  4. kepco_data에 upsert
  5. Materialized View REFRESH
   ↓
결과 토스트/모달 (신규/갱신/스킵/지오코딩 건수)
```

### 조회 (모든 인증 사용자)
```
페이지 진입
   ↓
인증 체크 → 미인증 시 /login 리다이렉트
   ↓
/api/map-summary 1회 호출 (Light 데이터, 리 단위 집계)
   ↓
지도 + 마커 + 클러스터 렌더
   ↓
필터 변경 → 메모리에서 즉시 필터링
   ↓
마커 클릭
   ↓
/api/location?addr=... (Heavy, 해당 리 raw 데이터)
   ↓
요약 카드 + 상세 모달 표시
```

---

## 3. 인증 / 권한

### 결정 사항
- **Supabase Auth** (이메일+비번)
- **회원가입 UI 없음** — 관리자가 직접 발급
- **권한 2단계**:
  - `admin`: 업로드, 데이터 삭제, 계정 관리
  - `viewer`: 조회만 (지도/필터/검색/거리재기 등)
- **관리자 전용 페이지(`/admin`)**: 계정 CRUD + 권한 관리 + 활동 이력
- **고객은 Supabase 콘솔 접근 불가** — 모든 관리 작업은 우리 UI에서

### user_roles 테이블
```sql
CREATE TABLE user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 미들웨어
- 모든 페이지: 미인증 → `/login`
- `/admin/*`: viewer → 메인으로 리다이렉트

---

## 4. DB 스키마 (최종)

### 4.1 `geocode_cache` — 영구 좌표 캐시
```sql
CREATE TABLE geocode_cache (
  address TEXT PRIMARY KEY,           -- 리 단위 정규화 주소
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  source TEXT DEFAULT 'vworld',       -- 'vworld' / 'kakao'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 `kepco_data` — 메인 raw 테이블
```sql
CREATE TABLE kepco_data (
  id BIGSERIAL PRIMARY KEY,

  -- 주소 (raw 그대로 저장, "-기타지역" 포함)
  addr_do TEXT NOT NULL,
  addr_si TEXT,                       -- "-기타지역" 가능
  addr_gu TEXT,
  addr_dong TEXT,
  addr_li TEXT,
  addr_jibun TEXT,
  geocode_address TEXT NOT NULL,      -- 리 단위로 정규화된 주소

  -- 좌표 (geocode_cache에서 복사)
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,

  -- 시설
  subst_nm TEXT,
  mtr_no TEXT,
  dl_nm TEXT,

  -- 여유 상태
  vol_subst TEXT,
  vol_mtr TEXT,
  vol_dl TEXT,

  -- 용량 (kW)
  subst_capa BIGINT, subst_pwr BIGINT, g_subst_capa BIGINT,
  mtr_capa BIGINT, mtr_pwr BIGINT, g_mtr_capa BIGINT,
  dl_capa BIGINT, dl_pwr BIGINT, g_dl_capa BIGINT,

  -- STEP (옵셔널)
  step1_cnt INT, step1_pwr BIGINT,
  step2_cnt INT, step2_pwr BIGINT,
  step3_cnt INT, step3_pwr BIGINT,

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Upsert 키 (9개 조합)
  UNIQUE (addr_do, addr_si, addr_gu, addr_dong, addr_li, addr_jibun, subst_nm, mtr_no, dl_nm)
);

CREATE INDEX idx_kepco_geocode ON kepco_data (geocode_address);
CREATE INDEX idx_kepco_latlng ON kepco_data (lat, lng);
CREATE INDEX idx_kepco_subst ON kepco_data (subst_nm);
CREATE INDEX idx_kepco_dl ON kepco_data (dl_nm);
CREATE INDEX idx_kepco_addr_do_gu ON kepco_data (addr_do, addr_gu);
```

### 4.3 `kepco_map_summary` — Light 집계 (Materialized View)
```sql
CREATE MATERIALIZED VIEW kepco_map_summary AS
SELECT
  geocode_address,
  MAX(lat) AS lat,
  MAX(lng) AS lng,
  COUNT(*) AS total,
  SUM(CASE WHEN vol_subst != '여유용량 있음' THEN 1 ELSE 0 END) AS subst_no_cap,
  SUM(CASE WHEN vol_mtr != '여유용량 있음' THEN 1 ELSE 0 END) AS mtr_no_cap,
  SUM(CASE WHEN vol_dl != '여유용량 있음' THEN 1 ELSE 0 END) AS dl_no_cap,
  MAX(addr_do) AS addr_do,
  MAX(addr_si) AS addr_si,
  MAX(addr_gu) AS addr_gu,
  MAX(addr_dong) AS addr_dong,
  MAX(addr_li) AS addr_li,
  ARRAY_AGG(DISTINCT subst_nm) FILTER (WHERE subst_nm IS NOT NULL) AS subst_names,
  ARRAY_AGG(DISTINCT dl_nm) FILTER (WHERE dl_nm IS NOT NULL) AS dl_names
FROM kepco_data
WHERE lat IS NOT NULL
GROUP BY geocode_address;

CREATE UNIQUE INDEX idx_summary_addr ON kepco_map_summary (geocode_address);
CREATE INDEX idx_summary_latlng ON kepco_map_summary (lat, lng);
```

### 4.4 `user_roles` — 권한 (위 3절 참조)

### 4.5 RLS
- 모든 테이블 RLS ON
- `authenticated` 역할: 모든 SELECT 허용
- INSERT/UPDATE/DELETE: 서버(service_role)에서만 (API Route 경유)
- 또는 RLS로 admin role만 INSERT/UPDATE 허용

---

## 5. 양식 검증 정책 (엑셀 업로드)

### KEPCO 엑셀 양식 (확인 완료 — 2026-04-08)

**파일**: `data/전라남도_-기타지역_전체_20260403_083204_part75.xlsx`

| 위치 | 내용 |
|---|---|
| Row 0 (1행) | 타이틀 + 추출일시 |
| Row 1 (2행) | 그룹 헤더 (병합셀) |
| **Row 2 (3행)** | **컬럼 헤더 (21개)** |
| Row 3~ | 데이터 행 |

**컬럼 (21개)**: 시/도, 시, 구/군, 동/면, 리, 상세번지, 변전소명, 주변압기, 배전선로명, 변전소여유용량, 주변압기여유용량, 배전선로여유용량, 변전소 접속기준용량(kW), 변전소 접수기준접속용량(kW), 변전소 접속계획반영접속용량(kW), 주변압기 접속기준용량(kW), 주변압기 접수기준접속용량(kW), 주변압기 접속계획반영접속용량(kW), 배전선로 접속기준용량(kW), 배전선로 접수기준접속용량(kW), 배전선로 접속계획반영접속용량(kW)

**선택 컬럼 (STEP, 6개)**: 접수 건수, 접수 용량(kW), 공용망보강 건수, 공용망보강 용량(kW), 접속공사 건수, 접속공사 용량(kW)

### 검증 단계

#### Step 1 — 파일 검증
- 확장자 .xlsx/.xls
- 시트 1개 이상 (첫 시트만 사용)

#### Step 2 — 헤더 자동 탐지
- 1~10행 중 "시/도"가 있는 행을 헤더 행으로 인식
- 필수 컬럼 21개 모두 존재 확인 (이름 기반 매핑)
- 누락 시 → "필수 컬럼 누락: [컬럼명...]" 에러
- STEP 컬럼은 옵셔널 자동 탐지

#### Step 3 — 행 검증
| 케이스 | 처리 |
|---|---|
| 빈 행 | 조용히 스킵 |
| 시/도 없음 | 스킵 + 카운트 |
| 변전소명 없음 | 스킵 + 카운트 |
| 주변압기 번호 없음 | 스킵 + 카운트 |
| 배전선로명 없음 | 스킵 + 카운트 |
| 용량 필드 비숫자 | 0으로 처리 + 카운트 |
| vol_* 필드 형식 다름 | raw 그대로 저장 |

#### Step 4 — 파일 내 중복 처리
- 9개 키 조합으로 중복 검출
- **마지막 행 우선** (LIFO)
- 중복 카운트 보고

### 결과 보고 예시
```
✓ 업로드 완료: 전라남도_고흥군_2026-04.xlsx

총 5,234 행 처리
  ✅ 신규 추가:        1,452 건
  🔄 갱신:            3,521 건
  ⚠️ 건너뜀:            261 건
       ├ 주소 누락: 142건
       ├ 변전소 누락: 78건
       └ 잘못된 형식: 41건
  📋 파일 내 중복:      12 건 (마지막 값 사용)
  🌍 새로 변환된 위치:   38 곳 (VWorld 호출)
  ⏱ 소요 시간:        14초
```

---

## 6. 지오코딩 정책

### 1차: VWorld 단독
- 도로명 → 지번 순서로 시도
- 실패율 모니터링 (콘솔 로그 + 카운트)

### 2차 (필요 시): VWorld → Kakao Fallback
- 실패율 5%+ 발생 시 카카오 fallback 추가

### 캐시
- `geocode_cache` 테이블 영구 저장
- 같은 주소 재호출 X
- 브라우저 localStorage 캐시는 제거 (서버 캐시로 대체)

---

## 7. 새 프로젝트 구조

```
kepco_web_map/web/
├── middleware.ts                    ← 인증 미들웨어 (NEW)
├── app/
│   ├── login/
│   │   └── page.tsx                ← 로그인 화면
│   ├── admin/
│   │   ├── page.tsx                ← 관리자 대시보드
│   │   ├── users/page.tsx          ← 계정 관리
│   │   └── upload/page.tsx         ← 엑셀 업로드
│   ├── api/
│   │   ├── upload/route.ts         ← 엑셀 처리
│   │   ├── map-summary/route.ts    ← Light 조회
│   │   ├── location/route.ts       ← Heavy 조회
│   │   └── admin/
│   │       ├── users/route.ts      ← 계정 CRUD
│   │       └── refresh/route.ts    ← Materialized View REFRESH
│   ├── layout.tsx
│   └── page.tsx                    ← 메인 (지도)
├── lib/
│   ├── supabase/
│   │   ├── client.ts               ← 브라우저 클라이언트
│   │   ├── server.ts               ← 서버 클라이언트 (cookies)
│   │   └── admin.ts                ← service_role 클라이언트
│   ├── geocode/
│   │   └── vworld.ts               ← VWorld API 호출
│   ├── excel/
│   │   ├── parse.ts                ← 엑셀 파싱 + 검증
│   │   └── headers.ts              ← 헤더 자동 탐지
│   └── types.ts                    ← 타입 정의
└── components/
    ├── auth/
    │   └── LoginForm.tsx
    ├── admin/
    │   ├── UserList.tsx
    │   ├── UserCreateModal.tsx
    │   └── UploadDropzone.tsx
    └── map/
        ├── KakaoMap.tsx
        ├── FilterPanel.tsx
        ├── MarkerSummaryCard.tsx
        ├── MarkerDetailModal.tsx
        └── DistanceTool.tsx

db/
├── migrations/
│   ├── 001_init.sql                ← 테이블 생성
│   ├── 002_indexes.sql
│   ├── 003_rls.sql
│   └── 004_materialized_view.sql
└── README.md
```

---

## 8. Phase별 작업 계획

| Phase | 내용 | 작업자 | 예상 |
|---|---|---|---|
| **1** | Supabase 프로젝트 생성, 키 발급 | 사용자 | 5분 |
| **2** | 패키지 설치, 환경변수, 클라이언트 셋업 | 개발 | 30분 |
| **3** | 스키마 SQL 작성 + 콘솔 실행 | 개발+사용자 | 1시간 |
| **4** | 인증 미들웨어, 로그인 페이지 | 개발 | 1.5시간 |
| **4-1** | 관리자 대시보드 (계정 CRUD) | 개발 | 2시간 |
| **5** | VWorld 지오코딩 모듈 | 개발 | 30분 |
| **6** | 엑셀 파싱 + 양식 검증 모듈 | 개발 | 2시간 |
| **7** | 업로드 API + 결과 리포트 UI | 개발 | 2시간 |
| **8** | Map summary API + 메인 페이지 | 개발 | 2시간 |
| **9** | 마커 클릭 → location detail | 개발 | 1시간 |
| **10** | 필터/검색/거리재기 재구현 | 개발 | 2시간 |
| **11** | 테스트, 운영 안정화 | 개발+사용자 | 1시간 |

**총 예상**: 15~17시간 작업 / 사용자 부담 1~2시간 (계정 생성, 키 발급, SQL 실행, 테스트)

---

## 9. 리스크와 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| Supabase 500MB 한도 | 적재 실패 | 정규화 마이그레이션 옵션 보유 |
| Materialized View REFRESH 지연 | 업로드 후 대기 시간 | CONCURRENTLY + 인덱스 |
| 무료 플랜 7일 휴면 | 갑자기 에러 | 주간 cron ping (운영 후 결정) |
| KEPCO 양식 변경 | 파싱 깨짐 | 헤더 자동 탐지 + 이름 기반 매핑 |
| VWorld 실패율 ↑ | 마커 누락 | Kakao fallback 추가 |
| 잘못된 업로드 사고 | 데이터 손상 | upsert 정책으로 재업로드 가능 |
| 동시 업로드 충돌 | 마지막이 이김 | 운영자 1명이라 사실상 무관 |

---

## 10. 안내문 (확정)

```
KEPCO 배전선로 여유용량 지도 서비스 안내드립니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣ 로그인 / 계정 안내
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

본 서비스는 로그인 후 이용 가능합니다.

▸ 관리자 계정
  - 1개의 관리자 계정이 있으며,
  - 관리자가 직접 일반 사용자 계정을 발급해드립니다.

▸ 일반 사용자 계정
  - 관리자에게 발급받은 계정으로 로그인
  - 지도 조회, 검색, 필터, 거리재기 등 모든 조회 기능 사용 가능

* 회원가입 기능은 없습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2️⃣ 데이터 업로드 (관리자 전용)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ 엑셀 업로드는 오직 관리자만 가능합니다.
▸ KEPCO 표준 양식을 그대로 사용
▸ 양식이 다를 경우 업로드가 거부되며 오류 사유 표시
▸ 지역별로 나눠서 여러 번 업로드 가능
▸ 같은 데이터를 다시 업로드하면 최신 값으로 자동 갱신
▸ 처리 결과(신규/갱신/스킵)를 즉시 화면에 표시

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3️⃣ 일반 사용자 화면
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ 컬럼 필터 (시도, 시군구, 변전소, 배전선로, 여유용량 상태)
▸ 마을 단위 마커 클러스터링
▸ 마커 클릭 시 마을 요약 + 상세 목록
▸ 거리 측정 / 주소 검색

문의: (관리자 연락처)
```

---

## 11. 합의된 결정 사항 (요약)

| 항목 | 결정 |
|---|---|
| 데이터 저장소 | Supabase (단일 진실 소스) |
| 인증 | Supabase Auth, 회원가입 X |
| 권한 | admin / viewer 2단계 |
| 계정 관리 | 관리자 전용 화면 (Supabase 콘솔 노출 X) |
| 지오코딩 | VWorld 단독 (실패율 보고 fallback 결정) |
| 캐시 | geocode_cache 영구 |
| 데이터 정책 | upsert (마지막 우선), 이력 X |
| Upsert 키 | 9개 조합 (시도+시+구군+동면+리+번지+변전소+변압기+선로) |
| 양식 검증 | 헤더 자동 탐지, 잘못된 행만 스킵 |
| 시트 | 첫 시트만 |
| 파일 내 중복 | 마지막 값 우선 |
| 결과 통보 | 화면 토스트/모달 |
| 2단계 로딩 | Light(map_summary) + Heavy(location) |
| 화면 표시 | "-기타지역"은 렌더 시 필터 |
| 컴포넌트 | 전면 재작성 (재활용 X) |
| 마이그레이션 | 새 프로젝트로 (기존 코드는 테스트로 간주) |

---

## 12. 다음 액션

1. **Phase 1**: Supabase 프로젝트 생성 (사용자 작업) — 가이드는 별도 메시지
2. 키 받으면 Phase 2~ 구현 시작
