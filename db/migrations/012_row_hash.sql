-- ============================================================
-- 012_row_hash.sql — 9컬럼 unique → MD5 해시 unique 전환
-- 작성: 2026-04-11
--
-- 목적:
--   기존 9컬럼 텍스트 unique constraint (17MB)를
--   32자 MD5 해시 1컬럼 unique (~5MB)로 대체하여 저장 공간 절약.
--   전국 데이터 기준 ~96MB 절약 예상.
--
-- 원복:
--   ALTER TABLE kepco_data ADD CONSTRAINT kepco_data_unique_key
--     UNIQUE (addr_do, addr_si, addr_gu, addr_dong, addr_li,
--             addr_jibun, subst_nm, mtr_no, dl_nm);
--   ALTER TABLE kepco_data DROP CONSTRAINT IF EXISTS kepco_data_row_hash_key;
--   DROP TRIGGER IF EXISTS trg_row_hash ON kepco_data;
--   DROP FUNCTION IF EXISTS fn_kepco_row_hash();
--   ALTER TABLE kepco_data DROP COLUMN IF EXISTS row_hash;
-- ============================================================

-- 1) 트리거 함수: INSERT/UPDATE 시 해시 자동 계산
CREATE OR REPLACE FUNCTION fn_kepco_row_hash() RETURNS TRIGGER AS $$
BEGIN
  NEW.row_hash := md5(concat_ws('|',
    NEW.addr_do, COALESCE(NEW.addr_si,''), COALESCE(NEW.addr_gu,''),
    COALESCE(NEW.addr_dong,''), COALESCE(NEW.addr_li,''),
    COALESCE(NEW.addr_jibun,''), COALESCE(NEW.subst_nm,''),
    COALESCE(NEW.mtr_no,''), COALESCE(NEW.dl_nm,'')));
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- 2) 컬럼 추가
ALTER TABLE kepco_data ADD COLUMN IF NOT EXISTS row_hash text;

-- 3) 기존 행 채우기
UPDATE kepco_data SET row_hash = md5(concat_ws('|',
  addr_do, COALESCE(addr_si,''), COALESCE(addr_gu,''),
  COALESCE(addr_dong,''), COALESCE(addr_li,''),
  COALESCE(addr_jibun,''), COALESCE(subst_nm,''),
  COALESCE(mtr_no,''), COALESCE(dl_nm,'')))
WHERE row_hash IS NULL;

-- 4) 트리거
CREATE TRIGGER trg_row_hash BEFORE INSERT OR UPDATE
  ON kepco_data FOR EACH ROW EXECUTE FUNCTION fn_kepco_row_hash();

-- 5) 새 unique
ALTER TABLE kepco_data ADD CONSTRAINT kepco_data_row_hash_key UNIQUE (row_hash);

-- 6) 기존 9컬럼 unique 제거
ALTER TABLE kepco_data DROP CONSTRAINT IF EXISTS kepco_data_unique_key;

-- 7) 정리
VACUUM FULL kepco_data;
