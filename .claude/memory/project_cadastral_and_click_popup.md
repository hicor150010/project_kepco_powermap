---
name: 지적편집도 + 지도 클릭 지번 팝업
description: 카카오맵 지적편집도 레이어 토글 + 지도 빈 곳 클릭 시 해당 지번의 용량 정보 팝업 (차기 개발)
type: project
---
## 1. 지적편집도 레이어
- 카카오맵 내장 `window.kakao.maps.MapTypeId.USE_DISTRICT` 오버레이 추가
- MapToolbar에 토글 체크박스 (스카이뷰 "도로·지명 표시" 옆에 배치)
- 스카이뷰/로드맵과 독립 — addOverlayMapTypeId / removeOverlayMapTypeId

## 2. 지도 클릭 → 지번 용량 팝업
- 지도 빈 곳 클릭 시 해당 좌표의 지번 용량 정보 표시
- 흐름: 지도 클릭 (lat,lng) → 카카오 역지오코딩 → 지번 문자열 → 신규 RPC `get_capa_by_jibun(addr_text)` → 용량 반환 → 팝업
- 신규: `/api/location/by-jibun` 엔드포인트
- 기존 handleJibunPin / LocationSummaryCard 재활용 가능 여부 검토
- 측정/거리재기 모드와 클릭 이벤트 충돌 방지

**Why:** 지적편집도로 지번 경계를 시각적으로 본 뒤, 원하는 지번을 바로 클릭해서 용량을 확인할 수 있는 워크플로우. 지적편집도 없이는 클릭 팝업이 의미 없음.

**How to apply:** 순서는 지적편집도 먼저 → 지도 클릭 팝업. 역지오코딩은 카카오 REST API 사용 (coord2address). 지번 단위 용량 조회는 kepco_capa.addr_jibun 매칭.
