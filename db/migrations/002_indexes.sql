-- ============================================================
-- 002_indexes.sql — 조회 성능 인덱스
-- ============================================================

-- kepco_data 조회 패턴별 인덱스
CREATE INDEX IF NOT EXISTS idx_kepco_geocode_address ON kepco_data (geocode_address);
CREATE INDEX IF NOT EXISTS idx_kepco_latlng         ON kepco_data (lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kepco_subst_nm        ON kepco_data (subst_nm);
CREATE INDEX IF NOT EXISTS idx_kepco_dl_nm           ON kepco_data (dl_nm);
CREATE INDEX IF NOT EXISTS idx_kepco_addr_do_gu      ON kepco_data (addr_do, addr_gu);

-- 여유용량 상태별 필터링 (자주 사용)
CREATE INDEX IF NOT EXISTS idx_kepco_vol_subst       ON kepco_data (vol_subst);
CREATE INDEX IF NOT EXISTS idx_kepco_vol_mtr         ON kepco_data (vol_mtr);
CREATE INDEX IF NOT EXISTS idx_kepco_vol_dl          ON kepco_data (vol_dl);

-- user_roles role별 조회 (admin 목록 등)
CREATE INDEX IF NOT EXISTS idx_user_roles_role       ON user_roles (role);
