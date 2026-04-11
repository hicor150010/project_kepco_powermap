-- ============================================================
-- 002_indexes.sql — 조회 성능 인덱스
-- ============================================================

-- kepco_data 조회 패턴별 인덱스
CREATE INDEX IF NOT EXISTS idx_kepco_geocode_address ON kepco_data (geocode_address);
CREATE INDEX IF NOT EXISTS idx_kepco_latlng         ON kepco_data (lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kepco_addr_do_gu      ON kepco_data (addr_do, addr_gu);

-- user_roles role별 조회 (admin 목록 등)
CREATE INDEX IF NOT EXISTS idx_user_roles_role       ON user_roles (role);
