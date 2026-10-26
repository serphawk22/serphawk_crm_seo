"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Loader2, Video, PhoneCall, MapPin, X } from "lucide-react";

export type ScheduleType = "followup" | "webinar" | "walkin" | "demo";

export interface SchedulePayload {
  scheduled_at: string;
  notes: string;
  meeting_url: string;
  location?: string;
}

interface LeadScheduleModalProps {
  type: ScheduleType;
  leadName: string;
  initial?: Partial<SchedulePayload>;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (payload: SchedulePayload) => Promise<void>;
}

function defaultDateTime(): string {
  // Tomorrow, 11:00 local, formatted for <input type="datetime-local">
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(11, 0, 0, 0);
  return toLocalInput(d);
}

export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LeadScheduleModal({ type, leadName, initial, submitLabel, onClose, onSubmit }: LeadScheduleModalProps) {
  const [when, setWhen] = useState(initial?.scheduled_at ? initial.scheduled_at.slice(0, 16) : defaultDateTime());
  const [notes, setNotes] = useState(initial?.notes || "");
  const [url, setUrl] = useState(initial?.meeting_url || "");
  const [location, setLocation] = useState(initial?.location || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isWebinar = type === "webinar" || type === "demo";
  const isWalkIn = type === "walkin";
  const Icon = isWebinar ? Video : isWalkIn ? MapPin : PhoneCall;
  const accent = isWebinar
    ? "from-indigo-600 to-violet-700"
    : isWalkIn
    ? "from-sky-500 to-indigo-600"
    : "from-amber-500 to-orange-600";

  const modalTitle = isWebinar ? "Schedule a webinar" : isWalkIn ? "Schedule a walk-in" : "Schedule a follow-up";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!when) { setError("Pick a date and time."); return; }
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        scheduled_at: when,
        notes: notes.trim(),
        meeting_url: url.trim(),
        location: location.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the schedule.");
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <motion.form
        onSubmit={submit}
        initial={{ scale: 0.95, y: 12, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 12, opacity: 0 }}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-zinc-950"
      >
        <div className={`flex items-center justify-between bg-gradient-to-r ${accent} px-5 py-4 text-white`}>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2"><Icon className="h-5 w-5" /></div>
            <div>
              <h2 className="text-base font-bold">{modalTitle}</h2>
              <p className="text-xs text-white/80">{leadName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="rounded-lg p-1.5 hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span className="mb-1.5 flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Date &amp; time <span className="text-red-500">*</span></span>
            <input
              type="datetime-local" required autoFocus value={when} onChange={e => setWhen(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </label>

          {isWalkIn && (
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span className="mb-1.5 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Campus / Branch location (optional)</span>
              <input
                value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Main Campus / Reception"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </label>
          )}

          {isWebinar && (
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span className="mb-1.5 block">Meeting / Webinar link (optional)</span>
              <input
                value={url} onChange={e => setUrl(e.target.value)} placeholder="https://zoom.us/j/... or Google Meet"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </label>
          )}

          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span className="mb-1.5 block">Notes (optional)</span>
            <textarea
              rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={isWebinar ? "Webinar topic, presentation link, or student questions…" : isWalkIn ? "Counselor name, documents to bring…" : "What to discuss on the call…"}
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </label>

          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-zinc-900/50">
          <button type="button" onClick={onClose} disabled={saving}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${accent} py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50`}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel || (isWebinar ? "Schedule webinar" : isWalkIn ? "Schedule walk-in" : "Schedule follow-up")}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
