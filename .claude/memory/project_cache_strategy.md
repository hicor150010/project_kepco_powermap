---
name: 캐시 전략 체계화 — 차기 작업
description: 현재는 parcel-by-address 만 KV. 추후 HTTP Cache-Control / KV / Next Data Cache 레이어 정리 필요
type: project
---

# 배경

2026-04-22 search/parcel 성능 최적화 마무리 시점, 사용자가 "캐시는 나중에 체계적으로
관리할 수 있는 무언가를 따로 만들어야겠다" 고 결정. 이번 세션에선 **선별 적용만** 하고
**전사 캐시 체계는 별도 작업으로 분리**.

# 현재 상태 (2026-04-22)

| 레이어 | 어디에 |
|---|---|
| HTTP Cache-Control | `/api/parcel` `private, max-age=300` 만. `/api/map-summary` 는 `no-store` (과거 "마커 0" 사고 때문) |
| Vercel KV | `/api/parcel-by-address` 만 (지번 필지정보 TTL 3일) |
| DB 캐시 | ~~`geocode_cache`~~ → 2026-04-22 폐기. 좌표는 `kepco_addr.lat/lng` 단일 저장 |
| MV | `kepco_map_summary` — 크롤링/업로드 후 `/api/refresh-mv` 로 갱신 |

# 차기 작업 범위

1. **"마커 0" 사고 복기** — `/api/map-summary` 가 `no-store` 인 진짜 이유 파악.
   docs/개발계획.md §4-1 참조. stale 응답이 원인이었다면 `stale-while-revalidate` 도
   동일 위험. 원인 재현 조건 정리가 선결.

2. **HTTP Cache-Control 도입 기준 정의**
   - 크롤링 주기(6시간) 고려해 `s-maxage` 값 설계
   - 관리자 수동 갱신(`/api/refresh-mv`) 과의 정합
   - "즉시 반영" 필수 API (업로드 직후 등) 식별

3. **KV 확장 기준**
   - 전사 공유 가치 큰 것만 (예: 자주 조회되는 검색 결과)
   - 무료 티어 한도 확인 (현재 미확인)
   - 쓰기 시 invalidate 정책

4. **Next 16 Data Cache / unstable_cache**
   - App Router 환경에 맞게 fetch cache 옵션 활용 여부 검토

# How to apply

이 작업 착수 시:
- 먼저 "마커 0" 사고 원인부터 복기
- 1 개 엔드포인트 (예: `/api/search`) 에 짧은 캐시(`s-maxage=30`) 시험 적용
- 사고 재현 없으면 확장
- 쓰기 경로의 invalidate 누락 검증 필수