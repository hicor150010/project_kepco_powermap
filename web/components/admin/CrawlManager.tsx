"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CrawlJob,
  THREADS,
  isActiveJob,
  isHistoryJob,
} from "@/lib/crawler";
import { CrawlForm } from "./CrawlForm";
import { ActiveJobCard } from "./ActiveJobCard";
import { HistoryList } from "./HistoryList";

export default function CrawlManager() {
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedThread, setSelectedThread] = useState<number>(THREADS[0]);
  const [mountedTabs, setMountedTabs] = useState<Set<number>>(new Set([THREADS[0]]));
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 탭별 state(폼 입력값, 이력 페이지/펼침) 보존을 위해 한 번 방문한 탭은 mount 유지.
  const onTabClick = (t: number) => {
    setSelectedThread(t);
    setMountedTabs((prev) => (prev.has(t) ? prev : new Set([...prev, t])));
  };

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
      /* 폴링 실패 무시 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const hasActiveJobs = jobs.some(isActiveJob);

  useEffect(() => {
    if (!hasActiveJobs) return;
    const id = setInterval(fetchJobs, 5000);
    return () => clearInterval(id);
  }, [hasActiveJobs, fetchJobs]);

  const handleStop = async (jobId: number) => {
    if (!confirm("데이터 수집을 중단하시겠습니까? 현재 진행 위치는 저장되며 나중에 이어서 수집할 수 있습니다.")) return;
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
          thread: job.thread || 1,
          mode: job.mode || "single",
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

  const handleDelete = async (jobId: number) => {
    if (!confirm("이 작업 기록을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/crawl?id=${jobId}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) setError(data.error);
      else await fetchJobs();
    } catch {
      setError("네트워크 오류");
    }
  };

  const activeJobs = jobs.filter(isActiveJob);
  const activeInThread = activeJobs.filter((j) => (j.thread || 1) === selectedThread);

  return (
    <div className="space-y-6 min-w-0">
      {hasActiveJobs && (
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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-500 hover:text-red-700">
            닫기
          </button>
        </div>
      )}

      {/* 새 크롤링 — 탭 + 폼 */}
      <div>
        <h3 className="text-base font-bold text-gray-900 mb-3">새 수집 시작</h3>

        <div className="flex items-end gap-1 border-b border-gray-200">
          {THREADS.map((t) => {
            const threadActive = activeJobs.find((j) => (j.thread || 1) === t);
            const isActive = selectedThread === t;
            return (
              <button
                key={t}
                onClick={() => onTabClick(t)}
                className={`px-4 py-2 text-sm font-bold rounded-t-md border border-b-0 -mb-px transition-colors ${
                  isActive
                    ? "bg-white text-blue-600 border-gray-200"
                    : "bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100"
                }`}
              >
                수집기 {t}
                {threadActive && (
                  <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    threadActive.status === "running" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {threadActive.status === "running" ? "실행중" : "대기"}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {THREADS.map((t) =>
          mountedTabs.has(t) ? (
            <div key={t} hidden={t !== selectedThread}>
              <CrawlForm
                thread={t}
                jobs={jobs}
                onJobCreated={fetchJobs}
                onError={setError}
              />
            </div>
          ) : null
        )}
      </div>

      {/* 실행 중 */}
      {activeInThread.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-bold text-gray-900">수집기 {selectedThread} 실행 중</h3>
          {activeInThread.map((job) => (
            <ActiveJobCard
              key={job.id}
              job={job}
              onStop={handleStop}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* 작업 이력 — 탭별 페이지/펼침 state 보존을 위해 한 번 mount 한 탭은 유지 */}
      {THREADS.map((t) =>
        mountedTabs.has(t) ? (
          <div key={t} hidden={t !== selectedThread}>
            <HistoryList
              thread={t}
              historyJobs={jobs.filter(
                (j) => isHistoryJob(j) && (j.thread || 1) === t
              )}
              allJobs={jobs}
              loading={loading}
              submitting={submitting}
              onResume={handleResume}
              onDelete={handleDelete}
            />
          </div>
        ) : null
      )}
    </div>
  );
}
