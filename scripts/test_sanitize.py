"""
Test A — _sanitize_json 단위 테스트.

lone surrogate 가 포함된 다양한 입력에 대해:
 1) surrogate 는 '?' 로 치환
 2) 정상 한글/숫자/None/bool 은 원형 보존
 3) 중첩 dict/list 재귀 통과

외부 의존 없음. Python 로컬에서 즉시 실행 가능.
"""
import json
import sys
from pathlib import Path

# Windows 콘솔 기본 cp949 회피 — UTF-8 로 강제
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "crawler"))
from run_crawl import _sanitize_json  # noqa: E402

PASS = "✅"
FAIL = "❌"

cases = [
    # (이름, 입력, 검증 함수)
    (
        "lone surrogate 단일",
        "\udceb",
        lambda out: "\udceb" not in out and not any(0xDC00 <= ord(c) <= 0xDFFF for c in out),
    ),
    (
        "정상 한글 원형 보존",
        "전라남도 광양시 옥곡면 묵백리",
        lambda out: out == "전라남도 광양시 옥곡면 묵백리",
    ),
    (
        "깨진+정상 혼합",
        "경\udceb상\udced남\udceb도",
        lambda out: "\udceb" not in out and "\udced" not in out and "경" in out and "상" in out,
    ),
    (
        "숫자/None/bool 통과",
        {"n": 42, "x": None, "b": True, "f": 3.14},
        lambda out: out == {"n": 42, "x": None, "b": True, "f": 3.14},
    ),
    (
        "중첩 dict 재귀",
        {"sido": "경\udceb상", "pos": {"do": "\ud800", "si": "정상"}},
        lambda out: "\udceb" not in out["sido"]
        and "\ud800" not in out["pos"]["do"]
        and out["pos"]["si"] == "정상",
    ),
    (
        "list 안 dict 재귀",
        ["\udceb", "정상", {"name": "\udceb묵백"}],
        lambda out: out[1] == "정상"
        and "\udceb" not in out[0]
        and "\udceb" not in out[2]["name"],
    ),
    (
        "Job #244 의 실제 깨진 sido 재현",
        "\u5bc3\uc38c\uae3d\udceb\uad93\udceb\ub8c4",
        lambda out: "\udceb" not in out,
    ),
    (
        "빈 문자열/빈 dict/빈 list",
        {"a": "", "b": {}, "c": []},
        lambda out: out == {"a": "", "b": {}, "c": []},
    ),
    (
        "JSON 직렬화 가능성 검증",
        {"sido": "경\udceb상", "checkpoint": {"stats": {"found": 100}}},
        lambda out: json.dumps(out, ensure_ascii=True) is not None,
    ),
]

print("=" * 60)
print("Test A — _sanitize_json 단위 테스트")
print("=" * 60)

passed = 0
failed = 0
for name, inp, check in cases:
    try:
        out = _sanitize_json(inp)
        ok = check(out)
        if ok:
            print(f"{PASS} {name}")
            print(f"    in : {inp!r}")
            print(f"    out: {out!r}")
            passed += 1
        else:
            print(f"{FAIL} {name}")
            print(f"    in : {inp!r}")
            print(f"    out: {out!r}")
            failed += 1
    except Exception as e:
        print(f"{FAIL} {name} — 예외 발생: {e!r}")
        failed += 1

print()
print("=" * 60)
print(f"결과: {passed} 통과 / {failed} 실패 / 총 {len(cases)}")
print("=" * 60)

sys.exit(0 if failed == 0 else 1)
