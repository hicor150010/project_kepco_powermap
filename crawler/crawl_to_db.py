"""
KEPCO 크롤링 결과 → Supabase DB UPSERT
PostgREST REST API 직접 호출 (supabase-py 불필요)

정규화 구조:
  kepco_addr  — 리 단위 주소 마스터 (geocode_address UNIQUE). 좌표는 별도 워커가 채움.
  kepco_capa  — 지번×시설 용량 데이터 (addr_id FK)

좌표 정책 (2026-04-22 변경):
  - 크롤러는 주소만 저장. lat/lng 는 NULL 로 INSERT.
  - 기존 행은 ignore-duplicates 로 기존 좌표 보존.
  - 좌표 채우기는 별도 배치 워커 (crawler/fill_kepco_coords.py, VWorld + PNU) 담당.
"""
import logging
import time

import requests
from crawler import CrawlResult

logger = logging.getLogger(__name__)

# PostgREST 배치 한도
BATCH_SIZE = 1000


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


def _build_geocode_address(
    addr_do: str,
    addr_si: str,
    addr_gu: str,
    addr_dong: str,
    addr_li: str,
) -> str:
    """
    리 단위 정규화 주소 생성.
    웹 buildGeocodeAddress()와 동일 로직: "-기타지역" 제외, 공백 join.
    """
    parts = []
    for p in [addr_do, addr_si, addr_gu, addr_dong, addr_li]:
        if p and p.strip() and p.strip() != "-기타지역":
            parts.append(p.strip())
    return " ".join(parts)


def _to_addr_row(result: CrawlResult) -> dict:
    """CrawlResult → kepco_addr row dict"""
    return {
        "addr_do": result.addr_do or None,
        "addr_si": _empty_to_none(result.addr_si),
        "addr_gu": _empty_to_none(result.addr_gu),
        "addr_dong": _empty_to_none(result.addr_lidong),
        "addr_li": _empty_to_none(result.addr_li),
        "geocode_address": _build_geocode_address(
            result.addr_do,
            result.addr_si,
            result.addr_gu,
            result.addr_lidong,
            result.addr_li,
        ),
    }


def _to_capa_row(result: CrawlResult, addr_id: int) -> dict:
    """CrawlResult → kepco_capa row dict"""
    return {
        "addr_id": addr_id,
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
    """크롤링 결과를 Supabase kepco_addr + kepco_capa 에 2단계 UPSERT."""

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
        # geocoded 키는 run_crawl.py 가 참조 — 항상 0 유지 (좌표 채우기는 별도 워커)
        self._stats = {"upserted": 0, "errors": 0, "geocoded": 0}
        # addr_id 캐시 (geocode_address → id)
        self._addr_id_cache: dict[str, int] = {}
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
        """버퍼의 모든 데이터를 Supabase에 2단계 UPSERT 후 비움 + 지오코딩"""
        if not self._buffer:
            return

        results = self._buffer.copy()
        self._buffer.clear()

        # ── 1단계: kepco_addr UPSERT ──
        # 고유 geocode_address 추출
        addr_rows_map: dict[str, dict] = {}
        for result in results:
            addr_row = _to_addr_row(result)
            ga = addr_row["geocode_address"]
            if ga and ga not in addr_rows_map:
                addr_rows_map[ga] = addr_row

        # 캐시에 없는 주소만 UPSERT
        new_addr_rows = [
            row for ga, row in addr_rows_map.items()
            if ga not in self._addr_id_cache
        ]

        if new_addr_rows:
            for i in range(0, len(new_addr_rows), BATCH_SIZE):
                chunk = new_addr_rows[i : i + BATCH_SIZE]
                try:
                    resp = requests.post(
                        f"{self._url}/rest/v1/kepco_addr"
                        "?on_conflict=geocode_address",
                        json=chunk,
                        headers=self._headers(
                            "resolution=merge-duplicates,return=representation"
                        ),
                        timeout=60,
                    )
                    if resp.status_code in (200, 201):
                        for r in resp.json():
                            self._addr_id_cache[r["geocode_address"]] = r["id"]
                        logger.info(f"kepco_addr UPSERT: {len(chunk)}건")
                    else:
                        logger.error(
                            f"kepco_addr UPSERT 실패 (HTTP {resp.status_code}): "
                            f"{resp.text[:500]}"
                        )
                except requests.exceptions.RequestException as e:
                    logger.error(f"kepco_addr 네트워크 오류: {e}")

        # ── 2단계: kepco_capa UPSERT ──
        capa_rows = []
        for result in results:
            ga = _build_geocode_address(
                result.addr_do, result.addr_si, result.addr_gu,
                result.addr_lidong, result.addr_li,
            )
            addr_id = self._addr_id_cache.get(ga)
            if not addr_id:
                self._stats["errors"] += 1
                continue
            capa_rows.append(_to_capa_row(result, addr_id))

        for i in range(0, len(capa_rows), BATCH_SIZE):
            chunk = capa_rows[i : i + BATCH_SIZE]
            try:
                resp = requests.post(
                    f"{self._url}/rest/v1/kepco_capa"
                    "?on_conflict=addr_id,addr_jibun,subst_nm,mtr_no,dl_nm",
                    json=chunk,
                    headers=self._headers(
                        "resolution=merge-duplicates,return=minimal"
                    ),
                    timeout=60,
                )
                if resp.status_code in (200, 201, 204):
                    self._stats["upserted"] += len(chunk)
                    logger.info(f"kepco_capa UPSERT: {len(chunk)}건")
                else:
                    self._stats["errors"] += len(chunk)
                    logger.error(
                        f"kepco_capa UPSERT 실패 (HTTP {resp.status_code}): "
                        f"{resp.text[:500]}"
                    )
            except requests.exceptions.RequestException as e:
                self._stats["errors"] += len(chunk)
                logger.error(f"kepco_capa 네트워크 오류: {e}")

        # ── 3단계: MV 새로고침 (1시간 간격) ──
        # 좌표 채우기는 별도 워커(fill_kepco_coords.py) 담당 — 여기서는 안 함.
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
