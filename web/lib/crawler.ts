// 수집기 공통 — 타입/상수/유틸
// 새 수집기 추가 시 THREADS 배열만 수정하면 UI 자동 대응.

export const THREADS = [1, 2, 3] as const;
export type Thread = (typeof THREADS)[number];

export const HISTORY_PAGE_SIZE = 10;

export interface CrawlJob {
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
    geocoded?: number;
    current_address?: string;
    phase?: string;
    addr_parts?: {
      sido?: string;
      si?: string;
      gu?: string;
      dong?: string;
      li?: string;
      jibun?: string;
    };
    recent_errors?: { addr: string; error: string }[];
    indices?: Record<string, [number, number]>;
  };
  checkpoint: Record<string, unknown> | null;
  options: Record<string, unknown>;
  github_run_id: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  thread: number;
  mode: string;
  cycle_count: number;
  max_cycles: number | null;
  last_heartbeat: string | null;
}

export const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  pending: { text: "대기 중", color: "bg-yellow-100 text-yellow-800" },
  running: { text: "실행 중", color: "bg-blue-100 text-blue-800" },
  completed: { text: "완료", color: "bg-green-100 text-green-800" },
  failed: { text: "실패", color: "bg-red-100 text-red-800" },
  stopped: { text: "타임아웃", color: "bg-gray-100 text-gray-800" },
  stop_requested: { text: "중단 요청", color: "bg-orange-100 text-orange-800" },
  cancelled: { text: "취소됨", color: "bg-gray-100 text-gray-600" },
};

export const ACTIVE_STATUSES = ["running", "pending", "stop_requested"] as const;
export const HISTORY_STATUSES = ["completed", "failed", "stopped", "cancelled"] as const;

export function isActiveJob(job: CrawlJob): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(job.status);
}

export function isHistoryJob(job: CrawlJob): boolean {
  return (HISTORY_STATUSES as readonly string[]).includes(job.status);
}

export function formatScope(job: CrawlJob): string {
  return [
    job.sido,
    job.si || "(전체)",
    job.gu || "(전체)",
    job.dong || "(전체)",
    job.li || "(전체)",
  ].join(" > ");
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return "-";
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}시간 ${mins % 60}분`;
  if (mins > 0) return `${mins}분 ${secs % 60}초`;
  return `${secs}초`;
}
