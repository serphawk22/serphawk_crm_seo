"use client";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HeadphonesIcon, Plus, X, Search, Loader2, Trash2, Edit2, AlertCircle, CheckCircle2, Clock, Globe, Bug, Lightbulb, UserCheck, ArrowUpRight } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";
import { useRole } from "@/context/RoleContext";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { useRouter } from "next/navigation";

interface Case { id: number; case_number?: string; subject: string; description?: string; status: string; priority: string; category?: string; case_type?: string; url?: string; client_name?: string; lead_name?: string; assignee_name?: string; assigned_to?: number | null; created_at: string; resolved_at?: string; }
const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const CASE_TYPES = ["Bug", "Feature Request"];
const STATUS_COLORS: Record<string, string> = {
  Open: "bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
  "In Progress": "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  Resolved: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  Closed: "bg-slate-100 text-slate-600 border-slate-200/80 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
};
const PRIORITY_COLORS: Record<string, string> = { Low: "text-slate-500", Medium: "text-amber-600", High: "text-orange-600", Urgent: "text-red-600" };
const PRIORITY_DOT: Record<string, string> = { Low: "bg-slate-400", Medium: "bg-amber-500", High: "bg-orange-500", Urgent: "bg-red-500" };
const TYPE_COLORS: Record<string, string> = {
  Bug: "bg-red-50 text-red-600 border-red-200/70 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  "Feature Request": "bg-violet-50 text-violet-600 border-violet-200/70 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30"
};

export default function CasesPage() {
  const { t } = useLanguage();
  const { role, user } = useRole();
  const { isOn } = useTenantConfig();
  const router = useRouter();
  const isAdmin = ["Admin", "SuperAdmin"].includes(role);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editCase, setEditCase] = useState<Case | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", status: "Open", priority: "Medium", category: "", case_type: "Bug", url: "", assigned_to: "" as number | string });
  const [users, setUsers] = useState<any[]>([]);

  const load = () => {
    setLoading(true);
    const assignedOnly = !["Admin", "SuperAdmin", "Demo"].includes(role) && user?.id;
    fetch(`${API_BASE_URL}/cases${assignedOnly ? `?assigned_to=${user.id}` : ""}`).then(r => r.json()).then(cd => {
      setCases(Array.isArray(cd.cases) ? cd.cases : []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { if (user?.id) { load(); fetch(`${API_BASE_URL}/users`).then(r => r.json()).then(d => setUsers(d.users || [])).catch(() => {}); } }, [user?.id, role]);

  const filtered = useMemo(() => cases.filter(c => {
    const s = search.toLowerCase();
    return (!s || c.subject.toLowerCase().includes(s) || (c.case_number || "").toLowerCase().includes(s) || (c.client_name || "").toLowerCase().includes(s) || (c.url || "").toLowerCase().includes(s))
      && (statusFilter === "All" || c.status === statusFilter)
      && (priorityFilter === "All" || c.priority === priorityFilter);
  }), [cases, search, statusFilter, priorityFilter]);

  const openEdit = (c: Case) => { setEditCase(c); setForm({ subject: c.subject, description: c.description || "", status: c.status, priority: c.priority, category: c.category || "", case_type: c.case_type || "Bug", url: c.url || "", assigned_to: c.assigned_to || "" } as any); setShowModal(true); };

  const handleSave = async () => {
    if (!form.subject.trim()) return;
    setSaving(true);
    const url = editCase ? `${API_BASE_URL}/cases/${editCase.id}` : `${API_BASE_URL}/cases`;
    const method = editCase ? "PUT" : "POST";
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, assigned_to: form.assigned_to ? Number(form.assigned_to) : null }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.detail || "Could not update case"); }
      setShowModal(false); load();
    } catch (error) { alert(error instanceof Error ? error.message : "Could not update case"); }
    finally { setSaving(false); }
  };
  const handleDelete = async (id: number) => { await fetch(`${API_BASE_URL}/cases/${id}`, { method: "DELETE" }); load(); };

  const openCount = cases.filter(c => c.status === "Open").length;
  const inProgressCount = cases.filter(c => c.status === "In Progress").length;
  const resolvedCount = cases.filter(c => c.status === "Resolved" || c.status === "Closed").length;
  const bugCount = cases.filter(c => c.case_type === "Bug").length;

  const FILTER_LABELS: Record<string, string> = {
    All: "All",
    Open: t("support_cases.open"),
    Resolved: t("support_cases.resolved"),
    "In Progress": "In Progress",
    Closed: "Closed",
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black p-3 sm:p-5 space-y-3.5">
      {/* Executive Compact Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-xs shrink-0">
            <HeadphonesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t("support_cases.title")}</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-300 border border-slate-200/80 dark:border-white/5">
                {cases.length} total
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">{t("support_cases.subtitle")}</p>
          </div>
        </div>

        {isOn("support_sh") && (
          <button
            onClick={() => router.push('/support/helpdesk')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 text-white text-xs sm:text-sm font-semibold hover:opacity-95 shadow-xs transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" /> {t("support_cases.new_case")}
          </button>
        )}
      </div>

      {/* High-density Compact Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: "Total Cases", value: cases.length, icon: HeadphonesIcon, c: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-500/10" },
          { label: "Open Issues", value: openCount, icon: AlertCircle, c: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10" },
          { label: "Resolved / Closed", value: resolvedCount, icon: CheckCircle2, c: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
          { label: "Active Bugs", value: bugCount, icon: Bug, c: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-slate-200/90 dark:border-white/10 bg-white/90 dark:bg-[#111111]/90 p-2 sm:px-3 sm:py-2 flex items-center justify-between shadow-xs hover:border-slate-300 dark:hover:border-white/20 transition-all"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-7 h-7 rounded-lg ${s.bg} border border-slate-200/40 dark:border-white/5 flex items-center justify-center shrink-0`}>
                <s.icon className={`w-3.5 h-3.5 ${s.c}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">{s.label}</p>
                <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none mt-0.5">{loading ? "—" : s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Streamlined Toolbar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 flex-wrap gap-2.5 shadow-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("support_cases.search_placeholder")}
            className="w-full h-8 pl-9 pr-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/5 p-0.5 rounded-lg border border-slate-200/60 dark:border-white/5">
            {["All", ...STATUSES].map(s => {
              const count = s === "All" ? cases.length : cases.filter(c => c.status === s).length;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                    statusFilter === s
                      ? "bg-rose-600 text-white shadow-xs font-semibold"
                      : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <span>{FILTER_LABELS[s] || s}</span>
                  <span className={`text-[10px] px-1 py-0.2 rounded-full ${statusFilter === s ? "bg-rose-700 text-white" : "bg-slate-200/80 dark:bg-white/10 text-slate-600 dark:text-zinc-400"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-white/10 pl-2">
            {["All", ...PRIORITIES].map(p => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  priorityFilter === p
                    ? "bg-slate-800 dark:bg-white text-white dark:text-black font-semibold"
                    : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Cases List Cards */}
      <div className="space-y-2">
        {/* Subtle column headers for desktop */}
        <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
          <div className="col-span-4">Case & Issue</div>
          <div className="col-span-3">Client / Related URL</div>
          <div className="col-span-2">Assignee</div>
          <div className="col-span-2">Status & Priority</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-rose-500 w-8 h-8" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 text-center">
            <HeadphonesIcon className="w-10 h-10 text-slate-300 dark:text-zinc-600 mb-2" />
            <p className="text-slate-600 dark:text-zinc-400 font-semibold text-sm">{t("support_cases.empty")}</p>
          </div>
        ) : (
          filtered.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.25) }}
              className="group rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-2.5 shadow-xs hover:border-rose-500/60 dark:hover:border-rose-500/50 hover:shadow-md transition-all duration-150"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
                {/* Case & Issue */}
                <div className="col-span-1 sm:col-span-2 lg:col-span-4 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {c.case_type && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.2 rounded border ${TYPE_COLORS[c.case_type] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {c.case_type === "Bug" ? <Bug className="w-2.5 h-2.5" /> : <Lightbulb className="w-2.5 h-2.5" />}
                        {c.case_type}
                      </span>
                    )}
                    <span className="text-xs font-mono text-slate-400">{c.case_number || `#${c.id}`}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate" title={c.subject}>
                    {c.subject}
                  </p>
                  {c.description && <p className="text-xs text-slate-500 dark:text-zinc-400 truncate mt-0.5">{c.description}</p>}
                </div>

                {/* Client & URL */}
                <div className="col-span-1 lg:col-span-3 min-w-0">
                  {c.client_name ? (
                    <p className="text-xs font-medium text-slate-800 dark:text-zinc-200 truncate">
                      {c.client_name}
                    </p>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Internal Issue</span>
                  )}
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate max-w-full mt-0.5"
                    >
                      <Globe className="w-3 h-3 shrink-0" />
                      <span className="truncate">{c.url.replace(/^https?:\/\//, '')}</span>
                    </a>
                  )}
                </div>

                {/* Assignee & Date */}
                <div className="col-span-1 lg:col-span-2 min-w-0">
                  {c.assignee_name ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200/60 dark:border-emerald-800/40 truncate max-w-[130px]">
                      <UserCheck className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{c.assignee_name}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200/60 dark:border-amber-800/40">
                      Unassigned
                    </span>
                  )}
                  <p className="text-[10.5px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <Clock className="w-2.5 h-2.5 shrink-0" />
                    <span>{new Date(c.created_at).toLocaleDateString()}</span>
                  </p>
                </div>

                {/* Status & Priority */}
                <div className="col-span-1 lg:col-span-2 flex items-center gap-1.5">
                  <span className={`inline-flex items-center text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shadow-xs whitespace-nowrap ${STATUS_COLORS[c.status] || STATUS_COLORS.Open}`}>
                    {c.status}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 whitespace-nowrap ${PRIORITY_COLORS[c.priority] || "text-slate-500"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[c.priority] || "bg-slate-400"}`} />
                    {c.priority}
                  </span>
                </div>

                {/* Actions */}
                <div className="col-span-1 sm:col-span-2 lg:col-span-1 flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => openEdit(c)}
                    title="Edit Case"
                    className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors shadow-xs"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      title="Delete Case"
                      className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 dark:hover:bg-rose-900/30 text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Edit / New Case Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-lg p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-zinc-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editCase ? t("support_cases.modal_edit") : t("support_cases.modal_new")}</h2>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition"><X className="w-4 h-4" /></button>
              </div>

              <div className="space-y-3.5">
                {/* Case Type */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-zinc-300 uppercase tracking-wider mb-1.5 block">Case Type *</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {CASE_TYPES.map(type => (
                      <button key={type} type="button"
                        onClick={() => setForm(f => ({ ...f, case_type: type }))}
                        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all ${form.case_type === type
                          ? type === "Bug" ? "border-red-500 bg-red-50 dark:bg-red-500/10 text-red-600 shadow-xs" : "border-violet-500 bg-violet-50 dark:bg-violet-500/10 text-violet-600 shadow-xs"
                          : "border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:border-slate-300"}`}>
                        {type === "Bug" ? <Bug className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* URL */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-zinc-300 mb-1 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-slate-400" /> Related URL</label>
                  <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                    placeholder="https://example.com/page-with-issue"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 transition-all" />
                </div>

                {/* Subject */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-zinc-300 mb-1 block">Subject *</label>
                  <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="Brief title of the issue"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 transition-all" />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-zinc-300 mb-1 block">Describe the Problem *</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
                    placeholder={form.case_type === "Bug" ? "Steps to reproduce, expected vs actual behavior..." : "Describe the feature you'd like to see and why it matters..."}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 transition-all resize-none" />
                </div>

                {/* Status & Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-zinc-300 mb-1 block">{t("support_cases.field_status")}</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs sm:text-sm focus:outline-none focus:border-rose-500">
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-zinc-300 mb-1 block">{t("support_cases.field_priority")}</label>
                    <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs sm:text-sm focus:outline-none focus:border-rose-500">
                      {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-zinc-300 mb-1 block">Assign To</label>
                  <select value={(form as any).assigned_to || ""} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value } as any))} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs sm:text-sm focus:outline-none focus:border-rose-500">
                    <option value="">Unassigned</option>
                    {users.filter(u => ["Admin", "Employee", "SalesManager", "ProjectMember", "Intern", "Developer"].includes(u.role)).map(u => <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-2.5 mt-5">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 font-semibold text-xs sm:text-sm hover:bg-slate-200 transition-all">{t("support_cases.btn_cancel")}</button>
                <button onClick={handleSave} disabled={saving || !form.subject.trim()}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 text-white font-semibold text-xs sm:text-sm hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-xs">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{editCase ? t("support_cases.btn_update") : t("support_cases.btn_create")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
