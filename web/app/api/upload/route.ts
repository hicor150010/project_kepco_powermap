/**
 * POST /api/upload
 * - 관리자 전용
 * - 브라우저에서 파싱한 ParsedRow[]를 받음
 * - 신규 주소 지오코딩 (VWorld) → geocode_cache 저장
 * - kepco_addr upsert → kepco_capa upsert (2단계)
 * - Materialized View REFRESH
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeBatch } from "@/lib/geocode/vworld";
import type { ParsedRow } from "@/lib/excel/parse";

interface UploadRequest {
  filename: string;
  rows: ParsedRow[];
  hasStep: boolean;
  parseSummary: {
    total: number;
    ok: number;
    skipped: number;
    duplicates: number;
  };
}

interface UploadResponse {
  ok: true;
  filename: string;
  parse: UploadRequest["parseSummary"];
  geocode: {
    uniqueAddresses: number;
    cacheHit: number;
    newGeocoded: number;
    failed: number;
  };
  db: {
    inserted: number;
    updated: number;
    rowsWithoutCoords: number;
  };
  elapsedMs: number;
}

const UPSERT_CHUNK = 1000;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  // 1) 권한 검증
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "관리자만 업로드 가능합니다." },
      { status: 403 }
    );
  }

  // 2) 본문 파싱
  let body: UploadRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청 본문" },
      { status: 400 }
    );
  }
  if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "업로드할 데이터가 없습니다." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // 3) 고유 geocode_address 추출
  const uniqueAddresses = Array.from(
    new Set(body.rows.map((r) => r.geocode_address).filter(Boolean))
  );

  // 4) geocode_cache 일괄 조회
  const cacheMap = new Map<string, { lat: number; lng: number }>();
  if (uniqueAddresses.length > 0) {
    for (let i = 0; i < uniqueAddresses.length; i += 1000) {
      const chunk = uniqueAddresses.slice(i, i + 1000);
      const { data, error } = await supabase
        .from("geocode_cache")
        .select("address, lat, lng")
        .in("address", chunk);
      if (error) {
        return NextResponse.json(
          { ok: false, error: `geocode_cache 조회 실패: ${error.message}` },
          { status: 500 }
        );
      }
      data?.forEach((row) => {
        cacheMap.set(row.address, { lat: row.lat, lng: row.lng });
      });
    }
  }

  // 5) 캐시 미스만 VWorld 호출
  const missing = uniqueAddresses.filter((a) => !cacheMap.has(a));
  let newGeocoded = 0;
  let geocodeFailed = 0;

  if (missing.length > 0) {
    const fetched = await geocodeBatch(missing);
    const toInsert: { address: string; lat: number; lng: number; source: string }[] = [];

    fetched.forEach((result, address) => {
      if (result) {
        cacheMap.set(address, result);
        toInsert.push({
          address,
          lat: result.lat,
          lng: result.lng,
          source: "vworld",
        });
        newGeocoded++;
      } else {
        geocodeFailed++;
      }
    });

    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += UPSERT_CHUNK) {
        const chunk = toInsert.slice(i, i + UPSERT_CHUNK);
        const { error } = await supabase
          .from("geocode_cache")
          .upsert(chunk, { onConflict: "address" });
        if (error) {
          return NextResponse.json(
            { ok: false, error: `geocode_cache 저장 실패: ${error.message}` },
            { status: 500 }
          );
        }
      }
    }
  }

  // 6) kepco_addr upsert — 고유 주소별 1행
  const addrRowsMap = new Map<string, {
    addr_do: string; addr_si: string | null; addr_gu: string | null;
    addr_dong: string | null; addr_li: string | null;
    geocode_address: string; lat: number | null; lng: number | null;
  }>();

  for (const r of body.rows) {
    if (!addrRowsMap.has(r.geocode_address)) {
      const geo = cacheMap.get(r.geocode_address);
      addrRowsMap.set(r.geocode_address, {
        addr_do: r.addr_do,
        addr_si: r.addr_si,
        addr_gu: r.addr_gu,
        addr_dong: r.addr_dong,
        addr_li: r.addr_li,
        geocode_address: r.geocode_address,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
      });
    }
  }

  const addrRows = Array.from(addrRowsMap.values());
  const addrIdMap = new Map<string, number>(); // geocode_address → id
  let rowsWithoutCoords = 0;

  for (let i = 0; i < addrRows.length; i += UPSERT_CHUNK) {
    const chunk = addrRows.slice(i, i + UPSERT_CHUNK);
    const { data, error } = await supabase
      .from("kepco_addr")
      .upsert(chunk, { onConflict: "geocode_address" })
      .select("id, geocode_address");
    if (error) {
      return NextResponse.json(
        { ok: false, error: `kepco_addr 저장 실패: ${error.message}` },
        { status: 500 }
      );
    }
    data?.forEach((r) => addrIdMap.set(r.geocode_address, r.id));
  }

  // 7) kepco_capa upsert — 지번×시설 용량 데이터
  const capaRows: any[] = [];
  for (const r of body.rows) {
    const addrId = addrIdMap.get(r.geocode_address);
    if (!addrId) {
      rowsWithoutCoords++;
      continue;
    }
    capaRows.push({
      addr_id: addrId,
      addr_jibun: r.addr_jibun,
      subst_nm: r.subst_nm,
      mtr_no: r.mtr_no,
      dl_nm: r.dl_nm,
      subst_capa: r.subst_capa,
      subst_pwr: r.subst_pwr,
      g_subst_capa: r.g_subst_capa,
      mtr_capa: r.mtr_capa,
      mtr_pwr: r.mtr_pwr,
      g_mtr_capa: r.g_mtr_capa,
      dl_capa: r.dl_capa,
      dl_pwr: r.dl_pwr,
      g_dl_capa: r.g_dl_capa,
      step1_cnt: r.step1_cnt,
      step1_pwr: r.step1_pwr,
      step2_cnt: r.step2_cnt,
      step2_pwr: r.step2_pwr,
      step3_cnt: r.step3_cnt,
      step3_pwr: r.step3_pwr,
    });
  }

  let totalUpserted = 0;
  for (let i = 0; i < capaRows.length; i += UPSERT_CHUNK) {
    const chunk = capaRows.slice(i, i + UPSERT_CHUNK);
    const { error, count } = await supabase
      .from("kepco_capa")
      .upsert(chunk, {
        onConflict: "addr_id,addr_jibun,subst_nm,mtr_no,dl_nm",
        count: "exact",
      });
    if (error) {
      return NextResponse.json(
        { ok: false, error: `kepco_capa 저장 실패: ${error.message}` },
        { status: 500 }
      );
    }
    totalUpserted += count ?? chunk.length;
  }

  // 8) Materialized View REFRESH
  const { error: refreshErr } = await supabase.rpc("refresh_kepco_summary");
  if (refreshErr) {
    console.error("[REFRESH 실패]", refreshErr);
  }

  const result: UploadResponse = {
    ok: true,
    filename: body.filename,
    parse: body.parseSummary,
    geocode: {
      uniqueAddresses: uniqueAddresses.length,
      cacheHit: uniqueAddresses.length - missing.length,
      newGeocoded,
      failed: geocodeFailed,
    },
    db: {
      inserted: totalUpserted,
      updated: 0,
      rowsWithoutCoords,
    },
    elapsedMs: Date.now() - startedAt,
  };

  return NextResponse.json(result);
}
