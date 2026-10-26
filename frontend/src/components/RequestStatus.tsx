export const STATUS_LABELS: Record<string, string> = {
  new: "Received", in_review: "In review", planned: "Planned", in_progress: "In progress", done: "Done", declined: "Not planned",
};

const STATUS_STYLE: Record<string, string> = {
  new: "bg-blue-100 text-blue-700", in_review: "bg-violet-100 text-violet-700", planned: "bg-amber-100 text-amber-700",
  in_progress: "bg-indigo-100 text-indigo-700", done: "bg-emerald-100 text-emerald-700", declined: "bg-gray-200 text-gray-600",
};

export const CATEGORY_LABELS: Record<string, string> = {
  feature: "New feature", integration: "Integration", report: "Report or dashboard", branding: "Branding or documents", workflow: "Workflow or automation", other: "Something else",
};

export const PRIORITY_LABELS: Record<string, string> = { low: "Low", normal: "Normal", high: "High" };

export function StatusBadge({ status }: { status: string }) {
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[status] || "bg-gray-100 text-gray-600"}`}>{STATUS_LABELS[status] || status}</span>;
}
