"use client";

/**
 * 화면 하단 검색 패널.
 *
 * 책임 범위:
 *   - 검색 입력바 (항상 표시) + 결과 패널 토글
 *   - /api/search 호출 + 응답 상태 관리
 *   - 리/지번 탭 전환
 *   - 결과 클릭 → 부모(MapClient)로 위임
 *
 * 결과 행 자체의 렌더링은 SearchResultList가 담당.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import SearchResultList, { type SearchPick } from "./SearchResultList";
import type { KepcoDataRow } from "@/lib/types";
import type { SearchRiResult } from "@/lib/search/searchKepco";

interface Props {
  /** 결과 행 클릭 시 호출 — MapClient가 지도 이동/모달 열기 처리 */
  onPick: (pick: SearchPick) => void;
  /** 지번 위치 핀 표시 */
  onJibunPin?: (row: KepcoDataRow) => void;
  /** 검색바 포커스 시 호출 — 요약 카드 등 숨기기 */
  onFocus?: () => void;
}

interface SearchState {
  loading: boolean;
  error: string | null;
  ri: SearchRiResult[];
  ji: KepcoDataRow[];
  jiFallback: boolean;
  parsed: { keywords: string[]; lotNo: number | null } | null;
}

const EMPTY_STATE: SearchState = {
  loading: false,
  error: null,
  ri: [],
  ji: [],
  jiFallback: false,
  parsed: null,
};

// 결과 패널 높이(px) — 사용자가 드래그로 조절. 최소/최대/기본값.
const PANEL_MIN = 140;
const PANEL_MAX_RATIO = 0.85; // 화면 높이의 85%
const PANEL_DEFAULT = 240;

/**
 * 탭 버튼 — 카운트가 0보다 크면 파란색 pill로 강조.
 * 결과가 있는 탭이 한눈에 보이게 하는 게 목적.
 */
function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
        active
          ? "border-blue-500 text-blue-600"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      <span>{label}</span>
      <span
        className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-bold tabular-nums ${
          count > 0
            ? active
              ? "bg-blue-500 text-white"
              : "bg-blue-100 text-blue-700"
            : "bg-gray-200 text-gray-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

const HISTORY_KEY = "kepco_search_history";
const HISTORY_MAX = 10;

function getHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addHistory(q: string) {
  const list = getHistory().filter((h) => h !== q);
  list.unshift(q);
  if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

function removeHistory(q: string) {
  const list = getHistory().filter((h) => h !== q);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

export default function SearchPanel({ onPick, onJibunPin, onFocus }: Props) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>(EMPTY_STATE);
  const [tab, setTab] = useState<"ri" | "ji">("ri");
  const [open, setOpen] = useState(false); // 결과 패널 펼침 여부
  const [panelHeight, setPanelHeight] = useState(PANEL_DEFAULT);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // 드래그 상태 — ref로 관리해서 mousemove 리스너에서 closure 꼬임 방지
  const draggingRef = useRef(false);

  // ─────────────────────────────────────────────
  // 드래그로 패널 높이 조절
  //   - 핸들 mousedown → 글로벌 mousemove/mouseup 등록
  //   - cursor.y 위치를 화면 하단 기준 거리(px)로 변환해 패널 높이로 사용
  //   - 검색바 높이(약 40px)는 빼서 결과 영역만 고려
  // ─────────────────────────────────────────────
  useEffect(() => {
    const calcHeight = (clientY: number) => {
      const winH = window.innerHeight;
      const SEARCH_BAR_H = 40;
      const next = winH - clientY - SEARCH_BAR_H;
      const max = winH * PANEL_MAX_RATIO;
      setPanelHeight(Math.min(Math.max(next, PANEL_MIN), max));
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      calcHeight(e.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!draggingRef.current) return;
      calcHeight(e.touches[0].clientY);
    };
    const onEnd = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
  };

  // ─────────────────────────────────────────────
  // 검색 실행 (Enter 또는 [검색] 버튼)
  // ─────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!q) return;

    addHistory(q);
    setHistory(getHistory());
    setHistoryOpen(false);
    setState({ ...EMPTY_STATE, loading: true });
    setOpen(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        throw new Error("검색이 잘 안 돼요. 잠시 후 다시 시도해 주세요.");
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "검색이 잘 안 돼요.");

      setState({
        loading: false,
        error: null,
        ri: data.ri ?? [],
        ji: data.ji ?? [],
        jiFallback: data.jiFallback ?? false,
        parsed: data.parsed ?? null,
      });

      if (data.parsed?.lotNo != null) {
        setTab("ji");
      } else {
        setTab("ri");
      }
    } catch (err: any) {
      setState({ ...EMPTY_STATE, error: String(err?.message || err) });
    }
  }, []);

  const runSearch = useCallback(() => {
    doSearch(query.trim());
  }, [query, doSearch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") runSearch();
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleClear = () => {
    setQuery("");
    setState(EMPTY_STATE);
    setOpen(false);
  };

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────
  const totalRi = state.ri.length;
  const totalJi = state.ji.length;
  const fallbackBanner =
    state.jiFallback && state.parsed?.lotNo != null && totalJi > 0;

  return (
    <div className="absolute left-0 right-0 bottom-0 z-10 pointer-events-none">
      {/* 결과 패널 (검색 후 펼쳐짐) */}
      {open && (
        <div className="pointer-events-auto bg-white border-t border-gray-200 shadow-2xl">
          {/* 드래그 핸들 — 위/아래로 끌어 패널 높이 조절 */}
          <div
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            className="h-3 md:h-2 cursor-ns-resize bg-gray-100 hover:bg-blue-100 flex items-center justify-center group touch-none"
            title="드래그로 높이 조절"
          >
            <div className="w-10 h-1 rounded-full bg-gray-300 group-hover:bg-blue-400" />
          </div>

          {/* 헤더: 탭 + 닫기 */}
          <div className="flex items-center justify-between border-b border-gray-100 px-2">
            <div className="flex">
              <TabButton
                label="리 단위"
                count={totalRi}
                active={tab === "ri"}
                onClick={() => setTab("ri")}
              />
              <TabButton
                label="지번 단위"
                count={totalJi}
                active={tab === "ji"}
                onClick={() => setTab("ji")}
              />
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-lg px-2"
              title="결과 닫기"
            >
              ✕
            </button>
          </div>

          {/* 폴백 안내 배너 */}
          {tab === "ji" && fallbackBanner && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-[11px] text-amber-800">
              💡 입력하신 <b>{state.parsed!.lotNo}번지</b>가 데이터에 없어,
              가장 가까운 지번을 보여드려요.
            </div>
          )}

          {/* 결과 목록 — 사용자가 드래그로 조절한 높이 적용 */}
          <div
            className="overflow-y-auto"
            style={{ height: panelHeight }}
          >
            {state.loading && (
              <div className="px-4 py-8 text-center text-xs text-gray-500">
                검색 중...
              </div>
            )}
            {state.error && (
              <div className="px-6 py-10 text-center">
                <div className="text-3xl mb-2">⚠️</div>
                <div className="text-xs font-medium text-red-700">
                  {state.error}
                </div>
              </div>
            )}
            {!state.loading && !state.error && (
              <SearchResultList
                mode={tab}
                ri={state.ri}
                ji={state.ji}
                onPick={(pick) => {
                  onPick(pick);
                  setOpen(false);
                }}
                onJibunPin={onJibunPin}
              />
            )}
          </div>
        </div>
      )}

      {/* 검색 입력 바 (항상 표시) */}
      <div className="pointer-events-auto mx-2 mb-2 md:mx-3 md:mb-3 pb-[env(safe-area-inset-bottom)] relative">
        <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-xl px-4 py-2.5 flex items-center gap-2.5 shadow-lg">
          <span className="text-base text-gray-400">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              const h = getHistory();
              setHistory(h);
              if (h.length > 0 && !open) setHistoryOpen(true);
              onFocus?.();
            }}
            onBlur={() => {
              // 약간 지연 — 히스토리 항목 클릭이 먼저 처리되도록
              setTimeout(() => setHistoryOpen(false), 150);
            }}
            placeholder="주소·지번 검색 (예: 용구리 100)"
            className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="text-gray-300 hover:text-gray-500 text-sm"
              title="지우기"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={runSearch}
            disabled={!query.trim() || state.loading}
            className="text-sm px-4 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600
                       disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            검색
          </button>
        </div>

        {/* 검색 히스토리 드롭다운 */}
        {historyOpen && history.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20">
            <div className="px-3 py-1.5 text-[10px] text-gray-400 font-semibold border-b border-gray-100">
              최근 검색
            </div>
            {history.map((h) => (
              <div
                key={h}
                className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer group"
              >
                <span className="text-gray-300 text-xs">🕐</span>
                <button
                  type="button"
                  className="flex-1 text-left text-sm text-gray-700 truncate"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setQuery(h);
                    doSearch(h);
                  }}
                >
                  {h}
                </button>
                <button
                  type="button"
                  className="text-gray-300 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    removeHistory(h);
                    setHistory(getHistory());
                  }}
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
