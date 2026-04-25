"""
추가 검증 — T1/T2/T3

T1. 광주 동구 / 대전 서구 / 전주 완산구 0건 원인
    - 시 목록 (gbn=0)
    - 구 단위에서 동 목록 (gbn=2)
    - '충장로4가' / '둔산동' / '효자동' 의 실제 KEPCO 표기

T2. '산1-10' 형식 지번 자동 분리 (parse_address 보완)

T3. 동분할 (둔산동 → 둔산1동/2동/3동) 자동 후보 생성 시뮬레이션
"""
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "crawler"))

from api_client import KepcoApiClient  # noqa: E402
from import_bjd_master import split_sep5  # noqa: E402

client = KepcoApiClient(delay=0.6)
client._on_log = lambda msg: None


def section(title):
    print(f"\n{'=' * 70}\n{title}\n{'=' * 70}")


# ════════════════════════════════════════════════════════
# T1. 광주/대전/전주 0건 원인
# ════════════════════════════════════════════════════════

section("T1-1. 광주광역시 시 목록 (gbn=0)")
sis = client.get_addr_list(gbn=0, addr_do="광주광역시")
print(f"  총 {len(sis)} 개: {sis}")

section("T1-2. 광주광역시 -기타지역 → 구 목록 (gbn=1)")
gus = client.get_addr_list(gbn=1, addr_do="광주광역시", addr_si="-기타지역")
print(f"  총 {len(gus)} 개: {gus}")

if "동구" in gus:
    section("T1-3. 광주광역시 동구 → 동 목록 (gbn=2)")
    dongs = client.get_addr_list(
        gbn=2, addr_do="광주광역시", addr_si="-기타지역", addr_gu="동구",
    )
    print(f"  총 {len(dongs)} 개")
    for d in dongs[:30]:
        print(f"    - '{d}'")
    충장 = [d for d in dongs if "충장" in d]
    print(f"  '충장' 매칭: {충장}")

section("T1-4. 대전광역시 시 목록 (gbn=0)")
sis = client.get_addr_list(gbn=0, addr_do="대전광역시")
print(f"  총 {len(sis)} 개: {sis}")

section("T1-5. 대전광역시 -기타지역 → 구 목록 (gbn=1)")
gus = client.get_addr_list(gbn=1, addr_do="대전광역시", addr_si="-기타지역")
print(f"  총 {len(gus)} 개: {gus}")

if "서구" in gus:
    section("T1-6. 대전광역시 서구 → 동 목록 (gbn=2)")
    dongs = client.get_addr_list(
        gbn=2, addr_do="대전광역시", addr_si="-기타지역", addr_gu="서구",
    )
    print(f"  총 {len(dongs)} 개")
    둔산 = [d for d in dongs if "둔산" in d]
    print(f"  '둔산' 매칭: {둔산}")

section("T1-7. 전북특별자치도 시 목록 (gbn=0)")
sis = client.get_addr_list(gbn=0, addr_do="전북특별자치도")
print(f"  총 {len(sis)} 개: {sis}")

if "전주시" in sis:
    section("T1-8. 전북 전주시 → 구 목록 (gbn=1)")
    gus = client.get_addr_list(
        gbn=1, addr_do="전북특별자치도", addr_si="전주시",
    )
    print(f"  총 {len(gus)} 개: {gus}")
    if "완산구" in gus:
        section("T1-9. 전북 전주시 완산구 → 동 목록 (gbn=2)")
        dongs = client.get_addr_list(
            gbn=2, addr_do="전북특별자치도", addr_si="전주시", addr_gu="완산구",
        )
        print(f"  총 {len(dongs)} 개")
        효자 = [d for d in dongs if "효자" in d]
        print(f"  '효자' 매칭: {효자}")
    else:
        # '전라북도' 표기일 가능성
        section("T1-9b. '전라북도' 로 재시도")
        sis2 = client.get_addr_list(gbn=0, addr_do="전라북도")
        print(f"  전라북도 시 목록 ({len(sis2)} 개): {sis2[:10]}")

# ════════════════════════════════════════════════════════
# T2. 산 지번 자동 분리 룰 보완
# ════════════════════════════════════════════════════════

section("T2. parse_address 보완 — '산1-10' 분리 룰")


def parse_address_v2(addr: str):
    """
    개선된 parse_address.
    지번 토큰 판정: 첫글자 숫자/하이픈, 또는 '산'+(숫자|하이픈|공백|단독).
    """
    tokens = addr.strip().split()
    jibun_tokens = []
    while tokens:
        last = tokens[-1]
        is_jibun = False
        if not last:
            break
        if last == "산":
            is_jibun = True
        elif last[0].isdigit() or last[0] == "-":
            is_jibun = True
        elif last.startswith("산") and len(last) > 1:
            # '산1-10', '산116', '산1-3' 등
            rest = last[1:]
            if rest[0].isdigit() or rest[0] == "-":
                is_jibun = True
        if is_jibun:
            jibun_tokens.insert(0, tokens.pop())
        else:
            break
    jibun = " ".join(jibun_tokens)
    if jibun.startswith("산 "):
        jibun = "산" + jibun[2:]
    sep = split_sep5(" ".join(tokens))
    return (*sep, jibun)


# 테스트 케이스
test_addrs = [
    "경기도 양평군 청운면 갈운리 산 1-10",
    "경기도 양평군 청운면 갈운리 산1-10",
    "경기도 양평군 청운면 갈운리 산1",
    "경기도 양평군 청운면 갈운리 산116",
    "경기도 양평군 청운면 갈운리 24-1",
]
for addr in test_addrs:
    parsed = parse_address_v2(addr)
    print(f"  '{addr}'")
    print(f"    → sep_1~5 = {parsed[:5]}, jibun = {parsed[5]!r}")

section("T2-실호출. 보완된 parse_address 로 산 지번 검증")
for addr in ["경기도 양평군 청운면 갈운리 산1-10", "경기도 양평군 청운면 갈운리 산116"]:
    p = parse_address_v2(addr)
    print(f"\n  주소: {addr}")
    print(f"  파싱: sep={p[:5]}, jibun={p[5]!r}")
    res = client.search_capacity(
        addr_do=p[0], addr_si="-기타지역" if not p[1] else p[1],
        addr_gu=p[2] or "", addr_lidong=p[3] or "", addr_li=p[4] or "",
        addr_jibun=p[5],
    )
    print(f"  결과 {len(res)} 건")
    if res:
        r = res[0]
        print(f"    SUBST={r.get('SUBST_NM','')} DL={r.get('DL_NM','')}")

# ════════════════════════════════════════════════════════
# T3. 동분할 자동 후보 생성 — 사용자가 '둔산동' 입력
# ════════════════════════════════════════════════════════

section("T3. 동분할 자동 후보 — 사용자 입력 '둔산동' → '둔산1동/2동/3동' 시도")
# bjd_master 없이 단순 추측: 입력 동 + 1동/2동/3동/4동 추가
candidates = ["둔산동", "둔산1동", "둔산2동", "둔산3동", "둔산4동"]
for cand in candidates:
    # 5필드: 대전광역시 -기타지역 서구 + cand + (li 빈)
    try:
        ji = client.get_addr_list(
            gbn=4, addr_do="대전광역시", addr_si="-기타지역",
            addr_gu="서구", addr_lidong=cand, addr_li="",
        )
    except Exception as e:
        print(f"  '{cand}' → 예외 {e}")
        continue
    n = len(ji)
    sample = ji[:3] if ji else []
    mark = "✅" if n > 0 else "❌"
    print(f"  {mark} '{cand}' → 번지 {n} 건 (앞 3: {sample})")
