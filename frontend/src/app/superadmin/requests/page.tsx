"use client";
import React, { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { Inbox, Loader2, Send, ArrowLeft } from "lucide-react";
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS, StatusBadge } from "@/components/RequestStatus";

interface Row {
  id: number;
  tenant_id: number;
  tenant_name: string;
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

export default function ClientRequestsPage() {
  const { user } = useRole();
  const allowed = !user || user.role === "SuperAdmin" || user.email === "admin@serphawk.com";
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<(Row & { messages: Message[] }) | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Request failed");
    return data;
  }, []);

  const load = useCallback(async () => {
    try {
      setRows((await call(`/superadmin/requests${filter ? `?status=${filter}` : ""}`)).requests);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [call, filter]);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const openRequest = async (id: number) => {
    setError("");
    try {
      setOpen(await call(`/superadmin/requests/${id}`));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const update = async (body: { status?: string; priority?: string }) => {
    if (!open) return;
    setBusy(true);
    try {
      await call(`/superadmin/requests/${open.id}`, { method: "PUT", body: JSON.stringify(body) });
      await openRequest(open.id);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!open || !reply.trim()) return;
    setBusy(true);
    try {
      setOpen(await call(`/superadmin/requests/${open.id}/messages`, { method: "POST", body: JSON.stringify({ body: reply }) }));
      setReply("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) return null;

  return (
    <div className="p-8 max-w-5xl mx-auto font-sans space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Inbox className="w-8 h-8 text-blue-600" /> Client requests</h1>
        <p className="text-gray-500 mt-2">Customization requests from every client. Build a request once as a module, then switch it on for any client that needs it.</p>
      </div>
      {error && <div className="rounded-lg bg-red-50 text-red-700 border border-red-200 px-4 py-3 text-sm">{error}</div>}

      {open ? (
        <div className={`${card} space-y-4`}>
          <button className="inline-flex items-center gap-1 text-sm text-blue-700" onClick={() => setOpen(null)}><ArrowLeft className="w-4 h-4" /> All requests</button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold">{open.title}</h2>
            <StatusBadge status={open.status} />
          </div>
          <p className="text-xs text-gray-500">
            {open.tenant_name} &middot; {CATEGORY_LABELS[open.category] || open.category} &middot; {PRIORITY_LABELS[open.priority] || open.priority} priority &middot; {open.requester_name || "unknown"} &middot; {new Date(open.created_at).toLocaleString()}
          </p>
          <p className="text-sm whitespace-pre-wrap">{open.description}</p>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">Status{" "}
              <select className={`${input} !w-auto inline-block`} value={open.status} disabled={busy} onChange={(e) => update({ status: e.target.value })}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-sm">Priority{" "}
              <select className={`${input} !w-auto inline-block`} value={open.priority} disabled={busy} onChange={(e) => update({ priority: e.target.value })}>
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-3">
            {open.messages.map((m) => (
              <div key={m.id} className={`rounded-lg px-3 py-2 text-sm ${m.from_platform ? "bg-indigo-50 dark:bg-indigo-950/30" : "bg-gray-50 dark:bg-gray-800/50"}`}>
                <div className="text-xs text-gray-500 mb-0.5">{m.from_platform ? "Our team" : m.author_name || "Client"} &middot; {new Date(m.created_at).toLocaleString()}</div>
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            ))}
            <div className="flex gap-2">
              <textarea className={input} rows={2} placeholder="Reply to the client" value={reply} onChange={(e) => setReply(e.target.value)} />
              <button className={btn} disabled={busy || !reply.trim()} onClick={send}><Send className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Show</span>
            <select className={`${input} !w-auto`} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
          ) : rows.length === 0 ? (
            <div className={`${card} text-center text-gray-500`}>No requests.</div>
          ) : (
            <div className={`${card} divide-y divide-gray-100 dark:divide-gray-800 !p-0`}>
              {rows.map((r) => (
                <button key={r.id} onClick={() => openRequest(r.id)} className="w-full text-left px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold">{r.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{r.tenant_name} &middot; {CATEGORY_LABELS[r.category] || r.category} &middot; {PRIORITY_LABELS[r.priority] || r.priority} &middot; updated {new Date(r.updated_at).toLocaleDateString()}</div>
                  </div>
                  <StatusBadge status={r.status} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
