---
name: Atomic API + 클라이언트 enrichment 패턴
description: atomic endpoint 6종 + lib/api source별 분리 + KepcoCapaRow 클라이언트 enrichment. Phase 2 정규화 후 대응.
type: project
---

# Atomic API + Enrichment

## 배경
Phase 2 (2026-04-23~) 에서 `kepco_capa` 컬럼 정규화 — addr_do/si/gu/dong/li, geocode_address, lat, lng 모두 빠지고 **bjd_code 가 마스터 키**. 주소/좌표는 `bjd_master` (MV `kepco_map_summary`) 분리.

UI 컴포넌트 (LocationSummaryCard, LocationDetailModal, SearchResultList) 는 `row.addr_do/li` 시멘틱 그대로 — UI 코드 0 변경 원칙. → **클라이언트 enrichment** 로 해결.

## Atomic API 6종 (2026-04-24~25)

| Endpoint | 입력 | 출력 | 데이터 소스 |
|---|---|---|---|
| `/api/capa/summary-by-bjd` | bjd_code | summary (시설별 avail/short) | RPC `get_location_summary` |
| `/api/capa/by-bjd` | bjd_code | rows[] | RPC `get_location_detail` |
| `/api/capa/by-jibun` | bjd_code, jibun | rows[] (exact only) | Supabase 직접 SELECT |
| `/api/parcel/by-pnu` | pnu(19) | jibun, geometry | VWorld WFS fes:Filter (~40ms) |
| `/api/parcel/by-latlng` | lat, lng | jibun, geometry | VWorld WFS BBOX + PIP |
| `/api/polygon/by-bjd` | bjd_code | level, full_nm, polygon, center | VWorld lt_c_adri / lt_c_ademd |

**summary vs by-bjd 분리 (2026-04-25)**: 마을 raw rows 가 평균 383행/P90 643/max 1524 → 마커 클릭당 gzip ~30KB. 카드는 시설별 비율 6숫자만 필요 → summary endpoint 신설로 ~80B (99% 절감). raw rows 는 "상세 목록 보기" 클릭 시 lazy fetch.

`/api/polygon/by-bjd` 분기: bjd_code 끝 2자리 "00" → 읍면동 (lt_c_ademd, emd_cd=앞8) / 아니면 리 (lt_c_adri, li_cd=10자리 전체).

## 트리

```
web/lib/api/
├── kepco.ts    — fetchKepcoSummaryByBjdCode + fetchKepcoCapa* (by-bjd, by-jibun)
├── vworld.ts   — fetchVworldParcel* + fetchVworldAdminPolygonByBjdCode
└── enrich.ts   — enrichKepcoCapaRow*WithVillageInfo

web/lib/geo/
└── pnu.ts      — buildPnuFromBjdAndJibun
```

source 별 분리 이유: 미래 fetch 함수 30+ 시 한 파일 폭발. import 짧음 (`from "@/lib/api/kepco"`). `lib/vworld/parcel.ts`, `lib/vworld/admin-polygon.ts` 는 server-side lib (route.ts 내부에서 직접 호출), `lib/api/*` 는 client-side fetch wrapper — 역할 분리.

## How to apply
- **모든 atomic endpoint 호출은 `lib/api/*` atoms 통해서만**. 컴포넌트 안 fetch URL 인라인 금지 — URL 변경 시 grep 한 곳만
- `/api/capa/*` 응답은 raw row (주소 필드 없음). 사용 직전 `enrichKepcoCapaRowsWithVillageInfo(rows, allRows)` 로 마을 정보 주입 필수
- 지번 인터랙션은 `buildPnuFromBjdAndJibun` 으로 PNU 직접 구성 → VWorld 검색 API 우회 (~500ms → ~40ms)
- 검색 응답 `ji: KepcoDataRow[]` 도 동일하게 enrichment 필요 (Sidebar 가 처리)

## 진행 상태 (2026-04-24)
- ✅ atomic 5종 작성 + 검증 (31케이스)
- ✅ 마을 클릭 흐름 (`/api/capa/by-bjd`) — commit 6f55577
- ✅ 검색 ri / TOP 클릭 → 마을 흐름 재사용
- 🔄 Step A: 지번 클릭 흐름 (`/api/parcel/by-pnu` + `/api/capa/by-jibun` Promise.all) — 진행 중
- ⏳ 좌표 클릭 (`/api/parcel/by-latlng` → PNU 추출 → capa)
- ⏳ 마을 폴리곤 시각화 (`/api/polygon/by-bjd`)