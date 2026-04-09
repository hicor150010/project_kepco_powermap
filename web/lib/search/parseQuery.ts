/**
 * 검색 입력 파싱.
 *
 * 사용자 자유 텍스트를 받아 "행정구역 키워드"와 "지번 본번"으로 분리한다.
 *
 * 예시:
 *   "용구리 100"          → { keywords: ["용구리"], lotNo: 100 }
 *   "마산면 용구리 산100" → { keywords: ["마산면", "용구리"], lotNo: 100 }
 *   "구례군 100-1"        → { keywords: ["구례군"], lotNo: 100 }
 *   "용구리"              → { keywords: ["용구리"], lotNo: null }
 *   "  "                  → { keywords: [], lotNo: null }
 *
 * 단순한 휴리스틱으로 충분 — 마지막 토큰에 숫자가 있으면 본번으로 추출,
 * 그 외 토큰은 모두 행정구역 키워드로 본다.
 */

export interface ParsedQuery {
  /** 행정구역 키워드 (각각 ILIKE OR로 결합) */
  keywords: string[];
  /** 지번 본번. "100", "100-1", "산100" 등에서 첫 숫자 시퀀스만. 없으면 null */
  lotNo: number | null;
}

export function parseQuery(input: string): ParsedQuery {
  const trimmed = input.trim();
  if (!trimmed) return { keywords: [], lotNo: null };

  // 공백 기준 토큰화
  const tokens = trimmed.split(/\s+/);

  // 마지막 토큰에서 본번 추출 시도
  const last = tokens[tokens.length - 1];
  const lotMatch = last.match(/(\d+)/);

  let lotNo: number | null = null;
  let keywordTokens: string[];

  if (lotMatch) {
    // 마지막 토큰에 숫자가 있으면 본번으로 사용하고 키워드에서 제외
    lotNo = parseInt(lotMatch[1], 10);
    keywordTokens = tokens.slice(0, -1);

    // 마지막 토큰에서 숫자 앞 부분이 의미 있는 한글이라면(예: "산100" → "산"이지만
    // "산"은 검색어로 의미 없으므로 버린다. "용구리100" 처럼 붙여 쓴 경우만 키워드 살림)
    const beforeNum = last.slice(0, lotMatch.index ?? 0).trim();
    if (beforeNum && beforeNum !== "산") {
      keywordTokens.push(beforeNum);
    }
  } else {
    keywordTokens = tokens;
  }

  // 빈 문자열 제거 + 1글자 토큰 제외 (너무 광범위한 매칭 방지)
  const keywords = keywordTokens
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  return { keywords, lotNo };
}
