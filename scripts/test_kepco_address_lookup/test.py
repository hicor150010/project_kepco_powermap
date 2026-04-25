"""
한글주소 → KEPCO search_capacity 직접 호출 가능성 검증

목적:
  - "경기도 양평군 청운면 갈운리 24-1" 같은 한글주소를 6필드로 파싱한 뒤
    바로 KEPCO API 를 호출해 용량 데이터를 받을 수 있는지 케이스별 검증
  - 1차 호출 실패 시 -기타지역 fallback 으로 회수율이 얼마나 올라가는지 측정

DB(bjd_master) 의존성 없음 — 순수 KEPCO API 호출만.
"""
import json
import sys
import time
from pathlib import Path

# Windows cp949 콘솔에서 한글/이모지 출력
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# crawler 모듈 import
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "crawler"))

from api_client import KepcoApiClient, SKIP_VALUE  # noqa: E402


# ── 테스트 케이스 ──────────────────────────────────────────────
# (label, addr_do, addr_si, addr_gu, addr_lidong, addr_li, addr_jibun)
CASES = [
    # A. 행정구역 형태별
    ("A1 도-군-면-리 (사용자 예시)",
     "경기도", "양평군", "", "청운면", "갈운리", "24-1"),
    ("A2 광역시-구-동",
     "서울특별시", "강남구", "", "역삼동", "", "736"),
    ("A3 광역시-군-읍-리",
     "부산광역시", "기장군", "", "일광읍", "청광리", "1"),
    ("A4 도-시-구-동",
     "충청북도", "청주시", "흥덕구", "가경동", "", "1502"),
    ("A5 세종 (시도=시 통합)",
     "세종특별자치시", "", "", "조치원읍", "신흥리", "1"),
    ("A6 제주 (도-시-동)",
     "제주특별자치도", "제주시", "", "노형동", "", "925"),
    ("A7 강원 (도-시-동, 구 없음)",
     "강원특별자치도", "춘천시", "", "효자동", "", "100"),

    # B. 지번 형태별
    ("B1 산 번지",
     "경기도", "양평군", "", "청운면", "갈운리", "산 1"),
    ("B2 본번만 (부번 없음)",
     "경기도", "양평군", "", "청운면", "갈운리", "24"),
    ("B3 존재하지 않을 가능성 큰 지번",
     "경기도", "양평군", "", "청운면", "갈운리", "9999"),

    # C. 잘못/불완전한 입력
    ("C1 면 누락 (도-군-리-지번)",
     "경기도", "양평군", "", "", "갈운리", "24-1"),
    ("C2 군→시 오타 (양평시)",
     "경기도", "양평시", "", "청운면", "갈운리", "24-1"),
]


def search_with_fallback(client: KepcoApiClient, do, si, gu, lidong, li, jibun):
    """
    crawler.py _do_search 와 동일한 2단계 호출.
    - 1차: 입력 그대로
    - 2차: -기타지역 → 빈값
    Returns: (results, attempt_used)
        attempt_used: 1=1차성공, 2=2차성공, 0=실패
    """
    # 1차
    try:
        results = client.search_capacity(
            addr_do=do, addr_si=si, addr_gu=gu,
            addr_lidong=lidong,
            addr_li="" if li == SKIP_VALUE else li,
            addr_jibun=jibun,
        )
        if results:
            return results, 1
    except Exception as e:
        return [], 0, str(e)

    # 2차: -기타지역 → 빈값
    alt_si = "" if si == SKIP_VALUE else si
    alt_gu = "" if gu == SKIP_VALUE else gu
    alt_li = "" if li == SKIP_VALUE else li
    try:
        retry = client.search_capacity(
            addr_do=do, addr_si=alt_si, addr_gu=alt_gu,
            addr_lidong=lidong, addr_li=alt_li, addr_jibun=jibun,
        )
        if retry:
            return retry, 2
    except Exception as e:
        return [], 0, str(e)

    return [], 0


def fmt_input(case):
    label, do, si, gu, lidong, li, jibun = case
    parts = [do, si, gu, lidong, li, jibun]
    return " ".join(p for p in parts if p)


def run():
    client = KepcoApiClient(delay=0.8)
    client._on_log = lambda msg: print(f"  [client] {msg}")

    out_rows = []
    print(f"{'='*80}")
    print(f"KEPCO API 직접 호출 테스트 — {len(CASES)} 케이스")
    print(f"{'='*80}\n")

    for case in CASES:
        label = case[0]
        addr_str = fmt_input(case)
        print(f"\n[{label}]")
        print(f"  입력: {addr_str}")

        t0 = time.time()
        result = search_with_fallback(client, *case[1:])
        elapsed = (time.time() - t0) * 1000

        if len(result) == 3:
            results, attempt, err = result
        else:
            results, attempt = result
            err = None

        n = len(results)
        if attempt == 1:
            status = f"✅ 1차 성공 ({n}건)"
        elif attempt == 2:
            status = f"⚠️ 2차(-기타지역 fallback) 성공 ({n}건)"
        elif err:
            status = f"❌ 예외: {err}"
        else:
            status = f"❌ 0건 (양쪽 다 실패)"

        print(f"  결과: {status}  [{elapsed:.0f}ms]")

        # 첫 결과 시설 미리보기
        if results:
            preview = results[0]
            print(f"  샘플: SUBST={preview.get('SUBST_NM','')} "
                  f"DL={preview.get('DL_NM','')} "
                  f"DL_CAPA={preview.get('DL_CAPA','')} "
                  f"DL_PWR={preview.get('DL_PWR','')}")

        out_rows.append({
            "label": label,
            "input": addr_str,
            "fields": {
                "addr_do": case[1],
                "addr_si": case[2],
                "addr_gu": case[3],
                "addr_lidong": case[4],
                "addr_li": case[5],
                "addr_jibun": case[6],
            },
            "attempt": attempt,
            "result_count": n,
            "elapsed_ms": round(elapsed, 1),
            "error": err,
            "first_result": results[0] if results else None,
        })

    # 저장
    out_path = Path(__file__).parent / "results.json"
    out_path.write_text(
        json.dumps(out_rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # 요약
    print(f"\n{'='*80}")
    print("요약")
    print(f"{'='*80}")
    n_first = sum(1 for r in out_rows if r["attempt"] == 1)
    n_second = sum(1 for r in out_rows if r["attempt"] == 2)
    n_fail = sum(1 for r in out_rows if r["attempt"] == 0)
    print(f"  1차 성공: {n_first}/{len(out_rows)}")
    print(f"  2차 성공: {n_second}/{len(out_rows)}")
    print(f"  실패: {n_fail}/{len(out_rows)}")
    print(f"\n결과 저장: {out_path}")


if __name__ == "__main__":
    run()
