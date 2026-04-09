-- ============================================================
-- 001_init.sql — 핵심 테이블 생성
-- 작성: 2026-04-08
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. geocode_cache — 주소 → 좌표 영구 캐시
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geocode_cache (
  address TEXT PRIMARY KEY,           -- 리 단위 정규화 주소
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL DEFAULT 'vworld',  -- 'vworld' / 'kakao'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE geocode_cache IS '주소→좌표 영구 캐시. 한 번 변환된 주소는 재호출하지 않음.';
COMMENT ON COLUMN geocode_cache.address IS '리 단위 정규화 주소. 예: "전라남도 -기타지역 고흥군 동강면 유둔리"';
COMMENT ON COLUMN geocode_cache.source IS '좌표 출처 (vworld/kakao)';

-- ─────────────────────────────────────────────
-- 2. kepco_data — KEPCO 배전선로 여유용량 메인 raw 테이블
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kepco_data (
  id BIGSERIAL PRIMARY KEY,

  -- 주소 (raw 그대로 저장; "-기타지역" 포함)
  addr_do TEXT NOT NULL,
  addr_si TEXT,
  addr_gu TEXT,
  addr_dong TEXT,
  addr_li TEXT,
  addr_jibun TEXT,
  geocode_address TEXT NOT NULL,      -- 리 단위 정규화 (geocode_cache 참조)

  -- 좌표 (geocode_cache에서 복사 — JOIN 비용 절감)
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,

  -- 시설
  subst_nm TEXT,
  mtr_no TEXT,
  dl_nm TEXT,

  -- 여유 상태 (raw 그대로)
  vol_subst TEXT,
  vol_mtr TEXT,
  vol_dl TEXT,

  -- 변전소 용량 (kW)
  subst_capa BIGINT,
  subst_pwr BIGINT,
  g_subst_capa BIGINT,

  -- 주변압기 용량 (kW)
  mtr_capa BIGINT,
  mtr_pwr BIGINT,
  g_mtr_capa BIGINT,

  -- 배전선로 용량 (kW)
  dl_capa BIGINT,
  dl_pwr BIGINT,
  g_dl_capa BIGINT,

  -- STEP (옵셔널)
  step1_cnt INTEGER,
  step1_pwr BIGINT,
  step2_cnt INTEGER,
  step2_pwr BIGINT,
  step3_cnt INTEGER,
  step3_pwr BIGINT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 9개 컬럼 조합으로 유니크 (upsert 키)
  CONSTRAINT kepco_data_unique_key UNIQUE (
    addr_do, addr_si, addr_gu, addr_dong, addr_li, addr_jibun,
    subst_nm, mtr_no, dl_nm
  )
);

COMMENT ON TABLE kepco_data IS 'KEPCO 배전선로 여유용량 raw 데이터. upsert 키 = 9개 주소+시설 조합.';

-- ─────────────────────────────────────────────
-- 3. user_roles — 사용자 권한 (admin / viewer)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_roles IS '사용자 권한. admin은 업로드/계정관리 가능, viewer는 조회만.';
COMMENT ON COLUMN user_roles.role IS 'admin: 모든 권한 / viewer: 조회만';

-- ─────────────────────────────────────────────
-- 4. updated_at 자동 갱신 트리거
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kepco_data_updated_at ON kepco_data;
CREATE TRIGGER trg_kepco_data_updated_at
  BEFORE UPDATE ON kepco_data
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_roles_updated_at ON user_roles;
CREATE TRIGGER trg_user_roles_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
