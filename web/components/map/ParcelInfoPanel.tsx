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

import { useEffect, useState } from "react";
import type { AddrMeta, KepcoDataRow } from "@/lib/types";
import { hasCapacity } from "@/lib/types";
import type { JibunInfo, ParcelGeometry } from "@/lib/vworld/parcel";
import { formatRelativeKst, formatAbsoluteKst } from "@/lib/dateFormat";
import {
  fetchBuildingsByPnu,
  type BuildingTitleInfo,
} from "@/lib/api/buildings";
import {
  classifyPurpose,
  classifyRoof,
  classifyStructure,
  yearsSince,
  formatBldgYearMonth,
  toPyeong,
  NOTEWORTHY_OLD_YEARS,
  LAND_SOLAR_HINT_BCRAT,
  type PurposeGrade,
  type MaterialGrade,
} from "@/lib/building-hub/classify";
import AddrLine from "./AddrLine";
import { FacilityCard } from "./FacilityCard";

type TabKey = "parcel" | "electric" | "price" | "location" | "regulation";

interface Props {
  jibun: JibunInfo | null;
  geometry: ParcelGeometry | null;
  capa: KepcoDataRow[];
  /** by-jibun 응답의 행정구역 메타 (헤더 표시용, DB 기준). null 이면 jibun fallback. */
  meta: AddrMeta | null;
  /** 사용자가 클릭한 지번 번호 (헤더 표시용, parcel 응답 전에도 즉시 표시). */
  clickedJibun: string;
  matchMode: "exact" | "nearest_jibun" | null;
  nearestJibun: string | null;
  loading: boolean;
  onClose: () => void;
  /** 전기 탭 새로고침 — undefined 면 버튼 숨김 */
  onRefreshCapa?: () => void;
  refreshingCapa?: boolean;
  refreshCapaError?: string | null;
}

const M2_TO_PYEONG = 0.3025;

const TABS: { key: TabKey; label: string }[] = [
  { key: "parcel", label: "필지" },
  { key: "electric", label: "전기" },
  { key: "price", label: "가격" },
  { key: "location", label: "입지" },
  { key: "regulation", label: "규제" },
];

export default function ParcelInfoPanel({
  jibun,
  geometry,
  capa,
  meta,
  clickedJibun,
  matchMode,
  nearestJibun,
  loading,
  onClose,
  onRefreshCapa,
  refreshingCapa,
  refreshCapaError,
}: Props) {
  const [tab, setTab] = useState<TabKey>("electric");

  // 헤더 주소 출처 우선순위:
  //   1. meta (by-jibun, DB) — 가장 빠르고 권위 있음 (행안부 표준)
  //   2. jibun (parcel API, VWorld) — meta 없을 때 fallback (sentinel 케이스 등)
  const headerParts: string[] = meta
    ? ([meta.sep_1, meta.sep_2, meta.sep_3, meta.sep_4, meta.sep_5, clickedJibun].filter(
        Boolean,
      ) as string[])
    : jibun
      ? ([jibun.ctp_nm, jibun.sig_nm, jibun.emd_nm, jibun.li_nm || null, jibun.jibun].filter(
          Boolean,
        ) as string[])
      : [];

  return (
    <div
      className="absolute left-4 right-4 bottom-4 md:left-auto md:right-4 md:bottom-4
                 md:w-[460px] max-w-[calc(100%-32px)] bg-white rounded-xl shadow-2xl
                 border border-gray-200 overflow-hidden z-10 flex flex-col
                 h-[62dvh] md:h-[min(540px,calc(100dvh-120px))] kepco-slide-up"
    >
      {/* 헤더 */}
      <div className="px-3 py-2.5 md:px-4 md:py-3 border-b bg-gray-50 flex items-start justify-between gap-2 flex-shrink-0">
        <div className="flex-1 min-w-0">
          {headerParts.length === 0 ? (
            loading ? (
              <div className="text-sm text-gray-500 py-1">필지 정보 불러오는 중...</div>
            ) : (
              <div className="text-sm text-gray-600 py-1">이 위치에 필지 없음</div>
            )
          ) : (
            <div className="font-semibold text-xs md:text-sm text-gray-900 truncate">
              <AddrLine parts={headerParts} />
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
              clickedJibun={clickedJibun || jibun.jibun}
              onRefresh={onRefreshCapa}
              refreshing={refreshingCapa}
              refreshError={refreshCapaError}
            />
          )}
          {tab === "price" && <PriceTab geometry={geometry} />}
          {tab === "location" && <LocationTab />}
          {tab === "regulation" && <RegulationTab />}
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
  // 탭 활성화 시점에 lazy fetch (1 atomic = 1 외부 호출).
  // 같은 PNU 재방문은 모듈 scope 캐시로 0회.
  const [buildings, setBuildings] = useState<BuildingTitleInfo[]>([]);
  const [bldgLoading, setBldgLoading] = useState(false);
  const [bldgError, setBldgError] = useState<string | null>(null);

  useEffect(() => {
    if (!jibun.pnu) return;
    const controller = new AbortController();
    setBldgLoading(true);
    setBldgError(null);
    setBuildings([]);
    fetchBuildingsByPnu(jibun.pnu, { signal: controller.signal })
      .then((rows) => {
        if (controller.signal.aborted) return;
        setBuildings(rows);
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name === "AbortError") return;
        setBldgError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBldgLoading(false);
      });
    return () => controller.abort();
  }, [jibun.pnu]);

  return (
    <div className="space-y-3">
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

      {/* 건축물대장 — 영업 결정 1차 필터 (공장/창고 vs 주택) */}
      <div className="pt-3 border-t border-gray-100">
        <div className="text-xs font-semibold text-gray-700 mb-2">건축물대장</div>
        {bldgLoading ? (
          <div className="text-xs text-gray-500 py-1">건축물 정보 불러오는 중...</div>
        ) : bldgError ? (
          <div className="text-xs text-red-600 py-1">조회 실패: {bldgError}</div>
        ) : buildings.length === 0 ? (
          <div className="text-xs text-gray-500 py-1">등록된 건축물 없음 (빈 땅)</div>
        ) : (
          <div className="space-y-1.5">
            {buildings.map((b, i) => (
              <BuildingCard key={i} info={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BuildingCard({ info }: { info: BuildingTitleInfo }) {
  const purposeGrade = classifyPurpose(info.mainPurpsCdNm);
  const roofGrade = classifyRoof(info.roofCdNm, info.etcRoof);
  const strctGrade = classifyStructure(info.strctCdNm);
  const years = yearsSince(info.useAprDay);
  const roofLabel = info.etcRoof || info.roofCdNm || "-";
  const hasExtras =
    info.atchBldCnt > 0 ||
    info.oudrAutoUtcnt > 0 ||
    info.hhldCnt > 0 ||
    info.hoCnt > 0;
  const hasSiteInfo = info.platArea != null || info.bcRat != null;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
      {/* TL;DR 헤더 — 용도 배지 + 건물명 + 연식 */}
      <div className="px-3 py-2 bg-gradient-to-r from-gray-50 to-white flex items-center gap-2 flex-wrap border-b border-gray-100">
        {info.mainPurpsCdNm && (
          <PurposeBadge grade={purposeGrade}>{info.mainPurpsCdNm}</PurposeBadge>
        )}
        {info.bldNm && (
          <span className="text-xs font-semibold text-gray-800 truncate">
            {info.bldNm}
          </span>
        )}
        {info.useAprDay && (
          <span className="ml-auto text-[11px] tabular-nums whitespace-nowrap">
            <span className="text-gray-500">
              {formatBldgYearMonth(info.useAprDay)}
            </span>
            {years != null && (
              <span
                className={`ml-1 ${
                  years >= NOTEWORTHY_OLD_YEARS
                    ? "text-red-600 font-semibold"
                    : "text-gray-400"
                }`}
                title={
                  years >= NOTEWORTHY_OLD_YEARS
                    ? "노후 건물 — 옥상 구조 안전성 별도 검토 권장"
                    : undefined
                }
              >
                ({years}년차)
              </span>
            )}
          </span>
        )}
      </div>

      {/* 옥상 태양광 잠재력 — 영업 핵심 */}
      <Section title="옥상 태양광 잠재력" tone="primary">
        {info.archArea != null && (
          <Metric label="건축면적">
            <AreaValue m2={info.archArea} />
          </Metric>
        )}
        <Metric label="지붕">
          <GradedValue grade={roofGrade}>{roofLabel}</GradedValue>
        </Metric>
        <Metric label="구조">
          <GradedValue grade={strctGrade}>{info.strctCdNm ?? "-"}</GradedValue>
        </Metric>
        <Metric label="높이·층수">
          <span className="text-gray-900 tabular-nums">
            {info.heit != null ? `${info.heit}m` : "-"}
            <span className="text-gray-400 mx-1.5">·</span>
            {info.grndFlrCnt}F
            {info.ugrndFlrCnt > 0 && `/B${info.ugrndFlrCnt}`}
          </span>
        </Metric>
      </Section>

      {/* 부지 · 확장 여지 */}
      {hasSiteInfo && (
        <Section title="부지 · 확장 여지" tone="muted">
          {info.platArea != null && (
            <Metric label="대지면적">
              <AreaValue m2={info.platArea} />
            </Metric>
          )}
          {info.bcRat != null && (
            <Metric label="건폐율">
              <span className="text-gray-900 tabular-nums">{info.bcRat}%</span>
              {info.bcRat < 60 && (
                <span className="text-emerald-700 text-[10px] ml-1.5 font-medium">
                  여유 {Math.round(100 - info.bcRat)}%
                </span>
              )}
            </Metric>
          )}
          {info.vlRat != null && info.vlRat !== info.bcRat && (
            <Metric label="용적률">
              <span className="text-gray-900 tabular-nums">{info.vlRat}%</span>
            </Metric>
          )}
          {info.bcRat != null && info.bcRat < LAND_SOLAR_HINT_BCRAT && (
            <div className="text-[10px] text-emerald-700 font-medium mt-1.5 pl-[72px] leading-snug">
              마당 여유 큼 — 노지·캐노피 추가 영업 검토 권장
            </div>
          )}
        </Section>
      )}

      {/* 기타 (있을 때만) */}
      {hasExtras && (
        <Section title="기타" tone="subtle">
          {info.atchBldCnt > 0 && (
            <Metric label="부속건물">
              <span className="text-gray-900 tabular-nums">
                {info.atchBldCnt}동 ({info.atchBldArea.toLocaleString()}㎡)
              </span>
            </Metric>
          )}
          {info.oudrAutoUtcnt > 0 && (
            <Metric label="옥외주차">
              <span className="text-gray-900 tabular-nums">
                {info.oudrAutoUtcnt}대
              </span>
            </Metric>
          )}
          {info.hhldCnt > 0 && (
            <Metric label="세대수">
              <span className="text-gray-900 tabular-nums">{info.hhldCnt}</span>
            </Metric>
          )}
          {info.hoCnt > 0 && (
            <Metric label="호수">
              <span className="text-gray-900 tabular-nums">{info.hoCnt}</span>
            </Metric>
          )}
        </Section>
      )}
    </div>
  );
}

function PurposeBadge({
  grade,
  children,
}: {
  grade: PurposeGrade;
  children: React.ReactNode;
}) {
  const cls =
    grade === "go"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : grade === "skip"
        ? "bg-gray-100 text-gray-600 border-gray-200"
        : "bg-amber-100 text-amber-800 border-amber-200";
  return (
    <span
      className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${cls}`}
    >
      {children}
    </span>
  );
}

function GradedValue({
  grade,
  children,
}: {
  grade: MaterialGrade;
  children: React.ReactNode;
}) {
  const dot =
    grade === "ideal"
      ? "bg-emerald-500"
      : grade === "ok"
        ? "bg-amber-500"
        : grade === "poor"
          ? "bg-red-500"
          : "bg-gray-300";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
      <span className="text-gray-900">{children}</span>
    </span>
  );
}

function AreaValue({ m2 }: { m2: number }) {
  return (
    <span>
      <span className="text-gray-900 tabular-nums">{m2.toLocaleString()}㎡</span>
      <span className="text-gray-400 text-[11px] ml-1 tabular-nums">
        ({toPyeong(m2).toLocaleString()}평)
      </span>
    </span>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "primary" | "muted" | "subtle";
  children: React.ReactNode;
}) {
  const bg =
    tone === "primary"
      ? "bg-blue-50/40"
      : tone === "muted"
        ? "bg-gray-50/60"
        : "bg-white";
  const titleCls =
    tone === "primary"
      ? "text-blue-900"
      : tone === "muted"
        ? "text-gray-700"
        : "text-gray-500";
  return (
    <div className={`px-3 py-2 ${bg} border-t border-gray-100`}>
      <div
        className={`text-[10px] font-bold mb-1.5 tracking-wide ${titleCls}`}
      >
        {title}
      </div>
      <dl className="space-y-1 text-xs">{children}</dl>
    </div>
  );
}

function Metric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-gray-500 w-16 shrink-0">{label}</dt>
      <dd className="flex-1 min-w-0 flex items-center flex-wrap gap-x-1">
        {children}
      </dd>
    </div>
  );
}

function RefreshArrowIcon({
  spinning,
  className,
}: {
  spinning?: boolean;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={`${className ?? ""} ${spinning ? "animate-spin" : ""}`}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m0 0l-3.181-3.183a8.25 8.25 0 0113.803-3.7L19.5 7.5m-15 7.5l4.5-4.5m11.336 1.5a8.25 8.25 0 01-13.803 3.7L4.5 16.5m4.5-4.5h-5"
      />
    </svg>
  );
}

function ElectricTab({
  capa,
  matchMode,
  nearestJibun,
  clickedJibun,
  onRefresh,
  refreshing,
  refreshError,
}: {
  capa: KepcoDataRow[];
  matchMode: "exact" | "nearest_jibun" | null;
  nearestJibun: string | null;
  clickedJibun: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshError?: string | null;
}) {
  if (capa.length === 0) {
    return (
      <div className="py-6 text-center space-y-3">
        <div className="text-sm text-gray-500">
          수집되지 않았거나 KEPCO 미보유 지번일 수 있어요.
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs
                       bg-blue-50 text-blue-700 rounded border border-blue-200
                       hover:bg-blue-100 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshArrowIcon spinning={refreshing} className="w-3 h-3" />
            {refreshing ? "KEPCO 조회 중..." : "KEPCO 에서 지금 확인"}
          </button>
        )}
        {refreshError && (
          <div className="text-[11px] text-red-500">{refreshError}</div>
        )}
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
          className="pt-1.5 text-right text-[10px] text-gray-400 flex items-center justify-end gap-1.5"
          title={absolute || undefined}
        >
          <span>KEPCO 마지막 확인: {relative}</span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="text-gray-500 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title="KEPCO 에서 최신 데이터 가져오기"
              aria-label="새로고침"
            >
              <RefreshArrowIcon spinning={refreshing} className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      {refreshError && (
        <div className="text-[10px] text-red-500 text-right">{refreshError}</div>
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
  // 입지 = 지리적 / 주변 정보 (참고용). 인허가 가능성 자체는 RegulationTab.
  return (
    <div className="py-2">
      <div className="text-[11px] text-gray-400 mb-1.5">2차 개발 예정</div>
      <ul className="text-[11px] text-gray-500 space-y-0.5 pl-3 list-disc">
        <li>취락지구 포함 여부</li>
        <li>주변 도로 거리 (도로 SHP)</li>
        <li>주변 태양광 허가 분포 (경쟁사)</li>
      </ul>
    </div>
  );
}

function RegulationTab() {
  // 규제 = 인허가 가능성 deal-breaker. 3차 핵심 차별화 (이격거리·조례).
  return (
    <div className="py-2">
      <div className="text-[11px] text-gray-400 mb-1.5">3차 개발 예정</div>
      <ul className="text-[11px] text-gray-500 space-y-0.5 pl-3 list-disc">
        <li>주택 5가구 500m 이격 판정</li>
        <li>도로 200m 이격 판정</li>
        <li>시도별 조례 적용 결과</li>
        <li>보호구역 (보전산지/농업진흥지역)</li>
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
