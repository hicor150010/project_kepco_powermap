---
name: KEPCO 여유용량 판정 수식
description: 여유용량 판정 로직 — (capa-pwr≤0)OR(capa-g_capa≤0)이면 없음. 3개 시설 동일 적용.
type: reference
---

## 수식 (KEPCO 프론트엔드 EWM092D01.xml에서 추출)

```
여유없음 = (capa - pwr ≤ 0) OR (capa - g_capa ≤ 0)
여유있음 = (capa - pwr > 0) AND (capa - g_capa > 0)
```

3개 시설(변전소/주변압기/배전선로) 동일 적용. NULL은 0 처리.

**Why:** vol_subst/mtr/dl 컬럼 삭제 후 이 수식으로 코드에서 계산. 기존 "주의" 값은 엑셀 업로드에서 유입된 잘못된 데이터였음.
