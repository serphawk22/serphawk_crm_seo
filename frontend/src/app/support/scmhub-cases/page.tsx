"use client";
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Cloud, Search, Loader2, AlertCircle, CheckCircle2, Clock, Link2 } from "lucide-react";
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
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-mono text-slate-400">{c.case_number || `#${c.id}`}</span>
                  <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-lg ${STATUS_COLORS[c.status || "Open"] || "bg-slate-100 text-slate-500"}`}>{c.status || "Open"}</span>
                  <span className={`flex items-center gap-1 text-[10px] font-black uppercase ${PRIORITY_COLORS[c.priority || "Medium"] || "text-slate-500"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[c.priority || "Medium"]}`} />{c.priority || "Medium"}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-800 dark:text-zinc-100 mb-1">{c.title || "Untitled case"}</p>
                {c.description && <p className="text-xs text-slate-500 line-clamp-2">{c.description}</p>}
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                  {c.entity_type && (
                    <span className="flex items-center gap-1"><Link2 className="w-3 h-3" />{c.entity_type}{c.entity_id ? ` #${c.entity_id}` : ""}</span>
                  )}
                  {!c.entity_type && <span className="text-slate-400">{t("support_scmhub_cases.unknown_entity")}</span>}
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(c.updated_at || c.created_at || Date.now()).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}