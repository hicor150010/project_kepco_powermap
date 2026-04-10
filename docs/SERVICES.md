# 외부 서비스 통합 문서

이 문서는 프로젝트가 사용하는 모든 외부 서비스의 메타 정보를 한곳에 모아두는 곳입니다.
**실제 키 / 비밀번호는 [SECRETS.local.md](SECRETS.local.md)** 에 보관합니다 (gitignored).

---

## 한눈에 보기

| 서비스 | 용도 | 무료? | 한도 | 만료일 | 비고 |
|---|---|---|---|---|---|
| **Kakao Developers** | 지도 표시, 지오코딩 (메인) | ✅ | 300,000건/일 | - | 빠름, 정확 |
| **VWorld** | 지오코딩 (fallback) | ✅ | 사실상 무제한 | **2026-10-08** | 공공기관, 키 갱신 필요 |
| **Vercel** | 호스팅 | ✅ Hobby | 100GB 대역폭/월 | - | 미배포 |
| **Supabase** | DB / Auth / 캐시 | ✅ | 500MB DB / 5GB egress | - | `kepco-web-map` (Seoul) |

---

## 1. Kakao Developers

### 개요
- 카카오맵 JavaScript SDK + REST API 제공
- 한국 내 가장 빠르고 정확한 지오코딩
- 프로젝트의 **메인 지오코딩 + 지도 SDK**

### 콘솔
- URL: https://developers.kakao.com/console/app/1424714
- 앱 이름: `kepco_web`
- 앱 ID: `1424714`

### 사용 중인 기능
| 기능 | 키 종류 | 사용 위치 |
|---|---|---|
| 지도 SDK + 클러스터러 | JavaScript 키 | [components/KakaoMap.tsx](../web/components/KakaoMap.tsx) |
| 주소 → 좌표 변환 | REST API 키 | [app/api/geocode/route.ts](../web/app/api/geocode/route.ts) |
| 지도 검색(주소 이동) | JavaScript 키 | [app/page.tsx](../web/app/page.tsx) `handleSearch` |

### 무료 한도
| API | 한도 | 초과 시 | 비고 |
|---|---|---|---|
| 지도 JavaScript SDK | 무제한 | - | 마커, 클러스터링 포함 |
| 지오코딩 (주소→좌표) | 300,000건/일 | 차단 (과금 없음) | REST API |
| 역지오코딩 (좌표→주소) | 300,000건/일 | 차단 (과금 없음) | REST API |

### 등록된 플랫폼 (Web)
- `http://localhost:3000` (개발)
- ⚠️ Vercel 배포 후 운영 도메인 등록 필요

### 환경변수
```
NEXT_PUBLIC_KAKAO_JS_KEY  # JavaScript 키 (브라우저 노출 OK)
KAKAO_REST_KEY            # REST API 키 (서버 전용)
```

### 주의사항
- JavaScript 키는 브라우저에 노출되지만, **카카오 개발자 콘솔의 도메인 화이트리스트로 보호**됨
- REST API 키는 절대 브라우저에 노출 금지 → API Route 통해서만 호출
- 일 한도 초과 시 자동 차단 (과금 X), 자정 지나면 복구

---

## 2. VWorld (국토교통부 공간정보 오픈플랫폼)

### 개요
- 국토교통부에서 운영하는 공공 지도/주소 API
- **완전 무료**, 사실상 무제한
- 카카오 한도 초과 시 fallback으로 사용

### 콘솔
- URL: https://www.vworld.kr/dev/v4api.do
- 메인: https://www.vworld.kr

### 사용 중인 기능
| 기능 | 사용 위치 | 비고 |
|---|---|---|
| 검색 API (지오코딩) | [app/api/geocode/route.ts](../web/app/api/geocode/route.ts) | Kakao fallback |

### 무료 한도
- **공식**: 무제한
- **실질**: 분당/초당 트래픽 제한 있음 (일반 사용 시 문제 없음)
- **권장 병렬도**: 3~5개 동시 호출

### 키 정보
- **인증키 만료일**: **2026-10-08** ⚠️ **달력에 등록 권장**
- **등록 서비스 URL**:
  - `http://localhost:3000` (개발)
  - ⚠️ Vercel 배포 후 운영 도메인 추가 필요
- **활성화 API**: 검색 API, 2D 지도 API
- **갱신 방법**: 만료 전 콘솔에서 연장 신청

### 환경변수
```
VWORLD_KEY  # 인증키 (서버 전용)
```

### 주의사항
- **Referer 헤더 검증**: 등록한 URL에서 호출되는 요청만 허용
- 브라우저 직접 호출 시 CORS 막힘 → API Route 경유 필수
- "기타지역" 같은 비표준 주소는 카카오와 마찬가지로 실패 가능

### 응답 포맷 (참고)
```json
{
  "response": {
    "status": "OK",
    "result": {
      "point": { "x": "127.123456", "y": "34.567890" }
    }
  }
}
```

---

## 3. Vercel

### 개요
- Next.js 호스팅 플랫폼
- Edge Functions, KV, Postgres 등 통합 제공
- **현재 미배포** — 로컬 개발 중

### 무료 한도 (Hobby)
| 항목 | 한도 | 비고 |
|---|---|---|
| 대역폭 | 100 GB/월 | |
| 빌드 시간 | 6,000분/월 | |
| Edge Function 실행 | 500,000회/월 | |
| Vercel KV (Upstash) | 256 MB / 10K 명령/일 | 미사용 |

### 배포 시 필요 작업
1. GitHub 리포지토리 연결
2. 환경변수 등록 (Kakao, VWorld, Supabase 등)
3. Kakao 콘솔에 배포 도메인 추가
4. VWorld 콘솔에 배포 도메인 추가
5. 도메인 추가 후 SECRETS.local.md / SERVICES.md 업데이트

---

## 4. Supabase

### 개요
- Postgres + Auth + Storage + Edge Functions
- **프로젝트**: `kepco-web-map` (Seoul region)
- **Project ID**: `wtbwgjejfrrwgbzgcdjd`
- **콘솔**: https://supabase.com/dashboard/project/wtbwgjejfrrwgbzgcdjd
- KEPCO 데이터 + 지오코딩 캐시 + 사용자 인증 통합 저장소

### 무료 한도
| 항목 | 한도 | 비고 |
|---|---|---|
| DB 용량 | 500 MB | 핵심 |
| 월 egress | 5 GB | 다운로드 양 |
| API 요청 | 무제한 | |
| MAU | 50,000 | |
| **휴면** | 7일 미접속 시 일시정지 | ⚠️ |

### 예상 사용 구조
- `geocode_cache` — 주소→좌표 영구 캐시 (한 번 저장 후 재사용)
- `addresses` — 정규화된 주소 마스터
- `substations`, `distribution_lines` — 시설 마스터
- `kepco_data` — 용량/상태/STEP 데이터 (정기 upsert)

### 생성 시 필요 작업
1. supabase.com 회원가입
2. 새 프로젝트 생성 (region: Northeast Asia - Seoul 권장)
3. DB 패스워드 설정 → SECRETS.local.md 기록
4. 환경변수 발급:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (서버 전용)
5. 휴면 방지 cron 설정 (주 1회 ping)

---

## 5. GitHub Actions

### 개요
- KEPCO 크롤링 자동 실행 플랫폼
- 3개 독립 스레드 동시 실행 가능
- 아키텍처 상세: [CRAWLING.md](CRAWLING.md) 참고

### 리포지토리
- URL: https://github.com/hicor1/project_kepco_powermap
- Visibility: **Public** (Actions 무제한 무료)

### 워크플로우
| 이름 | 파일 | 용도 |
|------|------|------|
| KEPCO Crawl | `.github/workflows/crawl.yml` | 크롤링 (스레드 1/2/3) |
| KEPCO Geocode | `.github/workflows/geocode.yml` | 지오코딩 (레거시, 크롤러에 통합됨) |

### 무료 한도
| 항목 | 한도 | 비고 |
|------|------|------|
| 동시 Job | 20개 | 계정 기준 (3개 사용) |
| 실행 시간 | 무제한 | Public repo |
| Job당 최대 | 6시간 | 3시간 체이닝으로 해결 |
| 스토리지 | 500 MB | Artifacts/Cache |

### GitHub Secrets
| 시크릿 | 용도 | 비고 |
|--------|------|------|
| `SUPABASE_URL` | Supabase API URL | |
| `SUPABASE_SERVICE_KEY` | Supabase service role 키 | |
| `KAKAO_REST_KEY` | 카카오 지오코딩 | |
| `GH_PAT` | Actions 자동 트리거 | **workflow 스코프 필수** |

### 주의사항
- `GH_PAT`에 **workflow 스코프**가 있어야 crawl.yml 푸시 + dispatch 가능
- PAT 생성: GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
- concurrency group이 스레드별로 분리되어 동시 실행 안전

---

## 6. KEPCO API (크롤링 대상)

### 개요
- 한국전력공사 배전선로 여유용량 조회 시스템
- 비공식 API (웹 사이트 내부 API 역호출)
- **공식 API 제공 없음** — 차단 위험 있음

### 엔드포인트
- Base URL: `https://online.kepco.co.kr`
- 주소 조회: `/EWM092D00SJ.do` (POST, JSON)

### 차단 방지 대책
| 대책 | 설명 |
|------|------|
| User-Agent 랜덤 | 7개 브라우저 UA 풀 |
| 세션 재생성 | 2,000건마다 새 세션 |
| 주기적 휴식 | 1,000건마다 30초 대기 |
| 점진적 백오프 | 연속 에러 시 60~180초 대기 |
| delay 조정 | 0.15초~2.0초 (UI에서 설정) |

### 주의사항
- 동시 3개 스레드 시 delay를 0.5초 이상 권장
- 연속 10회 에러 시 자동 중단 (TooManyErrorsException)
- IP 차단 시 GitHub Actions 러너 IP 변경으로 자연 해제 (재실행)

---

## 부록 A — 자격증명 관리 원칙

### 1. 분리 원칙
- **공개 가능한 정보** → `SERVICES.md` (이 파일, git tracked)
- **비밀 정보** → `SECRETS.local.md` (gitignored)
- 새 서비스 추가 시: SERVICES.md 먼저 → SECRETS.local.md에 키 추가

### 2. .gitignore 확인
`docs/.gitignore`에 다음이 등록되어 있어야 함:
```
SECRETS.local.md
*.local.md
*.secret.md
```

### 3. 만료 관리
- 키 발급 시 **만료일을 SERVICES.md 표 + SECRETS.local.md**에 기록
- 만료 1개월 전 알림 권장

### 4. 키 노출 시 대응
1. 즉시 해당 서비스 콘솔에서 키 폐기/재발급
2. SECRETS.local.md 갱신
3. `.env.local` 갱신
4. Vercel 환경변수 갱신 (배포 중이라면)

### 5. 유출 사고 (참고)
- 2026-04-08: 초기 `API_KEYS.md`가 git에 commit되어 카카오 키가 히스토리에 남음
  → private repo이므로 외부 노출 없으나, 이후 SECRETS.local.md로 분리 관리
  → 카카오 키 폐기/재발급 검토 필요 (선택)

---

## 부록 B — 서비스별 콘솔 빠른 링크

| 서비스 | 콘솔 URL |
|---|---|
| Kakao | https://developers.kakao.com/console/app/1424714 |
| VWorld | https://www.vworld.kr/dev/v4api.do |
| Vercel | https://vercel.com/dashboard (미생성) |
| Supabase | https://supabase.com/dashboard (미생성) |

---

## 변경 이력
- 2026-04-08: 초안 작성. 기존 API_KEYS.md를 SERVICES.md(공개) + SECRETS.local.md(비공개)로 분리. VWorld 추가.
