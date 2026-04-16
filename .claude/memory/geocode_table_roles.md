---
name: 좌표 테이블 역할 분리
description: kepco_addr = 마을(리) 단위 좌표 (지도 마커), geocode_cache = 지번 단위 좌표 (핀, 태양광 등)
type: project
---

- `kepco_addr.lat/lng` — 마을(리) 단위 좌표. MV → 지도 마커용.
- `geocode_cache.lat/lng` — 지번 단위 좌표. 지번 클릭 핀, 향후 태양광 기능용.

**Why:** 역할 분리로 혼동 방지. 지번별 지오코딩 전체 적용 시 geocode_cache가 본격 활용됨.
