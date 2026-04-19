---
name: 도메인 sublab.kr 연결 예정
description: 가비아에서 sublab.kr 구매 완료. 추후 Vercel/배포 환경에 DNS 연결 작업 필요
type: project
---

# 도메인 sublab.kr

- **구매처**: 가비아
- **도메인**: `sublab.kr`
- **상태**: 구매 완료, DNS 미연결 (2026-04-19 기준)

**Why:**
의뢰자가 서비스 정식 운영을 위해 직접 도메인 구매. 현재는 Vercel 기본 도메인으로 접근 중.

**How to apply:**
- 배포/도메인 관련 작업 요청 시, 이 도메인을 기본 후보로 인지
- 연결 작업 시 필요한 단계:
  1. 가비아 DNS 관리에서 Vercel 네임서버 또는 A/CNAME 레코드 설정
  2. Vercel 프로젝트 → Settings → Domains 에 `sublab.kr` 추가
  3. SSL 인증서 자동 발급 확인
- 서브도메인 사용 여부는 의뢰자 확인 필요 (e.g. `app.sublab.kr` vs 루트)