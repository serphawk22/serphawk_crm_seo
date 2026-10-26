"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Loader2, Plus, X } from "lucide-react";
import { API_BASE_URL } from "@/config";

type ExistingSession = { scheduled_start: string };

type RecurringSessionSchedulerProps = {
  batchId: number | string;
  batchStart?: string | null;
  batchEnd?: string | null;
  meetingUrl?: string | null;
  existingSessions: ExistingSession[];
  onCreated: () => void;
};

function localDateValue(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayAt(dateValue: string, timeValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export default function RecurringSessionScheduler({ batchId, batchStart, batchEnd, meetingUrl, existingSessions, onCreated }: RecurringSessionSchedulerProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [startDate, setStartDate] = useState(localDateValue(batchStart));
  const [endDate, setEndDate] = useState(localDateValue(batchEnd));
  const [startTime, setStartTime] = useState("18:00");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [skipSaturday, setSkipSaturday] = useState(true);
  const [skipSunday, setSkipSunday] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resultMessage, setResultMessage] = useState("");

  const plannedStarts = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate) return [];
    const starts: Date[] = [];
    const cursor = dayAt(startDate, "00:00");
    const lastDay = dayAt(endDate, "00:00");
    while (cursor <= lastDay) {
      const weekday = cursor.getDay();
      if (!(weekday === 6 && skipSaturday) && !(weekday === 0 && skipSunday)) {
        const cursorDate = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        starts.push(dayAt(cursorDate, startTime));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return starts;
  }, [startDate, endDate, startTime, skipSaturday, skipSunday]);

  const createSchedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    setResultMessage("");
    try {
      const existingStarts = new Set(existingSessions.map(item => new Date(item.scheduled_start).getTime()));
      const uniqueStarts = plannedStarts.filter(item => !existingStarts.has(item.getTime()));
      let created = 0;
      for (const [index, starts] of uniqueStarts.entries()) {
        const ends = new Date(starts.getTime() + durationMinutes * 60_000);
        const response = await fetch(`${API_BASE_URL}/batches/${batchId}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `${title.trim()} · ${starts.toLocaleDateString()}`,
            topic: topic.trim() || null,
            scheduled_start: starts.toISOString(),
            scheduled_end: ends.toISOString(),
            status: "Scheduled",
            meeting_url: meetingUrl || null,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || `Could not create class ${index + 1}.`);
        created += 1;
      }
      setResultMessage(`Created ${created} classes${plannedStarts.length - uniqueStarts.length ? `; skipped ${plannedStarts.length - uniqueStarts.length} existing dates` : ""}.`);
      onCreated();
      if (created > 0) setOpen(false);
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "Could not create the class schedule.");
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return <>
    <button type="button" onClick={() => { setError(""); setOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-md border border-sky-900 px-4 py-2.5 text-sm font-semibold text-sky-900 hover:bg-sky-50 dark:border-sky-300 dark:text-sky-200 dark:hover:bg-sky-950"><CalendarDays className="h-4 w-4" />Auto-schedule classes</button>
    {resultMessage && <span role="status" className="sr-only">{resultMessage}</span>}
    {open && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
      <form onSubmit={createSchedule} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Auto-schedule classes</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Create one class on each selected weekday in the date range.</p></div><button type="button" title="Close" disabled={saving} onClick={() => setOpen(false)} className="rounded-md p-1.5 hover:bg-[var(--background)]"><X className="h-4 w-4" /></button></div>
        {error && <p role="alert" className="mt-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="text-sm font-medium">Class title</span><input required value={title} onChange={event => setTitle(event.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm" placeholder="e.g. Full Stack Web Development" /></label>
          <label className="sm:col-span-2"><span className="text-sm font-medium">Topic (optional)</span><input value={topic} onChange={event => setTopic(event.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm" /></label>
          <label><span className="text-sm font-medium">First class date</span><input required type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm" /></label>
          <label><span className="text-sm font-medium">Last class date</span><input required type="date" min={startDate} value={endDate} onChange={event => setEndDate(event.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm" /></label>
          <label><span className="text-sm font-medium">Start time</span><input required type="time" value={startTime} onChange={event => setStartTime(event.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm" /></label>
          <label><span className="text-sm font-medium">Class length</span><select value={durationMinutes} onChange={event => setDurationMinutes(Number(event.target.value))} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"><option value={60}>1 hour</option><option value={90}>1.5 hours</option><option value={120}>2 hours</option><option value={180}>3 hours</option><option value={240}>4 hours</option></select></label>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">Skip weekends</legend><div className="mt-2 flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={skipSaturday} onChange={event => setSkipSaturday(event.target.checked)} />Skip Saturdays</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={skipSunday} onChange={event => setSkipSunday(event.target.checked)} />Skip Sundays</label></div></fieldset>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4"><p className="text-sm text-[var(--text-secondary)]">{plannedStarts.length} classes planned</p><button type="submit" disabled={saving || !plannedStarts.length || !title.trim()} className="inline-flex items-center gap-2 rounded-md bg-sky-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create classes</button></div>
      </form>
    </div>}
  </>;
}
