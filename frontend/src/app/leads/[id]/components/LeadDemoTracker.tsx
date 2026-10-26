"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CalendarDays, ExternalLink, Loader2, Plus, Video } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";

type LeadDemo = { id: number; scheduled_at: string; status: "Scheduled" | "Attended" | "Missed" | "Cancelled"; meeting_url?: string | null; notes?: string | null };

const DEMO_STATUSES: LeadDemo["status"][] = ["Scheduled", "Attended", "Missed", "Cancelled"];

export default function LeadDemoTracker({ leadId }: { leadId: string | string[] }) {
  const { role } = useRole();
  const canManage = ["Admin", "Employee", "SalesManager", "Demo"].includes(role);
  const [demos, setDemos] = useState<LeadDemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ scheduled_at: "", meeting_url: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/leads/${leadId}/demo-sessions`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load demo sessions.");
      setDemos(data.demo_sessions || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load demo sessions.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  const scheduleDemo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/leads/${leadId}/demo-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, scheduled_at: new Date(form.scheduled_at).toISOString() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not schedule the demo.");
      setForm({ scheduled_at: "", meeting_url: "", notes: "" });
      setShowForm(false);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not schedule the demo.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (demoId: number, status: LeadDemo["status"]) => {
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/lead-demo-sessions/${demoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not update the demo.");
      setDemos(current => current.map(item => item.id === demoId ? data.demo_session : item));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update the demo.");
    }
  };

  const attended = demos.filter(demo => demo.status === "Attended").length;
  const missed = demos.filter(demo => demo.status === "Missed").length;
  const scheduled = demos.filter(demo => demo.status === "Scheduled").length;

  return <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-semibold"><Video className="h-4 w-4 text-sky-800 dark:text-sky-300" />Demo sessions</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">{attended} attended · {scheduled} scheduled · {missed} missed</p></div>
      {canManage && <button type="button" onClick={() => { setError(""); setShowForm(value => !value); }} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--background)]"><Plus className="h-4 w-4" />Schedule demo</button>}
    </div>
    {error && <p role="alert" className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    {showForm && <form onSubmit={scheduleDemo} className="mt-4 grid gap-3 rounded-md border border-[var(--border)] p-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Demo date and time<input required type="datetime-local" value={form.scheduled_at} onChange={event => setForm(current => ({ ...current, scheduled_at: event.target.value }))} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
      <label className="text-sm font-medium">Meeting link<input type="url" value={form.meeting_url} onChange={event => setForm(current => ({ ...current, meeting_url: event.target.value }))} placeholder="https://" className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
      <label className="text-sm font-medium sm:col-span-2">Notes<input value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
      <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-sky-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}Schedule</button></div>
    </form>}
    {loading ? <div className="mt-4 flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-sky-800" /></div> : <div className="mt-4 divide-y divide-[var(--border)]">
      {demos.map(demo => <div key={demo.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="text-sm font-medium">{new Date(demo.scheduled_at).toLocaleString()}</p>{demo.notes && <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{demo.notes}</p>}{demo.meeting_url && <a href={demo.meeting_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sky-800 hover:underline dark:text-sky-300">Open meeting <ExternalLink className="h-3 w-3" /></a>}</div>{canManage ? <select aria-label={`Demo status for ${new Date(demo.scheduled_at).toLocaleDateString()}`} value={demo.status} onChange={event => void updateStatus(demo.id, event.target.value as LeadDemo["status"])} className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-sm">{DEMO_STATUSES.map(status => <option key={status}>{status}</option>)}</select> : <span className="rounded bg-[var(--background)] px-2.5 py-1 text-xs font-medium">{demo.status}</span>}</div>)}
  {!demos.length && <p className="py-3 text-sm text-[var(--text-secondary)]">No demos scheduled.</p>}
+    </div>}
+  </section>;
}
