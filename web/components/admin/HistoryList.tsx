"use client";

import { useState } from "react";
import {
  CrawlJob,
  HISTORY_PAGE_SIZE,
  formatScope,
  relativeTime,
} from "@/lib/crawler";
import { CrawlStatusBadge } from "./CrawlStatusBadge";
import { HistoryDetailPanel } from "./HistoryDetailPanel";

interface Props {
  thread: number;
  historyJobs: CrawlJob[];
  allJobs: CrawlJob[];
  loading: boolean;
  submitting: boolean;
  onResume: (job: CrawlJob) => void;
  onDelete: (jobId: number) => void;
}

export function HistoryList({
  thread,
  historyJobs,
  allJobs,
  loading,
  submitting,
  onResume,
  onDelete,
}: Props) {
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [historyPage, setHistoryPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(historyJobs.length / HISTORY_PAGE_SIZE));
  const effectivePage = Math.min(historyPage, totalPages - 1);
  const start = effectivePage * HISTORY_PAGE_SIZE;
  const pagedJobs = historyJobs.slice(start, start + HISTORY_PAGE_SIZE);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-base font-bold text-gray-900">수집기 {thread} 작업 이력</h3>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-gray-400">로딩 중...</div>
      ) : historyJobs.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">완료된 작업이 없습니다.</div>
      ) : (
        <div>
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 text-xs text-gray-500 font-medium border-b border-gray-100">
            <span className="flex-shrink-0" style={{ width: 16 }}></span>
            <span className="flex-shrink-0" style={{ width: 36 }}>ID</span>
            <span className="flex-1 min-w-0">지역</span>
            <span className="flex-shrink-0" style={{ width: 52 }}>상태</span>
            <span className="flex-shrink-0 text-right" style={{ width: 55 }}>결과</span>
            <span className="flex-shrink-0 text-right w-16">수집 일시</span>
            <span className="flex-shrink-0 text-right" style={{ width: 36 }}>작업</span>
          </div>

          <div className="divide-y divide-gray-100">
            {pagedJobs.map((job) => {
              const isExpanded = expandedJobId === job.id;
              return (
                <div key={job.id}>
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-blue-50/50 transition-colors"
                    onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                  >
                    <span className="text-gray-400 text-xs flex-shrink-0">{isExpanded ? "▼" : "▶"}</span>
                    <span className="text-gray-500 text-sm flex-shrink-0">#{job.id}</span>
                    <span className="text-sm font-medium text-gray-900 truncate flex-1 min-w-0">{formatScope(job)}</span>
                    <CrawlStatusBadge job={job} />
                    <span className="text-sm text-gray-600 flex-shrink-0">
                      {job.progress.found != null ? `${job.progress.found.toLocaleString()}건` : "-"}
                    </span>
                    <span className="text-xs text-gray-500 flex-shrink-0 w-16 text-right">
                      {job.completed_at ? relativeTime(job.completed_at) : job.created_at ? relativeTime(job.created_at) : "-"}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(job.id); }}
                      className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors flex-shrink-0"
                    >
                      삭제
                    </button>
                  </div>

                  {isExpanded && (
                    <HistoryDetailPanel
                      job={job}
                      allJobs={allJobs}
                      submitting={submitting}
                      onResume={onResume}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {historyJobs.length > HISTORY_PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-600">
              <button
                onClick={() => setHistoryPage(Math.max(0, effectivePage - 1))}
                disabled={effectivePage === 0}
                className="px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← 이전
              </button>
              <span>
                {effectivePage + 1} / {totalPages}
                <span className="text-gray-400 ml-2">({historyJobs.length.toLocaleString()}건)</span>
              </span>
              <button
                onClick={() => setHistoryPage(Math.min(totalPages - 1, effectivePage + 1))}
                disabled={effectivePage >= totalPages - 1}
                className="px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                다음 →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
