-- ══════════════════════════════════════════════
-- 031: kepco_capa 재설계 — addr_id → bjd_code 전환
-- ══════════════════════════════════════════════
-- 배경:
--   기존: kepco_capa.addr_id (FK→kepco_addr.id) — 130만 행
--   신규: kepco_capa.bjd_code (CHAR(10), bjd_master 참조, FK 미설정)
--
--   bjd_master(20,560행) 는 행안부 법정동코드 마스터.
--   주소 텍스트 / 좌표 의 단일 진실 공급원.
--   같은 리가 KEPCO 에서 -기타지역 변종으로 여러 행으로 저장된 케이스(~1,144건)
--   도 모두 동일 bjd_code 로 수렴.
--
-- 전환 정책:
--   1. kepco_capa 데이터는 TRUNCATE — 다시 크롤링 (130만 행)
--   2. addr_id 컬럼 DROP — kepco_addr 자체는 033 에서 별도 DROP
--   3. bjd_code NOT NULL — 매칭 실패 시 sentinel '0000000000' 저장
--      (NULL 허용 시 PostgreSQL UNIQUE 가 NULL≠NULL 처리해 중복 차단 실패)
--
-- 매칭 실패 sentinel '0000000000':
--   - 행안부 법정동코드 시도코드는 11~50 → '0000000000' 은 영구 안전
--   - SELECT COUNT(*) ... WHERE bjd_code = '0000000000' 으로 실패율 즉시 모니터링
--   - LEFT JOIN bjd_master 시 자연스레 NULL → 화면 표시는 별도 분기
--
-- 적용 순서: 031 적용 직후 즉시 032 (RPC/MV 재생성) 적용 필수.
--   031 만 적용된 상태에서는 모든 RPC 가 부재 → 웹 503/빈 결과.
-- ══════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- Phase 1: 의존 객체 임시 제거 (RPC/MV 가 addr_id 참조)
-- ─────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS kepco_map_summary;

DROP FUNCTION IF EXISTS get_location_detail(text);
DROP FUNCTION IF EXISTS search_kepco(text[], integer, integer, integer);
DROP FUNCTION IF EXISTS get_capa_by_jibun(text, text, text, text, text);
-- get_changes_since 와 kepco_capa_history 는 014 에서 이미 폐기됨 (kepco_capa_ref 로 전환).

-- ─────────────────────────────────────────────
-- Phase 2: 데이터 초기화
-- ─────────────────────────────────────────────

-- kepco_capa: 130만 행 전부 → 재크롤링
TRUNCATE TABLE kepco_capa;

-- 참고: kepco_capa_ref (014) / kepco_capa_history (010, 014에서 폐기) 는
-- 현 DB 에 부재 — compare 시스템이 미사용 상태로 보임. 후속 정리 별도 판단.

-- ─────────────────────────────────────────────
-- Phase 3: 스키마 변경
-- ─────────────────────────────────────────────

-- 기존 UNIQUE / 인덱스 제거 (addr_id 의존)
ALTER TABLE kepco_capa DROP CONSTRAINT kepco_capa_ukey;
DROP INDEX IF EXISTS idx_capa_addr_id;

-- addr_id 컬럼 제거 (FK 도 함께 사라짐)
ALTER TABLE kepco_capa DROP COLUMN addr_id;

-- bjd_code 컬럼 추가 — NOT NULL + sentinel 기본값
ALTER TABLE kepco_capa
  ADD COLUMN bjd_code CHAR(10) NOT NULL DEFAULT '0000000000';

COMMENT ON COLUMN kepco_capa.bjd_code IS
  '법정동코드 10자리 (bjd_master 참조, FK 미설정). 매칭 실패 시 sentinel ''0000000000''.';

-- ─────────────────────────────────────────────
-- Phase 4: 새 UNIQUE 제약 + 인덱스
-- ─────────────────────────────────────────────

-- 같은 이름 재사용 — UPSERT 키 = (bjd_code, addr_jibun, subst_nm, mtr_no, dl_nm)
ALTER TABLE kepco_capa
  ADD CONSTRAINT kepco_capa_ukey
  UNIQUE (bjd_code, addr_jibun, subst_nm, mtr_no, dl_nm);

-- bjd_code 단독 인덱스 — sentinel 제외 partial 로 크기 최소화
CREATE INDEX idx_capa_bjd_code
  ON kepco_capa (bjd_code)
  WHERE bjd_code <> '0000000000';

COMMENT ON INDEX idx_capa_bjd_code IS
  'bjd_master JOIN 가속. sentinel(매칭 실패) 행 제외 partial.';

-- idx_capa_jibun_main (022) 은 addr_jibun 기반이라 그대로 유지.
-- idx_capa_addr_id 는 위에서 DROP 됨.

-- ─────────────────────────────────────────────
-- Phase 5: kepco_capa CHECK — sentinel 가시화
-- ─────────────────────────────────────────────

-- 매칭 실패 카운트 모니터링용 — 운영 중 크롤러 측에서 수치 확인:
--   SELECT COUNT(*) FROM kepco_capa WHERE bjd_code = '0000000000';
-- 목표: < 1% (130만 행 기준 < 13,000)

-- ═══════════════════════════════════════════════
-- 다음 단계: 032 (RPC/MV 재생성), 033 (kepco_addr DROP)
-- ═══════════════════════════════════════════════
