/**
 * 지번 → PNU 19자리 직접 구성.
 *
 * 행안부 표준 PNU = bjd_code(10) + 산구분(1) + 본번(4) + 부번(4)
 *   산구분: 1=일반, 2=산
 *
 * 입력은 KEPCO 데이터 포맷 ("1-2", "산23", "산5-7"). 부번 없으면 "0000".
 * 검증 도구 crawler/test_pnu_construction.py 와 동일 알고리즘 (JS 포팅).
 */
export function buildPnu(
  bjdCode: string,
  addrJibun: string | null | undefined
): string | null {
  if (!/^\d{10}$/.test(bjdCode)) return null;
  const raw = (addrJibun ?? "").trim();
  if (!raw) return null;
  const isSan = raw.startsWith("산");
  const rest = (isSan ? raw.slice(1) : raw).trim();
  const [bonbunStr = "", bubunStr = "0"] = rest.split("-");
  const bonbun = bonbunStr.match(/\d+/)?.[0]?.padStart(4, "0");
  const bubun = bubunStr.match(/\d+/)?.[0]?.padStart(4, "0");
  if (!bonbun || !bubun) return null;
  return `${bjdCode}${isSan ? "2" : "1"}${bonbun}${bubun}`;
}
