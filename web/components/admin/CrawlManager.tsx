"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── 타입 ──

interface CrawlJob {
  id: number;
  sido: string;
  si: string | null;
  gu: string | null;
  dong: string | null;
  li: string | null;
  status: string;
  progress: {
    processed?: number;
    found?: number;
    errors?: number;
    current_address?: string;
    phase?: string;
  };
  checkpoint: Record<string, unknown> | null;
  options: Record<string, unknown>;
  github_run_id: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// ── 상수 ──

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  pending: { text: "대기 중", color: "bg-yellow-100 text-yellow-800" },
  running: { text: "실행 중", color: "bg-blue-100 text-blue-800" },
  completed: { text: "완료", color: "bg-green-100 text-green-800" },
  failed: { text: "실패", color: "bg-red-100 text-red-800" },
  stopped: { text: "중단됨", color: "bg-gray-100 text-gray-800" },
  stop_requested: { text: "중단 요청", color: "bg-orange-100 text-orange-800" },
};

// ── 메인 컴포넌트 ──

export default function CrawlManager() {
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 새 크롤링 폼
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

  // 수집 옵션
  const [optFlushSize, setOptFlushSize] = useState(100);
  const [optDelay, setOptDelay] = useState(0.5);
  const [optFetchStep, setOptFetchStep] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── 작업 목록 조회 ──

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/crawl");
      const data = await res.json();
      if (data.ok) {
        setJobs(data.jobs);
        setError("");
        setLastUpdated(new Date());
      }
    } catch {
      /* 폴링 중 실패는 무시 */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchJobs();
  };

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // running job이 있으면 5초 폴링
  const hasActiveJobs = jobs.some(
    (j) => j.status === "running" || j.status === "pending" || j.status === "stop_requested"
  );

  useEffect(() => {
    if (!hasActiveJobs) return;

    const id = setInterval(fetchJobs, 5000);
    return () => clearInterval(id);
  }, [hasActiveJobs, fetchJobs]);

  // ── 시/도 목록 로드 ──

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

  // ── 주소 계층 로드 ──

  async function loadAddrList(
    gbn: string,
    params: Record<string, string>
  ): Promise<string[]> {
    const sp = new URLSearchParams({ gbn, ...params });
    const res = await fetch(`/api/admin/crawl/regions?${sp}`);
    const data = await res.json();
    return data.ok ? data.list : [];
  }

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
    if (sido) {
      const list = await loadAddrList("0", { addr_do: sido });
      setSiList(list);
    }
  };

  const onSiChange = async (si: string) => {
    setSelectedSi(si);
    setSelectedGu("");
    setSelectedDong("");
    setSelectedLi("");
    setGuList([]);
    setDongList([]);
    setLiList([]);
    if (si) {
      const list = await loadAddrList("1", {
        addr_do: selectedSido,
        addr_si: si,
      });
      setGuList(list);
    }
  };

  const onGuChange = async (gu: string) => {
    setSelectedGu(gu);
    setSelectedDong("");
    setSelectedLi("");
    setDongList([]);
    setLiList([]);
    if (gu) {
      const list = await loadAddrList("2", {
        addr_do: selectedSido,
        addr_si: selectedSi,
        addr_gu: gu,
      });
      setDongList(list);
    }
  };

  const onDongChange = async (dong: string) => {
    setSelectedDong(dong);
    setSelectedLi("");
    setLiList([]);
    if (dong) {
      const list = await loadAddrList("3", {
        addr_do: selectedSido,
        addr_si: selectedSi,
        addr_gu: selectedGu,
        addr_lidong: dong,
      });
      setLiList(list);
    }
  };

  // ── 크롤링 시작 ──

  const handleStart = async () => {
    if (!selectedSido) {
      setError("시/도를 선택해주세요.");
      return;
    }
    setSubmitting(true);
    setError("");

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
          options: {
            flush_size: optFlushSize,
            delay: optDelay,
            fetch_step_data: optFetchStep,
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "작업 생성 실패");
      } else {
        if (data.warning) setError(data.warning);
        await fetchJobs();
        // 폼 초기화
        setSelectedSido("");
        setSelectedSi("");
        setSelectedGu("");
        setSelectedDong("");
        setSelectedLi("");
        setSiList([]);
        setGuList([]);
        setDongList([]);
        setLiList([]);
      }
    } catch {
      setError("네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  // ── 중단 요청 ──

  const handleStop = async (jobId: number) => {
    if (!confirm("데이터 수집을 중단하시겠습니까? 현재 진행 위치는 저장되며 나중에 이어서 수집할 수 있습니다."))
      return;

    try {
      const res = await fetch("/api/admin/crawl", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error);
      else await fetchJobs();
    } catch {
      setError("네트워크 오류");
    }
  };

  // ── 이어서 추출 ──

  const handleResume = async (job: CrawlJob) => {
    if (!job.checkpoint) {
      setError("체크포인트가 없습니다.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/admin/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sido: job.sido,
          si: job.si,
          gu: job.gu,
          dong: job.dong,
          li: job.li,
          options: job.options,
          checkpoint: job.checkpoint,
        }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error || "재개 실패");
      else await fetchJobs();
    } catch {
      setError("네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  // ── 삭제 ──

  const handleDelete = async (jobId: number) => {
    if (!confirm("이 작업 기록을 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`/api/admin/crawl?id=${jobId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.ok) setError(data.error);
      else await fetchJobs();
    } catch {
      setError("네트워크 오류");
    }
  };

  // ── 유틸 ──

  function formatScope(job: CrawlJob): string {
    return [
      job.sido,
      job.si || "(전체)",
      job.gu || "(전체)",
      job.dong || "(전체)",
      job.li || "(전체)",
    ].join(" > ");
  }

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "방금 전";
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  }

  // ── 렌더링 ──

  const activeJobs = jobs.filter(
    (j) =>
      j.status === "running" ||
      j.status === "pending" ||
      j.status === "stop_requested"
  );
  const historyJobs = jobs.filter(
    (j) =>
      j.status === "completed" ||
      j.status === "failed" ||
      j.status === "stopped"
  );

  const isPolling = hasActiveJobs;

  return (
    <div className="space-y-6">
      {/* 상태 바 */}
      {isPolling && (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            자동 갱신 중
          </span>
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              {lastUpdated.toLocaleTimeString("ko-KR")} 기준
            </span>
          )}
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
          <button
            onClick={() => setError("")}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            닫기
          </button>
        </div>
      )}

      {/* ── 새 크롤링 ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-base font-bold text-gray-900 mb-4">
          새 수집 시작
        </h3>

        <div className="grid grid-cols-5 gap-3">
          {/* 시/도 */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">시/도</label>
            <select
              value={selectedSido}
              onChange={(e) => onSidoChange(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">선택</option>
            {sidoList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          </div>

          {/* 시 */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">시</label>
            <select
              value={selectedSi}
              onChange={(e) => onSiChange(e.target.value)}
              disabled={!siList.length}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">(전체)</option>
              {siList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* 구/군 */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">구/군</label>
            <select
              value={selectedGu}
              onChange={(e) => onGuChange(e.target.value)}
              disabled={!guList.length}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">(전체)</option>
              {guList.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* 동/면 */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">동/면</label>
            <select
              value={selectedDong}
              onChange={(e) => onDongChange(e.target.value)}
              disabled={!dongList.length}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">(전체)</option>
              {dongList.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* 리 */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">리</label>
            <select
              value={selectedLi}
              onChange={(e) => setSelectedLi(e.target.value)}
              disabled={!liList.length}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">(전체)</option>
              {liList.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 옵션 토글 */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <span>{showOptions ? "▼" : "▶"}</span>
            상세 설정
          </button>

          {showOptions && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
              {/* 배치 크기 */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  배치 크기 (flush_size)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={optFlushSize}
                    onChange={(e) => setOptFlushSize(Number(e.target.value) || 100)}
                    min={10}
                    max={1000}
                    step={10}
                    className="w-24 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-xs text-gray-500">
                    이 숫자만큼 데이터가 모이면 한꺼번에 DB에 저장합니다.
                    저장할 때 지도에도 반영됩니다. (기본: 100건)
                  </span>
                </div>
              </div>

              {/* API 호출 간격 */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  API 호출 간격 (delay)
                </label>
                <div className="flex items-center gap-3">
                  <select
                    value={optDelay}
                    onChange={(e) => setOptDelay(Number(e.target.value))}
                    className="w-24 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                  >
                    <option value={0.2}>0.2초</option>
                    <option value={0.3}>0.3초</option>
                    <option value={0.5}>0.5초</option>
                    <option value={1.0}>1.0초</option>
                    <option value={2.0}>2.0초</option>
                  </select>
                  <span className="text-xs text-gray-500">
                    KEPCO 서버에 요청을 보내는 간격입니다.
                    짧을수록 빠르지만 차단 위험이 있습니다. (기본: 0.5초)
                  </span>
                </div>
              </div>

              {/* STEP 데이터 */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={optFetchStep}
                    onChange={(e) => setOptFetchStep(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-semibold text-gray-700">
                    STEP 데이터 포함 (접속예정 건수/용량)
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  각 배전선로의 접속예정 건수와 용량(STEP 01/02/03)을 추가로 조회합니다.
                  활성화하면 번지당 API를 1회 더 호출하므로 수집 속도가 절반으로 느려집니다.
                </p>
              </div>

              {/* 안내 */}
              <div className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 border border-amber-200">
                이 설정은 수집을 시작할 때 적용됩니다.
                실행 중에는 변경할 수 없으며, 중단 후 다시 시작하면 새 설정이 적용됩니다.
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleStart}
            disabled={!selectedSido || submitting}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "시작 중..." : "수집 시작"}
          </button>
          {selectedSido && (
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
          )}
        </div>
      </div>

      {/* ── 실행 중인 작업 ── */}
      {activeJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-bold text-gray-900">실행 중</h3>
          {activeJobs.map((job) => (
            <div
              key={job.id}
              className="bg-white rounded-xl border-2 border-blue-300 p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <StatusBadge status={job.status} />
                  <span className="text-base font-semibold text-gray-900">
                    {formatScope(job)}
                  </span>
                  <span className="text-sm text-gray-400">
                    Job #{job.id}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {job.status === "running" && (
                    <button
                      onClick={() => handleStop(job.id)}
                      className="text-sm text-red-600 hover:text-red-800 border border-red-300 hover:bg-red-50 px-4 py-2 rounded-md font-medium transition-colors"
                    >
                      중단
                    </button>
                  )}
                  {job.status === "pending" && (
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="text-sm text-gray-500 hover:text-red-600 border border-gray-300 hover:border-red-300 hover:bg-red-50 px-4 py-2 rounded-md font-medium transition-colors"
                    >
                      취소
                    </button>
                  )}
                </div>
              </div>

              {/* 진행률 */}
              {job.progress.processed != null && (
                <div className="space-y-3">
                  {/* 통계 카드 */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-blue-50 rounded-lg px-4 py-3 text-center">
                      <div className="text-xl font-bold text-blue-700">
                        {job.progress.processed?.toLocaleString()}
                      </div>
                      <div className="text-xs text-blue-600 mt-0.5">조회한 주소</div>
                    </div>
                    <div className="bg-green-50 rounded-lg px-4 py-3 text-center">
                      <div className="text-xl font-bold text-green-700">
                        {job.progress.found?.toLocaleString()}
                      </div>
                      <div className="text-xs text-green-600 mt-0.5">수집한 데이터</div>
                    </div>
                    <div className={`rounded-lg px-4 py-3 text-center ${(job.progress.errors || 0) > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                      <div className={`text-xl font-bold ${(job.progress.errors || 0) > 0 ? "text-red-700" : "text-gray-400"}`}>
                        {job.progress.errors || 0}
                      </div>
                      <div className={`text-xs mt-0.5 ${(job.progress.errors || 0) > 0 ? "text-red-600" : "text-gray-400"}`}>오류</div>
                    </div>
                  </div>

                  {/* 현재 위치 */}
                  <div className="bg-gray-50 rounded-lg px-4 py-3">
                    {job.progress.current_address && (
                      <div className="text-sm text-gray-700">
                        현재: <span className="font-medium">{job.progress.current_address}</span>
                      </div>
                    )}
                    {job.progress.phase && (
                      <div className="text-sm text-blue-600 font-medium mt-1">
                        {job.progress.phase}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    {job.started_at && (
                      <div className="text-sm text-gray-500">
                        {relativeTime(job.started_at)} 시작
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>배치: {(job.options as any)?.flush_size || 100}건</span>
                      <span>간격: {(job.options as any)?.delay || 0.5}초</span>
                      {(job.options as any)?.fetch_step_data && <span>STEP 포함</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 작업 이력 ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">작업 이력</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">
            로딩 중...
          </div>
        ) : historyJobs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            완료된 작업이 없습니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs">
                <th className="text-left px-4 py-2 font-medium">ID</th>
                <th className="text-left px-4 py-2 font-medium">지역</th>
                <th className="text-left px-4 py-2 font-medium">상태</th>
                <th className="text-right px-4 py-2 font-medium">결과</th>
                <th className="text-right px-4 py-2 font-medium">시간</th>
                <th className="text-right px-4 py-2 font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {historyJobs.map((job, idx) => (
                <tr
                  key={job.id}
                  className={idx % 2 === 1 ? "bg-gray-50/40" : ""}
                >
                  <td className="px-4 py-2.5 text-gray-500">#{job.id}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {formatScope(job)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-600">
                    {job.progress.found != null
                      ? `${job.progress.found.toLocaleString()}건`
                      : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500 text-xs">
                    {job.completed_at
                      ? relativeTime(job.completed_at)
                      : job.created_at
                        ? relativeTime(job.created_at)
                        : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {job.status === "stopped" && job.checkpoint && (
                        <button
                          onClick={() => handleResume(job)}
                          disabled={submitting}
                          className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                        >
                          이어서 추출
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(job.id)}
                        className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── 상태 뱃지 ──

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_LABELS[status] || {
    text: status,
    color: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${info.color}`}
    >
      {info.text}
    </span>
  );
}
