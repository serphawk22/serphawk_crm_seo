"use client";
import LocalizedText from "@/components/LocalizedText";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { Inbox, Loader2, Send, ArrowLeft, Clock, CheckCircle2, AlertTriangle, Layers, ChevronRight } from "lucide-react";
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

  const stats = useMemo(() => {
    return {
      total: rows.length,
      open: rows.filter(r => r.status === "open" || r.status === "new" || r.status === "submitted").length,
      in_progress: rows.filter(r => r.status === "in_progress" || r.status === "review").length,
      resolved: rows.filter(r => r.status === "completed" || r.status === "resolved" || r.status === "closed").length,
    };
  }, [rows]);

  if (!allowed) return null;

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-16 max-w-5xl mx-auto">
      {/* Compact Executive Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Inbox className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">Client Requests</h1>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700">
                {rows.length} requests
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 leading-none mt-0.5 truncate">
              Customization requests across all client workspaces
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-800/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {open ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-4 space-y-3.5 shadow-2xs">
          <button 
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline" 
            onClick={() => setOpen(null)}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> All requests
          </button>
          
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2.5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{open.title}</h2>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                {open.tenant_name} &middot; {CATEGORY_LABELS[open.category] || open.category} &middot; {PRIORITY_LABELS[open.priority] || open.priority} priority &middot; {open.requester_name || "unknown"} &middot; {new Date(open.created_at).toLocaleString()}
              </p>
            </div>
            <StatusBadge status={open.status} />
          </div>

          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-slate-200/60 dark:border-zinc-700">
            {open.description}
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-zinc-300 flex items-center gap-1.5">
              <span>Status:</span>
              <select 
                className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs font-medium text-slate-800 dark:text-zinc-100 outline-none" 
                value={open.status} 
                disabled={busy} 
                onChange={(e) => update({ status: e.target.value })}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-zinc-300 flex items-center gap-1.5">
              <span>Priority:</span>
              <select 
                className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs font-medium text-slate-800 dark:text-zinc-100 outline-none" 
                value={open.priority} 
                disabled={busy} 
                onChange={(e) => update({ priority: e.target.value })}
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>

          <div className="border-t border-slate-100 dark:border-zinc-800 pt-3 space-y-2.5">
            <h3 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">Conversation</h3>
            {open.messages.map((m) => (
              <div key={m.id} className={`rounded-lg px-3 py-2 text-xs ${m.from_platform ? "bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50" : "bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/50"}`}>
                <div className="text-[10px] text-slate-400 dark:text-zinc-500 mb-0.5">{m.from_platform ? "Platform Admin" : m.author_name || "Client"} &middot; {new Date(m.created_at).toLocaleString()}</div>
                <div className="whitespace-pre-wrap text-slate-800 dark:text-zinc-100">{m.body}</div>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <textarea 
                className="flex-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 resize-none" 
                rows={2} 
                placeholder="Reply to the client..." 
                value={reply} 
                onChange={(e) => setReply(e.target.value)} 
              />
              <button 
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1 disabled:opacity-50 shrink-0 self-end" 
                disabled={busy || !reply.trim()} 
                onClick={send}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Reply
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Compact 4-KPI Metric Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate"><LocalizedText text={"Total Requests"} /></div>
                <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{stats.total}</div>
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">Open / New</div>
                <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{stats.open}</div>
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate"><LocalizedText text={"In Progress"} /></div>
                <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{stats.in_progress}</div>
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate"><LocalizedText text={"Resolved"} /></div>
                <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{stats.resolved}</div>
              </div>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2 px-3 flex items-center gap-2 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">Filter by status:</span>
            <div className="flex gap-1 overflow-x-auto">
              <button 
                onClick={() => setFilter("")}
                className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${filter === "" ? "bg-indigo-600 text-white shadow-2xs" : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"}`}
              >
                <LocalizedText text={"All"} /> </button>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <button 
                  key={k} 
                  onClick={() => setFilter(k)}
                  className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${filter === k ? "bg-indigo-600 text-white shadow-2xs" : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Request List */}
          {loading ? (
            <div className="flex items-center justify-center py-16 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/90 dark:border-white/10">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-slate-400 bg-white dark:bg-zinc-900 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 text-xs font-medium">
              <LocalizedText text={"No requests found."} /> </div>
          ) : (
            <div className="space-y-1.5">
              {rows.map((r) => (
                <div 
                  key={r.id} 
                  onClick={() => openRequest(r.id)} 
                  className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 shadow-2xs hover:shadow-xs hover:border-indigo-500/60 dark:hover:border-indigo-500/50 transition-all cursor-pointer group flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                        {r.title}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5 truncate flex items-center gap-1.5">
                      <span className="font-medium text-slate-600 dark:text-zinc-300">{r.tenant_name}</span>
                      <span>&middot;</span>
                      <span>{CATEGORY_LABELS[r.category] || r.category}</span>
                      <span>&middot;</span>
                      <span>{PRIORITY_LABELS[r.priority] || r.priority} priority</span>
                      <span>&middot;</span>
                      <span><LocalizedText text={"Updated"} /> {new Date(r.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={r.status} />
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
