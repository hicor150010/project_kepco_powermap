"use client";

import { useEffect, useState } from "react";
import { CrawlJob, isActiveJob } from "@/lib/crawler";

interface Props {
  thread: number;
  jobs: CrawlJob[];
  onJobCreated: () => Promise<void> | void;
  onError: (msg: string) => void;
}

async function loadAddrList(gbn: string, params: Record<string, string>): Promise<string[]> {
  const sp = new URLSearchParams({ gbn, ...params });
  const res = await fetch(`/api/admin/crawl/regions?${sp}`);
  const data = await res.json();
  return data.ok ? data.list : [];
}

export function CrawlForm({ thread, jobs, onJobCreated, onError }: Props) {
  const [sidoList, setSidoList] = useState<string[]>([]);
  const [siList, setSiList] = useState<string[]>([]);
  const [guList, setGuList] = useState<string[]>([]);
  const [dongList, setDongList] = useState<string[]>([]);
  const [liList, setLiList] = useState<string[]>([]);

  const [selectedSido, setSelectedSido] = useState("");
  const [selectedSi, setSelectedSi] = useState("");
  const [selectedGu, setSelectedGu] = useState("");
  const [selectedDong, setSelectedDong] = useState("");
  const [selectedLi, setSelectedLi] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [selectedMode, setSelectedMode] = useState<"single" | "recurring">("single");
  const [maxCycles, setMaxCycles] = useState<number | undefined>(undefined);

  const [optFlushSize, setOptFlushSize] = useState(100);
  const [optDelay, setOptDelay] = useState(0.5);
  const [optProgressInterval, setOptProgressInterval] = useState(10);
  const [optFetchStep, setOptFetchStep] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const activeInThread = jobs.filter((j) => (j.thread || 1) === thread && isActiveJob(j));

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/crawl/regions?gbn=init");
        const data = await res.json();
        if (data.ok) setSidoList(data.list);
      } catch {
        /* 무시 */
      }
    })();
  }, []);

  const onSidoChange = async (sido: string) => {
    setSelectedSido(sido);
    setSelectedSi("");
    setSelectedGu("");
    setSelectedDong("");
    setSelectedLi("");
    setSiList([]);
    setGuList([]);
    setDongList([]);
    setLiList([]);
    if (sido) setSiList(await loadAddrList("0", { addr_do: sido }));
  };

  const onSiChange = async (si: string) => {
    setSelectedSi(si);
    setSelectedGu("");
    setSelectedDong("");
    setSelectedLi("");
    setGuList([]);
    setDongList([]);
    setLiList([]);
    if (si) setGuList(await loadAddrList("1", { addr_do: selectedSido, addr_si: si }));
  };

  const onGuChange = async (gu: string) => {
    setSelectedGu(gu);
    setSelectedDong("");
    setSelectedLi("");
    setDongList([]);
    setLiList([]);
    if (gu) setDongList(await loadAddrList("2", { addr_do: selectedSido, addr_si: selectedSi, addr_gu: gu }));
  };

  const onDongChange = async (dong: string) => {
    setSelectedDong(dong);
    setSelectedLi("");
    setLiList([]);
    if (dong) setLiList(await loadAddrList("3", { addr_do: selectedSido, addr_si: selectedSi, addr_gu: selectedGu, addr_lidong: dong }));
  };

  const handleStart = async () => {
    if (!selectedSido) {
      onError("시/도를 선택해주세요.");
      return;
    }
    setSubmitting(true);
    onError("");

    try {
      const res = await fetch("/api/admin/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sido: selectedSido,
          si: selectedSi || undefined,
          gu: selectedGu || undefined,
          dong: selectedDong || undefined,
          li: selectedLi || undefined,
          thread,
          mode: selectedMode,
          max_cycles: maxCycles || undefined,
          options: {
            flush_size: optFlushSize,
            delay: optDelay,
            progress_interval: optProgressInterval,
            fetch_step_data: optFetchStep,
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        onError(data.error || "작업 생성 실패");
      } else {
        if (data.warning) onError(data.warning);
        await onJobCreated();
        setSelectedSido("");
        setSelectedSi("");
        setSelectedGu("");
        setSelectedDong("");
        setSelectedLi("");
        setSiList([]);
        setGuList([]);
        setDongList([]);
        setLiList([]);
        setShowOptions(false);
      }
    } catch {
      onError("네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl rounded-tr-xl p-6 shadow-sm space-y-5">
      {/* 1. 모드 */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2">모드</label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedMode("single")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              selectedMode === "single"
                ? "bg-green-600 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            1회 수집
          </button>
          <button
            onClick={() => setSelectedMode("recurring")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              selectedMode === "recurring"
                ? "bg-orange-500 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            반복 수집
          </button>
          {selectedMode === "recurring" && (
            <div className="flex items-center gap-1 ml-2">
              <input
                type="number"
                value={maxCycles ?? ""}
                onChange={(e) => setMaxCycles(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="무제한"
                min={1}
                className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 font-medium focus:border-orange-400 focus:outline-none"
              />
              <span className="text-xs text-gray-500">회 순환</span>
            </div>
          )}
        </div>
        {selectedMode === "recurring" && (
          <div className="mt-2 text-xs text-orange-700 bg-orange-50 rounded px-3 py-2 border border-orange-200">
            선택한 지역을 5시간 단위로 자동 재시작하며 무한 반복 수집합니다. 수동으로 중단하지 않으면 계속됩니다.
          </div>
        )}
      </div>

      {/* 2. 지역 선택 */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2">지역 선택</label>
        <div className="grid grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">시/도</label>
            <select
              value={selectedSido}
              onChange={(e) => onSidoChange(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">선택</option>
              {sidoList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">시</label>
            <select
              value={selectedSi}
              onChange={(e) => onSiChange(e.target.value)}
              disabled={!siList.length}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">(전체)</option>
              {siList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">구/군</label>
            <select
              value={selectedGu}
              onChange={(e) => onGuChange(e.target.value)}
              disabled={!guList.length}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">(전체)</option>
              {guList.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">동/면</label>
            <select
              value={selectedDong}
              onChange={(e) => onDongChange(e.target.value)}
              disabled={!dongList.length}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">(전체)</option>
              {dongList.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">리</label>
            <select
              value={selectedLi}
              onChange={(e) => setSelectedLi(e.target.value)}
              disabled={!liList.length}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">(전체)</option>
              {liList.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* 3. 상세 설정 (개발 환경 전용) */}
      {process.env.NODE_ENV === "development" && (
        <div>
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <span>{showOptions ? "▼" : "▶"}</span>
            상세 설정 <span className="text-[10px] text-gray-400 ml-1">(개발 전용)</span>
          </button>

          {showOptions && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                    <th className="text-left py-2 font-medium w-1/4">항목</th>
                    <th className="text-left py-2 font-medium w-1/4">설정값</th>
                    <th className="text-left py-2 font-medium">설명</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  <tr className="border-b border-gray-100">
                    <td className="py-3 font-semibold text-gray-700">API 호출 간격</td>
                    <td className="py-3">
                      <select
                        value={optDelay}
                        onChange={(e) => setOptDelay(Number(e.target.value))}
                        className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                      >
                        <option value={0.5}>0.5초 (기본)</option>
                        <option value={1.0}>1.0초</option>
                        <option value={2.0}>2.0초</option>
                      </select>
                    </td>
                    <td className="py-3 text-gray-500">KEPCO에 요청 보내는 간격. 짧으면 빠르지만 차단 위험.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 font-semibold text-gray-700">배치 크기</td>
                    <td className="py-3">
                      <input
                        type="number"
                        value={optFlushSize}
                        onChange={(e) => setOptFlushSize(Number(e.target.value) || 100)}
                        min={10} max={1000} step={10}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                      /> 건
                    </td>
                    <td className="py-3 text-gray-500">이만큼 모이면 DB 저장 + 좌표 변환 + 체크포인트 + 변화 감지 (지도 반영은 1시간 간격)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 font-semibold text-gray-700">화면 갱신 주기</td>
                    <td className="py-3">
                      <input
                        type="number"
                        value={optProgressInterval}
                        onChange={(e) => setOptProgressInterval(Number(e.target.value) || 10)}
                        min={1} max={100} step={1}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                      /> 건
                    </td>
                    <td className="py-3 text-gray-500">이만큼 조회할 때마다 진행 상황 갱신 + 중단 요청 확인 (~{Math.round(optProgressInterval * optDelay)}초 간격)</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-semibold text-gray-700">STEP 데이터</td>
                    <td className="py-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={optFetchStep}
                          onChange={(e) => setOptFetchStep(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-700">{optFetchStep ? "사용" : "미사용"}</span>
                      </label>
                    </td>
                    <td className="py-3 text-gray-500">접속예정 건수/용량(STEP 01/02/03) 추가 조회. 속도 절반으로 느려짐.</td>
                  </tr>
                </tbody>
              </table>

              <div className="space-y-2">
                <div className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 border border-amber-200">
                  이 설정은 수집을 시작할 때 적용됩니다.
                  실행 중에는 변경할 수 없으며, 중단 후 다시 시작하면 새 설정이 적용됩니다.
                </div>
                <div className="text-xs text-blue-700 bg-blue-50 rounded px-3 py-2 border border-blue-200">
                  <b>변화 감지:</b> 수집 시 기준 스냅샷(ref)과 비교하여 변전소/주변압기/배전선로의 여유 상태가 달라진 건을 자동으로 이력에 기록합니다.
                  기록된 이력은 지도의 &quot;변화추적&quot; 기능에서 확인할 수 있습니다.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. 수집 시작 */}
      <div className="pt-2 border-t border-gray-100 flex items-center gap-3">
        <button
          onClick={handleStart}
          disabled={!selectedSido || submitting || activeInThread.length > 0}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "시작 중..." : "수집 시작"}
        </button>
        {activeInThread.length > 0 ? (
          <span className="text-sm text-amber-600">
            수집기 {thread}에 이미 실행 중인 작업이 있습니다. 다른 수집기를 선택하거나 기존 작업을 중단해주세요.
          </span>
        ) : selectedSido ? (
          <span className="text-sm text-gray-600">
            대상:{" "}
            {[
              selectedSido,
              selectedSi || "(전체)",
              selectedGu || "(전체)",
              selectedDong || "(전체)",
              selectedLi || "(전체)",
            ].join(" > ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
