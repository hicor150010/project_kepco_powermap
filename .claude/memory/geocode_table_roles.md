---
name: 좌표 저장소 역할 분리
description: kepco_addr.lat/lng = 마을 대표 좌표, geocode_cache = 마을 단위 캐시만, 지번 좌표는 Vercel KV (TTL 3일)
type: project
---

- `kepco_addr.lat/lng` — 마을(리) 단위 대표 좌표. MV/지도 마커용.
- `geocode_cache.lat/lng` — 마을(리/동) 단위 주소 → 좌표 캐시. **지번 단위 저장 금지**.
- **Vercel KV** — 지번 단위 필지정보(ParcelResult). TTL 3일. 키 `parcel:{주소}`, 마을 인덱스 `parcel:v:{마을주소}`.

**Why:** 지번 단위까지 DB에 영구 저장하면 테이블 비대해지고 크롤링 변동 대응이 느려짐. 지번 좌표는 접근 빈도 편향이 크므로 TTL 캐시가 적합. `/api/geocode-cached` 는 이제 KV 만 조회 (DB 미조회).

**How to apply:**
- 지번 단위 좌표/필지는 반드시 KV (`lib/cache/parcelKv.ts`) 경로로만.
- `/api/geocode` (단건 카카오) 는 마을 단위 전용으로 사용 — 업로드 파이프라인 등에서 지번 넣지 말 것.
- 기존 쌓인 지번 행은 마이그레이션 `021_purge_jibun_geocode.sql` 로 제거됨.
- 엑셀 업로드는 2026-04-22 잠정 중단 (`/api/upload` 503, `/admin/upload` 안내 페이지).
