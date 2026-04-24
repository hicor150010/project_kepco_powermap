"""
KEPCO 크롤링 결과 → Supabase kepco_capa UPSERT
PostgREST REST API 직접 호출 (supabase-py 불필요)

신 구조 (031 마이그레이션 후):
  kepco_capa  — 지번×시설 용량 데이터. 주소 키는 bjd_code CHAR(10).
  bjd_master  — 행안부 법정동코드 마스터 (cache_loader 경유 프로세스 메모리 로드).

bjd_code 매칭:
  CrawlResult 5필드(addr_do/si/gu/lidong/li) → bjd_lookup.lookup() → bjd_code 또는 None.
  None 일 경우 sentinel '0000000000' 저장 (UNIQUE 정합성 + 매칭률 모니터링용).
  실패 카운트는 _stats["bjd_unmatched"] 로 누적.

MV refresh:
  kepco_map_summary 부재 시(032 작성 전) 매시간 warning 로그 발생 — 의도적 무시.
  032 RPC/MV 재생성 후 자동 정상화.
"""
import logging
import time

import requests
from crawler import CrawlResult
from bjd_lookup import lookup as bjd_lookup

logger = logging.getLogger(__name__)

# PostgREST 배치 한도
BATCH_SIZE = 1000

# 매칭 실패 sentinel (031 마이그레이션 정의와 동일)
BJD_UNMATCHED = "0000000000"


def _parse_int(value: str):
    """문자열 → int 변환. 빈값/비숫자 → None"""
    if not value or not isinstance(value, str):
        return None
    v = value.strip().replace(",", "")
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def _empty_to_none(value: str):
    """빈 문자열 → None (DB unique constraint NULL 일관성)"""
    if not value or (isinstance(value, str) and not value.strip()):
        return None
    return value.strip()


def _to_capa_row(result: CrawlResult, bjd_code: str) -> dict:
    """CrawlResult → kepco_capa row dict"""
    return {
        "bjd_code": bjd_code,
        "addr_jibun": _empty_to_none(result.addr_jibun),
        "subst_nm": _empty_to_none(result.subst_nm),
        "mtr_no": _empty_to_none(result.mtr_no),
        "dl_nm": _empty_to_none(result.dl_nm),
        # 변전소 용량
        "subst_capa": _parse_int(result.subst_capa),
        "subst_pwr": _parse_int(result.subst_pwr),
        "g_subst_capa": _parse_int(result.g_subst_capa),
        # 주변압기 용량
        "mtr_capa": _parse_int(result.mtr_capa),
        "mtr_pwr": _parse_int(result.mtr_pwr),
        "g_mtr_capa": _parse_int(result.g_mtr_capa),
        # 배전선로 용량
        "dl_capa": _parse_int(result.dl_capa),
        "dl_pwr": _parse_int(result.dl_pwr),
        "g_dl_capa": _parse_int(result.g_dl_capa),
        # STEP 데이터
        "step1_cnt": _parse_int(result.step1_cnt),
        "step1_pwr": _parse_int(result.step1_pwr),
        "step2_cnt": _parse_int(result.step2_cnt),
        "step2_pwr": _parse_int(result.step2_pwr),
        "step3_cnt": _parse_int(result.step3_cnt),
        "step3_pwr": _parse_int(result.step3_pwr),
    }


class CrawlDbWriter:
    """크롤링 결과를 Supabase kepco_capa 에 UPSERT (bjd_master 메모리 매칭 경유)."""

    def __init__(
        self,
        supabase_url: str,
        supabase_key: str,
        flush_size: int = 500,
    ):
        self._url = supabase_url.rstrip("/")
        self._key = supabase_key
        self._flush_size = flush_size
        self._buffer: list[CrawlResult] = []
        self._stats = {
            "upserted": 0,
            "errors": 0,
            "geocoded": 0,           # run_crawl.py 호환 — 항상 0 (좌표는 별도 워커)
            "bjd_unmatched": 0,      # bjd_lookup 매칭 실패 = sentinel 사용 카운트
        }
        # MV 갱신 주기 (1시간)
        self._last_mv_refresh: float = 0.0
        self._mv_interval: float = 3600.0

    def _headers(self, prefer: str = "") -> dict:
        """PostgREST 요청 헤더"""
        h = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
        }
        if prefer:
            h["Prefer"] = prefer
        return h

    def add(self, result: CrawlResult) -> bool:
        """
        CrawlResult를 버퍼에 추가.
        flush_size에 도달하면 자동 flush 후 True 반환.
        """
        self._buffer.append(result)
        if len(self._buffer) >= self._flush_size:
            self.flush()
            return True
        return False

    def flush(self):
        """버퍼의 모든 데이터를 bjd_lookup 매칭 후 kepco_capa UPSERT."""
        if not self._buffer:
            return

        results = self._buffer.copy()
        self._buffer.clear()

        # ── bjd_code 매칭 + capa row 빌드 ──
        capa_rows = []
        unmatched_in_batch = 0
        for result in results:
            bjd_code = bjd_lookup(
                result.addr_do,
                result.addr_si,
                result.addr_gu,
                result.addr_lidong,
                result.addr_li,
            )
            if bjd_code is None:
                bjd_code = BJD_UNMATCHED
                unmatched_in_batch += 1
            capa_rows.append(_to_capa_row(result, bjd_code))
        self._stats["bjd_unmatched"] += unmatched_in_batch

        # ── kepco_capa UPSERT ──
        for i in range(0, len(capa_rows), BATCH_SIZE):
            chunk = capa_rows[i : i + BATCH_SIZE]
            try:
                resp = requests.post(
                    f"{self._url}/rest/v1/kepco_capa"
                    "?on_conflict=bjd_code,addr_jibun,subst_nm,mtr_no,dl_nm",
                    json=chunk,
                    headers=self._headers(
                        "resolution=merge-duplicates,return=minimal"
                    ),
                    timeout=60,
                )
                if resp.status_code in (200, 201, 204):
                    self._stats["upserted"] += len(chunk)
                    logger.info(
                        f"kepco_capa UPSERT: {len(chunk)}건 "
                        f"(bjd 매칭 실패 {unmatched_in_batch}/{len(chunk)})"
                    )
                else:
                    self._stats["errors"] += len(chunk)
                    logger.error(
                        f"kepco_capa UPSERT 실패 (HTTP {resp.status_code}): "
                        f"{resp.text[:500]}"
                    )
            except requests.exceptions.RequestException as e:
                self._stats["errors"] += len(chunk)
                logger.error(f"kepco_capa 네트워크 오류: {e}")

        # ── MV 새로고침 (1시간 간격) ──
        # kepco_map_summary 부재 시 warning 로그만 — 의도적 무시 (032 후 자동 정상화).
        if time.time() - self._last_mv_refresh > self._mv_interval:
            self.refresh_mv()
            self._last_mv_refresh = time.time()

    def refresh_mv(self):
        """Materialized View 새로고침 (refresh_kepco_summary RPC)"""
        try:
            resp = requests.post(
                f"{self._url}/rest/v1/rpc/refresh_kepco_summary",
                json={},
                headers=self._headers(),
                timeout=120,
            )
            if resp.status_code in (200, 204):
                logger.info("Materialized View 새로고침 완료")
            else:
                logger.warning(
                    f"MV 새로고침 실패 (HTTP {resp.status_code}): "
                    f"{resp.text[:300]}"
                )
        except requests.exceptions.RequestException as e:
            logger.warning(f"MV 새로고침 네트워크 오류: {e}")

    def get_stats(self) -> dict:
        """현재까지의 통계 반환"""
        return self._stats.copy()

    @property
    def buffer_size(self) -> int:
        return len(self._buffer)
