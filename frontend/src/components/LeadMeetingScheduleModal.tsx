"use client";
import React, { useState, useEffect, useRef, FormEvent } from "react";
import { X, Calendar, Clock, Video, MapPin, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { API_BASE_URL } from "@/config";
import TimezonePicker from "@/components/TimezonePicker";
import { detectTimeZone, zonedWallToUtc } from "@/lib/timezone";

interface LeadMeetingScheduleModalProps {
  lead: {
    id: number;
    company_name: string;
    email?: string | null;
    phone?: string | null;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export default function LeadMeetingScheduleModal({
  lead,
  onClose,
  onSuccess,
}: LeadMeetingScheduleModalProps) {
  const [title, setTitle] = useState(`Meeting with ${lead.company_name}`);
  const [meetingType, setMeetingType] = useState("Meeting");
  const [date, setDate] = useState("");
  const [timezone, setTimezone] = useState(detectTimeZone);
  const [duration, setDuration] = useState("45");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // Default to tomorrow at 10:00 AM if not set
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const localIso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setDate(localIso);

    const dialog = dialogRef.current;
    dialog?.showModal();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) {
      setError("Please provide a meeting title and date/time.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const due = zonedWallToUtc(date, timezone);
      const token = typeof window !== "undefined" ? localStorage.getItem("crm_token") || localStorage.getItem("token") : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const payload = {
        title: title.trim(),
        meeting_type: meetingType,
        status: "Scheduled",
        scheduled_at: due ? due.toISOString() : date,
        timezone,
        duration_minutes: parseInt(duration) || 45,
        location: location.trim() || null,
        meeting_link: location.startsWith("http") ? location.trim() : null,
        notes: notes.trim() || null,
        lead_id: lead.id,
      };

      const res = await fetch(`${API_BASE_URL}/meetings`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to schedule meeting on calendar.");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to schedule meeting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-0 text-slate-900 dark:text-zinc-100 shadow-2xl backdrop:bg-black/60"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200/80 dark:border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-800">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Schedule Meeting on Calendar</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 truncate max-w-xs" title={lead.company_name}>
                Lead: <span className="font-semibold text-slate-800 dark:text-zinc-200">{lead.company_name}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
              Meeting Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Discovery Call with Lead"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                Meeting Type
              </label>
              <select
                value={meetingType}
                onChange={(e) => setMeetingType(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Meeting">Meeting</option>
                <option value="Demo">Demo</option>
                <option value="Discovery">Discovery</option>
                <option value="Call">Call</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
                Duration
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
              Date &amp; Time *
            </label>
            <input
              type="datetime-local"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
            <div className="mt-2">
              <TimezonePicker compact value={timezone} onChange={setTimezone} localTime={date} />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
              Meeting Link or Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. https://meet.google.com/abc-defg-hij or Head Office Room 2"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1">
              Agenda / Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Key discussion points, deliverables, or context..."
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200/80 dark:border-zinc-800 px-5 py-3">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-indigo-500/20 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Scheduling...</span>
              </>
            ) : (
              <>
                <Calendar className="w-3.5 h-3.5" />
                <span>Save Meeting to Calendar</span>
              </>
            )}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
