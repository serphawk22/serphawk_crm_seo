"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import { API_BASE_URL } from "@/config";
import TimezonePicker from "@/components/TimezonePicker";
import { detectTimeZone, zonedWallToUtc } from "@/lib/timezone";
import type { ScheduleStage } from "@/lib/leadWorkflow";

/** Uses the admissions endpoints so scheduling and the stage change commit together. */
export default function InstituteLeadScheduleModal({ lead, stage, onClose, onSuccess }: {
  lead: { id: number; company_name: string }; stage: ScheduleStage;
  onClose: () => void; onSuccess: () => void;
}) {
  const [date, setDate] = useState("");
  const [timezone, setTimezone] = useState(detectTimeZone);
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const followup = stage === "Follow-up";
  const webinar = stage === "Webinar Scheduled";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const title = `Schedule ${followup ? "follow-up" : webinar ? "webinar" : "walk-in"}`;
  const fieldClass = "mt-1 block min-h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const due = zonedWallToUtc(date, timezone);
      if (!due) throw new Error("Choose a valid date, time and timezone");
      const endpoint = followup ? "follow-ups" : webinar ? "webinars" : "walk-ins";
      const response = await fetch(`${API_BASE_URL}/leads/${lead.id}/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: due.toISOString(), notes: notes || null,
          ...(webinar ? { meeting_url: location || null } : !followup ? { location: location || null } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save the schedule");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the schedule");
    } finally { setSaving(false); }
  }

  return <dialog ref={dialogRef} aria-labelledby="schedule-title" aria-describedby="schedule-lead"
    onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget && !saving) {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    } }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
    <form onSubmit={submit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <header className="flex shrink-0 items-start gap-2 border-b border-slate-200 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0 flex-1">
          <h2 id="schedule-title" className="text-base font-semibold">{title}</h2>
          <p id="schedule-lead" className="mt-0.5 truncate text-xs text-slate-500 dark:text-zinc-400" title={lead.company_name}>{lead.company_name}</p>
        </div>
        <button type="button" aria-label="Close schedule" disabled={saving} onClick={onClose}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"><X className="h-5 w-5" /></button>
      </header>
      <fieldset disabled={saving} className="min-h-0 min-w-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
        <div>
        <label className="block text-xs font-medium">
          Date &amp; time <span className="text-red-500" aria-hidden="true">*</span>
          <input autoFocus required type="datetime-local" value={date} onChange={e => setDate(e.target.value)} className={fieldClass} />
        </label>
        <TimezonePicker compact value={timezone} onChange={setTimezone} localTime={date} />
        </div>
        {!followup && <label className="block text-xs font-medium">{webinar ? "Meeting link" : "Location"} <span className="font-normal text-slate-400">(optional)</span>
          <input type={webinar ? "url" : "text"} value={location} onChange={e => setLocation(e.target.value)}
            placeholder={webinar ? "https://meet.google.com/…" : "Campus, branch or meeting address"} className={fieldClass} />
        </label>}
        <details>
          <summary className="w-fit cursor-pointer rounded text-xs text-slate-500 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-zinc-400">Add notes</summary>
          <label className="sr-only" htmlFor="schedule-notes">Notes</label>
          <textarea id="schedule-notes" rows={2} value={notes} maxLength={8000} onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className={`${fieldClass} resize-y`} />
        </details>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}
      </fieldset>
      <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-2.5 dark:border-zinc-800">
        <button type="button" disabled={saving} onClick={onClose} className="min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Cancel</button>
        <button disabled={saving} className="flex min-h-9 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-60">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{saving ? "Saving…" : "Schedule"}
        </button>
      </footer>
    </form>
  </dialog>;
}
