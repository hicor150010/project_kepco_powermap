-- ══════════════════════════════════════════════
-- 027: kepco_addr 에 bjd_code (법정동코드) 컬럼 추가
-- ══════════════════════════════════════════════
-- 배경:
--   VWorld 지오코딩 응답의 PNU(19자리) 앞 10자리 = 법정동코드.
--   좌표와 함께 한 번에 획득해 주소 매칭 기반을 이름→코드로 전환.
--
-- 효과:
--   - "-기타지역" OR 매칭 땜빵 (025) 불필요화
--   - VWorld/Kakao/KEPCO 3개 주소 체계를 단일 코드로 통합
--   - 외부 공공 API 연계 공통 키 (건축물대장 PNU, 법제처 bjd_code 등)
--
-- UNIQUE 아님:
--   같은 리가 addr_si/addr_gu 변종으로 여러 행 저장된 경우 (~1,144건)
--   전부 동일 bjd_code 공유해야 정답. 중복 허용.
-- ══════════════════════════════════════════════

ALTER TABLE kepco_addr ADD COLUMN IF NOT EXISTS bjd_code CHAR(10);

CREATE INDEX IF NOT EXISTS idx_addr_bjd_code
  ON kepco_addr (bjd_code)
  WHERE bjd_code IS NOT NULL;

COMMENT ON COLUMN kepco_addr.bjd_code IS
  '법정동코드 10자리 (행정안전부 표준). VWorld PNU 앞 10자리 = 이 값. 같은 리는 행 여러 개라도 동일 코드 공유. 2026-04-22 도입.';
