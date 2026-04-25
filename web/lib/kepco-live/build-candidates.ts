/**
 * ParsedAddress → KEPCO API 호출 후보 N개.
 *
 * KEPCO 의 비일관성 (광주광역시 si='-기타지역' 유지 / 천안시 gu='-기타지역' 빈값,
 * 세종 si=do, 광역시 시 목록 패턴 등) 때문에 단일 호출로는 매칭률이 낮다.
 * 검증된 4단계 fallback 룰을 우선순위 순서대로 후보로 만들어
 * 호출 측에서 첫 매칭 결과를 채택한다.
 *
 * 검증 출처: scripts/test_kepco_address_lookup/verify_full.py 33 케이스 + verify_extra
 */

import type { ParsedAddress } from "./parse-address";

export interface KepcoCandidate {
  do: string;
  si: string;
  gu: string;
  lidong: string;
  li: string;
  reason: string; // 디버그/로그용 — 어떤 룰로 만들어진 후보인지
}

const SKIP_VALUE = "-기타지역";

// 동분할 후보 — 사용자 입력 '효자동' → '효자동N가' 또는 '효자N동'
// (검증: 전북 전주 완산구 효자동 → 효자동1가/2가/3가 매칭)
const SPLIT_DONG_GA = ["1가", "2가", "3가", "4가", "5가"];
const SPLIT_DONG_NUM = ["1동", "2동", "3동", "4동"];

function makeBaseCandidates(parsed: ParsedAddress): KepcoCandidate[] {
  const do_ = parsed.sep_1 ?? "";
  const sep2 = parsed.sep_2 ?? "";
  const gu = parsed.sep_3 ?? "";
  const lidong = parsed.sep_4 ?? "";
  const li = parsed.sep_5 ?? "";

  const candidates: KepcoCandidate[] = [];

  // 1차: sep_2 → si, 빈값이면 '-기타지역' (양평군/광역시 등 검증)
  const si1 = sep2 || SKIP_VALUE;
  candidates.push({
    do: do_, si: si1, gu, lidong, li,
    reason: sep2 ? "primary" : "no-si → -기타지역",
  });

  // 2차: si='-기타지역' 이면 '' 도 시도 (충남 천안시 같은 케이스)
  if (si1 === SKIP_VALUE) {
    candidates.push({
      do: do_, si: "", gu, lidong, li,
      reason: "-기타지역 → empty",
    });
  }

  // 3차: sep_2/sep_3 모두 없는 케이스 — si=do (세종 검증)
  // 양평군/강남구처럼 sep_3 채워진 광역시/도-군은 si='-기타지역' 으로 충분.
  if (!sep2 && !gu) {
    candidates.push({
      do: do_, si: do_, gu, lidong, li,
      reason: "si=do (sejong)",
    });
    // 4차: li='' 까지 (세종은 마을 단위 검색 미수신, 검증)
    if (li) {
      candidates.push({
        do: do_, si: do_, gu, lidong, li: "",
        reason: "si=do + empty li",
      });
    }
  }

  return candidates;
}

function expandSplitDongCandidates(parsed: ParsedAddress): KepcoCandidate[] {
  const lidong = parsed.sep_4;
  if (!lidong) return [];
  if (parsed.sep_5) return []; // 리가 있으면 동분할 의미 없음
  // 이미 분할된 형태 (효자동1가, 둔산1동 등) 면 skip
  if (/\d/.test(lidong)) return [];

  const do_ = parsed.sep_1 ?? "";
  const sep2 = parsed.sep_2 ?? "";
  const gu = parsed.sep_3 ?? "";
  const si = sep2 || SKIP_VALUE;

  // ~동 → ~동N가 (효자동 → 효자동1가)
  // ~동 → ~N동 (효자동 → 효자1동)
  const stem = lidong.endsWith("동") ? lidong.slice(0, -1) : lidong;
  const variants: string[] = [];
  for (const s of SPLIT_DONG_GA) variants.push(`${lidong}${s}`);
  for (const s of SPLIT_DONG_NUM) variants.push(`${stem}${s}`);

  return variants.map((v): KepcoCandidate => ({
    do: do_, si, gu, lidong: v, li: "",
    reason: `split-dong:${v}`,
  }));
}

export interface BuildOpts {
  /** 동분할 변종 후보 추가 (효자동 → 효자동1가/2가/3가 등). 1차 0건 시에만 의미 있음. */
  includeSplitDong?: boolean;
}

export function buildKepcoCandidates(
  parsed: ParsedAddress,
  opts?: BuildOpts,
): KepcoCandidate[] {
  const base = makeBaseCandidates(parsed);
  if (!opts?.includeSplitDong) return base;
  return [...base, ...expandSplitDongCandidates(parsed)];
}
