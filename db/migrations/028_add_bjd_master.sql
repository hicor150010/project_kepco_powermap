-- ══════════════════════════════════════════════
-- 028: bjd_master — 행안부 법정동코드 주소 마스터
-- ══════════════════════════════════════════════
-- 배경:
--   KEPCO 주소 체계는 행정구역 개편 미반영·계층 오류·데이터 오염 다수.
--   행안부 법정동코드(공식 표준)를 "주소 마스터"로 삼아
--   KEPCO / VWorld / 기타 외부 API 데이터를 bjd_code 기준으로 연결한다.
--
-- 출처:
--   행정표준코드관리시스템 (code.go.kr) "법정동 코드 전체자료" CSV
--   월 1회 갱신 / 이 마이그 기준 2026-04-23 버전 — 존재 행 20,560개
--
-- sep_1~5 구조 (KEPCO addr_* 5필드와 1:1 매핑):
--   sep_1  시/도          ↔ addr_do
--   sep_2  일반시          ↔ addr_si
--   sep_3  자치구 / 행정구 / 군 ↔ addr_gu
--   sep_4  읍 / 면 / 동    ↔ addr_dong
--   sep_5  리              ↔ addr_li
--
-- bjd_code:
--   10자리 법정동코드 (PK). VWorld PNU 19자리 앞 10자리.
--   외부 공공 API 공통 키 (건축물대장 / 태양광허가 / 법제처 조례 / KOSIS).
--
-- 좌표(lat/lng):
--   VWorld 로 리 단위 중심점을 별도 채움 (이 마이그레이션에서는 NULL).
--
-- 폐지 행(29,539개) 미포함:
--   현존 20,560개만 저장. 폐지 매핑은 추후 KEPCO 클리닝 모듈에서 별도 관리.
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bjd_master (
  bjd_code    CHAR(10) PRIMARY KEY,

  sep_1       TEXT NOT NULL,
  sep_2       TEXT,
  sep_3       TEXT,
  sep_4       TEXT,
  sep_5       TEXT,

  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,

  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bjd_sep
  ON bjd_master (sep_1, sep_2, sep_3, sep_4, sep_5);

COMMENT ON TABLE bjd_master IS
  '행안부 법정동코드 마스터 (code.go.kr 월 1회 CSV). KEPCO/VWorld/외부 API 의 공통 조인 키. 2026-04-23 도입.';

COMMENT ON COLUMN bjd_master.bjd_code IS '법정동코드 10자리. VWorld PNU 앞 10자리와 동일.';
COMMENT ON COLUMN bjd_master.sep_1 IS '시/도 (KEPCO addr_do 와 동일값)';
COMMENT ON COLUMN bjd_master.sep_2 IS '일반시 (KEPCO addr_si). 광역시 자치구 체계에선 NULL.';
COMMENT ON COLUMN bjd_master.sep_3 IS '자치구/행정구/군 (KEPCO addr_gu)';
COMMENT ON COLUMN bjd_master.sep_4 IS '읍/면/동 (KEPCO addr_dong)';
COMMENT ON COLUMN bjd_master.sep_5 IS '리 (KEPCO addr_li). 동/가 단위에선 NULL.';
