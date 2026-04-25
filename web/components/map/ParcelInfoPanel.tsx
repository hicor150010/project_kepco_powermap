"use client";

/**
 * 필지 정보 패널 (1차 1단계 — 지도 클릭 시 표시되는 상담 허브).
 *
 * 설계 원칙:
 *   - 지번 = 정보 출발점. 좌표 진입이든 지번 직접 진입이든 같은 패널.
 *   - 탭으로 정보 카테고리 분리: 필지 / 전기 / 가격 / 입지
 *   - 1차/2차/3차 기능 확장은 각 탭 내부에 섹션 추가 (패널 구조는 그대로)
 *
 * 레이아웃:
 *   - 데스크톱: 좌측 고정 패널
 *   - 모바일: 하단 바텀시트 (화면 하단부)
 */

import { useState } from "react";
import type { KepcoDataRow } from "@/lib/types";
import { hasCapacity } from "@/lib/types";
import type { JibunInfo, ParcelGeometry } from "@/lib/vworld/parcel";
import { formatRelativeKst, formatAbsoluteKst } from "@/lib/dateFormat";
import AddrLine from "./AddrLine";
import { FacilityCard } from "./FacilityCard";

type TabKey = "parcel" | "electric" | "price" | "location";

interface Props {
  jibun: JibunInfo | null;
  geometry: ParcelGeometry | null;
  capa: KepcoDataRow[];
  matchMode: "exact" | "nearest_jibun" | null;
  nearestJibun: string | null;
  loading: boolean;
  onClose: () => void;
}

const M2_TO_PYEONG = 0.3025;

const TABS: { key: TabKey; label: string }[] = [
  { key: "parcel", label: "필지" },
  { key: "electric", label: "전기" },
  { key: "price", label: "가격" },
  { key: "location", label: "입지" },
];

export default function ParcelInfoPanel({
  jibun,
  geometry,
  capa,
  matchMode,
  nearestJibun,
  loading,
  onClose,
}: Props) {
  const [tab, setTab] = useState<TabKey>("parcel");

  return (
    <div
      className="absolute left-4 right-4 bottom-4 md:left-auto md:right-4 md:bottom-4
                 md:w-[400px] max-w-[calc(100%-32px)] bg-white rounded-xl shadow-2xl
                 border border-gray-200 overflow-hidden z-10 flex flex-col
                 h-[55dvh] md:h-[min(440px,calc(100dvh-120px))] kepco-slide-up"
    >
      {/* 헤더 */}
      <div className="px-3 py-2.5 md:px-4 md:py-3 border-b bg-gray-50 flex items-start justify-between gap-2 flex-shrink-0">
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="text-sm text-gray-500 py-1">필지 정보 불러오는 중...</div>
          ) : !jibun ? (
            <div className="text-sm text-gray-600 py-1">이 위치에 필지 없음</div>
          ) : (
            <div className="font-semibold text-xs md:text-sm text-gray-900 truncate">
              <AddrLine
                parts={[
                  jibun.ctp_nm,
                  jibun.sig_nm,
                  jibun.emd_nm,
                  jibun.li_nm || null,
                  jibun.jibun,
                ].filter(Boolean) as string[]}
              />
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0"
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      {/* 탭 */}
      {!loading && jibun && (
        <div className="flex border-b border-gray-200 flex-shrink-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors border-b-2 ${
                tab === t.key
                  ? "text-blue-600 border-blue-600 bg-white"
                  : "text-gray-500 border-transparent hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* 탭 내용 */}
      {!loading && jibun && (
        <div className="flex-1 overflow-auto px-3 py-3 md:px-4 md:py-3">
          {tab === "parcel" && (
            <ParcelTab jibun={jibun} geometry={geometry} />
          )}
          {tab === "electric" && (
            <ElectricTab
              capa={capa}
              matchMode={matchMode}
              nearestJibun={nearestJibun}
              clickedJibun={jibun.jibun}
            />
          )}
          {tab === "price" && <PriceTab geometry={geometry} />}
          {tab === "location" && <LocationTab />}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────
// 탭별 컨텐츠
// ───────────────────────────────────────────

function ParcelTab({
  jibun,
  geometry,
}: {
  jibun: JibunInfo;
  geometry: ParcelGeometry | null;
}) {
  return (
    <dl className="space-y-2.5 text-sm">
      <Row label="주소">
        <span className="text-gray-900">{jibun.addr}</span>
      </Row>
      <Row label="지번">
        <span className="text-gray-900 font-mono">{jibun.jibun}</span>
        {jibun.isSan && (
          <span className="ml-1.5 text-[10px] text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">
            산
          </span>
        )}
      </Row>
      {geometry && (
        <>
          <Row label="지목">
            <span className="text-gray-900">{geometry.jimok || "-"}</span>
          </Row>
          <Row label="면적">
            <span className="text-gray-900 tabular-nums">
              {geometry.area_m2.toLocaleString()}㎡
            </span>
            <span className="text-gray-400 ml-1.5 tabular-nums">
              ({Math.round(geometry.area_m2 * M2_TO_PYEONG).toLocaleString()}평)
            </span>
          </Row>
        </>
      )}
      <Row label="PNU">
        <span className="text-gray-500 text-[11px] font-mono">{jibun.pnu}</span>
      </Row>
    </dl>
  );
}

function ElectricTab({
  capa,
  matchMode,
  nearestJibun,
  clickedJibun,
}: {
  capa: KepcoDataRow[];
  matchMode: "exact" | "nearest_jibun" | null;
  nearestJibun: string | null;
  clickedJibun: string;
}) {
  if (capa.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-6 text-center">
        이 지번/주변에 여유선로 데이터가 없습니다.
      </div>
    );
  }

  // capa row 별로 updated_at 이 갈라질 수 있음 (분할 저장 경계).
  // "이 데이터셋에서 가장 최근 확인 시각" 의미로 max 를 사용.
  // ISO 사전식 비교 대신 Date 변환 비교 (offset 차이에도 안전).
  let lastUpdatedIso: string | null = null;
  let lastUpdatedMs = -Infinity;
  for (const row of capa) {
    if (!row.updated_at) continue;
    const ms = new Date(row.updated_at).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms > lastUpdatedMs) {
      lastUpdatedMs = ms;
      lastUpdatedIso = row.updated_at;
    }
  }
  const relative = formatRelativeKst(lastUpdatedIso);
  const absolute = formatAbsoluteKst(lastUpdatedIso);

  return (
    <div className="space-y-3">
      {matchMode === "nearest_jibun" && nearestJibun && (
        <div className="px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-700 leading-snug">
          <b>{clickedJibun}</b> 데이터가 없어 같은 리에서 가장 가까운{" "}
          <b>{nearestJibun}</b> 정보를 보여드립니다.
        </div>
      )}
      {capa.map((row, i) => (
        <div key={row.id ?? i} className="space-y-1.5">
          {capa.length > 1 && (
            <div className="text-[11px] text-gray-500 font-medium">
              세트 {i + 1} / {capa.length}
            </div>
          )}
          <FacilityCard
            title="변전소"
            name={row.subst_nm ?? "-"}
            ok={hasCapacity(row.subst_capa, row.subst_pwr, row.g_subst_capa)}
            base={row.subst_capa}
            received={row.subst_pwr}
            planned={row.g_subst_capa}
          />
          <FacilityCard
            title="주변압기"
            name={`#${row.mtr_no ?? "-"}`}
            ok={hasCapacity(row.mtr_capa, row.mtr_pwr, row.g_mtr_capa)}
            base={row.mtr_capa}
            received={row.mtr_pwr}
            planned={row.g_mtr_capa}
          />
          <FacilityCard
            title="배전선로"
            name={row.dl_nm ?? "-"}
            ok={hasCapacity(row.dl_capa, row.dl_pwr, row.g_dl_capa)}
            base={row.dl_capa}
            received={row.dl_pwr}
            planned={row.g_dl_capa}
          />
        </div>
      ))}
      {relative && (
        <div
          className="pt-1.5 text-right text-[10px] text-gray-400"
          title={absolute || undefined}
        >
          KEPCO 마지막 확인: {relative}
        </div>
      )}
    </div>
  );
}

function PriceTab({ geometry }: { geometry: ParcelGeometry | null }) {
  if (!geometry) return <ComingSoon />;

  const hasJiga = geometry.jiga != null && geometry.jiga > 0;
  const estimatedPrice =
    hasJiga && geometry.jiga != null
      ? Math.round((geometry.jiga * geometry.area_m2) / 10000)
      : null;

  return (
    <div className="space-y-3 text-sm">
      {hasJiga && geometry.jiga != null ? (
        <>
          <Row label="공시지가">
            <span className="text-gray-900 tabular-nums">
              {geometry.jiga.toLocaleString()}원/㎡
            </span>
          </Row>
          <Row label="필지 추정가">
            <span className="text-gray-900 tabular-nums">
              {estimatedPrice?.toLocaleString()}만원
            </span>
            <span className="text-gray-400 text-[11px] ml-1.5">
              (공시지가 × 면적)
            </span>
          </Row>
        </>
      ) : (
        <div className="text-sm text-gray-500 py-2">공시지가 데이터 없음</div>
      )}
      <div className="pt-2 border-t border-gray-200">
        <div className="text-[11px] text-gray-400 mb-1.5">2차 개발 예정</div>
        <ul className="text-[11px] text-gray-500 space-y-0.5 pl-3 list-disc">
          <li>실거래가 이력 (국토부)</li>
          <li>공매 진행 여부 (캠코)</li>
        </ul>
      </div>
    </div>
  );
}

function LocationTab() {
  return (
    <div className="py-2">
      <div className="text-[11px] text-gray-400 mb-1.5">2·3차 개발 예정</div>
      <ul className="text-[11px] text-gray-500 space-y-0.5 pl-3 list-disc">
        <li>취락지구 포함 여부</li>
        <li>건축물대장 (용도/층수/건축면적)</li>
        <li>주택 밀집도 이격거리 판정</li>
        <li>도로 접근성</li>
      </ul>
    </div>
  );
}

// ───────────────────────────────────────────
// 공용 컴포넌트
// ───────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="text-gray-500 text-xs w-16 shrink-0 mt-0.5">{label}</dt>
      <dd className="flex-1 min-w-0">{children}</dd>
    </div>
  );
}

function ComingSoon() {
  return (
    <div className="text-sm text-gray-500 py-6 text-center">
      2차 개발 예정 기능입니다.
    </div>
  );
}
