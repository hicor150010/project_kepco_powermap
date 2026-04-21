---
name: 도메인 sublab.kr 연결 작업 중
description: 가비아 sublab.kr → Vercel 연결. Vercel 측 도메인 추가 완료 (2026-04-21). 가비아 DNS 입력 남음
type: project
---

# 도메인 sublab.kr

- **구매처**: 가비아 (의뢰자 직접 구매)
- **도메인**: `sublab.kr`
- **가비아 계정**: 카카오 소셜 로그인 (`anhong7749`) — 개발자가 대신 접속 불가

## 현재 진행 상태 (2026-04-21)

- ✅ Vercel 프로젝트(`kepco-powermap`) 에 `sublab.kr` + `www.sublab.kr` 추가
- ✅ Vercel 자동 구성: `sublab.kr` → `www.sublab.kr` 로 307 리다이렉트, `www` 가 메인
- ⏳ 가비아 DNS 레코드 입력 대기 (의뢰자 PC 원격 연결 예정)

## 가비아에 입력할 DNS 값

```
A     @     216.198.79.1                                TTL 600
CNAME www   9fc9fba5905538a5.vercel-dns-017.com.        TTL 600
```

CNAME 값 끝 점(`.`) 포함 주의. 가비아 UI 에서 자동 처리될 수도, 수동일 수도 있음.

## 연결 방식 결정

- 의뢰자 컴맹 + 카카오 소셜 로그인 → 원격 PC 연결 (AnyDesk) 로 진행 결정
- 개발자가 의뢰자 PC 원격 조작하여 가비아 DNS 입력

**Why:** 의뢰자 직접 DNS 편집은 허들 높음. 카카오 소셜 계정 공유는 카톡/카카오페이 등 전체 노출되어 위험. 원격 PC 가 가장 안전하고 빠름.

**How to apply:**
- DNS 전파: 보통 5~30분, 최대 24시간
- 전파 확인: `nslookup sublab.kr` 또는 https://dnschecker.org
- Vercel Domains 화면에서 Refresh 클릭 → Valid Configuration 되면 완료
- SSL 인증서 자동 발급 (Let's Encrypt, 수 분 내)
- 연결 후 Kakao Developers 콘솔에 `https://sublab.kr`, `https://www.sublab.kr` 추가 필수 (카카오맵 SDK 차단 방지)