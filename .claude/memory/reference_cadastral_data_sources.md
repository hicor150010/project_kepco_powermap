---
name: 지적도 데이터 출처 + 카카오 SDK 한계
description: VWorld LX 편집지적도(lt_c_landinfobasemap) 사용 + 카카오 USE_DISTRICT 부정확 + 외부 타일 오버레이 비호환 (재시도 방지)
type: reference
---

# 지적도 데이터 출처 결정 (2026-04-25)

## 사용 중

**VWorld `lt_c_landinfobasemap`** (LX 한국국토정보공사 편집지적도)
- 토지이음 / 일사편리와 같은 정부 공식 데이터
- WFS GetFeature 로 PNU/좌표 → 폴리곤 + 지목/면적/공시지가 ([web/lib/vworld/parcel.ts](../../web/lib/vworld/parcel.ts))
- 응답 schema: `pnu, jibun, jimok(풀명칭), mnnm/slno(0-pad), gbn_cd(1=일반/2=산), sido_nm/sgg_nm/emd_nm/ri_nm, jiga_ilp, parea`

## 사용 X (이유 — 재시도 금지)

### lp_pa_cbnd_bubun (VWorld 자체 연속지적도)
- 시골에서 토지이음과 **67m 일관 어긋남** 실측 확인 (직리 179/870/116-2 등)
- 도시(서울 강남)는 1m 일치 — 시골만 부정확
- 검증 도구: [web/scripts/test-vworld-lx/](../../web/scripts/test-vworld-lx/)

### 카카오 USE_DISTRICT 외부 타일 교체
- **카카오 SDK 한계 — EPSG:3857 외부 타일 오버레이 사실상 불가능**
- 카카오 SDK = EPSG:5181 (한국 자체 TM), VWorld = EPSG:3857 (Web Mercator) — 좌표계 본질적 비호환
- 카카오 z/x/y → EPSG:5181 BBOX 변환 룰 미공개 (역공학 필요)
- 시도 결과: `Tileset.add()` 후 `'md'` 런타임 에러 또는 빈 타일 응답
- → **현 구조 유지**: 카카오 USE_DISTRICT 배경 + 우리 LX 폴리곤 (배경 라벨만 일부 부정확, 폴리곤은 정확)

## 카카오 USE_DISTRICT 자체 한계 (참고)
- 카카오 공식 명시: "현행 지적 정보와 일치하지 않을 수 있으며 참고 이외의 용도로 사용하실 수 없습니다"
- 분할 부번 누락 + 일부 라벨 위치 어긋남 (예: 위성 모드의 "53-4" 라벨 ≠ 실제 위치)
- 그러나 사용자가 클릭하면 우리 LX 폴리곤이 정답 위치 → 카드 정보(지번/지목) 신뢰 가능