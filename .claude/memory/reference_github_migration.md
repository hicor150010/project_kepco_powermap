---
name: GitHub 계정 이전 (hicor1 → hicor150010)
description: 2026-04-19 GitHub 저장소/계정 이전 완료. 이전 계정/PAT 참조 시 혼동 방지용.
type: reference
---

## 현재 GitHub 상태 (2026-04-19 이후)

- **저장소**: https://github.com/hicor150010/project_kepco_powermap (Public)
- **계정**: `hicor150010@gmail.com` (Google 소셜)
- **PAT**: `ghp_BMREnU1fn...` (자세한 값은 `docs/SECRETS.local.md`)

## 이전 전 상태 (2026-04-19 이전, 현재 존재하지 않음)

- 저장소: ~~`hicor1/project_kepco_powermap`~~ (삭제됨)
- 계정: ~~`hicor1`~~
- 구 PAT: ~~`ghp_kScOxR4c...`~~ (삭제됨)

## 주의

- 과거 commit message, issue reference, 문서에 `hicor1` 이 등장하면 **옛날 저장소 참조**임
- 혹시 외부 문서/블로그에서 `github.com/hicor1/project_kepco_powermap` 링크를 발견하면 **모두 404** (구 저장소 삭제됨)
- **Archive 나 Fork 로 남겨두지 않았음** — 완전 삭제

## 이전 작업 시 배운 것

- Windows Git Credential Manager 에 구 계정 캐시가 남아있으면 새 저장소 push 시 403 발생 → PAT 를 URL 에 직접 끼워서 push (`https://user:pat@github.com/...`) 후 push 성공하면 URL 에서 PAT 제거하는 방식이 가장 확실
- Vercel GitHub 연동은 재연결 시 **환경변수는 보존**되므로 재등록 불필요 (단, `GITHUB_PAT` 같이 **PAT 값 자체가 바뀌는 변수**는 수동 업데이트 필요)
- GitHub Actions 시크릿은 **저장소 소속**이라 새 저장소에 **수동 재등록 필수** (자동 이전 안 됨)