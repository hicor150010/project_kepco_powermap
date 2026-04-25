# -*- coding: utf-8 -*-
"""
⑥ 태양광 허가 API — 공식 스펙 기반 실측
- 파라미터: pageNo / numOfRows / type / 필드 검색 (SOLAR_GEN_FCLT_NM, LCTN_LOTNO_ADDR, ...)
- 응답 필드: SOLAR_GEN_FCLT_NM, LCTN_LOTNO_ADDR, LATITUDE, LONGITUDE, CAPA, OPRTNG_STTS_SE_NM, INSTL_DTL_PSTN_SE_NM 등
- bjd_code 직접 필터 불가 → 지번주소 파싱 + 좌표 매칭 전략 확인
"""
import sys, io, json, requests
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

KEY = "CWsYAfYYh5I6XFXULGd0/aP6i25mvT6QyAhNyEBPd0GYr6JYMemZBGORK0MwJ1Nx9IUIFd/zR2WpBenPqk+3zg=="
URL = "https://api.data.go.kr/openapi/tn_pubr_public_solar_gen_flct_api"
H = {"User-Agent": "Mozilla/5.0"}


def call(params, label):
    p = {"serviceKey": KEY, "pageNo": "1", "numOfRows": "10", "type": "json"}
    p.update(params)
    r = requests.get(URL, params=p, timeout=30, headers=H)
    print(f"\n━ {label}  HTTP={r.status_code}")
    body = r.text
    if body.strip().startswith("<"):
        # XML/HTML 응답
        print(f"  (XML/HTML 응답) {body[:300]}")
        return None, 0
    try:
        d = r.json()
    except Exception:
        print(f"  raw: {body[:300]}")
        return None, 0
    resp = d.get("response", d)
    header = resp.get("header", {})
    body_data = resp.get("body", {})
    rc = header.get("resultCode")
    rm = header.get("resultMsg")
    if rc not in ("00", "0000", None):
        print(f"  🔴 resultCode={rc} msg={rm}")
        return None, 0
    total = int(body_data.get("totalCount", 0) or 0)
    items = body_data.get("items", [])
    if isinstance(items, dict):
        items = items.get("item", [])
    if isinstance(items, dict):
        items = [items]
    print(f"  🟢 total={total:,}, 반환={len(items)}")
    return items, total


# ═════════ 1) 전체 규모 파악 ═════════
items, total = call({"numOfRows": "1"}, "1) 전국 전체 태양광 허가 건수")
if items:
    first = items[0]
    print(f"\n  📋 응답 필드 ({len(first.keys())}개) + 샘플값:")
    for k, v in first.items():
        print(f"     {k:<25} = {str(v)[:50]}")

# ═════════ 2) 페이지당 100건 호출해서 실제 데이터 분포 확인 ═════════
items, _ = call({"numOfRows": "100"}, "2) 100건 샘플링 (지역분포/용량분포)")
if items:
    # 시도 분포 (LCTN_LOTNO_ADDR 앞부분 파싱)
    sido_counter = Counter()
    capa_buckets = Counter()
    status_counter = Counter()
    instl_pos_counter = Counter()
    for it in items:
        addr = (it.get("LCTN_LOTNO_ADDR") or it.get("LCTN_ROAD_NM_ADDR") or "").strip()
        sido = addr.split()[0] if addr else "(빈값)"
        sido_counter[sido] += 1

        try:
            c = float(it.get("CAPA") or 0)
            if c < 3: capa_buckets["~3kW"] += 1
            elif c < 30: capa_buckets["3~30kW"] += 1
            elif c < 100: capa_buckets["30~100kW"] += 1
            elif c < 500: capa_buckets["100~500kW"] += 1
            else: capa_buckets["500kW+"] += 1
        except:
            capa_buckets["용량불명"] += 1

        status_counter[it.get("OPRTNG_STTS_SE_NM") or "(빈)"] += 1
        instl_pos_counter[it.get("INSTL_DTL_PSTN_SE_NM") or "(빈)"] += 1

    print(f"\n  📊 시도 분포 (상위 10): {sido_counter.most_common(10)}")
    print(f"  📊 용량 분포: {dict(capa_buckets)}")
    print(f"  📊 가동상태: {dict(status_counter)}")
    print(f"  📊 설치위치구분: {dict(instl_pos_counter)}")

# ═════════ 3) 지역 검색 — LCTN_LOTNO_ADDR 으로 필터 가능한지 ═════════
for addr_kw in ["전라남도 여수시", "전라남도 영암군", "경기도"]:
    items, tot = call({"LCTN_LOTNO_ADDR": addr_kw, "numOfRows": "5"}, f"3) LCTN_LOTNO_ADDR={addr_kw} 검색")
    if items:
        for it in items[:3]:
            print(f"     • {it.get('SOLAR_GEN_FCLT_NM')} | {it.get('LCTN_LOTNO_ADDR')}")
            print(f"       CAPA={it.get('CAPA')}kW, 위치={it.get('INSTL_DTL_PSTN_SE_NM')}, 가동={it.get('OPRTNG_STTS_SE_NM')}, 위경도=({it.get('LATITUDE')},{it.get('LONGITUDE')})")

# ═════════ 4) 우리 bjd_code 샘플 지역 데이터 확인 ═════════
print("\n" + "=" * 60)
print("우리 샘플 bjd 기준 지역 매칭 테스트")
print("=" * 60)
samples = [
    ("전라남도 여수시 돌산읍 신복리", "4613025022"),
    ("전라남도 영암군 영암읍 송평리", "4683025031"),
    ("서울특별시 강남구 삼성동", "1168010500"),
]
for addr_text, bjd in samples:
    items, tot = call({"LCTN_LOTNO_ADDR": addr_text, "numOfRows": "3"}, f"{addr_text} (bjd={bjd})")
    if items and tot > 0:
        for it in items[:3]:
            print(f"     • {it.get('LCTN_LOTNO_ADDR')} / CAPA={it.get('CAPA')}kW / {it.get('INSTL_DTL_PSTN_SE_NM')} / 좌표=({it.get('LATITUDE')},{it.get('LONGITUDE')})")

# ═════════ 5) 전국 수집 가능성 — 일 트래픽 1000건 대비 ═════════
print("\n" + "=" * 60)
print("수집 비용 추정")
print("=" * 60)
# 전체 totalCount / 1000 건 페이지 = 몇 페이지 필요
items, grand_total = call({"numOfRows": "1000"}, "대량호출 1000건/페이지 테스트")
if grand_total:
    pages_needed = (grand_total + 999) // 1000
    print(f"  전국 전체: {grand_total:,}건")
    print(f"  1000건/페이지 호출 시 필요 호출 수: {pages_needed:,}회")
    print(f"  일 1000호출 제한 → 최단 {pages_needed/1000:.1f}일 소요 (실제는 여유 두고 며칠)")

print("\n완료")
