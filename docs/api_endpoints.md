# API Endpoints 카탈로그

> **유지보수·확장의 단일 진실원**.
> 새 endpoint 추가/변경 시 반드시 이 문서를 함께 갱신한다.
> 인덱스: [docs/개발계획.md](개발계획.md) · 외부 명세 원본: [docs/api_specs/](api_specs/)

---

## 0. 사용 규칙 (필독)

### 0-1. 신규 endpoint 추가 체크리스트

| 단계 | 산출 |
|---|---|
| 1 | `web/app/api/<도메인>/<키패턴>/route.ts` — 상단 주석에 한 줄 요약 + 입출력 |
| 2 | `web/lib/api/<도메인>.ts` — 클라이언트 fetcher + 응답 타입 |
| 3 | **본 카탈로그에 spec 카드 추가** ← 빠뜨리면 PR 거부 |
| 4 | (외부 API) 원본 명세 → `docs/api_specs/<source>/` 보존 |

### 0-2. 본 카탈로그 사용 흐름

- **"무슨 endpoint 가 있더라?"** → §1 목차 표 검색
- **"이 endpoint 입출력이 뭐였지?"** → §3 spec 카드
- **"새 endpoint 어떻게 만들까?"** → §0 컨벤션 + §1 비슷한 패턴 카드 참조

---

## 1. 전체 목차

### 데이터 조회 (사용자 호출, 11개)

| Endpoint | Method | 출처 | 외부호출 | 캐시 | 사용처 |
|---|---|---|---|---|---|
| [`/api/map-summary`](#get-apimap-summary) | GET | DB(MV) | 0 | `no-store` | 지도 마커 |
| [`/api/search`](#get-apisearch) | GET | DB(searchKepco) | 0 | (none) | 검색 패널 |
| [`/api/capa/by-bjd`](#get-apicapaby-bjd) | GET | DB RPC | 0 | `no-store` | 마을 모달 raw rows |
| [`/api/capa/by-jibun`](#get-apicapaby-jibun) | GET | DB(kepco_capa+bjd_master) | 0 | `no-store` | 전기 탭 + 헤더 주소 |
| [`/api/capa/summary-by-bjd`](#get-apicapasummary-by-bjd) | GET | DB RPC | 0 | `no-store` | 마을 카드 집계 (~80B) |
| [`/api/capa/lookup`](#post-apicapalookup) | POST | DB + KEPCO live | 0~1 | `no-store` | DB miss 시 KEPCO 직접 조회 |
| [`/api/parcel/by-pnu`](#get-apiparcelby-pnu) | GET | VWorld WFS (FILTER) | 1 | `s-maxage=86400` | 필지 + 가격 탭 + 폴리곤 |
| [`/api/parcel/by-latlng`](#get-apiparcelby-latlng) | GET | VWorld WFS (BBOX) | 1 | `s-maxage=86400` | 지도 직접 클릭 |
| [`/api/polygon/by-bjd`](#get-apipolygonby-bjd) | GET | VWorld lt_c_adri/ademd | 1 | `s-maxage=604800` | 마을 음영 폴리곤 |
| [`/api/buildings/by-pnu`](#get-apibuildingsby-pnu) | GET | 건축HUB (getBrTitleInfo) | 1 | `s-maxage=86400` | 필지 탭 (lazy) |
| [`/api/transactions/by-bjd`](#get-apitransactionsby-bjd) | GET | 국토부 RTMS 토지매매 | N (월별 fan-out) | `s-maxage=21600` | 가격 탭 (lazy) |

### 운영 (관리자/시스템, 6개)

| Endpoint | Method | 인증 | 용도 |
|---|---|---|---|
| [`/api/health`](#get-apihealth) | GET | (none) | Supabase 연결 헬스체크 |
| [`/api/refresh-mv`](#post-apirefresh-mv) | POST | 사용자 | MV 수동 새로고침 |
| [`/api/reconcile`](#post-apireconcile) | POST | CRON_SECRET | 좀비 작업 정리 (cron 1분) |
| [`/api/admin/crawl`](#apiadmincrawl) | GET/POST/PATCH/DELETE | 관리자 | 크롤 작업 CRUD |
| [`/api/admin/crawl/regions`](#get-apiadmincrawlregions) | GET | 관리자 | KEPCO 주소 계층 프록시 |
| [`/api/admin/users`](#apiadminusers) | GET/POST/PATCH/DELETE/PUT | 관리자 | 사용자 CRUD |

### 신규 예정 (Phase 2 — 영업 발굴 / 가격 / 규제)

| Endpoint | 출처 | 사용 탭 | 상태 |
|---|---|---|---|
| `/api/auctions/by-pnu` | 캠코 온비드 | 가격 | 🚧 |
| `/api/auctions/list-by-region` | 캠코 온비드 | 지도 마커 | 🚧 |
| `/api/solar-permits/near-point` | 산자부 태양광허가 | 전기 | 🚧 |
| `/api/regulations/search` | 법제처 자치법규 | 규제 | 🚧 |
| `/api/regulations/by-id` | 법제처 자치법규 | 규제 | 🚧 |
| `/api/roads/near-point` | DB(PostGIS, SHP import) | 규제 | 🚧 |

---

## 2. 컨벤션

### 2-1. 네이밍

**폴더 = 데이터 도메인** (외부 source 노출 X, 의미 우선)

| 폴더 | 의미 |
|---|---|
| `capa/` | KEPCO 전력용량 |
| `parcel/` | 필지 (지목·면적·공시지가·폴리곤) |
| `polygon/` | 마을 행정구역 폴리곤 |
| `map-summary/` | 지도 마커용 light 데이터 |
| `search/` | 텍스트 검색 |
| `buildings/` | 건축물대장 |
| `transactions/` | 토지 실거래가 |
| `auctions/` | 공매 |
| `solar-permits/` | 태양광 허가 |
| `regulations/` | 자치법규/조례 |
| `roads/` | 도로 |
| `admin/` | 관리자 전용 |
| `health/`, `reconcile/`, `refresh-mv/` | 운영/모니터링 |

**파일 = 조회 키 패턴** (입력 형태)

| 키패턴 | 의미 | 입력 예 |
|---|---|---|
| `by-pnu` | PNU 19자리 단건 | `?pnu=4683034023000070000` |
| `by-jibun` | bjd_code + jibun 단건 | `?bjd_code=4673025025&jibun=20-1` |
| `by-bjd` | 법정동 코드 단위 | `?bjd_code=4673025025` |
| `by-latlng` | 좌표 단건 | `?lat=37.5&lng=127.4` |
| `by-region` | 시도/시군구 단위 | `?sigungu_cd=11680` |
| `by-id` | 외부 시스템 ID 단건 | `?id=2026666` |
| `near-point` | 좌표 반경 N개 | `?lat=...&lng=...&radius=500` |
| `list-by-*` | 다건 페이지네이션 | `?page=1&size=20` |
| `search` | 텍스트 검색 | `?q=태양광` |
| `summary-by-*` | 집계/요약 (응답 작음) | `?bjd_code=...` |
| `lookup` | 다중 입력 fallback (POST body) | (POST) |

→ **`/api/<도메인>/<키패턴>`** 만 보고 *"무엇을 어떻게 호출하는지"* 즉시 인식.

### 2-2. 응답 envelope

**성공**:
```ts
{ ok: true, ...data }
// 예: { ok: true, bjd_code, jibun, rows, total, meta }
```

**실패**:
```ts
{ ok: false, error: string }
```

**부분 성공** (호출은 됐는데 데이터 없음): 200 OK + `ok: true` + 데이터 필드 `null` 또는 빈 배열
```ts
{ ok: true, lat, lng, jibun: null, geometry: null }   // 바다/미등록
```

### 2-3. HTTP status code

| 코드 | 의미 |
|---|---|
| 200 | 성공 (데이터 없음 포함) |
| 400 | 파라미터 오류 (형식·범위) |
| 401 | 미인증 (로그인 필요) |
| 403 | 권한 부족 (관리자 전용) |
| 404 | 명시적 미존재 (드물게 사용) |
| 500 | 서버 오류 (DB·내부) |
| 502 | 외부 API 장애 (Phase 2 신규 atomic 에서 사용) |

### 2-4. 캐시 전략

| 패턴 | 사용 케이스 |
|---|---|
| `Cache-Control: no-store` | DB 직접 조회 (KEPCO 갱신 즉시 반영) |
| `Cache-Control: private, max-age=300` | 부분 응답 (필지 미존재 등 5분) |
| `Cache-Control: private, s-maxage=86400, max-age=3600` | VWorld 응답 (1일 CDN, 1시간 브라우저) |
| `Cache-Control: public, s-maxage=604800, stale-while-revalidate=86400` | 행정구역 폴리곤 (1주, 변경 거의 없음) |
| (Phase 2) **KV** `<도메인>:<키>:<값>` TTL=N | 외부 API 응답 캐시 ([lib/cache/kv.ts](../web/lib/cache/kv.ts)) |

### 2-5. 인증

| 레벨 | 헬퍼 | 사용처 |
|---|---|---|
| 공개 | (none) | `/api/health` 만 |
| 사용자 | `getCurrentUser()` | 데이터 조회 9개 + `refresh-mv` |
| 관리자 | `requireAdmin()` | `/api/admin/*` |
| 시스템 (cron) | `Bearer ${CRON_SECRET}` | `/api/reconcile` |

### 2-6. 외부 API 표준 (Phase 2 신규 작성 시)

- **1 atomic = 1 외부 호출** 원칙
  - **예외**: 외부 API 가 페이지네이션·기간 분할을 강제할 때만 서버 fan-out 허용 (`Promise.all`, 부분 실패 catch). 사용자→서버는 1회 유지.
  - 사례: `/api/transactions/by-bjd` — 국토부 RTMS 가 월 단위 호출만 지원 → 12회 fan-out
- **KV 캐시 의무** (`getOrSet(key, ttl, fetcher)`)
- 응답 변환: 외부 raw 필드 그대로 노출하지 말고 우리 도메인 타입으로 정리
- 인증 정보 (Referer, OC, serviceKey 등) 는 **서버사이드에서만 주입** — 클라이언트 노출 X

---

## 3. Spec 카드 (데이터 조회 10개)

### `GET /api/map-summary`

> 지도 마커용 light 데이터 (마을 단위 집계, MV 전체 반환)

| 항목 | 값 |
|---|---|
| **출처** | DB MV `kepco_map_summary` |
| **외부 호출** | 0 |
| **캐시** | `no-store` (수집·지오코딩 즉시 반영 — 캐시 시 "마커 0" 사고 사례) |
| **인증** | 사용자 |
| **사용처** | [MapClient.tsx](../web/components/map/MapClient.tsx) 초기 로드 |
| **route** | [route.ts](../web/app/api/map-summary/route.ts) |

**입력**: 없음

**출력 (200)**
```ts
{
  rows: MapSummaryRow[],   // [lib/types.ts] — bjd_code, geocode_address, lat, lng,
                           //   total, subst_no_cap, mtr_no_cap, dl_no_cap,
                           //   addr_do/si/gu/dong/li, max_remaining_kw 등
  total: number,
  generatedAt: string,
}
```

**구현 노트**: PostgREST 1000행 제한 우회 위해 페이지네이션 (PAGE=1000) 으로 전량 수집.

---

### `GET /api/search`

> 자유 텍스트 검색 — 마을(ri) + 지번(ji) 결과 함께 반환

| 항목 | 값 |
|---|---|
| **출처** | DB ([lib/search/searchKepco.ts](../web/lib/search/searchKepco.ts)) |
| **외부 호출** | 0 |
| **캐시** | (없음) |
| **인증** | 사용자 |
| **사용처** | 검색 패널 (Sidebar) |
| **route** | [route.ts](../web/app/api/search/route.ts) |

**입력 (Query)**
| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `q` | string | ✅ | 자유 텍스트 (예: `용구리 100`) |

**출력 (200)**
```ts
{
  ok: true,
  ri: SearchRiResult[],     // 마을 후보
  ji: KepcoDataRow[],       // 지번 후보 (raw, 클라이언트가 enrich)
  jiFallback: boolean,      // ji 가 폴백 매칭인지
  parsed: { keywords: string[], lotNo: number | null },
}
```

**구현 노트**: `parsed.keywords` 비어있고 `lotNo` 도 없으면 DB 호출 없이 빈 결과 반환 (효율).

---

### `GET /api/capa/by-bjd`

> 마을(리/읍면동) bjd_code 기준 KEPCO 용량 raw rows 전체

| 항목 | 값 |
|---|---|
| **출처** | DB RPC `get_location_detail(bjd_code)` |
| **외부 호출** | 0 |
| **캐시** | `no-store` |
| **인증** | 사용자 |
| **사용처** | 마을 마커 → 상세 모달 (raw rows 펼치기, lazy fetch) |
| **route** | [route.ts](../web/app/api/capa/by-bjd/route.ts) |

**입력 (Query)**
| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `bjd_code` | string(10) | ✅ | 행안부 법정동 코드 |

**출력 (200)**
```ts
{ ok: true, bjd_code: string, rows: KepcoDataRow[], total: number }
```

**에러**: 400(`bjd_code` 형식) / 401 / 500(RPC)

**fetcher**: [`fetchKepcoCapaByBjdCode`](../web/lib/api/kepco.ts)

---

### `GET /api/capa/by-jibun`

> 지번 단위 KEPCO 용량 + **행정구역 메타** (헤더 주소용)

| 항목 | 값 |
|---|---|
| **출처** | DB (`kepco_capa` + `bjd_master` 병렬 lookup) |
| **외부 호출** | 0 |
| **캐시** | `no-store` |
| **인증** | 사용자 |
| **사용처** | [ParcelInfoPanel](../web/components/map/ParcelInfoPanel.tsx) 전기 탭 + 헤더 주소 |
| **route** | [route.ts](../web/app/api/capa/by-jibun/route.ts) |

**입력 (Query)**
| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `bjd_code` | string(10) | ✅ | 행안부 법정동 코드 |
| `jibun` | string | ✅ | 지번 번호 (예: `73-1`, `산10`) |

**출력 (200)**
```ts
{
  ok: true,
  bjd_code: string,
  jibun: string,
  rows: KepcoDataRow[],
  total: number,
  meta: AddrMeta | null,    // {sep_1~5}: bjd_master 매칭 실패 시 null (sentinel 0.43%)
}
```

**에러**: 400(파라미터) / 401 / 500(DB)

**fetcher**: [`fetchKepcoCapaByJibun`](../web/lib/api/kepco.ts)

**구현 노트**: 헤더 주소 권위 출처 — VWorld parcel 보다 우선. fallback 만 parcel 사용.

---

### `GET /api/capa/summary-by-bjd`

> 마을 카드용 시설별 여유·부족 집계 (~80B, raw rows 대신)

| 항목 | 값 |
|---|---|
| **출처** | DB RPC `get_location_summary(bjd_code)` |
| **외부 호출** | 0 |
| **캐시** | `no-store` |
| **인증** | 사용자 |
| **사용처** | 마커 클릭 → 카드 (모달 안 열 때 99% 절감) |
| **route** | [route.ts](../web/app/api/capa/summary-by-bjd/route.ts) |

**입력 (Query)**
| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `bjd_code` | string(10) | ✅ | 행안부 법정동 코드 |

**출력 (200)**
```ts
{
  ok: true,
  bjd_code: string,
  summary: KepcoCapaSummary,  // {
                              //   total: number,
                              //   subst: { avail, short },
                              //   mtr:   { avail, short },
                              //   dl:    { avail, short },
                              // }
}
```

**구현 노트**: DB flat 7컬럼 → 시설별 중첩 객체로 변환 (UI 순회 편의).

---

### `POST /api/capa/lookup`

> 한글주소 또는 bjd_code+jibun → KEPCO 용량 조회 (DB hit / live fallback)

| 항목 | 값 |
|---|---|
| **출처** | DB → [lookupCapacity](../web/lib/kepco-live/lookup-capacity.ts) (KEPCO live 직접 호출 fallback) |
| **외부 호출** | 0 (DB hit) ~ 1 (KEPCO live) |
| **캐시** | `no-store` (live 결과는 DB upsert) |
| **인증** | 사용자 |
| **route** | [route.ts](../web/app/api/capa/lookup/route.ts) |

**입력 (JSON Body)**
| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `addr` | string | △ | 한글주소 (`bjd_code` 와 둘 중 하나 필수) |
| `bjd_code` | string(10) | △ | 행안부 코드 (refresh 용) |
| `jibun` | string | ✅ | 지번 번호 |
| `refresh` | boolean | - | true 시 항상 KEPCO live 호출 (기본 false) |
| `includeSplitDong` | boolean | - | 동분할 후보 포함 (기본 false) |

**출력 (200)**
```ts
{
  ok: true,
  source: 'db' | 'live' | 'not_found',
  bjd_code: string | null,
  addr_jibun: string,
  rows: KepcoDataRow[],
  fetched_at: string,
  candidate_used?: { ... },   // includeSplitDong 시
}
```

**에러**: 400(JSON 파싱·`jibun` 누락) / 401 / 500

---

### `GET /api/parcel/by-pnu`

> PNU 19자리 → VWorld 필지 폴리곤 + 주소·지목·면적·공시지가

| 항목 | 값 |
|---|---|
| **출처** | VWorld WFS (`fes:Filter PropertyIsEqualTo`, 1:1 매칭, ~40ms) |
| **외부 호출** | 1 |
| **캐시** | `private, s-maxage=86400, max-age=3600` (CDN 1d, 브라우저 1h) |
| **인증** | 사용자 |
| **사용처** | 지번 클릭 → 필지·가격 탭 + 폴리곤 음영 + panTo |
| **route** | [route.ts](../web/app/api/parcel/by-pnu/route.ts) · 라이브러리 [parcel.ts](../web/lib/vworld/parcel.ts) |

**입력 (Query)**
| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `pnu` | string(19) | ✅ | PNU 19자리 숫자 |

**출력 (200)**
```ts
// 매칭 성공
{ ok: true, pnu: string, jibun: JibunInfo, geometry: ParcelGeometry }
// 매칭 실패
{ ok: true, pnu: string, jibun: null, geometry: null }   // private, max-age=300

// JibunInfo: pnu, jibun, isSan, ctp_nm, sig_nm, emd_nm, li_nm, addr
// ParcelGeometry: jimok, area_m2, jiga, polygon, center{lat,lng}
```

**구현 노트**: parcel API 가 7~8가지 정보를 묶어 반환 (atomic 1회). 가격 탭의 공시지가도 여기 포함.

---

### `GET /api/parcel/by-latlng`

> 좌표 → VWorld 필지 (BBOX ±5m + point-in-polygon 선별)

| 항목 | 값 |
|---|---|
| **출처** | VWorld WFS BBOX 호출 |
| **외부 호출** | 1 |
| **캐시** | `private, s-maxage=86400, max-age=3600` |
| **인증** | 사용자 |
| **사용처** | 지도 직접 클릭 (PNU 미확보) |
| **route** | [route.ts](../web/app/api/parcel/by-latlng/route.ts) |

**입력 (Query)**
| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `lat` | number | ✅ | 위도 |
| `lng` | number | ✅ | 경도 |

**출력 (200)**: `by-pnu` 와 동일 (단, `pnu` 대신 `lat/lng` 에코)

---

### `GET /api/polygon/by-bjd`

> 행정구역(리/읍면동) 폴리곤 + 중심좌표

| 항목 | 값 |
|---|---|
| **출처** | VWorld `lt_c_adri` (리) / `lt_c_ademd` (읍면동) WFS |
| **외부 호출** | 1 |
| **캐시** | `public, s-maxage=604800, stale-while-revalidate=86400` (1주) |
| **인증** | 사용자 |
| **사용처** | 마을 마커 클릭 → 음영 시각화 |
| **route** | [route.ts](../web/app/api/polygon/by-bjd/route.ts) |

**입력 (Query)**
| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `bjd_code` | string(10) | ✅ | 행안부 법정동 코드 |

**출력 (200)**
```ts
// 매칭 성공
{ ok: true, bjd_code, level: 'ri'|'emd', full_nm: string, polygon: number[][][], center: {lat,lng} }
// 매칭 실패
{ ok: true, bjd_code, level: null, full_nm: null, polygon: null, center: null }
```

---

### `GET /api/buildings/by-pnu`

> PNU 19자리 → 건축물대장 표제부 (메인 건물 정보) — 영업 결정 1차 필터

| 항목 | 값 |
|---|---|
| **출처** | 건축HUB `getBrTitleInfo` (국토부 BldRgstHubService) |
| **외부 호출** | 1 |
| **캐시** | `private, s-maxage=86400, max-age=3600` (건축물대장은 신축/철거 외엔 불변) |
| **인증** | 사용자 |
| **사용처** | ParcelInfoPanel "필지" 탭 활성화 시 lazy fetch |
| **env** | `DATA_GO_KR_KEY` (공공데이터포털 통합 키) |
| **route** | [route.ts](../web/app/api/buildings/by-pnu/route.ts) · 라이브러리 [title.ts](../web/lib/building-hub/title.ts) · 영업 분류 [classify.ts](../web/lib/building-hub/classify.ts) · wrapper [buildings.ts](../web/lib/api/buildings.ts) |

**입력 (Query)**
| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `pnu` | string(19) | ✅ | PNU 19자리. 11번째 자리(산구분)는 자동으로 건축HUB `platGbCd` (1=일반→0, 2=산→1) 로 변환 |

**출력 (200)**
```ts
{ ok: true, pnu: string, rows: BuildingTitleInfo[] }   // 0건도 정상 (빈 땅/미등록)

// BuildingTitleInfo (응답 78필드 → 영업가치 22개 발췌)
{
  // ── 식별 / TL;DR
  bldNm: string | null,           // 건물명 (대부분 빈 값)
  mainPurpsCdNm: string,          // 주용도 ("공장", "단독주택", ...)
  regstrKindCdNm: string | null,  // 건축물 종류 ("일반건축물"/"집합건축물")
  mainAtchGbCdNm: string | null,  // "주건축물"/"부속건축물"
  useAprDay: string | null,       // 사용승인일 YYYYMMDD
  pmsDay: string | null,          // 허가일 YYYYMMDD
  stcnsDay: string | null,        // 착공일 YYYYMMDD

  // ── 옥상 태양광 핵심
  archArea: number | null,        // 건축면적 ㎡ (≈ 옥상 가용)
  totArea: number,                // 연면적 ㎡
  roofCdNm: string | null,        // 지붕 ("평슬래브", "기타지붕")
  etcRoof: string | null,         // 기타지붕 시 실제자재 ("판넬", "슬레이트")
  strctCdNm: string | null,       // 구조 ("일반철골구조" 등)
  heit: number | null,            // 건축물 높이 m
  grndFlrCnt: number,             // 지상층수
  ugrndFlrCnt: number,            // 지하층수

  // ── 부지 · 확장
  platArea: number | null,        // 대지면적 ㎡
  bcRat: number | null,           // 건폐율 %
  vlRat: number | null,           // 용적률 %
  atchBldCnt: number,             // 부속건물 수
  atchBldArea: number,            // 부속건물 합계 ㎡

  // ── 조건부 (있을 때만 UI 노출)
  hhldCnt: number,                // 세대수 (주택)
  fmlyCnt: number,                // 가구수
  hoCnt: number,                  // 호수
  oudrAutoUtcnt: number,          // 옥외주차 대수

  // ── 주소 (헤더 중복이지만 대장 권위 출처)
  newPlatPlc: string | null,
  platPlc: string | null
}
```

**구현 노트**:
- 한 지번에 여러 동(부속건축물 등) 가능 → `rows` 는 배열
- 산지 처리는 PNU 11번째 자리만 split → 별도 jibun 문자열 파싱 X
- 표제부 응답은 한 번에 78필드 옴. 영업가치 22개만 정규화 (추가 호출 0)
- 영업 분류는 [classify.ts](../web/lib/building-hub/classify.ts) 1곳에서 관리:
  - `classifyPurpose()` — 용도 → go/review/skip (공장·창고·축사 = go, 주택 = skip)
  - `classifyRoof()` — 지붕 → ideal/ok/poor (슬래브 = ideal, 슬레이트 = poor)
  - `classifyStructure()` — 구조 → ideal/ok/poor (RC = ideal, 목조 = poor)
- 7개 operation 중 표제부만 우선 도입. 총괄/층별/전유부 등은 미래 별도 atomic

---

### `GET /api/transactions/by-bjd`

> 시군구 단위 토지 실거래가 + 영업담당자용 통계 (중앙값/추세/지목별/sparkline)

| 항목 | 값 |
|---|---|
| **출처** | 국토부 RTMS `getRTMSDataSvcLandTrade` |
| **외부 호출** | N회 (월별 fan-out, 기본 12회 — `Promise.all`, 부분 실패 catch) |
| **캐시** | `private, s-maxage=21600, max-age=3600` (6h CDN — 이번 달 분 매일 갱신) |
| **인증** | 사용자 |
| **사용처** | ParcelInfoPanel "가격" 탭 활성화 시 lazy fetch |
| **env** | `DATA_GO_KR_KEY` (공공데이터포털 통합 키, 건축HUB 와 동일) |
| **route** | [route.ts](../web/app/api/transactions/by-bjd/route.ts) · 라이브러리 [land-trade.ts](../web/lib/rtms/land-trade.ts) · 통계 [trade-stats.ts](../web/lib/rtms/trade-stats.ts) · wrapper [transactions.ts](../web/lib/api/transactions.ts) |

**입력 (Query)**
| 이름 | 타입 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|
| `bjd_code` | string(10) | ✅ | — | 행안부 법정동 코드. 앞 5자리 = `LAWD_CD` 변환 |
| `months` | number | - | 12 | 1~24 (UI 0건 시 24로 확장 토글) |

**출력 (200)**
```ts
{
  ok: true,
  bjd_code: string,
  months: number,
  rows: LandTransaction[],   // 날짜 내림차순. 0건 정상.
  stats: {
    total: number,
    medianPricePerPyeong: number | null,        // 0건 시 null
    trend: { pct: number; direction: 'up'|'down'|'flat' } | null,
    byJimok: Array<{ jimok, count, medianPricePerPyeong }>,
    monthly: Array<{ ym: string; count: number }>,  // sparkline (0 채움 보장)
  }
}

// LandTransaction (RTMS raw → 영업가치 정규화)
{
  dealYmd: string,         // "2025-10"
  dealDate: string | null, // "2025-10-15"
  jibun: string,           // "178-3"
  jimok: string,           // "답"
  area_m2: number,         // 980
  price_won: number,       // 14_200_000 (raw 만원 → 원 변환)
  pricePerPyeong: number,  // 145_000 (계산값)
  zoning: string | null,   // "계획관리지역"
  dealType: string | null, // "직거래"/"중개" (UI 미노출)
  umdNm: string,           // "개진면"
}
```

**에러**: 400(`bjd_code` 형식) / 401 / 502(외부 API 장애)

**구현 노트**:
- "1 atomic = 1 외부 호출" 원칙 예외 (§2-6) — RTMS 가 시군구+월 단위만 지원
- 부분 실패 허용: 12회 중 일부 월 실패 시 해당 월만 빈 배열 (전체 실패 X)
- `resultCode "03"` (NO_DATA) = 거래 0건 정상 처리
- 추세는 후반 6개월 vs 전반 6개월 평당가 중앙값 비교 (양쪽 모두 ≥1건일 때만)
- 통계 계산은 [trade-stats.ts](../web/lib/rtms/trade-stats.ts) 1곳에서 관리

---

## 4. Spec 카드 (운영 6개 — 간략)

### `GET /api/health`

> Supabase 연결 헬스체크 (Phase 3 이후 제거 예정)

- 인증: 없음 / 외부호출: 0 / 캐시: 없음
- 출력: `{ ok: true, url: string, userCount: number }`
- route: [route.ts](../web/app/api/health/route.ts)

### `POST /api/refresh-mv`

> Materialized View `kepco_map_summary` 수동 새로고침

- 인증: 사용자 / 외부호출: 0 / 캐시: 없음 / `maxDuration=300`
- 호출: 새로고침 버튼 → DB RPC `refresh_kepco_summary`
- 응답:
  - `{ ok: true, skipped: false }` — REFRESH 수행
  - `{ ok: true, skipped: true, reason, age_sec? }` — cooldown/진행중
- 동시성: RPC 측에서 60s cooldown + advisory lock + 5분 statement_timeout
- route: [route.ts](../web/app/api/refresh-mv/route.ts)

### `POST /api/reconcile`

> 좀비 작업 정리 워커 (Supabase pg_cron 매 1분 호출)

- 인증: `Authorization: Bearer ${CRON_SECRET}` (시스템 전용)
- 외부호출: GitHub Actions (cancel/dispatch) 필요 시
- 판단: 12줄 표 (intent × status × heartbeat)
- route: [route.ts](../web/app/api/reconcile/route.ts) · 자세한 규칙은 파일 상단 주석

### `/api/admin/crawl`

> 크롤 작업 CRUD (관리자 전용)

| Method | 용도 | 응답 |
|---|---|---|
| GET | 작업 목록 (최신 50건) | `{ ok, jobs }` |
| POST | 새 Job 생성 + GH Actions 트리거 | `{ ok, job }` |
| PATCH | 정지 요청 (`intent='cancel'`) | `{ ok }` |
| DELETE `?id=` | 종료된 Job 기록 삭제 | `{ ok }` |

- 인증: `requireAdmin()`
- 설계: API 는 의도(`intent`) 만 기록, 관측(`status`) 은 크롤러/Worker 가 갱신 (2중 제어)
- route: [route.ts](../web/app/api/admin/crawl/route.ts)

### `GET /api/admin/crawl/regions`

> KEPCO 주소 계층 API 프록시 (브라우저 CORS 우회)

| Query `gbn` | 의미 |
|---|---|
| `init` | 시/도 목록 |
| `0` + `addr_do` | 시 목록 |
| `1` + `addr_do/si` | 구/군 목록 |
| `2` + ... | 동/면 목록 |
| `3` + ... | 리 목록 |

- 인증: 관리자
- 외부: KEPCO `online.kepco.co.kr` (Referer 헤더 주입 필수)
- route: [route.ts](../web/app/api/admin/crawl/regions/route.ts)

### `/api/admin/users`

> 사용자 CRUD (관리자 전용, Supabase Auth 래퍼)

| Method | 용도 |
|---|---|
| GET | 전체 사용자 목록 |
| POST | 사용자 생성 (loginId/password/role/displayName) |
| PATCH | 권한·표시명 변경 |
| DELETE `?userId=` | 삭제 |
| PUT | 비밀번호 초기화 |

- 인증: `requireAdmin()`
- 입력 변환: loginId 에 `@` 없으면 `${loginId}@kepco.local` 부착
- route: [route.ts](../web/app/api/admin/users/route.ts)

---

## 5. 변경 이력

| 일자 | 내용 |
|---|---|
| 2026-04-25 | 초기 작성 — 기존 15개 endpoint 정리 + 컨벤션 명문화 |
| 2026-04-25 | `transactions/by-bjd` 추가 (국토부 토지 실거래가, 월별 fan-out). §2-6 fan-out 예외 단서 추가 |

---

## 6. 미래 endpoint 작성 시 참고

### 6-1. 비슷한 패턴 매핑

| 작성하려는 것 | 참고할 기존 endpoint |
|---|---|
| 외부 REST API 단건 조회 | `parcel/by-pnu` (VWorld FILTER 패턴) |
| 외부 REST API 좌표 검색 | `parcel/by-latlng` (BBOX + 필터) |
| 다건 페이지네이션 | `map-summary` (PostgREST 1000행 우회) |
| 외부 + Referer 헤더 필수 | `admin/crawl/regions` (KEPCO 프록시 패턴) |
| DB raw + 메타 JOIN | `capa/by-jibun` (병렬 Promise.all 패턴) |
| 외부 API 월/페이지 분할 fan-out | `transactions/by-bjd` (Promise.all 12회 + 부분 실패 catch) |
| raw + 통계 묶음 응답 | `transactions/by-bjd` (rows + stats 한 응답) |

### 6-2. KV 캐시 도입 시점 (Phase 2~)

외부 API 호출 endpoint 는 **반드시 KV 캐시** ([web/lib/cache/kv.ts](../web/lib/cache/kv.ts) Step 1 에서 작성 예정):

```ts
const result = await getOrSet(
  `auctions:pnu:${pnu}`,
  6 * 60 * 60,   // 6h
  () => fetchOnbidByPnu(pnu),
);
```

키 prefix 컨벤션: `<도메인>:<키패턴>:<값>`

### 6-3. 응답 표준 — 부분 성공 처리

외부 API 가 "데이터 없음" 응답할 때:
- **200 OK + `ok: true`** + 데이터 필드 `null`/`[]` 반환
- 404 사용 X (`이 위치엔 필지 없음` 같은 정상 케이스)
- 502 는 진짜 외부 API 장애일 때만

```ts
// ✅ 좋은 예
{ ok: true, pnu, jibun: null, geometry: null }
// ❌ 나쁜 예
return new Response(null, { status: 404 });
```
