import * as XLSX from "xlsx";
import type { LocationData, MarkerColor } from "./types";

function getMarkerColor(
  volSubst: string,
  volMtr: string,
  volDl: string
): MarkerColor {
  const substOk = volSubst === "여유용량 있음";
  const mtrOk = volMtr === "여유용량 있음";
  const dlOk = volDl === "여유용량 있음";

  if (!substOk) return "red";
  if (substOk && mtrOk && dlOk) return "blue";
  if (substOk && mtrOk && !dlOk) return "green";
  if (substOk && !mtrOk) return "yellow";
  return "red";
}

function buildAddress(parts: string[]): string {
  return parts
    .filter((p) => p && p !== "-기타지역")
    .join(" ")
    .trim();
}

export function parseExcelFile(file: File): Promise<LocationData[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
        });

        const results: LocationData[] = [];

        for (let i = 3; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 12) continue;

          const addr_do = String(row[0] || "");
          const addr_si = String(row[1] || "");
          const addr_gu = String(row[2] || "");
          const addr_dong = String(row[3] || "");
          const addr_li = String(row[4] || "");
          const addr_jibun = String(row[5] || "");

          if (!addr_do) continue;

          const vol_subst = String(row[9] || "");
          const vol_mtr = String(row[10] || "");
          const vol_dl = String(row[11] || "");

          const fullAddress = buildAddress([
            addr_do,
            addr_si,
            addr_gu,
            addr_dong,
            addr_li,
            addr_jibun,
          ]);
          // 위치 변환용: 리까지만 (번지 제외) → 카카오 호출량 대폭 감소
          const geocodeAddress = buildAddress([
            addr_do,
            addr_si,
            addr_gu,
            addr_dong,
            addr_li,
          ]);

          results.push({
            addr_do,
            addr_si,
            addr_gu,
            addr_dong,
            addr_li,
            addr_jibun,
            fullAddress,
            geocodeAddress,
            subst_nm: String(row[6] || ""),
            mtr_no: String(row[7] || ""),
            dl_nm: String(row[8] || ""),
            vol_subst,
            vol_mtr,
            vol_dl,
            subst_capa: String(row[12] || ""),
            subst_pwr: String(row[13] || ""),
            g_subst_capa: String(row[14] || ""),
            mtr_capa: String(row[15] || ""),
            mtr_pwr: String(row[16] || ""),
            g_mtr_capa: String(row[17] || ""),
            dl_capa: String(row[18] || ""),
            dl_pwr: String(row[19] || ""),
            g_dl_capa: String(row[20] || ""),
            // STEP 데이터 (있을 경우만 — 21~26 컬럼)
            step1_cnt: row[21] != null ? String(row[21]) : undefined,
            step1_pwr: row[22] != null ? String(row[22]) : undefined,
            step2_cnt: row[23] != null ? String(row[23]) : undefined,
            step2_pwr: row[24] != null ? String(row[24]) : undefined,
            step3_cnt: row[25] != null ? String(row[25]) : undefined,
            step3_pwr: row[26] != null ? String(row[26]) : undefined,
            color: getMarkerColor(vol_subst, vol_mtr, vol_dl),
          });
        }

        resolve(results);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsArrayBuffer(file);
  });
}
