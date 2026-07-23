"use client";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Plus, X, Search, Loader2, Trash2, Building2 } from "lucide-react";
import { API_BASE_URL } from "@/config";

interface SalesOrder { id: number; order_number?: string; status: string; grand_total: number; currency: string; client_name?: string; delivery_date?: string; created_at: string; }
interface Lead { id: number; company_name: string; email?: string; }
const STATUSES = ["Pending", "Processing", "Fulfilled", "Cancelled"];
const STATUS_COLORS: Record<string, string> = { Pending: "bg-amber-500/10 text-amber-600", Processing: "bg-blue-500/10 text-blue-600", Fulfilled: "bg-emerald-500/10 text-emerald-600", Cancelled: "bg-red-500/10 text-red-500" };

export default function SalesOrdersPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ linked_to: "lead" as "lead" | "client", lead_id: "" as string | number, client_id: "" as string | number, status: "Pending", grand_total: "", currency: "USD", delivery_date: "", notes: "" });
  const [clients, setClients] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => { 
    setLoading(true); 
    Promise.all([
      fetch(`${API_BASE_URL}/sales-orders`).then(r => r.json()),
      fetch(`${API_BASE_URL}/leads`).then(r => r.json()),
      fetch(`${API_BASE_URL}/clients?per_page=1000`).then(r => r.json()),
    ]).then(([od, ld, cd]) => {
      setOrders(Array.isArray(od.orders) ? od.orders : []);
      setLeads(Array.isArray(ld.leads) ? ld.leads : []);
      setClients(Array.isArray(cd.clients) ? cd.clients : []);
      setError(null);
    }).catch(e => {
      console.error(e);
      setError("Failed to load data. Please refresh.");
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => orders.filter(o => {
    const s = search.toLowerCase();
    return (!s || (o.order_number || "").toLowerCase().includes(s) || (o.client_name || "").toLowerCase().includes(s))
      && (statusFilter === "All" || o.status === statusFilter);
  }), [orders, search, statusFilter]);

  const handleSave = async () => {
    if (form.linked_to === "lead" && !form.lead_id) { alert("Please select a lead first"); return; }
    if (form.linked_to === "client" && !form.client_id) { alert("Please select a client first"); return; }
    setSaving(true);
    const payload: any = { ...form, grand_total: parseFloat(form.grand_total as string) || 0 };
    if (form.linked_to === "lead") payload.lead_id = Number(form.lead_id);
    if (form.linked_to === "client") payload.client_id = Number(form.client_id);
    await fetch(`${API_BASE_URL}/sales-orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false); setShowModal(false); load();
  };
  const handleDelete = async (id: number) => { if (!confirm("Delete order?")) return; await fetch(`${API_BASE_URL}/sales-orders/${id}`, { method: "DELETE" }); load(); };
  const handleStatus = async (o: SalesOrder, status: string) => {
    await fetch(`${API_BASE_URL}/sales-orders/${o.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...o, status }) });
    load();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/20"><ShoppingCart className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-black text-slate-800 dark:text-zinc-100">Sales Orders</h1><p className="text-sm text-slate-500 dark:text-zinc-400">Track confirmed orders and fulfillment</p></div>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold hover:opacity-90 shadow-md transition-all">
          <Plus className="w-4 h-4" /> New Order
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Orders", value: orders.length, c: "text-blue-500" },
          { label: "Pending", value: orders.filter(o => o.status === "Pending").length, c: "text-amber-500" },
          { label: "Fulfilled", value: orders.filter(o => o.status === "Fulfilled").length, c: "text-emerald-500" },
          { label: "Total Revenue", value: `$${orders.filter(o => o.status === "Fulfilled").reduce((s, o) => s + o.grand_total, 0).toFixed(0)}`, c: "text-indigo-500" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm">
            <p className="text-2xl font-black text-slate-800 dark:text-zinc-100">{loading ? "—" : s.value}</p>
            <p className={`text-xs font-medium mt-0.5 ${s.c}`}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders..." className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-2">{["All", ...STATUSES].map(s => <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"}`}>{s}</button>)}</div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[auto_2fr_1fr_1fr_1fr_auto] gap-4 px-6 py-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50">
          {["Order #", "Client", "Amount", "Delivery", "Status", ""].map(h => <p key={h} className="text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</p>)}
        </div>
        {loading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500 w-8 h-8" /></div>
          : filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-20"><ShoppingCart className="w-10 h-10 text-slate-300 mb-3" /><p className="text-slate-500 font-bold">No sales orders yet</p></div>
          : filtered.map((o, i) => (
          <motion.div key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            className="grid grid-cols-1 md:grid-cols-[auto_2fr_1fr_1fr_1fr_auto] gap-3 md:gap-4 items-center px-6 py-4 border-b border-slate-100 dark:border-zinc-800 last:border-0 hover:bg-slate-50 dark:hover:bg-zinc-800/40 group transition-colors">
            <span className="text-xs font-mono text-slate-400">{o.order_number}</span>
            <span className="text-sm font-bold text-slate-800 dark:text-zinc-100">{o.client_name || "—"}</span>
            <span className="text-sm font-black text-slate-800 dark:text-zinc-100">{o.currency} {o.grand_total.toFixed(2)}</span>
            <span className="text-xs text-slate-500">{o.delivery_date || "—"}</span>
            <select value={o.status} onChange={e => handleStatus(o, e.target.value)} className={`text-xs font-bold px-2 py-1 rounded-lg border-0 outline-none cursor-pointer ${STATUS_COLORS[o.status]}`}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <button onClick={() => handleDelete(o.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200 dark:border-zinc-700">
                <h2 className="text-lg font-black text-slate-800 dark:text-zinc-100">New Sales Order</h2>
                <button onClick={() => setShowModal(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                {/* Lead / Client Selector — required */}
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/40">
                  <p className="text-xs font-black text-blue-700 dark:text-blue-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" /> Who is this order for? *
                  </p>
                  <div className="flex gap-2 mb-3">
                    {(["lead", "client"] as const).map(type => (
                      <button key={type} onClick={() => setForm(f => ({ ...f, linked_to: type, lead_id: "", client_id: "" }))}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all ${form.linked_to === type ? "bg-blue-600 text-white shadow" : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 hover:border-blue-400"}`}>
                        {type === "lead" ? "🎯 Lead" : "✅ Client"}
                      </button>
                    ))}
                  </div>
                  {error && <p className="text-xs text-red-500 font-bold mb-3">{error}</p>}
                  {form.linked_to === "lead" ? (
                    <select value={form.lead_id} onChange={e => setForm(f => ({ ...f, lead_id: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-blue-200 dark:border-blue-700/40 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
                      <option className="text-slate-900 dark:text-zinc-100" value="">Select a lead...</option>
                      {leads.map(l => <option className="text-slate-900 dark:text-zinc-100" key={l.id} value={l.id}>{l.company_name}{l.email ? ` — ${l.email}` : ""}</option>)}
                    </select>
                  ) : (
                    <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-blue-200 dark:border-blue-700/40 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
                      <option className="text-slate-900 dark:text-zinc-100" value="">Select a client...</option>
                      {clients.map(c => <option className="text-slate-900 dark:text-zinc-100" key={c.id} value={c.id}>{c.companyName || `Client #${c.id}`}</option>)}
                    </select>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Amount</label>
                    <input type="number" value={form.grand_total} onChange={e => setForm(f => ({ ...f, grand_total: e.target.value }))} placeholder="0.00" className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Delivery Date</label>
                    <input type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Order notes..." className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-all">Cancel</button>
                <button onClick={handleSave} disabled={saving || (form.linked_to === "lead" ? !form.lead_id : !form.client_id)} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-sm hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create Order
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
