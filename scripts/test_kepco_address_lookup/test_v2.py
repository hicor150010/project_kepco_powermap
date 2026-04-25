"""
정규화 룰 단독 검증 — 한글주소 → KEPCO 5필드 → search_capacity

목적:
  사용자가 지도에서 DB 에 없는 지역 (= 우리 kepco_capa 에 없는 bjd_code) 을
  클릭했을 때, 한글주소로부터 즉시 KEPCO API 를 호출해 전기용량을 보여주는 흐름.

구성:
  1. parse_address(): 한글주소 → (sep_1~5, jibun)
       - import_bjd_master.split_sep5() 룰 그대로 + 지번 토큰 분리
  2. to_kepco_candidates(): KEPCO 호출 후보 (1차/2차 재시도)
       - 1차: sep_2 ∅ → '-기타지역' 으로 채움
       - 2차: 1차 si='-기타지역' 이었으면 ''로 재시도
       - 세종/제주 등은 추가 후보
  3. search_with_fallback(): 후보 순서대로 호출 → 0건 아닌 첫 결과 반환

DB 의존성 없음. 순수 정규화 룰 + KEPCO API.
"""
import json
import sys
import time
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "crawler"))

from api_client import KepcoApiClient  # noqa: E402
from import_bjd_master import split_sep5  # noqa: E402


# ── 한글주소 파싱 ────────────────────────────────────────────
def parse_address(addr: str):
    """
    한글주소 → (sep_1, sep_2, sep_3, sep_4, sep_5, jibun)

    예:
      '경기도 양평군 청운면 갈운리 24-1'
        → ('경기도', None, '양평군', '청운면', '갈운리', '24-1')
      '경기도 양평군 청운면 갈운리 산 1'
        → ('경기도', None, '양평군', '청운면', '갈운리', '산 1')
      '서울특별시 강남구 역삼동 736'
        → ('서울특별시', None, '강남구', '역삼동', None, '736')
    """
    tokens = addr.strip().split()
    # 뒤에서부터 지번 토큰 모음 — 숫자/하이픈/'산' 으로 시작
    jibun_tokens = []
    while tokens:
        last = tokens[-1]
        if last == "산" or (last and (last[0].isdigit() or last[0] == "-")):
            jibun_tokens.insert(0, tokens.pop())
        else:
            break
    jibun = " ".join(jibun_tokens)
    name_part = " ".join(tokens)
    sep = split_sep5(name_part)  # (sep_1..5)
    return (*sep, jibun)


# ── KEPCO 호출 후보 생성 ─────────────────────────────────────
def to_kepco_candidates(sep_1, sep_2, sep_3, sep_4, sep_5, jibun):
    """
    역방향 정규화 — bjd_lookup._clean() 의 역.

    bjd_master sep 룰:
      - sep_2 None == KEPCO addr_si='-기타지역' 또는 ''
      - 시도==시 (세종) → KEPCO addr_si=do 또는 ''

    KEPCO 비일관성 (kepco_api_skip_value 메모리):
      - 광주광역시: si='-기타지역' 유지해야 결과
      - 충남 천안시: gu='-기타지역' 빈값이어야 결과
      → 1차 → 0건 → 2차 (-기타지역을 '' 로) 패턴
    """
    do = sep_1
    si_raw = sep_2 or ""
    gu_raw = sep_3 or ""
    lidong_raw = sep_4 or ""
    li_raw = sep_5 or ""

    candidates = []

    # 1차: sep_2 빈값이면 '-기타지역'
    si_1 = si_raw if si_raw else "-기타지역"
    candidates.append((do, si_1, gu_raw, lidong_raw, li_raw))

    # 2차: 1차 si='-기타지역' 이었으면 빈값으로
    if si_1 == "-기타지역":
        candidates.append((do, "", gu_raw, lidong_raw, li_raw))

    # 3차 (세종/제주처럼 sep_2=None 인 광역시·자치시): si=do
    if not si_raw:
        candidates.append((do, do, gu_raw, lidong_raw, li_raw))

    # 4차 (마지막 fallback): li 빈값으로 (마을 단위)
    if li_raw:
        last = candidates[-1]
        candidates.append((last[0], last[1], last[2], last[3], ""))

    return candidates, jibun


# ── 호출 ────────────────────────────────────────────────────
def search_via_candidates(client, candidates, jibun):
    """후보 순서대로 호출 — 첫 비어있지 않은 결과 반환."""
    log = []
    for idx, (do, si, gu, lidong, li) in enumerate(candidates, 1):
        try:
            res = client.search_capacity(
                addr_do=do, addr_si=si, addr_gu=gu,
                addr_lidong=lidong, addr_li=li, addr_jibun=jibun,
            )
        except Exception as e:
            log.append(f"  후보#{idx} (do='{do}' si='{si}' gu='{gu}' lidong='{lidong}' li='{li}') → ❌ 예외 {e}")
            continue
        n = len(res)
        log.append(f"  후보#{idx} (do='{do}' si='{si}' gu='{gu}' lidong='{lidong}' li='{li}') → {n}건")
        if n > 0:
            return res, idx, log
    return [], 0, log


# ── 12 케이스 ───────────────────────────────────────────────
CASES = [
    "경기도 양평군 청운면 갈운리 24-1",       # A1
    "서울특별시 강남구 역삼동 736",            # A2
    "부산광역시 기장군 일광읍 청광리 1",       # A3
    "충청북도 청주시 흥덕구 가경동 1502",     # A4
    "세종특별자치시 조치원읍 신흥리 1",        # A5
    "제주특별자치도 제주시 노형동 925",        # A6
    "강원특별자치도 춘천시 효자동 100",        # A7
    "경기도 양평군 청운면 갈운리 산 1",        # B1
    "경기도 양평군 청운면 갈운리 24",          # B2
    "경기도 양평군 청운면 갈운리 9999",        # B3 (존재 안할 가능성)
    "경기도 양평군 갈운리 24-1",               # C1 (면 누락)
    "경기도 양평시 청운면 갈운리 24-1",        # C2 (오타)
]


def run():
    client = KepcoApiClient(delay=0.8)
    client._on_log = lambda msg: None  # silent

    out = []
    print(f"{'='*80}\n정규화 룰 단독 검증 — {len(CASES)} 케이스\n{'='*80}")

    for i, addr in enumerate(CASES, 1):
        print(f"\n[{i:02d}] {addr}")
        parsed = parse_address(addr)
        print(f"  parse: sep=({parsed[0]!r}, {parsed[1]!r}, {parsed[2]!r}, {parsed[3]!r}, {parsed[4]!r}) jibun={parsed[5]!r}")
        candidates, jibun = to_kepco_candidates(*parsed)
        print(f"  후보 {len(candidates)}개 생성")

        t0 = time.time()
        results, hit_idx, log = search_via_candidates(client, candidates, jibun)
        elapsed = (time.time() - t0) * 1000

        for line in log:
            print(line)

        if hit_idx > 0:
            sample = results[0]
            print(f"  ✅ 성공 (후보#{hit_idx}, {len(results)}건, {elapsed:.0f}ms)")
            print(f"     SUBST={sample.get('SUBST_NM','')} DL={sample.get('DL_NM','')} "
                  f"DL_CAPA={sample.get('DL_CAPA','')} DL_PWR={sample.get('DL_PWR','')}")
        else:
            print(f"  ❌ 전부 실패 ({len(candidates)} 후보, {elapsed:.0f}ms)")

        out.append({
            "addr": addr,
            "parsed": list(parsed),
            "candidates": [list(c) + [jibun] for c in candidates],
            "hit_candidate": hit_idx,
            "result_count": len(results),
            "elapsed_ms": round(elapsed, 1),
            "first_result": results[0] if results else None,
        })

    out_path = Path(__file__).parent / "results_v2.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    # 요약 매트릭스
    print(f"\n{'='*80}\n매트릭스\n{'='*80}")
    print(f"{'#':<3} {'주소':<40} {'후보#':<6} {'결과':<6}")
    print("-" * 80)
    for i, r in enumerate(out, 1):
        addr_short = r["addr"][:38]
        hit = f"#{r['hit_candidate']}" if r['hit_candidate'] else "FAIL"
        print(f"{i:<3} {addr_short:<40} {hit:<6} {r['result_count']:>4}건")
    print(f"\n결과 저장: {out_path}")


if __name__ == "__main__":
    run()
