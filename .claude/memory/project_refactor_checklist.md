---
name: 1차 내 리팩토링 체크리스트
description: 의뢰자 청구 외 내부 리팩토링 2건 — 비교 기능(엑셀 업로드 기반) + 리 테두리 오버레이. 카톡/견적서 노출 X
type: project
---

> **성격**: 비용 청구 없는 내부 리팩토링. 1차 진행 중 끼워 넣어 정리.
> **노출 금지**: `docs/견적_1차2차.md` / 카톡 전달본 / 외부 견적 합계에 포함하지 않음.
> **이유 (2026-04-22 의뢰자)**: "이전에 내가 만든 작업이 마음에 안 들어서 개편하는 것"

---

## ① 비교 기능 전면 개편 — 엑셀 업로드 기반

**목표**: 사용자가 과거 특정 시점에 다운받은 엑셀을 업로드하면, 현시점 데이터와 비교하여 달라진 부분만 노출.

### 1단계 — 기존 시스템 제거 ✅ **2026-04-22 완료**

**앱 코드 제거** (실제 수행됨)
- [x] `web/components/map/CompareFilterPanel.tsx` → "준비 중" 플레이스홀더로 축소
- [x] `web/components/map/Sidebar.tsx` → 탭 유지, props 전달 단순화 (`<CompareFilterPanel />`)
- [x] `web/components/map/UserGuide.tsx` → CompareTab 본문을 "개편 중" 안내로 교체
- [x] `web/components/map/SearchResultList.tsx` → SearchPick 유니온에서 `ji_compare` kind 제거
- [x] `web/components/map/LocationSummaryCard.tsx` → `compareRows` prop + CompareSection/CompareDetailRow/CapDelta 전부 제거, `CompareRefRow` import 제거
- [x] `web/components/map/KakaoMap.tsx` → `compareRows` prop, `compareOverlaysRef`, 80줄 분량 overlay 렌더링 블록 전부 제거, `CompareRefRow` import 제거
- [x] `web/components/map/MapClient.tsx` → `handleSearchPick` 의 `pick.kind === "ji_compare"` 분기 제거, `compareRows={[]}` prop 제거
- [x] `web/app/api/compare/route.ts` 삭제
- [x] `web/app/api/compare/dates/route.ts` 삭제
- [x] `web/app/api/compare/reset/route.ts` 삭제
- [x] `web/app/api/compare/` 디렉터리 제거
- [x] 크롤러 `crawler/crawl_to_db.py` — `sync_ref()` / `detect_changes()` 메서드 전체 삭제
- [x] 크롤러 `flush()` — 5·6단계(ref sync + detect changes) 호출 + 주석 제거
- [x] 크롤러 `flush()` — `upserted_ids` 수집 로직 간소화 (`return=representation&select=id` → `return=minimal`)

**문서**
- [x] `docs/COMPARE.md` 상단에 "⚠️ 2026-04-22 전면 폐기" 배너 추가 (본문은 과거 설계 기록으로 보존)
- [x] `docs/개발계획.md` — Phase 2 flush 흐름 / Phase 4 변화추적 / Phase 5 변화추적 연동 / 참고 문서 표 정리
- [x] `docs/CRAWLING.md` — flush 단계 설명 5·6 제거, 안전장치 표 변화감지 행 제거, 변경이력 2026-04-22 추가
- [x] `docs/SERVICES.md` — DB 구조 목록에서 ref/changelog 폐기 표기, 변경이력 2026-04-22 추가

### 2단계 — DB 정리 ✅ **2026-04-22 완료**

Supabase SQL Editor 에서 사용자가 수동 실행, 검증 쿼리로 0 rows 확인.

폐기 완료:
- [x] **테이블 2개**: `kepco_capa_ref`, `kepco_capa_changelog`
- [x] **RPC 7개**: `sync_capa_ref` · `detect_changes` · `reset_capa_ref` · `compare_at` · `compare_changelog` · `compare_with_ref` · `get_ref_info`

### 3단계 — 신규 엑셀 업로드 비교 구축 (미착수)

**새로 만들 것**
- [ ] 엑셀 업로드 경로 부활 (현재 `/api/upload` 는 503 스텁) — **비교 전용 별도 엔드포인트 권장** (e.g. `/api/compare/upload`)
- [ ] 업로드 엑셀 포맷 검증 — "시스템에서 내려받은 엑셀"만 허용 (헤더 시그니처 고정, 버전 태그 컬럼 검토)
- [ ] 서버 파서 재사용 — [web/lib/excel/parse.ts](../../web/lib/excel/parse.ts) 기존 `parseExcel` / `ParsedRow` 그대로 활용 가능
- [ ] 비교 로직: 업로드 엑셀 vs 현재 `kepco_capa` — 지번 복합키 매칭 (`addr_id, addr_jibun, subst_nm, mtr_no, dl_nm`) + 3시설 판정 diff
- [ ] 차이 시각화 UI — 목록 + 지도 색상 + 방향 배지 + 필터 (기존 `VillageStats` 구조 참고 가능)
- [ ] "기준 엑셀 내려받기" 편의 기능 (업로드용 양식 직접 생성)

**주의**
- 엑셀 포맷이 바뀌면 비교 깨짐 → 버전 태그 컬럼 하나 박아두기 검토
- 전국 엑셀 130만 행 비교 → 서버 메모리/시간 고려, 스트리밍 파서 필요 가능
- 응답은 변화 있는 행만 돌려주고, 클라이언트에서 필터링/정렬

---

## ② 리 클릭 시 마을 테두리 오버레이

**목표**: 리 클릭 → 현재는 위경도 좌표로 플래그 1개만 표시. 여기에 **마을(리) 법정 경계 폴리곤**도 함께 그려주기.

**구현 체크** (미착수)
- [ ] VWorld WFS `LT_C_ADRI_INFO` 레이어 TS 래퍼 (`web/lib/vworld/ri.ts` 신설)
- [ ] KV 캐시 키 `vworld:ri:{ctp}{sig}{emd}{li}`, **TTL 30일** (리 경계는 거의 불변)
- [ ] 리 클릭 이벤트에 훅 추가 — 기존 플래그 + 테두리 동시 렌더
- [ ] 카카오맵 `Polygon` 렌더 (기존 지번 필지 폴리곤 경로 재활용)
- [ ] 리 없는 지역(도심) fallback — 빈 응답 처리, 에러 로그만
- [ ] 줌 레벨별 표시 on/off 검토 (너무 축소 시 테두리 의미 없음)

**주의**
- 리 경계 응답 크기: 지번 대비 10~50배 → 캐시 필수
- 기존 VWORLD_KEY 쿼터 공유 → 캐시로 요청량 억제
- 이미 [docs/견적_1차2차.md](../../docs/견적_1차2차.md) 1차 1단계 "지적편집도 ON/OFF" 와 유사 성격 → 코드 재사용 가능

---

## 착수 순서

- ① 비교 기능 리팩토링 — **1단계(제거) 완료 / 3단계(신규 구축) 미착수**
- ② 리 테두리 오버레이 — 미착수
- 기본 입장: 1차 2단계 (면적/견적, 170만) **본 작업을 우선** 진행하고, 그 사이 틈틈이 병행

---

## 관련 메모 / 문서

- [SUNLAP 견적 — 진행 중](project_solar_proposal.md)
- [docs/견적_1차2차.md](../../docs/견적_1차2차.md) — 외부 견적 (이 리팩토링 2건은 **노출 금지**)
- [docs/COMPARE.md](../../docs/COMPARE.md) — 현 ref/changelog 설계 (2026-04-22 폐기, 기록 보존)
- [캐시 전략 체계화 — 차기](project_cache_strategy.md) — 리 테두리 KV 정책도 이 흐름에 포함
