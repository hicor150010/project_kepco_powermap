"""
KEPCO 5필드 → bjd_code (법정동코드 10자리) 매칭.

bjd_master 테이블을 프로세스 시작 시 1회 로드 (cache_loader 경유) 후
O(1) dict lookup 으로 bjd_code 반환.

KEPCO 의 "-기타지역" 은 NULL 과 동치로 처리.

사용 예:
    from bjd_lookup import lookup, stats

    # 크롤 중 각 row 마다
    bjd_code = lookup(row["addr_do"], row["addr_si"], row["addr_gu"],
                      row["addr_dong"], row["addr_li"])
    # 매칭 실패 시 None (kepco_capa.bjd_code = NULL 로 저장)

    # 디버그
    print(stats())  # {"total_entries": 20560}
"""
from cache_loader import load_table


_DICT: dict | None = None


def _clean(v):
    """KEPCO 의 '-기타지역' / 빈 문자열 → None 로 정규화."""
    if v in (None, "", "-기타지역"):
        return None
    return v


def _build_dict() -> dict:
    rows = load_table(
        "bjd_master",
        "bjd_code,sep_1,sep_2,sep_3,sep_4,sep_5",
    )
    return {
        (r["sep_1"], r["sep_2"], r["sep_3"], r["sep_4"], r["sep_5"]): r["bjd_code"]
        for r in rows
    }


def lookup(addr_do, addr_si, addr_gu, addr_dong, addr_li) -> str | None:
    """
    KEPCO 5필드 → bjd_code.

    Returns:
        매칭된 bjd_code (10자리 문자열) 또는 None (매칭 실패).
    """
    global _DICT
    if _DICT is None:
        _DICT = _build_dict()

    key = (
        _clean(addr_do),
        _clean(addr_si),
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
