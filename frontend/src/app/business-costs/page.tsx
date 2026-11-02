"use client";

import { useEffect, useState, useCallback } from "react";
import { IndianRupee, Plus, Trash2, RefreshCw, Search, SlidersHorizontal, CheckCircle2, X, AlertCircle, Receipt, Layers, Calendar, Repeat } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Currency = "INR" | "USD";
const EXCHANGE = 83.5;
const CATEGORIES = ["Salary", "Rent", "Marketing", "Software", "Operations", "Logistics", "Tax", "Misc", "Other"];

function fmt(amount: number, currency: Currency) {
  if (currency === "INR") return "\u20B9" + Math.round(amount).toLocaleString("en-IN");
  return "$" + Math.round(amount / EXCHANGE).toLocaleString("en-US");
}

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111111] p-6 shadow-2xl text-slate-900 dark:text-white" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-white"><X className="h-5 w-5" /></button>
        {children}
      </div>
    </div>
  );
}

const EMPTY_FORM = {
  title: "", category: "Other", amount: "", currency: "INR",
  cost_date: new Date().toISOString().slice(0, 7) + "-01",
  is_recurring: false, notes: "",
};

export default function BusinessCostsPage() {
  const { role, loading: roleLoading } = useRole();
  const router = useRouter();

  const [costs, setCosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState<Currency>("INR");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    if (!roleLoading && role !== "Admin" && role !== "SuperAdmin") router.replace("/");
  }, [role, roleLoading, router]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(API_BASE_URL + "/business-costs", { headers: token ? { Authorization: "Bearer " + token } : {} });
      if (res.ok) {
        const json = await res.json();
        setCosts(Array.isArray(json) ? json : json.costs || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.title || !form.amount) return showToast("Title and amount are required.", false);
    setSaving(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(API_BASE_URL + "/business-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      });
      if (res.ok) { showToast("Cost saved!"); setModalOpen(false); setForm(EMPTY_FORM); load(); }
      else { const e = await res.json(); showToast(e.detail ?? "Error saving.", false); }
    } catch { showToast("Network error.", false); }
    setSaving(false);
  };

  const del = async (id: number) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const res = await fetch(API_BASE_URL + "/business-costs/" + id, {
      method: "DELETE", headers: token ? { Authorization: "Bearer " + token } : {},
    });
    if (res.ok) { showToast("Cost deleted."); load(); } else showToast("Delete failed.", false);
    setDeleteId(null);
  };

  const filtered = costs.filter(c =>
    (!search || c.title?.toLowerCase().includes(search.toLowerCase())) &&
    (!catFilter || c.category === catFilter)
  );

  const total = filtered.reduce((s, c) => s + (c.amount || 0), 0);
  const recurringCount = filtered.filter(c => c.is_recurring).length;
  const maxCost = filtered.length ? Math.max(...filtered.map(c => c.amount || 0)) : 0;

  if (roleLoading) return null;
  if (role !== "Admin" && role !== "SuperAdmin") return null;

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={cn("fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-2xl transition-all",
          toast.ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white")}>
          {toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Compact Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none">Business Costs</h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                {costs.length} items
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Salaries, rent, software, and operational expenditures · Admin only
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Currency Toggle */}
          <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 p-0.5">
            {(["INR", "USD"] as Currency[]).map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className={cn("flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition-all",
                  currency === c ? "bg-white dark:bg-white/10 text-indigo-600 dark:text-indigo-300 shadow-xs" : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white")}>
                {c === "INR" ? "₹ INR" : "$ USD"}
              </button>
            ))}
          </div>

          <button onClick={() => { setForm(EMPTY_FORM); setModalOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs shadow-xs transition">
            <Plus className="w-3.5 h-3.5" /> <span>Add Cost</span>
          </button>
        </div>
      </div>

      {/* 4-KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Total Expenses</p>
            <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight mt-0.5 font-mono">{fmt(total, currency)}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Receipt className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Total Entries</p>
            <p className="text-base sm:text-lg font-bold text-indigo-600 dark:text-indigo-400 leading-tight mt-0.5">{filtered.length}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Layers className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Recurring Costs</p>
            <p className="text-base sm:text-lg font-bold text-violet-600 dark:text-violet-400 leading-tight mt-0.5">{recurringCount}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
            <Repeat className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Largest Expense</p>
            <p className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400 leading-tight mt-0.5 font-mono">{fmt(maxCost, currency)}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Calendar className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white dark:bg-[#111111]/90 p-2 sm:px-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-2 flex-1 px-2">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by cost title..."
            className="w-full bg-transparent text-xs text-slate-800 dark:text-zinc-200 outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200/80 dark:border-white/10">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-700 dark:text-zinc-300 outline-none cursor-pointer font-medium"
            >
              <option value="" className="dark:bg-zinc-900">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c} className="dark:bg-zinc-900">{c}</option>)}
            </select>
          </div>

          <button onClick={load} disabled={loading}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300 transition-colors">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-indigo-500")} />
          </button>
        </div>
      </div>

      {/* Costs Table / Card Container */}
      <div className="bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 border-b border-slate-200/80 dark:border-white/10">
              <tr>
                <th className="px-4 py-2.5">Title</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Amount</th>
                <th className="px-4 py-2.5">Month</th>
                <th className="px-4 py-2.5">Recurring</th>
                <th className="px-4 py-2.5">Notes</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filtered.length ? filtered.map((c: any) => (
                <tr key={c.id} className="group hover:bg-slate-50/60 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-slate-900 dark:text-white">{c.title}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                      {c.category ?? "Other"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(c.amount, currency)}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-zinc-400">{(c.cost_date ?? "").slice(0, 7)}</td>
                  <td className="px-4 py-2.5">
                    {c.is_recurring ? (
                      <span className="rounded-full bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
                        Monthly
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">One-off</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-zinc-400 max-w-[200px] truncate">{c.notes ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {deleteId === c.id ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => del(c.id)} className="rounded-md bg-rose-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-rose-500 shadow-xs">
                          Confirm
                        </button>
                        <button onClick={() => setDeleteId(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-[11px] px-1">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteId(c.id)} className="opacity-70 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-all p-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-xs text-slate-400 dark:text-zinc-500">
                    No costs found. Click &quot;Add Cost&quot; to log a business expense.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Cost Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <h2 className="mb-4 text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Receipt className="w-4 h-4 text-indigo-600" /> Add Business Cost
        </h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Title *</label>
            <input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Office Rent — Oct"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 placeholder:text-slate-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Category</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
              >
                {CATEGORIES.map(c => <option key={c} value={c} className="dark:bg-zinc-900">{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Currency</label>
              <select
                value={form.currency}
                onChange={e => setForm({ ...form, currency: e.target.value })}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
              >
                <option value="INR" className="dark:bg-zinc-900">INR (₹)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Amount *</label>
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Month</label>
              <input
                type="month"
                value={form.cost_date?.slice(0, 7)}
                onChange={e => setForm({ ...form, cost_date: e.target.value + "-01" })}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Optional notes..."
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 resize-none placeholder:text-slate-400"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 pt-1">
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={e => setForm({ ...form, is_recurring: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">Recurring monthly cost</span>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 shadow-xs">
            {saving ? "Saving…" : "Save Cost"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
