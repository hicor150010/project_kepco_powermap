import { CrawlJob, displayStatus } from "@/lib/crawler";

/**
 * 2중 제어 모델을 반영한 배지:
 *   - intent='cancel' + status IN (pending/running) → "정지 요청 중"
 *   - 그 외는 status 기반 기본 라벨
 *
 * job 전체를 받아야 intent 를 볼 수 있음.
 */
export function CrawlStatusBadge({ job }: { job: CrawlJob }) {
  const info = displayStatus(job);
  return (
    <span
      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${info.color}`}
    >
      {info.text}
    </span>
  );
}
