"use client";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, X, Search, Loader2, Trash2, Building2,
  ShoppingCart, Package, Minus, CheckCircle, IndianRupee,
  BadgeDollarSign, User2, Download, Eye
} from "lucide-react";
import { API_BASE_URL } from "@/config";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Quote {
  id: number; quote_number?: string; title: string; status: string;
  grand_total: number; currency: string; lead_name?: string;
  client_name?: string; valid_until?: string; created_at: string;
}
interface Lead   { id: number; company_name?: string; contact_name?: string; email?: string; }
interface Client { id: number; companyName?: string; }
interface CatalogItem {
  id: number; name: string; sku: string; category: string;
  unit_price: number; description?: string;
}
interface CartItem { product_id: number; product_name: string; quantity: number; unit_price: number; unit: string; provider: string; }

const STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];
const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400",
  Sent: "bg-blue-500/10 text-blue-600",
  Accepted: "bg-emerald-500/10 text-emerald-600",
  Rejected: "bg-red-500/10 text-red-500",
  Expired: "bg-amber-500/10 text-amber-600",
};

const INR_RATE = 4.5;
function currSymbol(c: string) { return c === "INR" ? "₹" : "$"; }
function fmtMoney(v: number, c: string) {
  return `${currSymbol(c)}${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Modal state type ─────────────────────────────────────────────────────────
type ModalStep = "form" | "cart";

export default function QuotesPage() {
  // List state
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("form");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingQuote, setDownloadingQuote] = useState<Quote | null>(null);
  const [downloadAction, setDownloadAction] = useState<'preview' | 'download'>('download');

  // Form
  const [form, setForm] = useState({
    title: "", status: "Draft", currency: "MXN",
    valid_until: "", notes: "",
    linked_to: "lead" as "lead" | "client" | "none",
    lead_id: "" as string | number,
    client_id: "" as string | number,
  });

  // Dropdown data (lazy)
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [modalDataLoaded, setModalDataLoaded] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("All");

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadQuotes = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/quotes`)
      .then(r => r.json())
      .then(d => setQuotes(Array.isArray(d.quotes) ? d.quotes : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadQuotes, []);

  async function loadModalData() {
    if (modalDataLoaded) return;
    setModalLoading(true);
    try {
      const [ld, cd, cat] = await Promise.all([
        fetch(`${API_BASE_URL}/leads`).then(r => r.json()),
        fetch(`${API_BASE_URL}/clients?per_page=500`).then(r => r.json()),
        fetch(`${API_BASE_URL}/products?active_only=true`).then(r => r.json()),
      ]);
      setLeads(Array.isArray(ld.leads) ? ld.leads : []);
      setClients(Array.isArray(cd.clients) ? cd.clients : []);
      setCatalog(Array.isArray(cat.products) ? cat.products : []);
      setModalDataLoaded(true);
    } catch (e) {
      console.error(e);
    } finally {
      setModalLoading(false);
    }
  }

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const cartTotal = useMemo(
    () => cart.reduce((s, i) => s + i.quantity * i.unit_price, 0),
    [cart]
  );

  function addToCart(item: CatalogItem) {
    const price = form.currency === "INR" ? item.unit_price * INR_RATE : item.unit_price;
    setCart(prev => {
      const idx = prev.findIndex(c => c.product_id === item.id);
      if (idx >= 0) {
        return prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { product_id: item.id, product_name: item.name, quantity: 1, unit_price: price, unit: "ea", provider: item.sku || "Custom" }];
    });
  }

  function removeFromCart(idx: number) { setCart(p => p.filter((_, i) => i !== idx)); }
  function updateQty(idx: number, qty: number) {
    if (qty <= 0) { removeFromCart(idx); return; }
    setCart(p => p.map((c, i) => i === idx ? { ...c, quantity: qty } : c));
  }
  function updatePrice(idx: number, price: number) {
    setCart(p => p.map((c, i) => i === idx ? { ...c, unit_price: price } : c));
  }

  function switchCurrency(newC: string) {
    if (newC === form.currency) return;
    setForm(f => ({ ...f, currency: newC }));
    setCart(prev => prev.map(c => ({
      ...c,
      unit_price: newC === "INR" ? c.unit_price * INR_RATE : c.unit_price / INR_RATE,
    })));
  }

  // ── Modal open/close ──────────────────────────────────────────────────────
  const openCreate = () => {
    setForm({ title: "", status: "Draft", currency: "MXN", valid_until: "", notes: "", linked_to: "lead", lead_id: "", client_id: "" });
    setCart([]);
    setCatalogSearch("");
    setCatalogCategory("All");
    setModalStep("form");
    setShowModal(true);
    loadModalData();
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const canSave = () => {
    if (!form.title.trim() && cart.length === 0) return false;
    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const title = form.title.trim() || `Quote – ${new Date().toLocaleDateString("en-IN")}`;
    const grandTotal = cartTotal;
    const payload: any = {
      title,
      status: form.status,
      currency: form.currency,
      valid_until: form.valid_until || null,
      notes: form.notes || null,
      grand_total: grandTotal,
      items: cart.map(c => ({ description: c.product_name, quantity: c.quantity, unit_price: c.unit_price, provider: c.provider })),
    };
    if (form.linked_to === "lead" && form.lead_id)   payload.lead_id   = Number(form.lead_id);
    if (form.linked_to === "client" && form.client_id) payload.client_id = Number(form.client_id);

    try {
      await fetch(`${API_BASE_URL}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setShowModal(false);
      loadQuotes();
    } catch (e) {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete quote?")) return;
    await fetch(`${API_BASE_URL}/quotes/${id}`, { method: "DELETE" });
    setQuotes(prev => prev.filter(q => q.id !== id));
  };

  const handleStatus = async (q: Quote, status: string) => {
    await fetch(`${API_BASE_URL}/quotes/${q.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: q.title, status }),
    });
    setQuotes(prev => prev.map(qt => qt.id === q.id ? { ...qt, status } : qt));
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => quotes.filter(q => {
    const s = search.toLowerCase();
    return (!s || q.title.toLowerCase().includes(s) || (q.quote_number || "").toLowerCase().includes(s) || (q.client_name || q.lead_name || "").toLowerCase().includes(s))
      && (statusFilter === "All" || q.status === statusFilter);
  }), [quotes, search, statusFilter]);

  const categories = ["All", ...Array.from(new Set(catalog.map(i => i.category)))];
  const filteredCatalog = catalog.filter(item => {
    const matchCat = catalogCategory === "All" || item.category === catalogCategory;
    const matchQ   = !catalogSearch || item.name.toLowerCase().includes(catalogSearch.toLowerCase()) || (item.sku || "").toLowerCase().includes(catalogSearch.toLowerCase());
    return matchCat && matchQ;
  });

  // ── Recipient label ───────────────────────────────────────────────────────
  function recipientLabel() {
    if (form.linked_to === "lead") {
      const l = leads.find(l => l.id === Number(form.lead_id));
      return l ? (l.company_name || l.contact_name || "Lead") : "";
    }
    if (form.linked_to === "client") {
      const c = clients.find(c => c.id === Number(form.client_id));
      return c?.companyName || "";
    }
    return "";
  }

  function handleDownloadSelect(provider: 'SERP_HAWK' | 'DAPROS') {
    if (downloadingQuote) {
      const qs = downloadAction === 'download' ? '&download=true' : '';
      window.open(`${API_BASE_URL}/quotes/${downloadingQuote.id}/pdf?provider=${provider}${qs}`, '_blank');
      setDownloadingQuote(null);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-zinc-950 p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100">Quotes</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400">Create and send quotes to leads or clients</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold hover:opacity-90 shadow-md transition-all active:scale-95">
          <Plus className="w-4 h-4" /> New Quote
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Quotes", value: quotes.length, c: "text-amber-600" },
          { label: "Draft",        value: quotes.filter(q => q.status === "Draft").length, c: "text-slate-600" },
          { label: "Accepted",     value: quotes.filter(q => q.status === "Accepted").length, c: "text-emerald-600" },
          { label: "Total Value",  value: `$${filtered.reduce((s, q) => s + (q.grand_total || 0), 0).toFixed(0)}`, c: "text-orange-600" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm">
            <p className={`text-2xl font-black ${s.c}`}>{loading ? "—" : s.value}</p>
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quotes..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["All", ...STATUSES].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${statusFilter === s ? "bg-amber-500 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[auto_2fr_1.5fr_1fr_1fr_auto] gap-4 px-6 py-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50">
          {["#", "Title", "Lead / Client", "Amount", "Status", ""].map(h => (
            <p key={h} className="text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</p>
          ))}
        </div>
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-500 w-8 h-8" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <FileText className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-bold">No quotes yet</p>
            <button onClick={openCreate} className="mt-3 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-all">
              Create first quote
            </button>
          </div>
        ) : filtered.map((q, i) => (
          <motion.div key={q.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            className="grid grid-cols-1 md:grid-cols-[auto_2fr_1.5fr_1fr_1fr_auto] gap-3 md:gap-4 items-center px-6 py-4 border-b border-slate-100 dark:border-zinc-800 last:border-0 hover:bg-slate-50 dark:hover:bg-zinc-800/40 group transition-colors">
            <span className="text-xs font-mono text-slate-400">{q.quote_number || `#${q.id}`}</span>
            <p className="text-sm font-semibold text-slate-800 dark:text-zinc-100">{q.title}</p>
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-xs text-slate-600 dark:text-zinc-300 truncate">
                {q.client_name || q.lead_name || <span className="text-slate-400 italic">No contact</span>}
              </span>
            </div>
            <span className="text-sm font-black text-slate-800 dark:text-zinc-100">
              {currSymbol(q.currency || "MXN")}{(q.grand_total || 0).toFixed(2)}
            </span>
            <select value={q.status} onChange={e => handleStatus(q, e.target.value)}
              className={`text-xs font-bold px-2 py-1 rounded-lg border-0 outline-none cursor-pointer ${STATUS_COLORS[q.status] || STATUS_COLORS.Draft}`}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={() => { setDownloadingQuote(q); setDownloadAction('preview'); }} title="Preview PDF"
                className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setDownloadingQuote(q); setDownloadAction('download'); }} title="Download PDF"
                className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20">
                <Download className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDelete(q.id)} title="Delete Quote"
                className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CREATE MODAL                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
            <motion.div initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 16 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">

              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-700">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-zinc-100">New Quote</h2>
                  {/* Tab switcher */}
                  <div className="flex bg-slate-100 dark:bg-zinc-800 rounded-xl p-1 gap-1">
                    <button onClick={() => setModalStep("form")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${modalStep === "form" ? "bg-white dark:bg-zinc-700 shadow text-amber-600" : "text-slate-500 hover:text-slate-700"}`}>
                      📋 Details
                    </button>
                    <button onClick={() => setModalStep("cart")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${modalStep === "cart" ? "bg-white dark:bg-zinc-700 shadow text-amber-600" : "text-slate-500 hover:text-slate-700"}`}>
                      <ShoppingCart className="w-3.5 h-3.5" />
                      Products
                      {cart.length > 0 && (
                        <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{cart.length}</span>
                      )}
                    </button>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              {/* ── TAB: DETAILS ─────────────────────────────────────────── */}
              {modalStep === "form" && (
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Currency toggle */}
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Currency</p>
                    <div className="flex bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl gap-1">
                      {[
                        { code: "MXN", icon: BadgeDollarSign, label: "MXN ($)" },
                        { code: "INR", icon: IndianRupee,     label: "INR (₹)" },
                      ].map(c => (
                        <button key={c.code} onClick={() => switchCurrency(c.code)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${form.currency === c.code ? "bg-white dark:bg-zinc-700 shadow text-amber-600" : "text-slate-500"}`}>
                          <c.icon className="w-3.5 h-3.5" />{c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* WHO IS THIS FOR */}
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40">
                    <p className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" /> Who is this quote for?
                    </p>
                    <div className="flex gap-2 mb-3">
                      {(["lead", "client", "none"] as const).map(type => (
                        <button key={type} onClick={() => setForm(f => ({ ...f, linked_to: type, lead_id: "", client_id: "" }))}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all ${form.linked_to === type ? "bg-amber-500 text-white shadow" : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 hover:border-amber-400"}`}>
                          {type === "none" ? "🚫 None" : type === "lead" ? "🎯 Lead" : "✅ Client"}
                        </button>
                      ))}
                    </div>

                    {modalLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                      </div>
                    ) : form.linked_to === "lead" ? (
                      <>
                        <select value={form.lead_id}
                          onChange={e => setForm(f => ({ ...f, lead_id: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500">
                          <option value="">— Select a lead —</option>
                          {leads.map(l => (
                            <option key={l.id} value={l.id}>
                              {l.company_name || l.contact_name || `Lead #${l.id}`}{l.email ? ` — ${l.email}` : ""}
                            </option>
                          ))}
                        </select>
                        {leads.length === 0 && (
                          <p className="text-xs text-amber-600 mt-1">No leads found in database.</p>
                        )}
                      </>
                    ) : form.linked_to === "client" ? (
                      <>
                        <select value={form.client_id}
                          onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500">
                          <option value="">— Select a client —</option>
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.companyName || `Client #${c.id}`}
                            </option>
                          ))}
                        </select>
                        {clients.length === 0 && (
                          <p className="text-xs text-amber-600 mt-1">No clients found in database.</p>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-amber-700 dark:text-amber-500">Standalone quote with no contact attached.</div>
                    )}
                  </div>

                  {/* Title */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">
                      Quote Title
                    </label>
                    <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder={`Quote for ${recipientLabel() || "client"} – ${new Date().toLocaleDateString("en-IN")}`}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Status</label>
                      <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500">
                        {STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Valid Until</label>
                      <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">Notes / Terms</label>
                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                      placeholder="Payment terms, scope notes..."
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
                  </div>

                  {/* Cart summary if items added */}
                  {cart.length > 0 && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/30 rounded-xl p-4">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                        <ShoppingCart className="w-3.5 h-3.5" /> {cart.length} product{cart.length !== 1 ? "s" : ""} in cart
                      </p>
                      <div className="space-y-1">
                        {cart.map((c, i) => (
                          <div key={i} className="flex justify-between text-xs text-emerald-800 dark:text-emerald-300">
                            <span>{c.product_name} ×{c.quantity}</span>
                            <span className="font-bold">{fmtMoney(c.quantity * c.unit_price, form.currency)}</span>
                          </div>
                        ))}
                        <div className="border-t border-emerald-200 dark:border-emerald-700/30 mt-2 pt-2 flex justify-between font-black text-emerald-800 dark:text-emerald-300 text-sm">
                          <span>Total</span>
                          <span>{fmtMoney(cartTotal, form.currency)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
                </div>
              )}

              {/* ── TAB: CATALOG / CART ──────────────────────────────────── */}
              {modalStep === "cart" && (
                <div className="flex-1 overflow-hidden flex">
                  {/* LEFT: Catalog list */}
                  <div className="flex-1 overflow-y-auto p-5">
                    {/* Search + category */}
                    <div className="flex gap-2 mb-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)}
                          placeholder="Search products…"
                          className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <select value={catalogCategory} onChange={e => setCatalogCategory(e.target.value)}
                        className="px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-700 dark:text-zinc-300 focus:outline-none">
                        {categories.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>

                    {modalLoading ? (
                      <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
                    ) : filteredCatalog.length === 0 ? (
                      <div className="flex flex-col items-center py-20 text-slate-400">
                        <Package className="w-12 h-12 mb-3 opacity-30" />
                        <p className="text-sm">No products found</p>
                        <p className="text-xs mt-1">Add products in the Inventory section first</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredCatalog.map(item => {
                          const inCart = cart.find(c => c.product_id === item.id);
                          const price  = form.currency === "INR" ? item.unit_price * INR_RATE : item.unit_price;
                          return (
                            <div key={item.id}
                              className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${
                                inCart
                                  ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20"
                                  : "border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-800/50 hover:border-amber-300"
                              }`}>
                              {/* Thumbnail */}
                              {item.photo_url ? (
                                <img src={item.photo_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-slate-100" />
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                                  <Package className="w-5 h-5 text-slate-300" />
                                </div>
                              )}
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">{item.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] bg-slate-100 dark:bg-zinc-700 text-slate-500 px-1.5 py-0.5 rounded">{item.category || "General"}</span>
                                  <span className="text-[10px] text-slate-400">{item.sku || "N/A"}</span>
                                </div>
                              </div>
                              {/* Price */}
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-bold text-amber-600">
                                  {price > 0 ? fmtMoney(price, form.currency) : "—"}
                                </p>
                                {inCart && (
                                  <p className="text-[10px] text-emerald-600 font-bold">×{inCart.quantity} in cart</p>
                                )}
                              </div>
                              {/* Add button */}
                              <button onClick={() => addToCart(item)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all font-bold text-sm ${
                                  inCart
                                    ? "bg-amber-500 text-white hover:bg-amber-600"
                                    : "bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-amber-500 hover:text-white"
                                }`}>
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* RIGHT: Cart */}
                  <div className="w-72 flex flex-col bg-slate-50 dark:bg-zinc-950 border-l border-slate-200 dark:border-zinc-800">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-amber-500" />
                      <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Cart ({cart.length})</p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {cart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                          <ShoppingCart className="w-8 h-8 mb-2 opacity-30" />
                          <p className="text-xs text-center">Click + on any product to add it</p>
                        </div>
                      ) : cart.map((item, idx) => (
                        <div key={idx} className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-slate-100 dark:border-zinc-800">
                          <div className="flex items-start justify-between gap-1 mb-2">
                            <p className="text-xs font-semibold text-slate-900 dark:text-zinc-100 leading-tight flex-1">{item.product_name}</p>
                            <button onClick={() => removeFromCart(idx)} className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {/* Qty controls */}
                          <div className="flex items-center gap-2 mb-2">
                            <button onClick={() => updateQty(idx, item.quantity - 1)}
                              className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700">
                              <Minus className="w-3 h-3 text-slate-600 dark:text-zinc-300" />
                            </button>
                            <span className="text-sm font-bold text-slate-900 dark:text-zinc-100 w-6 text-center">{item.quantity}</span>
                            <button onClick={() => updateQty(idx, item.quantity + 1)}
                              className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700">
                              <Plus className="w-3 h-3 text-slate-600 dark:text-zinc-300" />
                            </button>
                          </div>
                          {/* Price input */}
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-400">{currSymbol(form.currency)}</span>
                            <input type="number" value={item.unit_price} min={0} step={0.01}
                              onChange={e => updatePrice(idx, parseFloat(e.target.value) || 0)}
                              className="flex-1 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500" />
                          </div>
                          <p className="text-xs font-bold text-amber-600 mt-1.5 text-right">
                            {fmtMoney(item.quantity * item.unit_price, form.currency)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Cart total */}
                    <div className="p-4 border-t border-slate-200 dark:border-zinc-800">
                      <div className="flex justify-between items-center mb-3">
                        <p className="text-sm text-slate-500">Total</p>
                        <p className="text-xl font-black text-slate-900 dark:text-zinc-100">{fmtMoney(cartTotal, form.currency)}</p>
                      </div>
                      <button onClick={() => setModalStep("form")}
                        className="w-full py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition-colors">
                        ← Back to Details
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer actions */}
              <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900/50">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 font-semibold text-sm hover:bg-slate-100 transition-all">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-md">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "💾 Create Quote"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDF Download Provider Modal */}
      {downloadingQuote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-sm shadow-2xl p-6 relative overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <button onClick={() => setDownloadingQuote(null)} className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800/50 rounded-full transition-colors"><X className="w-5 h-5"/></button>
            <h3 className="text-xl font-black text-zinc-900 dark:text-white mb-2 tracking-tight">
              {downloadAction === 'preview' ? 'Preview Quote' : 'Download Quote'}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 font-medium">Select the agency provider format for this PDF.</p>
            <div className="space-y-3">
              <button onClick={() => handleDownloadSelect('SERP_HAWK')} className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-900/10 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all text-left group">
                <div>
                  <div className="font-bold text-indigo-900 dark:text-indigo-300">SERP Hawk</div>
                  <div className="text-xs font-semibold text-indigo-600/70 dark:text-indigo-400/70">Formal Proforma (INR)</div>
                </div>
                <Download className="w-5 h-5 text-indigo-400 group-hover:text-indigo-600 transition-colors" />
              </button>
              <button onClick={() => handleDownloadSelect('DAPROS')} className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-900/10 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-200 dark:hover:border-emerald-800 transition-all text-left group">
                <div>
                  <div className="font-bold text-emerald-900 dark:text-emerald-300">DaPros</div>
                  <div className="text-xs font-semibold text-emerald-600/70 dark:text-emerald-400/70">Clean Format (MXN)</div>
                </div>
                <Download className="w-5 h-5 text-emerald-400 group-hover:text-emerald-600 transition-colors" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
