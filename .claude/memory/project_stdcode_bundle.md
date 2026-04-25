---
name: 표준코드 번들 (행정표준코드 → 정적 JSON)
description: 코드 → 한글명 매핑은 행정표준코드 xlsx 를 정적 JSON 으로 번들링 (DB 적재 X). UI 개발 시점에 진행
type: project
---

행정표준코드(www.code.go.kr) **xlsx 7종**을 받아 `data/행정표준코드/` 에 보관 중. UI 에서 코드값 → 한글 표시할 때 활용.

## 결정사항 (2026-04-25)

- **DB 적재 X** → `web/lib/stdcode/data/*.json` 정적 번들로 처리
- 이유: 연 1~2회 갱신 / 합계 ~25KB gzip / DB 왕복 불필요
- 빌드 스크립트는 `xlsx` npm 패키지(이미 설치됨)로 Node.mjs 1회성 변환
- 갱신 시: xlsx 교체 → `npm run build:stdcode` → JSON 재생성 → commit

## 보유 xlsx (data/행정표준코드/)

지목(28) / 건축물구조(45) / 건축물용도(968) / 용도지역지구(1467) / 건축물대장종류 / 건축행위구분 / 건축구분

## 매핑 대상 (UI 렌더링 시)

- VWorld `jimok` → 지목 (예: `8`→대)
- VWorld `LT_C_UQ128.uq_cd` → 용도지역지구
- 건축HUB `mainPurpsCd` → 건축물용도
- 건축HUB `strctCd` → 건축물구조

## bjd_master 는 별개 처리

- 너무 큼 (~500KB gzip) → DB 유지 + 검색 API
- 시도/시군구만(~5KB) 번들화는 가능 (필요해지면 그때)

**Why:** 사용처(지번 클릭 팝업 UI)가 아직 미구현이라 지금 번들 만들면 사용처 없는 코드. UI 개발과 함께 진행해야 의미 있음.
**How to apply:** 지번 클릭 팝업/필지 정보 표시 UI 개발 착수 시 이 메모 회상 → 위 결정사항대로 바로 구현 (DB vs JSON 재고민 금지).
