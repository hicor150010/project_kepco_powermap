import * as XLSX from "xlsx";
import type { LocationData } from "./types";

const COLOR_LABEL: Record<string, string> = {
  red: "변전소 여유 없음",
  blue: "여유 충분",
  green: "배전선로만 부족",
  yellow: "주변압기·배전선로 부족",
};

export function exportToExcel(data: LocationData[], filename: string) {
  const rows = data.map((d) => ({
    "시/도": d.addr_do,
    시: d.addr_si,
    "구/군": d.addr_gu,
    "동/면": d.addr_dong,
    리: d.addr_li,
    상세번지: d.addr_jibun,
    변전소명: d.subst_nm,
    주변압기: d.mtr_no,
    배전선로명: d.dl_nm,
    상태: COLOR_LABEL[d.color] || d.color,
    "변전소 여유": d.vol_subst,
    "주변압기 여유": d.vol_mtr,
    "배전선로 여유": d.vol_dl,
    "변전소 접속기준(kW)": d.subst_capa,
    "변전소 접수기준접속(kW)": d.subst_pwr,
    "변전소 접속계획반영(kW)": d.g_subst_capa,
    "주변압기 접속기준(kW)": d.mtr_capa,
    "주변압기 접수기준접속(kW)": d.mtr_pwr,
    "주변압기 접속계획반영(kW)": d.g_mtr_capa,
    "배전선로 접속기준(kW)": d.dl_capa,
    "배전선로 접수기준접속(kW)": d.dl_pwr,
    "배전선로 접속계획반영(kW)": d.g_dl_capa,
    위도: d.lat ?? "",
    경도: d.lng ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "여유용량");
  XLSX.writeFile(wb, filename);
}
