"use client";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Plus, X, Search, Filter, Edit2, Trash2, Loader2, DollarSign, Send, CheckCircle, XCircle } from "lucide-react";
import { API_BASE_URL } from "@/config";

interface Quote { id: number; quote_number?: string; title: string; status: string; grand_total: number; currency: string; lead_name?: string; client_name?: string; valid_until?: string; created_at: string; }
const STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];
const STATUS_COLORS: Record<string, string> = { Draft: "bg-slate-100 text-slate-500", Sent: "bg-blue-500/10 text-blue-500", Accepted: "bg-emerald-500/10 text-emerald-600", Rejected: "bg-red-500/10 text-red-500", Expired: "bg-amber-500/10 text-amber-500" };

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", status: "Draft", currency: "USD", valid_until: "", notes: "" });

  const load = () => { setLoading(true); fetch(`${API_BASE_URL}/quotes`).then(r => r.json()).then(d => setQuotes(Array.isArray(d.quotes) ? d.quotes : [])).finally(() => setLoading(false)); };
  useEffect(load, []);

  const filtered = useMemo(() => quotes.filter(q => {
    const s = search.toLowerCase();
    const ms = !s || q.title.toLowerCase().includes(s) || (q.quote_number || "").toLowerCase().includes(s) || (q.client_name || "").toLowerCase().includes(s);
    return ms && (statusFilter === "All" || q.status === statusFilter);
  }), [quotes, search, statusFilter]);

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await fetch(`${API_BASE_URL}/quotes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false); setShowModal(false); setForm({ title: "", status: "Draft", currency: "USD", valid_until: "", notes: "" }); load();
  };
  const handleDelete = async (id: number) => { if (!confirm("Delete quote?")) return; await fetch(`${API_BASE_URL}/quotes/${id}`, { method: "DELETE" }); load(); };
  const handleStatus = async (q: Quote, status: string) => {
    await fetch(`${API_BASE_URL}/quotes/${q.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...q, status }) });
    load();
  };

  const totalValue = filtered.reduce((s, q) => s + q.grand_total, 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20"><FileText className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-black text-slate-800 dark:text-zinc-100">Quotes</h1><p className="text-sm text-slate-500 dark:text-zinc-400">Create and manage sales quotes</p></div>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-bold hover:opacity-90 shadow-md transition-all">
          <Plus className="w-4 h-4" /> New Quote
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Quotes", value: quotes.length, c: "text-amber-500" },
          { label: "Draft", value: quotes.filter(q => q.status === "Draft").length, c: "text-slate-500" },
          { label: "Accepted", value: quotes.filter(q => q.status === "Accepted").length, c: "text-emerald-500" },
          { label: "Total Value", value: `$${filtered.reduce((s,q) => s+q.grand_total,0).toFixed(0)}`, c: "text-orange-500" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm">
            <p className="text-2xl font-black text-slate-800 dark:text-zinc-100">{loading ? "—" : s.value}</p>
            <p className={`text-xs font-medium mt-0.5 ${s.c}`}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quotes..." className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div className="flex gap-2 flex-wrap">{["All", ...STATUSES].map(s => <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === s ? "bg-amber-500 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"}`}>{s}</button>)}</div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[auto_2fr_1fr_1fr_1fr_auto] gap-4 px-6 py-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50">
          {["#", "Title", "Client / Lead", "Amount", "Status", ""].map(h => <p key={h} className="text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</p>)}
        </div>
        {loading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-500 w-8 h-8" /></div>
          : filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-20"><FileText className="w-10 h-10 text-slate-300 mb-3" /><p className="text-slate-500 font-bold">No quotes yet</p></div>
          : filtered.map((q, i) => (
          <motion.div key={q.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            className="grid grid-cols-1 md:grid-cols-[auto_2fr_1fr_1fr_1fr_auto] gap-3 md:gap-4 items-center px-6 py-4 border-b border-slate-100 dark:border-zinc-800 last:border-0 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors group">
            <span className="text-xs font-mono text-slate-400">{q.quote_number}</span>
            <p className="text-sm font-bold text-slate-800 dark:text-zinc-100">{q.title}</p>
            <span className="text-xs text-slate-500">{q.client_name || q.lead_name || "—"}</span>
            <span className="text-sm font-black text-slate-800 dark:text-zinc-100">{q.currency} {q.grand_total.toFixed(2)}</span>
            <select value={q.status} onChange={e => handleStatus(q, e.target.value)}
              className={`text-xs font-bold px-2 py-1 rounded-lg border-0 outline-none cursor-pointer ${STATUS_COLORS[q.status]}`}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <button onClick={() => handleDelete(q.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-black text-slate-800 dark:text-zinc-100">New Quote</h2><button onClick={() => setShowModal(false)}><X className="w-4 h-4" /></button></div>
              <div className="space-y-4">
                <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Title *</label>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. SEO Package Q3 2026"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Valid Until</label>
                    <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                </div>
                <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Terms, conditions..."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-all">Cancel</button>
                <button onClick={handleSave} disabled={saving || !form.title.trim()} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create Quote
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
