---
name: 함수 네이밍 컨벤션 — [verb][Source][Entity][By + Input]
description: 미래 30+ 함수 추가 대비 충돌 0 + grep 정확성. 가독성 손해보다 장점이 큼.
type: feedback
---

# 함수 네이밍 패턴

`[verb][Source?][Entity][By/With/From + Input]`

## 부분별 의미

| 부분 | 예시 |
|---|---|
| verb | fetch, enrich, build, parse, format |
| Source | Kepco, Vworld, Kicox, Korem (데이터 출처 명시 — 도메인 충돌 방지) |
| Entity | Capa, Parcel, Polygon, Permit, Building (대상 객체) |
| By + Input | ByBjdCode, ByPnu, ByLatLng, ByAddress |

## 적용 예 (2026-04-24 합의)

```ts
// API atoms — endpoint 와 1:1 거울
fetchKepcoCapaByBjdCode(bjdCode)            → /api/capa/by-bjd
fetchKepcoCapaByJibun(bjdCode, jibun)       → /api/capa/by-jibun
fetchVworldParcelByPnu(pnu)                 → /api/parcel/by-pnu
fetchVworldParcelByLatLng(lat, lng)         → /api/parcel/by-latlng
fetchVworldAdminPolygonByBjdCode(bjdCode)   → /api/polygon/by-bjd

// enrichment
enrichKepcoCapaRowWithVillageInfo(row, village)
enrichKepcoCapaRowsWithVillageInfo(rows, villages)

// geo
buildPnuFromBjdAndJibun(bjdCode, jibun)

// MapClient handler — "어떤 패널을 어떤 입력으로 여는가" 시멘틱
openVillagePanelOnMarkerClick(row)
openParcelPanelOnMapClick(lat, lng)
openParcelPanelOnJibunClick(row)
handleSearchResultPick(pick)
handleTopRankingPick(row)
```

## Why
- **검색 정확**: 짧은 이름 (`fetchCapaByBjd`) 은 grep 시 무관 코드와 충돌. `fetchKepcoCapaByBjdCode` 는 1:1 매칭
- **확장 시 충돌 0**: 미래 30+ fetch 추가 대비. 예측 가능한 충돌 — `fetchKepcoCapaHistoryByBjdCode`, `fetchKicoxIndustrialZoneByBjdCode`, `fetchSolarPermitByBjdCode`, `fetchBuildingRegisterByPnu` 등 자연스럽게 공존
- **endpoint ↔ 함수 양방향 추적**: 함수명이 endpoint 거울 → 어느 쪽 봐도 다른 쪽 즉시 grep 가능

## How to apply
- **신규 lib 함수 작성 시 이 패턴 준수**
- 가독성 손해 (한 줄 호출 줄바꿈) 는 IDE 자동완성 + minify 로 상쇄 — 런타임/번들 영향 0
- handler 명도 동일 정신: `[verb][Target+Detail/Panel][On + Source][Click/Pick/Hover]`
- prop 명 (Sidebar.onJibunPin 등) 은 contract 라 점진 정리 — 함수명만 먼저 정리
