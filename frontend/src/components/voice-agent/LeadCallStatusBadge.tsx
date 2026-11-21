"use client";

/** Compact lead-list indicator for the most recent AI call (status + time on hover). */
export default function LeadCallStatusBadge({
  status,
  at,
  onClick,
}: {
  status?: string | null;
  at?: string | null;
  onClick?: (e: React.MouseEvent) => void;
}) {
  if (!status) return null;
  const live = ["queued", "initiated", "ringing", "in-progress"].includes(status);
  const tone = ["completed", "answered", "in-progress", "ringing", "queued", "initiated"].includes(status)
    ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
    : ["failed", "busy", "no-answer", "canceled"].includes(status)
      ? "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
      : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
  const when = at ? new Date(at).toLocaleString() : "time unavailable";
  const label = (
    <>
      {live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />}
      Call · {status}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`View AI call (${status}) · ${when}`}
        className={`inline-flex items-center px-1.5 py-0.2 rounded-md border text-[9.5px] font-bold uppercase tracking-wide shrink-0 hover:opacity-85 transition-opacity cursor-pointer ${tone}`}
      >
        {label}
      </button>
    );
  }
  return (
    <span
      title={`Last AI call: ${status} · ${when}`}
      className={`inline-flex items-center px-1.5 py-0.2 rounded-md border text-[9.5px] font-bold uppercase tracking-wide shrink-0 ${tone}`}
    >
      {label}
    </span>
  );
}
