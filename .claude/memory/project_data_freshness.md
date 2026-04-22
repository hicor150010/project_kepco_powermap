---
name: 전기용량 데이터 신선도 표시
description: 전기용량 정보를 보여줄 때 DB 에 저장된 수집 시각을 함께 노출 — 한전온 실값과 불일치 가능성 인지용
type: project
---

## 배경 (2026-04-22)

- 오늘 아침 의뢰자가 **한전온 화면값과 사이트 표시값이 2배 가까이 다르다**고 보고
- 조사 결과: 크롤러/API 로직은 정상. 원인은 **DB 가 과거 크롤링 시점의 스냅샷**이라서 그동안 접수 용량이 대폭 늘었는데 반영 안 됨
- 대표 사례: 묵백리 1036 (백운 변전소). DB 접수 54.24MW ↔ 한전온 실값 102.25MW — "여유있음"을 "여유없음"으로 오판

## 의뢰자 요청

전기용량 정보를 보여줄 때 **"이 데이터가 몇 시 몇 분에 추출된 것인지"** 를 함께 표시.
사용자가 값의 신선도를 인지하고 필요 시 한전온 직접 확인을 선택할 수 있도록.

## 구현 체크 (미착수)

### 데이터 소스 확인
- [ ] `kepco_capa` 테이블에 수집 시각 컬럼이 있는지 확인 — `crawled_at` 있음 ([crawler/crawler.py](../../crawler/crawler.py) CrawlResult), DB 반영 여부 점검
- [ ] 없으면 컬럼 추가 + 크롤러 UPSERT 에 포함 + 마이그레이션 작성

### UI 노출 지점
전기용량이 표시되는 모든 화면에 일관된 배지 필요:
- [ ] [LocationSummaryCard](../../web/components/map/LocationSummaryCard.tsx) — 마을 요약 카드
- [ ] [LocationDetailModal](../../web/components/map/LocationDetailModal.tsx) — 상세 목록 모달
- [ ] [ParcelInfoPanel](../../web/components/map/ParcelInfoPanel.tsx) — 지번 클릭 패널
- [ ] [SearchResultList](../../web/components/map/SearchResultList.tsx) `JibunDetail` — 검색 결과 펼침

### 표시 방식 (결정 필요)
- 상대 시간 ("3일 전 수집") vs 절대 시각 ("2026-04-19 14:23 수집")
- 오래된 정도에 따른 색상 경고 (예: 7일 경과 시 주황, 30일 경과 시 빨강)
- "한전온에서 직접 확인" 링크 병기 여부 ([한전온 URL](https://online.kepco.co.kr/EWM092D00))

### 관련 고려
- 지번마다 수집 시각이 다를 수 있음 (크롤러가 순차 진행) → 여러 행 표시 시 최고/최저/평균 중 무엇을 보여줄지
- 캐시(KV `kepco:live:*` 차기 기능) 도입 시 "KV 캐시 시각" 과 "DB 수집 시각" 구분 필요

## 관련 메모

- [여유용량 판정 수식](kepco_vol_formula.md)
- [거짓말/추측 금지](feedback_no_lies_no_guess.md) — 사용자에게 값의 불확실성 정직히 노출하는 차원
- [1차 리팩토링 체크리스트](project_refactor_checklist.md) — 엑셀 업로드 비교 UI 작업 시 함께 다루면 효율적
