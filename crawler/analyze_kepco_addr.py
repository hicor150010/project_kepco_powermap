"""
kepco_addr 현황 분석 + 랜덤 샘플 검증

출력:
  1) 시/도별 행 수 분포
  2) (addr_do, addr_dong, addr_li) 조합 중복 카운트 (동일 리가 여러 경로로 저장된 케이스)
  3) 좌표 채움률
  4) 랜덤 샘플 100개 → KEPCO 드롭다운 역조회로 누락 검증
"""
import json
import os
import random
import sys
from collections import Counter

import requests

from api_client import KepcoApiClient

# Windows 콘솔 cp949 회피 — UTF-8 강제
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

DO_LIST = [
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시",
    "대전광역시", "울산광역시", "세종특별자치시",
    "경기도", "강원도", "강원특별자치도",
    "충청북도", "충청남도",
    "전라북도", "전북특별자치도", "전라남도",
    "경상북도", "경상남도", "제주특별자치도",
]


def _headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }


def _count(params: dict) -> int:
    """PostgREST Range+count 로 개수 조회"""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/kepco_addr",
        params={**params, "select": "id"},
        headers={**_headers(), "Prefer": "count=exact", "Range": "0-0"},
        timeout=30,
    )
    cr = resp.headers.get("content-range", "0-0/0")
    return int(cr.split("/")[-1])


def _fetch_all(params: dict, limit: int = 25000) -> list[dict]:
    """전체 행 조회 (page 단위)"""
    rows = []
    page = 1000
    offset = 0
    while offset < limit:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/kepco_addr",
            params={**params, "limit": str(page), "offset": str(offset)},
            headers=_headers(),
            timeout=60,
        )
        if resp.status_code != 200:
            break
        data = resp.json()
        if not data:
            break
        rows.extend(data)
        if len(data) < page:
            break
        offset += page
    return rows


def analyze_by_do():
    print("\n=== 1) 시/도별 kepco_addr 행 수 ===")
    total = 0
    for do in DO_LIST:
        cnt = _count({"addr_do": f"eq.{do}"})
        if cnt > 0:
            print(f"  {do:<15} {cnt:,}")
            total += cnt
    print(f"  {'-'*30}")
    print(f"  {'합계':<15} {total:,}")
    print(f"  DB 총합: {_count({}):,}")


def analyze_coords():
    print("\n=== 2) 좌표 채움률 ===")
    total = _count({})
    has_coord = _count({"lat": "not.is.null"})
    print(f"  총 행: {total:,}")
    print(f"  좌표 있음: {has_coord:,} ({100*has_coord/total:.1f}%)")
    print(f"  좌표 없음: {total - has_coord:,} ({100*(total-has_coord)/total:.1f}%)")


def analyze_duplicates():
    """(addr_do, addr_dong, addr_li) 조합 중복 — 같은 리가 여러 경로로 저장"""
    print("\n=== 3) 실질 중복 분석 ((do, dong, li) 조합 기준) ===")
    print("  전체 행 로딩 중...")
    rows = _fetch_all({}, limit=30000)
    print(f"  {len(rows):,} 행 로드 완료")

    # (do, dong, li) 조합 카운트
    combo_counts = Counter()
    for r in rows:
        if r.get("addr_dong") and r.get("addr_li"):
            key = (r["addr_do"], r["addr_dong"], r["addr_li"])
            combo_counts[key] += 1

    total_keys = len(combo_counts)
    dup_keys = [k for k, c in combo_counts.items() if c > 1]
    dup_total_rows = sum(combo_counts[k] for k in dup_keys)

    print(f"  고유 (do, dong, li) 조합: {total_keys:,}")
    print(f"  중복 발생 조합: {len(dup_keys):,} "
          f"(= {dup_total_rows:,} 행이 {len(dup_keys):,} 개 실제 리에 해당)")
    print(f"  중복으로 인한 잉여 행: {dup_total_rows - len(dup_keys):,}")

    if dup_keys:
        print("\n  중복 TOP 10 (같은 리가 N번 저장):")
        top10 = sorted(dup_keys, key=lambda k: -combo_counts[k])[:10]
        for k in top10:
            print(f"    {combo_counts[k]}회: {k[0]} / {k[1]} / {k[2]}")

    # 2-2) 같은 리의 addr_si/addr_gu 변종 예시
    print("\n  중복 예시 3개 (si/gu 조합 변종):")
    for k in dup_keys[:3]:
        variants = [r for r in rows
                    if r["addr_do"] == k[0] and r.get("addr_dong") == k[1]
                    and r.get("addr_li") == k[2]]
        print(f"\n    ■ {k[0]} {k[1]} {k[2]} ({len(variants)}개)")
        for v in variants:
            has = "Y" if v.get("lat") else "N"
            print(f"      [{has}] si={v.get('addr_si')!r:20} gu={v.get('addr_gu')!r:20}")


def sample_validation(n: int = 100, delay: float = 0.5):
    """랜덤 샘플 N개 → KEPCO 드롭다운 역조회로 일치 확인"""
    print(f"\n=== 4) 랜덤 샘플 {n}개 KEPCO 드롭다운 역조회 ===")
    print(f"  addr_li 값이 있는 행만 대상 ({n}개 추출)")

    # addr_li 가 있고 -기타지역이 아닌 행만 샘플링
    rows = _fetch_all({"addr_li": "not.is.null"}, limit=25000)
    eligible = [r for r in rows
                if r.get("addr_li") and r["addr_li"] != "-기타지역"]
    print(f"  샘플 풀: {len(eligible):,}행")

    random.seed(42)  # 재현성
    sample = random.sample(eligible, min(n, len(eligible)))

    client = KepcoApiClient(delay=delay)
    found, missing = 0, 0
    mismatch_details = []

    for i, r in enumerate(sample, 1):
        do = r["addr_do"]
        si = r.get("addr_si") or ""
        gu = r.get("addr_gu") or ""
        dong = r.get("addr_dong") or ""
        li = r["addr_li"]

        # KEPCO gbn=3 호출 — 해당 동의 리 목록 받아서 우리 li 가 포함돼 있는지 확인
        try:
            li_list = client.get_addr_list(
                gbn=3, addr_do=do, addr_si=si, addr_gu=gu, addr_lidong=dong
            )
            if li in li_list:
                found += 1
                status = "Y"
            else:
                # 빈 응답이었을 수도 있음
                if not li_list:
                    # gbn=3 에서 빈배열이면 "-기타지역" 으로 매핑된 것. DB 에 저장된 li 는 실제 값이라 불일치.
                    missing += 1
                    status = "N (드롭다운 빈 응답)"
                else:
                    missing += 1
                    status = "N (불일치)"
                mismatch_details.append({
                    "db_row": {"do": do, "si": si, "gu": gu, "dong": dong, "li": li},
                    "kepco_li_list": li_list,
                    "status": status,
                })
        except Exception as e:
            missing += 1
            mismatch_details.append({
                "db_row": {"do": do, "si": si, "gu": gu, "dong": dong, "li": li},
                "error": str(e),
            })
            status = f"N (에러: {str(e)[:50]})"

        if i % 10 == 0:
            print(f"  진행 {i}/{len(sample)} — 일치 {found} / 불일치 {missing}")

    print(f"\n  최종 결과: 일치 {found} / 불일치 {missing} / 샘플 {len(sample)}")
    print(f"  일치율: {100*found/len(sample):.1f}%")

    if mismatch_details:
        with open("sample_mismatches.json", "w", encoding="utf-8") as f:
            json.dump(mismatch_details, f, ensure_ascii=False, indent=2)
        print(f"\n  불일치 {len(mismatch_details)}건 → sample_mismatches.json 저장")
        # 처음 5건 인라인 출력
        print("\n  불일치 처음 5건:")
        for d in mismatch_details[:5]:
            db = d["db_row"]
            print(f"    - {db['do']} / si={db['si']!r} gu={db['gu']!r} dong={db['dong']} li={db['li']}")
            if "kepco_li_list" in d:
                sample_list = d["kepco_li_list"][:5]
                print(f"      KEPCO 응답 ({len(d['kepco_li_list'])}개): {sample_list}...")


if __name__ == "__main__":
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수 필수")
        sys.exit(1)

    analyze_by_do()
    analyze_coords()
    analyze_duplicates()
    sample_validation(n=100, delay=0.5)
