import { STATUS_LABELS } from "@/lib/crawler";

export function CrawlStatusBadge({ status }: { status: string }) {
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
