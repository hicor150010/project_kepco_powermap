"""
충분 검증 — 6개 그룹 약 30 케이스로 5필드 정규화 룰의 적용 한계 측정.

각 케이스마다:
  Step A: 5필드 (do, si, gu, lidong, li) 로 gbn=4 호출 → 번지 목록 확인
  Step B: 사용자 입력 jibun 으로 search_capacity 1차/2차 재시도

판정:
  - 5필드 OK + jibun 매칭: 완벽
  - 5필드 OK + jibun 미존재: 5필드는 정확, 단순히 그 번지가 KEPCO 에 없음
  - 5필드 자체 실패 (gbn=4 가 0건): 정규화 룰 미흡
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

client = KepcoApiClient(delay=0.6)
client._on_log = lambda msg: None


# ── 한글주소 → 5필드 후보 ─────────────────────────────────
def parse_address(addr: str):
    tokens = addr.strip().split()
    jibun_tokens = []
    while tokens:
        last = tokens[-1]
        # '산' + 숫자 형식 (검증됨: '산1-10') 도 처리
        if last == "산" or (last and (last[0].isdigit() or last[0] == "-")):
            jibun_tokens.insert(0, tokens.pop())
        else:
            break
    jibun = " ".join(jibun_tokens)
    # KEPCO '산' 형식 = '산1' (공백 없음)
    if jibun.startswith("산 "):
        jibun = "산" + jibun[2:]
    sep = split_sep5(" ".join(tokens))
    return (*sep, jibun)


def to_candidates(sep_1, sep_2, sep_3, sep_4, sep_5):
    """5필드 후보 (do, si, gu, lidong, li) 우선순위 순."""
    do = sep_1
    si = sep_2 or "-기타지역"
    gu = sep_3 or ""
    lidong = sep_4 or ""
    li = sep_5 or ""
    cands = [(do, si, gu, lidong, li)]
    # si='-기타지역' 이면 '' 도 시도
    if si == "-기타지역":
        cands.append((do, "", gu, lidong, li))
    # sep_2 None 인 광역시/특별자치시 → si=do (세종 룰)
    if not sep_2:
        cands.append((do, do, gu, lidong, li))
        # 세종 패턴: li='' 까지
        if li:
            cands.append((do, do, gu, lidong, ""))
    return cands


# ── 핵심 호출 ────────────────────────────────────────────
def test_case(label, addr):
    parsed = parse_address(addr)
    sep_1, sep_2, sep_3, sep_4, sep_5, jibun = parsed
    cands = to_candidates(sep_1, sep_2, sep_3, sep_4, sep_5)

    # Step A: 5필드 후보별 gbn=4 시도 — 번지 목록 나오는 첫 후보
    sep5_ok_cand = None
    ji_count = 0
    for c in cands:
        try:
            ji = client.get_addr_list(
                gbn=4, addr_do=c[0], addr_si=c[1], addr_gu=c[2],
                addr_lidong=c[3], addr_li=c[4],
            )
        except Exception:
            continue
        if ji:
            sep5_ok_cand = c
            ji_count = len(ji)
            ji_sample = ji[:3]
            break

    # Step B: search_capacity (사용자 jibun)
    search_hit = None
    if sep5_ok_cand:
        for c in cands:
            try:
                res = client.search_capacity(
                    addr_do=c[0], addr_si=c[1], addr_gu=c[2],
                    addr_lidong=c[3], addr_li=c[4], addr_jibun=jibun,
                )
            except Exception:
                continue
            if res:
                search_hit = (c, res)
                break

    # 판정
    if sep5_ok_cand and search_hit:
        verdict = "✅ 완벽"
        first = search_hit[1][0]
        detail = f"SUBST={first.get('SUBST_NM','')} DL={first.get('DL_NM','')}"
    elif sep5_ok_cand:
        verdict = "🟡 5필드 OK / 번지없음"
        detail = f"번지 {ji_count}건 (첫 3: {ji_sample})"
    else:
        verdict = "❌ 5필드 실패"
        detail = f"후보 {len(cands)}개 모두 번지 0건"

    return {
        "label": label,
        "addr": addr,
        "parsed_sep": list(parsed[:5]),
        "jibun": jibun,
        "sep5_ok": sep5_ok_cand,
        "ji_count": ji_count,
        "search_hit": bool(search_hit),
        "verdict": verdict,
        "detail": detail,
    }


# ── 테스트 케이스 그룹 ────────────────────────────────────
GROUPS = {
    "기존 12 케이스 재검증 (정상 번지)": [
        ("A1", "경기도 양평군 청운면 갈운리 24-1"),
        ("A2-원본", "서울특별시 강남구 역삼동 736"),
        ("A2-실존", "서울특별시 강남구 역삼동 601-11"),  # gbn=4 확인 번지
        ("A3", "부산광역시 기장군 일광읍 청광리 108-1"),
        ("A4-원본", "충청북도 청주시 흥덕구 가경동 1502"),
        ("A4-실존", "충청북도 청주시 흥덕구 가경동 1501"),  # gbn=4 확인 번지
        ("A5", "세종특별자치시 조치원읍 신흥리 1"),
        ("A6-원본", "제주특별자치도 제주시 노형동 925"),
        ("A6-실존", "제주특별자치도 제주시 노형동 1000-2"),
        ("A7", "강원특별자치도 춘천시 효자동 10-33"),
        ("B1-공백있음", "경기도 양평군 청운면 갈운리 산 1-10"),
        ("B1-공백없음", "경기도 양평군 청운면 갈운리 산1-10"),
    ],
    "광역시 정규구 (자치구)": [
        ("부산 해운대구", "부산광역시 해운대구 우동 731"),
        ("대구 수성구", "대구광역시 수성구 범어동 1"),
        ("인천 부평구", "인천광역시 부평구 부평동 1"),
        ("광주 동구", "광주광역시 동구 충장로4가 1"),
        ("대전 서구", "대전광역시 서구 둔산동 1"),
        ("울산 남구", "울산광역시 남구 삼산동 1"),
    ],
    "광역시 자치군": [
        ("인천 강화군", "인천광역시 강화군 강화읍 갑곳리 1"),
        ("대구 달성군", "대구광역시 달성군 화원읍 천내리 1"),
        ("울산 울주군", "울산광역시 울주군 언양읍 동부리 1"),
    ],
    "도-시-구 (분구)": [
        ("경기 성남 분당구", "경기도 성남시 분당구 정자동 1"),
        ("경기 수원 영통구", "경기도 수원시 영통구 영통동 1"),
        ("전북 전주 완산구", "전북특별자치도 전주시 완산구 효자동 1"),
    ],
    "도-시 (구 없음)": [
        ("전북 군산시", "전북특별자치도 군산시 수송동 1"),
        ("전남 목포시", "전라남도 목포시 용해동 1"),
        ("경북 경주시", "경상북도 경주시 황성동 1"),
        ("경남 김해시", "경상남도 김해시 외동 1"),
    ],
    "도-군": [
        ("경북 청도군", "경상북도 청도군 청도읍 고수리 1"),
        ("충남 부여군", "충청남도 부여군 부여읍 동남리 1"),
        ("전남 진도군", "전라남도 진도군 진도읍 성내리 1"),
    ],
    "세종 변형": [
        ("세종 한솔동", "세종특별자치시 한솔동 1"),
        ("세종 부강면", "세종특별자치시 부강면 부강리 1"),
    ],
}


def run():
    all_results = []
    print(f"{'='*90}\n충분 검증 — 그룹별 매트릭스\n{'='*90}\n")

    for group_name, cases in GROUPS.items():
        print(f"\n## {group_name}")
        for label, addr in cases:
            t0 = time.time()
            r = test_case(label, addr)
            elapsed = (time.time() - t0)
            r["elapsed_sec"] = round(elapsed, 1)
            r["group"] = group_name
            all_results.append(r)
            sep_str = "/".join(s or "∅" for s in r["parsed_sep"])
            print(f"  [{label:<18}] {addr}")
            print(f"    parse: {sep_str} + jibun='{r['jibun']}'")
            if r["sep5_ok"]:
                ok = r["sep5_ok"]
                print(f"    sep5_ok: si='{ok[1]}' gu='{ok[2]}' lidong='{ok[3]}' li='{ok[4]}'")
            print(f"    {r['verdict']}  {r['detail']}  [{elapsed:.1f}s]")

    # 매트릭스
    print(f"\n{'='*90}\n최종 매트릭스\n{'='*90}")
    print(f"{'그룹':<32} {'케이스':<22} {'판정':<28}")
    print("-" * 90)
    cur_group = None
    for r in all_results:
        g = r["group"] if r["group"] != cur_group else ""
        cur_group = r["group"]
        print(f"{g:<32} {r['label']:<22} {r['verdict']}")

    # 요약
    n_ok = sum(1 for r in all_results if r["search_hit"])
    n_5ok = sum(1 for r in all_results if r["sep5_ok"])
    n_fail = sum(1 for r in all_results if not r["sep5_ok"])
    print(f"\n총 {len(all_results)} 케이스")
    print(f"  ✅ 완벽 (5필드+번지 매칭): {n_ok}")
    print(f"  🟡 5필드 OK / 번지만 없음: {n_5ok - n_ok}")
    print(f"  ❌ 5필드 실패 (정규화 룰 미흡): {n_fail}")

    out = Path(__file__).parent / "verify_full_results.json"
    out.write_text(json.dumps(all_results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n결과 저장: {out}")


if __name__ == "__main__":
    run()
