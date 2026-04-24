"""
KEPCO 5필드 → bjd_code (법정동코드 10자리) 매칭.

bjd_master 테이블을 프로세스 시작 시 1회 로드 (cache_loader 경유) 후
O(1) dict lookup 으로 bjd_code 반환.

정규화 룰 (fuzzy 매칭 없음, 명확 룰만):
  1) 빈 문자열 / '-기타지역' → None
  2) 세종 룰: addr_si == addr_do 면 None (세종특별자치시 광역+기초 통합 케이스)
  - 추측·근사 매칭 일체 없음. 매칭 실패 시 호출측이 sentinel 처리.

사용 예:
    from bjd_lookup import lookup, stats

    bjd_code = lookup(row["addr_do"], row["addr_si"], row["addr_gu"],
                      row["addr_dong"], row["addr_li"])
    # 매칭 실패 시 None
"""
import logging

from cache_loader import load_table

logger = logging.getLogger(__name__)


_DICT: dict | None = None


def _clean(v, addr_do=None):
    """
    KEPCO 필드 정규화.

    Args:
        v: 정규화할 값
        addr_do: 세종 룰 적용용. 시도명과 동일하면 None 처리 (의미상 중복).
    """
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
    if v in ("", "-기타지역"):
        return None
    if addr_do is not None and v == addr_do:
        return None
    return v


def _build_dict() -> dict:
    rows = load_table(
        "bjd_master",
        "bjd_code,sep_1,sep_2,sep_3,sep_4,sep_5",
    )
    d = {
        (r["sep_1"], r["sep_2"], r["sep_3"], r["sep_4"], r["sep_5"]): r["bjd_code"]
        for r in rows
    }
    logger.info(f"[bjd_lookup] dict 빌드 완료: {len(d):,} entries")
    return d


def lookup(addr_do, addr_si, addr_gu, addr_dong, addr_li) -> str | None:
    """
    KEPCO 5필드 → bjd_code.

    Returns:
        매칭된 bjd_code (10자리 문자열) 또는 None (매칭 실패).
    """
    global _DICT
    if _DICT is None:
        _DICT = _build_dict()

    do_n = _clean(addr_do)
    key = (
        do_n,
        _clean(addr_si, addr_do=do_n),   # 세종 룰 적용
        _clean(addr_gu),
        _clean(addr_dong),
        _clean(addr_li),
    )
    return _DICT.get(key)


def stats() -> dict:
    """디버그: 로드된 항목 수."""
    global _DICT
    if _DICT is None:
        _DICT = _build_dict()
    return {"total_entries": len(_DICT)}
