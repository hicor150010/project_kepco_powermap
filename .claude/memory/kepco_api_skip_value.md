---
name: KEPCO API -기타지역 처리 규칙
description: search_capacity 호출 시 -기타지역 값 처리 — addr_li만 빈값, 나머지 그대로 + 0건 시 전체 빈값 재시도
type: project
---

KEPCO API(retrieveMeshNo)의 -기타지역 처리가 지역마다 다름:
- 광주광역시: addr_si="-기타지역" **유지해야** 결과 나옴
- 충남 천안시: addr_gu="-기타지역" **빈값이어야** 결과 나옴
- addr_li="-기타지역"은 **항상 빈값으로** 보내야 함

**Why:** KEPCO API 내부 구현이 일관성 없음. 단순히 모든 -기타지역을 빈값으로 바꾸거나 그대로 보내면 일부 지역에서 0건 반환.

**How to apply:** crawler.py의 _search_jibun에서 2단계 재시도:
1. 1차: addr_li만 빈값, 나머지 그대로
2. 0건이면 2차: 모든 -기타지역을 빈값으로 재시도

전국 8개 지역 테스트 8/8 성공 확인 (2026-04-09).
