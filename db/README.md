# DB Migrations

Supabase Postgres 스키마 마이그레이션 SQL 파일.

## 실행 방법

1. https://supabase.com/dashboard/project/wtbwgjejfrrwgbzgcdjd/sql/new 접속
2. 마이그레이션 파일 내용을 SQL Editor에 붙여넣기
3. **Run** 클릭
4. 결과 확인

## 순서대로 실행

| 순번 | 파일 | 내용 |
|---|---|---|
| 001 | `001_init.sql` | 핵심 테이블 (geocode_cache, kepco_data, user_roles) |
| 002 | `002_indexes.sql` | 조회 성능 인덱스 |
| 003 | `003_materialized_view.sql` | 지도용 집계 뷰 |
| 004 | `004_rls.sql` | Row Level Security 정책 |

## 주의

- **순서대로** 실행해야 함 (의존 관계 존재)
- 한 번 실행한 파일은 다시 실행하지 말 것 (DROP/CREATE 충돌)
- 이미 존재하는 객체 에러 발생 시 → 내용 확인 후 필요한 부분만 추출 실행

## 롤백

각 마이그레이션의 역작업은 별도 `_rollback.sql`로 관리 (필요 시).
긴급 상황엔 Supabase 콘솔에서 DROP TABLE 직접 실행 가능.
