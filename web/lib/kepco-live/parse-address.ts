/**
 * 한글주소 → 5필드 토큰 + 지번 분리.
 *
 * 행안부 표준 한글주소를 KEPCO API 호출에 필요한 5필드 (sep_1~5) 와
 * 지번 토큰으로 분리한다. crawler/import_bjd_master.py 의 split_sep5
 * 룰을 그대로 따르며, 지번 분리 룰은 KEPCO 형식 ('산1-10' 공백 없음)
 * 에 맞게 정규화한다.
 *
 * 룰:
 *  sep_1 = 첫 토큰 (시도)
 *  sep_5 ← 접미 '리'
 *  sep_4 ← 접미 '읍' / '면' / '동' / '가'
 *  sep_3 ← 접미 '구' / '군'
 *  sep_2 ← 접미 '시'
 *  jibun ← 뒤에서부터 모은 숫자/하이픈/'산' 시작 토큰
 *           '산 1' 형태는 KEPCO 표기 '산1' 로 정규화
 */

export interface ParsedAddress {
  sep_1: string | null; // 시도 (예: '경기도', '서울특별시')
  sep_2: string | null; // 시 (예: '청주시'). 없으면 null
  sep_3: string | null; // 구/군 (예: '흥덕구', '양평군'). 없으면 null
  sep_4: string | null; // 읍/면/동/가 (예: '청운면', '역삼동'). 없으면 null
  sep_5: string | null; // 리 (예: '갈운리'). 없으면 null
  jibun: string;         // 지번 (예: '24-1', '산1-10'). 없으면 빈 문자열
  original: string;      // 원본 입력
}

const JIBUN_PREFIX_DIGITS = /^[0-9-]/;

function isJibunToken(token: string): boolean {
  if (!token) return false;
  if (token === "산") return true;
  if (JIBUN_PREFIX_DIGITS.test(token[0])) return true;
  // '산1-10', '산116', '산1' 등 KEPCO 형식
  if (token.startsWith("산") && token.length > 1) {
    return JIBUN_PREFIX_DIGITS.test(token[1]);
  }
  return false;
}

function splitSep5(name: string): [
  string | null, string | null, string | null, string | null, string | null
] {
  const tokens = name.split(/\s+/).filter(Boolean);
  const sep_1 = tokens[0] ?? null;
  let sep_2: string | null = null;
  let sep_3: string | null = null;
  let sep_4: string | null = null;
  let sep_5: string | null = null;

  for (const t of tokens.slice(1)) {
    if (t.endsWith("리")) {
      sep_5 = t;
    } else if (
      t.endsWith("읍") || t.endsWith("면") ||
      t.endsWith("동") || t.endsWith("가")
    ) {
      sep_4 = t;
    } else if (t.endsWith("구") || t.endsWith("군")) {
      sep_3 = t;
    } else if (t.endsWith("시")) {
      sep_2 = t;
    } else {
      // 세종 본청 등 예외 — sep_4 → sep_5 순서로 채움
      if (sep_4 == null) sep_4 = t;
      else if (sep_5 == null) sep_5 = t;
    }
  }
  return [sep_1, sep_2, sep_3, sep_4, sep_5];
}

export function parseKoreanAddress(addr: string): ParsedAddress {
  const tokens = addr.trim().split(/\s+/).filter(Boolean);

  // 뒤에서부터 지번 토큰 분리
  const jibunTokens: string[] = [];
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    if (isJibunToken(last)) {
      jibunTokens.unshift(tokens.pop()!);
    } else {
      break;
    }
  }

  // KEPCO 표기 정규화: '산 1' → '산1'
  let jibun = jibunTokens.join(" ");
  if (jibun.startsWith("산 ")) jibun = "산" + jibun.slice(2);

  const [sep_1, sep_2, sep_3, sep_4, sep_5] = splitSep5(tokens.join(" "));

  return { sep_1, sep_2, sep_3, sep_4, sep_5, jibun, original: addr };
}
