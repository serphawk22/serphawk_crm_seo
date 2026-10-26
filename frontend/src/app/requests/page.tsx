"use client";
import React, { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { Lightbulb, Loader2, Plus, Send, ArrowLeft } from "lucide-react";
import { CATEGORY_LABELS, PRIORITY_LABELS, StatusBadge } from "@/components/RequestStatus";

interface RequestRow {
  id: number;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  requester_name?: string | null;
  created_at: string;
  updated_at: string;
}
interface Message { id: number; author_name?: string | null; from_platform: boolean; body: string; created_at: string }

const input = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm";
const card = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5";
const btn = "inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 disabled:opacity-50";

export default function RequestsPage() {
  const { user } = useRole();
  const allowed = !user || user.role === "Admin";
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", description: "", category: "feature", priority: "normal" });
  const [open, setOpen] = useState<(RequestRow & { messages: Message[] }) | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Request failed");
    return data;
  }, []);

  const load = useCallback(async () => {
    try {
      setRows((await call("/tenant/requests")).requests);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await call("/tenant/requests", { method: "POST", body: JSON.stringify(form) });
      setForm({ title: "", description: "", category: "feature", priority: "normal" });
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openRequest = async (id: number) => {
    setError("");
    try {
      setOpen(await call(`/tenant/requests/${id}`));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const send = async () => {
    if (!open || !reply.trim()) return;
    setBusy(true);
    try {
      setOpen(await call(`/tenant/requests/${open.id}/messages`, { method: "POST", body: JSON.stringify({ body: reply }) }));
      setReply("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (user?.role === "SuperAdmin") {
    return (
      <div className="p-8 max-w-2xl mx-auto font-sans">
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-5 text-sm text-amber-900 dark:text-amber-200">
          Requests are raised by each client&apos;s Admin. You answer them in <a className="underline font-semibold" href="/superadmin/requests">Client Requests</a>.
        </div>
      </div>
    );
  }
  if (!allowed) return <p className="p-8 text-gray-500">Only an Admin can raise customization requests.</p>;

  return (
    <div className="p-8 max-w-4xl mx-auto font-sans space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Lightbulb className="w-8 h-8 text-amber-500" /> Customization requests</h1>
          <p className="text-gray-500 mt-2">Need something the CRM does not do yet? Tell us. We reply here and let you know when it is planned or ready. Small changes to look and wording you can make yourself under Company profile.</p>
        </div>
        {!open && <button className={btn} onClick={() => setShowForm((v) => !v)}><Plus className="w-4 h-4" /> New request</button>}
      </div>
      {error && <div className="rounded-lg bg-red-50 text-red-700 border border-red-200 px-4 py-3 text-sm">{error}</div>}

      {!open && showForm && (
        <form onSubmit={submit} className={`${card} space-y-3`}>
          <input className={input} placeholder="What do you need? (a short title)" required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea className={input} rows={5} required maxLength={5000} placeholder="Describe it: what you do today, what should happen instead, and why it matters." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm"><span className="text-gray-600 dark:text-gray-400">Type</span>
              <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-sm"><span className="text-gray-600 dark:text-gray-400">How urgent?</span>
              <select className={input} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <button className={btn} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send request</button>
        </form>
      )}

      {open ? (
        <div className={`${card} space-y-4`}>
          <button className="inline-flex items-center gap-1 text-sm text-blue-700" onClick={() => setOpen(null)}><ArrowLeft className="w-4 h-4" /> All requests</button>
          <div className="flex items-center gap-3"><h2 className="text-xl font-bold">{open.title}</h2><StatusBadge status={open.status} /></div>
          <p className="text-xs text-gray-500">{CATEGORY_LABELS[open.category] || open.category} &middot; {PRIORITY_LABELS[open.priority] || open.priority} priority &middot; raised by {open.requester_name || "you"} on {new Date(open.created_at).toLocaleDateString()}</p>
          <p className="text-sm whitespace-pre-wrap">{open.description}</p>
          <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-3">
            {open.messages.length === 0 && <p className="text-sm text-gray-500">No replies yet. We will answer here.</p>}
            {open.messages.map((m) => (
              <div key={m.id} className={`rounded-lg px-3 py-2 text-sm ${m.from_platform ? "bg-indigo-50 dark:bg-indigo-950/30" : "bg-gray-50 dark:bg-gray-800/50"}`}>
                <div className="text-xs text-gray-500 mb-0.5">{m.from_platform ? "Our team" : m.author_name || "You"} &middot; {new Date(m.created_at).toLocaleString()}</div>
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            ))}
            <div className="flex gap-2">
              <textarea className={input} rows={2} placeholder="Add a message" value={reply} onChange={(e) => setReply(e.target.value)} />
              <button className={btn} disabled={busy || !reply.trim()} onClick={send}><Send className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : rows.length === 0 ? (
        <div className={`${card} text-center text-gray-500`}>No requests yet. Use &ldquo;New request&rdquo; to tell us what you need.</div>
      ) : (
        <div className={`${card} divide-y divide-gray-100 dark:divide-gray-800 !p-0`}>
          {rows.map((r) => (
            <button key={r.id} onClick={() => openRequest(r.id)} className="w-full text-left px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">{r.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">{CATEGORY_LABELS[r.category] || r.category} &middot; updated {new Date(r.updated_at).toLocaleDateString()}</div>
              </div>
              <StatusBadge status={r.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
