"use client";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Plus, X, Search, Filter, Edit2, Trash2, Loader2, Tag, DollarSign, ToggleLeft, ToggleRight, Upload } from "lucide-react";
import { API_BASE_URL } from "@/config";

interface Product { id: number; name: string; sku?: string; description?: string; category?: string; unit_price: number; currency: string; tax_rate: number; stock_quantity?: number; is_active: boolean; }

const CATEGORIES = ["Software", "Service", "Hardware", "Consulting", "Marketing", "Support", "Other"];

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", sku: "", description: "", category: "", unit_price: "", currency: "USD", tax_rate: "0", stock_quantity: "", is_active: true });

  const load = () => { setLoading(true); fetch(`${API_BASE_URL}/products`).then(r => r.json()).then(d => setProducts(Array.isArray(d.products) ? d.products : [])).finally(() => setLoading(false)); };
  useEffect(load, []);

  const filtered = useMemo(() => products.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q);
    const matchCat = catFilter === "All" || p.category === catFilter;
    return matchSearch && matchCat;
  }), [products, search, catFilter]);

  const openCreate = () => { setEditProduct(null); setForm({ name: "", sku: "", description: "", category: "", unit_price: "", currency: "USD", tax_rate: "0", stock_quantity: "", is_active: true }); setShowModal(true); };
  const openEdit = (p: Product) => { setEditProduct(p); setForm({ name: p.name, sku: p.sku || "", description: p.description || "", category: p.category || "", unit_price: p.unit_price.toString(), currency: p.currency, tax_rate: p.tax_rate.toString(), stock_quantity: p.stock_quantity?.toString() || "", is_active: p.is_active }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { ...form, unit_price: parseFloat(form.unit_price) || 0, tax_rate: parseFloat(form.tax_rate) || 0, stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity) : null };
    const url = editProduct ? `${API_BASE_URL}/products/${editProduct.id}` : `${API_BASE_URL}/products`;
    await fetch(url, { method: editProduct ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false); setShowModal(false); load();
  };

  const handleDelete = async (id: number) => { if (!confirm("Delete product?")) return; await fetch(`${API_BASE_URL}/products/${id}`, { method: "DELETE" }); load(); };
  const handleToggle = async (p: Product) => { await fetch(`${API_BASE_URL}/products/${p.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !p.is_active }) }); load(); };

  const totalValue = products.filter(p => p.is_active).reduce((s, p) => s + p.unit_price, 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20"><Package className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-black text-slate-800 dark:text-zinc-100">Products</h1><p className="text-sm text-slate-500 dark:text-zinc-400">Manage your product & service catalog</p></div>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-bold hover:opacity-90 shadow-md transition-all">
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Products", value: products.length, color: "text-emerald-500" },
          { label: "Active", value: products.filter(p => p.is_active).length, color: "text-blue-500" },
          { label: "Categories", value: new Set(products.map(p => p.category).filter(Boolean)).size, color: "text-violet-500" },
          { label: "Avg Price", value: products.length ? `$${(products.reduce((s,p) => s+p.unit_price,0)/products.length).toFixed(0)}` : "$0", color: "text-amber-500" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm">
            <p className="text-2xl font-black text-slate-800 dark:text-zinc-100">{loading ? "—" : s.value}</p>
            <p className={`text-xs font-medium mt-0.5 ${s.color}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products, SKU..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["All", ...CATEGORIES].map(c => (
            <button key={c} onClick={() => setCatFilter(c)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${catFilter === c ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"}`}>{c}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-6 py-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50">
          {["Product", "Category", "Price", "Tax", "Status", ""].map(h => <p key={h} className="text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</p>)}
        </div>
        {loading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500 w-8 h-8" /></div>
          : filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-20"><Package className="w-10 h-10 text-slate-300 mb-3" /><p className="text-slate-500 font-bold">No products yet</p></div>
          : filtered.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 md:gap-4 items-center px-6 py-4 border-b border-slate-100 dark:border-zinc-800 last:border-0 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors group">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-zinc-100">{p.name}</p>
              {p.sku && <p className="text-xs text-slate-400 font-mono">SKU: {p.sku}</p>}
              {p.description && <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{p.description}</p>}
            </div>
            <span className="text-xs text-slate-600 dark:text-zinc-300 font-medium">{p.category || "—"}</span>
            <span className="text-sm font-black text-slate-800 dark:text-zinc-100">{p.currency} {p.unit_price.toFixed(2)}</span>
            <span className="text-xs text-slate-500">{p.tax_rate}%</span>
            <button onClick={() => handleToggle(p)} className={`flex items-center gap-1 text-xs font-bold ${p.is_active ? "text-emerald-600" : "text-slate-400"}`}>
              {p.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />} {p.is_active ? "Active" : "Inactive"}
            </button>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 hover:bg-slate-200 transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
              <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-zinc-700">
                <h2 className="text-lg font-black text-slate-800 dark:text-zinc-100">{editProduct ? "Edit Product" : "Add Product"}</h2>
                <button onClick={() => setShowModal(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="p-6 space-y-4">
                {[{ label: "Name *", key: "name", ph: "Product name" }, { label: "SKU", key: "sku", ph: "e.g. SRV-001" }].map(({ label, key, ph }) => (
                  <div key={key}><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">{label}</label>
                    <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
                ))}
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Description</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Brief description..."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Category</label>
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="">Select...</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Currency</label>
                    <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      {["USD","EUR","GBP","INR","MXN"].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Unit Price</label>
                    <input type="number" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} placeholder="0.00"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Tax Rate (%)</label>
                    <input type="number" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))} placeholder="0"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 p-6 pt-0">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-all">Cancel</button>
                <button onClick={handleSave} disabled={saving || !form.name.trim()} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}{editProduct ? "Update" : "Add Product"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
