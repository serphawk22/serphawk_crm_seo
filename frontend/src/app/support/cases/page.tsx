"use client";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HeadphonesIcon, Plus, X, Search, Filter, Loader2, Trash2, Edit2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { API_BASE_URL } from "@/config";

interface Case { id: number; case_number?: string; subject: string; description?: string; status: string; priority: string; category?: string; client_name?: string; lead_name?: string; assignee_name?: string; created_at: string; resolved_at?: string; }
const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const STATUS_COLORS: Record<string, string> = { Open: "bg-blue-500/10 text-blue-600", "In Progress": "bg-amber-500/10 text-amber-600", Resolved: "bg-emerald-500/10 text-emerald-600", Closed: "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400" };
const PRIORITY_COLORS: Record<string, string> = { Low: "text-slate-500", Medium: "text-amber-600", High: "text-orange-600", Urgent: "text-red-600" };
const PRIORITY_DOT: Record<string, string> = { Low: "bg-slate-400", Medium: "bg-amber-500", High: "bg-orange-500", Urgent: "bg-red-500" };

export default function CasesPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editCase, setEditCase] = useState<Case | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", status: "Open", priority: "Medium", category: "" });

  const load = () => { setLoading(true); fetch(`${API_BASE_URL}/cases`).then(r => r.json()).then(d => setCases(Array.isArray(d.cases) ? d.cases : [])).finally(() => setLoading(false)); };
  useEffect(load, []);

  const filtered = useMemo(() => cases.filter(c => {
    const s = search.toLowerCase();
    return (!s || c.subject.toLowerCase().includes(s) || (c.case_number || "").toLowerCase().includes(s) || (c.client_name || "").toLowerCase().includes(s))
      && (statusFilter === "All" || c.status === statusFilter)
      && (priorityFilter === "All" || c.priority === priorityFilter);
  }), [cases, search, statusFilter, priorityFilter]);

  const openCreate = () => { setEditCase(null); setForm({ subject: "", description: "", status: "Open", priority: "Medium", category: "" }); setShowModal(true); };
  const openEdit = (c: Case) => { setEditCase(c); setForm({ subject: c.subject, description: c.description || "", status: c.status, priority: c.priority, category: c.category || "" }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.subject.trim()) return;
    setSaving(true);
    const url = editCase ? `${API_BASE_URL}/cases/${editCase.id}` : `${API_BASE_URL}/cases`;
    const method = editCase ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false); setShowModal(false); load();
  };
  const handleDelete = async (id: number) => { if (!confirm("Delete case?")) return; await fetch(`${API_BASE_URL}/cases/${id}`, { method: "DELETE" }); load(); };

  const openCount = cases.filter(c => c.status === "Open").length;
  const resolvedCount = cases.filter(c => c.status === "Resolved" || c.status === "Closed").length;
  const urgentCount = cases.filter(c => c.priority === "Urgent" && c.status === "Open").length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg shadow-rose-500/20"><HeadphonesIcon className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-black text-slate-800 dark:text-zinc-100">Support Cases</h1><p className="text-sm text-slate-500 dark:text-zinc-400">Manage client support tickets and cases</p></div>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 text-white text-sm font-bold hover:opacity-90 shadow-md transition-all">
          <Plus className="w-4 h-4" /> New Case
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Cases", value: cases.length, icon: HeadphonesIcon, c: "text-rose-500", bg: "bg-rose-500/10" },
          { label: "Open", value: openCount, icon: AlertCircle, c: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "Resolved", value: resolvedCount, icon: CheckCircle2, c: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: "Urgent Open", value: urgentCount, icon: AlertCircle, c: "text-red-500", bg: "bg-red-500/10" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mb-2`}><s.icon className={`w-4 h-4 ${s.c}`} /></div>
            <p className="text-2xl font-black text-slate-800 dark:text-zinc-100">{loading ? "—" : s.value}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cases, clients..." className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["All", ...STATUSES].map(s => <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === s ? "bg-rose-500 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"}`}>{s}</button>)}
        </div>
        <div className="flex gap-2 flex-wrap">
          {["All", ...PRIORITIES].map(p => <button key={p} onClick={() => setPriorityFilter(p)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${priorityFilter === p ? "bg-slate-700 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"}`}>{p}</button>)}
        </div>
      </div>

      <div className="space-y-3">
        {loading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-rose-500 w-8 h-8" /></div>
          : filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-700"><HeadphonesIcon className="w-10 h-10 text-slate-300 mb-3" /><p className="text-slate-500 font-bold">No cases found</p></div>
          : filtered.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-slate-400">{c.case_number}</span>
                  <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-lg ${STATUS_COLORS[c.status]}`}>{c.status}</span>
                  <span className={`flex items-center gap-1 text-[10px] font-black uppercase ${PRIORITY_COLORS[c.priority]}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[c.priority]}`} />{c.priority}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-800 dark:text-zinc-100 mb-1">{c.subject}</p>
                {c.description && <p className="text-xs text-slate-500 line-clamp-2">{c.description}</p>}
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                  {c.client_name && <span>Client: {c.client_name}</span>}
                  {c.assignee_name && <span>Assigned: {c.assignee_name}</span>}
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 hover:bg-slate-200"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-black text-slate-800 dark:text-zinc-100">{editCase ? "Edit Case" : "New Case"}</h2><button onClick={() => setShowModal(false)}><X className="w-4 h-4" /></button></div>
              <div className="space-y-4">
                <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Subject *</label>
                  <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Brief description of the issue" className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
                </div>
                <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Description</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Full details..." className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500">
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Priority</label>
                    <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500">
                      {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-all">Cancel</button>
                <button onClick={handleSave} disabled={saving || !form.subject.trim()} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}{editCase ? "Update" : "Create Case"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
