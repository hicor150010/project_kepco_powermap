---
name: 특허 출원 중 워터마크 (임시 표시)
description: 지도 화면에 "특허 출원 중 · Patent Pending" 사선 워터마크. 특허 등록 완료 시 제거 예정.
type: project
---
## 현황 (2026-04-15 추가)

지도 화면 전체에 "특허 출원 중 · Patent Pending" 사선(-30°) 반복 워터마크 표시.

- 파일: `web/components/map/PatentWatermark.tsx`
- 연결: `web/components/map/MapClient.tsx` 루트 div 최하단에 `<PatentWatermark />`
- 투명도: 10% (rgba(0,0,0,0.10))
- 관리자 페이지(`app/admin/*`)는 적용 안 됨 (AdminNav 사용하기 때문)

**Why:** 의뢰자가 특허 출원 진행 중이라 등록 완료 전까지 권리 고지 목적. 등록 후 삭제 예정.

**How to apply:** 특허 등록 완료 소식이 들리면 아래 방법으로 제거.

## 동작 원리 (기능 영향 0인 이유)

- `pointer-events: none` — 마우스/터치 이벤트 모두 투과 (지도 드래그, 마커 클릭, 버튼 클릭 전부 정상)
- `user-select: none` — 텍스트 드래그 선택 불가
- `overflow: hidden` — 회전된 텍스트가 화면 밖으로 안 넘침
- `z-index: 45` — 지도 UI 위, 모달(z-100) 아래 (모달 뜨면 워터마크 가려짐)
- `position: absolute inset-0` — MapClient 루트 div 기준 전체 화면 덮음

## 제거 방법

### A. 환경변수 토글 (즉시, 권장)
```
# .env.local 또는 Vercel 환경변수
NEXT_PUBLIC_PATENT_PENDING=false
```
재배포만 하면 워터마크 안 보임. 코드 수정 불필요.

### B. 코드 완전 제거
1. `web/components/map/MapClient.tsx` 에서 `PatentWatermark` import 삭제
2. 같은 파일에서 `<PatentWatermark />` 렌더 라인 삭제
3. `web/components/map/PatentWatermark.tsx` 파일 삭제
4. `docs/개발계획.md` §4-2 "특허 출원 중 워터마크" 섹션 삭제
5. 이 메모 파일 삭제 + MEMORY.md 해당 라인 삭제

## 관련 문서
- `docs/개발계획.md` §4-2
- `web/components/map/PatentWatermark.tsx` 상단 주석
