"use client";
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Cloud, Search, Loader2, AlertCircle, CheckCircle2, Clock, Link2, Pencil, X } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";

interface ScmhubCase {
  id: number;
  case_number?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assigned_to?: number | null;
  created_by?: number | null;
  entity_type?: string | null;
  entity_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];
const STATUS_COLORS: Record<string, string> = {
  Open: "bg-blue-500/10 text-blue-600",
  "In Progress": "bg-amber-500/10 text-amber-600",
  Resolved: "bg-emerald-500/10 text-emerald-600",
  Closed: "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400",
};
const PRIORITY_COLORS: Record<string, string> = {
  Low: "text-slate-500",
  Medium: "text-amber-600",
  High: "text-orange-600",
  Urgent: "text-red-600",
};
const PRIORITY_DOT: Record<string, string> = {
  Low: "bg-slate-400",
  Medium: "bg-amber-500",
  High: "bg-orange-500",
  Urgent: "bg-red-500",
};

export default function ScmhubCasesPage() {
  const { t } = useLanguage();
  const [cases, setCases] = useState<ScmhubCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ScmhubCase | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", status: "Open", priority: "Medium" });

  const load = () => {
    setLoading(true);
    setError("");
    fetch(`${API_BASE_URL}/scmhub-cases`)
      .then(r => r.json())
      .then(d => setCases(Array.isArray(d.cases) ? d.cases : []))
      .catch(() => setError("Could not load SCMHub cases."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openEdit = (c: ScmhubCase) => {
    setEditing(c);
    setForm({ title: c.title || "", description: c.description || "", status: c.status || "Open", priority: c.priority || "Medium" });
  };

  const changeStatus = async (c: ScmhubCase, status: string) => {
    if (!status || status === (c.status || "Open")) return;
    setCases(prev => prev.map(x => x.id === c.id ? { ...x, status } : x));
    try {
      const res = await fetch(`${API_BASE_URL}/scmhub-cases/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
    } catch (e) {
      setError("Could not update status. Please try again.");
      load();
    }
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/scmhub-cases/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title.trim(), description: form.description.trim(), status: form.status, priority: form.priority }),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditing(null);
      load();
    } catch (e) {
      setError("Could not update case. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => cases.filter(c => {
    const s = search.toLowerCase();
    return (!s || (c.title || "").toLowerCase().includes(s) || (c.case_number || "").toLowerCase().includes(s) || (c.description || "").toLowerCase().includes(s))
      && (statusFilter === "All" || (c.status || "Open") === statusFilter);
  }), [cases, search, statusFilter]);

  const total = cases.length;
  const openCount = cases.filter(c => c.status === "Open").length;
  const resolvedCount = cases.filter(c => c.status === "Resolved" || c.status === "Closed").length;
  const urgentCount = cases.filter(c => c.priority === "High" || c.priority === "Urgent").length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/20">
          <Cloud className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-zinc-100">{t("support_scmhub_cases.title")}</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400">{t("support_scmhub_cases.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t("support_scmhub_cases.total"), value: total, icon: Cloud, c: "text-sky-500", bg: "bg-sky-500/10" },
          { label: t("support_scmhub_cases.open"), value: openCount, icon: AlertCircle, c: "text-blue-500", bg: "bg-blue-500/10" },
          { label: t("support_scmhub_cases.resolved"), value: resolvedCount, icon: CheckCircle2, c: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: t("support_scmhub_cases.high_priority"), value: urgentCount, icon: AlertCircle, c: "text-red-500", bg: "bg-red-500/10" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mb-2`}><s.icon className={`w-4 h-4 ${s.c}`} /></div>
            <p className="text-2xl font-black text-slate-800 dark:text-zinc-100">{loading ? "—" : s.value}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("support_scmhub_cases.search_placeholder")}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["All", ...STATUSES].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === s ? "bg-sky-500 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"}`}>{s}</button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-500 font-semibold">{error}</p>}

      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-sky-500 w-8 h-8" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-700">
            <Cloud className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-bold max-w-sm text-center text-sm">{t("support_scmhub_cases.empty")}</p>
          </div>
        ) : filtered.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            onClick={() => openEdit(c)}
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-sky-300 dark:hover:border-sky-700 transition-all cursor-pointer">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-mono text-slate-400">{c.case_number || `#${c.id}`}</span>
                  <select
                    value={c.status || "Open"}
                    onChange={e => changeStatus(c, e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className={`appearance-none cursor-pointer text-[10px] font-black uppercase tracking-wide pl-2 pr-4 py-0.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 ${STATUS_COLORS[c.status || "Open"] || "bg-slate-100 text-slate-500"}`}
                    title="Change status"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span className={`flex items-center gap-1 text-[10px] font-black uppercase ${PRIORITY_COLORS[c.priority || "Medium"] || "text-slate-500"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[c.priority || "Medium"]}`} />{c.priority || "Medium"}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-800 dark:text-zinc-100 mb-1">{c.title || "Untitled case"}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                  {c.entity_type && c.entity_id && (
                    <span className="flex items-center gap-1"><Link2 className="w-3 h-3" />{c.entity_type} #{c.entity_id}</span>
                  )}
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(c.updated_at || c.created_at || Date.now()).toLocaleDateString()}</span>
                  <span className="flex items-center gap-1 text-sky-500 font-semibold ml-auto"><Pencil className="w-3 h-3" />Edit</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !saving && setEditing(null)}>
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-slate-400">{editing.case_number || `#${editing.id}`}</p>
                <h3 className="text-lg font-black text-slate-800 dark:text-zinc-100">{t("support_scmhub_cases.edit_title")}</h3>
              </div>
              <button onClick={() => setEditing(null)} disabled={saving} className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:bg-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t("support_scmhub_cases.field_title")}</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t("support_scmhub_cases.field_description")}</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t("support_scmhub_cases.field_status")}</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500">
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t("support_scmhub_cases.field_priority")}</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500">
                  {["Low", "Medium", "High", "Urgent"].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} disabled={saving} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-sm font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-200 disabled:opacity-50">
                {t("support_scmhub_cases.cancel")}
              </button>
              <button onClick={save} disabled={saving || !form.title.trim()} className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="animate-spin w-4 h-4" />}{t("support_scmhub_cases.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}