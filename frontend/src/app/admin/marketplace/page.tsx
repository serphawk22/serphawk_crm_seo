"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store, Search, Filter, Plus, Sparkles, X, ChevronLeft, ChevronRight,
  Building2, Tag, DollarSign, GitCompare, Loader2, CheckCircle2, Trash2, Edit3,
  ExternalLink, BarChart2, AlertCircle, LayoutGrid, List, Zap, FileText, Send
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

// ─── Category color map ──────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "SEO":           { bg: "bg-indigo-50",   text: "text-indigo-700",   dot: "bg-indigo-500" },
  "Web Design":    { bg: "bg-violet-50",   text: "text-violet-700",   dot: "bg-violet-500" },
  "Marketing":     { bg: "bg-pink-50",     text: "text-pink-700",     dot: "bg-pink-500" },
  "Plumbing":      { bg: "bg-blue-50",     text: "text-blue-700",     dot: "bg-blue-500" },
  "Legal":         { bg: "bg-slate-100 dark:bg-zinc-800",   text: "text-slate-700 dark:text-zinc-200",    dot: "bg-slate-50 dark:bg-zinc-9500" },
  "Accounting":    { bg: "bg-emerald-50",  text: "text-emerald-700",  dot: "bg-emerald-500" },
  "Consulting":    { bg: "bg-amber-50",    text: "text-amber-700",    dot: "bg-amber-500" },
  "Construction":  { bg: "bg-orange-50",   text: "text-orange-700",   dot: "bg-orange-500" },
  "Healthcare":    { bg: "bg-red-50",      text: "text-red-700",      dot: "bg-red-500" },
  "Real Estate":   { bg: "bg-teal-50",     text: "text-teal-700",     dot: "bg-teal-500" },
  "IT Services":   { bg: "bg-cyan-50",     text: "text-cyan-700",     dot: "bg-cyan-500" },
  "Landscaping":   { bg: "bg-lime-50",     text: "text-lime-700",     dot: "bg-lime-500" },
  "Cleaning":      { bg: "bg-sky-50",      text: "text-sky-700",      dot: "bg-sky-500" },
  "Electrical":    { bg: "bg-yellow-50",   text: "text-yellow-700",   dot: "bg-yellow-500" },
  "HVAC":          { bg: "bg-rose-50",     text: "text-rose-700",     dot: "bg-rose-500" },
};
const DEFAULT_CAT_COLOR = { bg: "bg-slate-100 dark:bg-zinc-800", text: "text-slate-700 dark:text-zinc-200", dot: "bg-slate-400" };

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const color = CATEGORY_COLORS[category] ?? DEFAULT_CAT_COLOR;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${color.bg} ${color.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
      {category}
    </span>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface MarketplaceService {
  id: number;
  service_name: string;
  normalized_name: string | null;
  category: string | null;
  description: string | null;
  estimated_cost: number;
  cost_is_estimated: boolean;
  provider_name: string | null;
  provider_client_id: number | null;
  provider_industry: string | null;
  provider_address: string | null;
  source: string;
  created_at: string;
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function MarketplacePage() {
  const { t } = useLanguage();

  const [services, setServices] = useState<MarketplaceService[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [clients, setClients] = useState<{ id: number; companyName: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [minCost, setMinCost] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Compare
  const [compareIds, setCompareIds] = useState<number[]>([]);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCompareDrawer, setShowCompareDrawer] = useState(false);

  // Upsell Modal
  const [upsellTargetService, setUpsellTargetService] = useState<MarketplaceService | null>(null);
  const [upsellClientId, setUpsellClientId] = useState<string>("");
  const [upsellNegotiatedPrice, setUpsellNegotiatedPrice] = useState<string>("");
  const [upsellQuantity, setUpsellQuantity] = useState<string>("1");
  const [upsellNotes, setUpsellNotes] = useState<string>("");
  const [upsellBusy, setUpsellBusy] = useState(false);

  const openUpsell = (svc: MarketplaceService) => {
    setUpsellTargetService(svc);
    setUpsellNegotiatedPrice(String(svc.estimated_cost || 0));
    setUpsellQuantity("1");
    setUpsellNotes(svc.description || "");
    if (clients.length > 0) {
      const target = clients.find(c => c.id !== svc.provider_client_id) || clients[0];
      setUpsellClientId(String(target.id));
    }
  };

  const handleCreateUpsellProposal = async () => {
    if (!upsellTargetService || !upsellClientId) return;
    setUpsellBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: Number(upsellClientId),
          title: `Proposal: ${upsellTargetService.service_name}`,
          items: [{
            description: upsellTargetService.service_name,
            quantity: Number(upsellQuantity) || 1,
            unit_price: Number(upsellNegotiatedPrice) || 0,
          }],
          notes: upsellNotes || null,
        }),
      });
      if (res.ok) {
        const prop = await res.json();
        setUpsellTargetService(null);
        window.location.href = `/proposals?highlight=${prop.id || ""}`;
      } else {
        alert("Failed to create proposal");
      }
    } catch (e) {
      alert("Error creating proposal");
    } finally {
      setUpsellBusy(false);
    }
  };

  const handleCreateUpsellInvoice = async () => {
    if (!upsellTargetService || !upsellClientId) return;
    setUpsellBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: Number(upsellClientId),
          description: upsellTargetService.service_name,
          items: [{
            description: upsellTargetService.service_name,
            quantity: Number(upsellQuantity) || 1,
            unit_price: Number(upsellNegotiatedPrice) || 0,
          }],
          notes: upsellNotes || null,
        }),
      });
      if (res.ok) {
        const inv = await res.json();
        setUpsellTargetService(null);
        window.location.href = `/billing?tab=invoices&highlight=${inv.id || ""}`;
      } else {
        alert("Failed to create invoice");
      }
    } catch (e) {
      alert("Error creating invoice");
    } finally {
      setUpsellBusy(false);
    }
  };

  // Add form
  const [form, setForm] = useState({
    service_name: "",
    category: "",
    description: "",
    estimated_cost: "",
    provider_client_id: "",
    provider_name: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // AI categorize
  const [categorizingId, setCategorizingId] = useState<number | null>(null);

  // ── Fetch data ──────────────────────────────────────────────────────────────
  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: "24",
        ...(search && { search }),
        ...(filterCategory && { category: filterCategory }),
        ...(filterClientId && { client_id: filterClientId }),
        ...(minCost && { min_cost: minCost }),
        ...(maxCost && { max_cost: maxCost }),
      });
      const res = await fetch(`${API_BASE_URL}/marketplace/services?${params}`);
      const data = await res.json();
      setServices(data.services || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, search, filterCategory, filterClientId, minCost, maxCost]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/marketplace/categories`).then(r => r.json()).then(d => setCategories(d.categories || []));
    fetch(`${API_BASE_URL}/clients?page=1&per_page=200`).then(r => r.json()).then(d => {
      setClients((d.clients || []).map((c: any) => ({ id: c.id, companyName: c.companyName || c.company_name || "Unknown" })));
    });
  }, []);

  // ── Add Service ─────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.service_name.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/marketplace/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_name: form.service_name,
          category: form.category || null,
          description: form.description || null,
          estimated_cost: parseFloat(form.estimated_cost) || 0,
          provider_client_id: form.provider_client_id ? parseInt(form.provider_client_id) : null,
          provider_name: form.provider_name || null,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.detail === "string" ? data.detail : "Could not save marketplace service");
      }
      setSaveSuccess(true);
      setForm({ service_name: "", category: "", description: "", estimated_cost: "", provider_client_id: "", provider_name: "" });
      fetchServices();
      fetch(`${API_BASE_URL}/marketplace/categories`).then(r => r.json()).then(d => setCategories(d.categories || []));
      setTimeout(() => { setSaveSuccess(false); setShowAddModal(false); }, 1500);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save marketplace service");
    } finally { setSaving(false); }
  };

  // ── AI Categorize ───────────────────────────────────────────────────────────
  const handleAICategorize = async (id: number) => {
    setCategorizingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/marketplace/services/${id}/ai-categorize`, { method: "POST" });
      const data = await res.json();
      setServices(prev => prev.map(s => s.id === id ? data.service : s));
    } catch (e) { console.error(e); }
    finally { setCategorizingId(null); }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!confirm(t("marketplace.confirm_remove"))) return;
    await fetch(`${API_BASE_URL}/marketplace/services/${id}`, { method: "DELETE" });
    setServices(prev => prev.filter(s => s.id !== id));
    setTotal(t => t - 1);
  };

  // ── Compare logic ───────────────────────────────────────────────────────────
  const toggleCompare = (id: number) => {
    setCompareIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : prev.length < 4 ? [...prev, id] : prev);
  };
  const compareServices = services.filter(s => compareIds.includes(s.id));

  const clearFilters = () => { setSearch(""); setFilterCategory(""); setFilterClientId(""); setMinCost(""); setMaxCost(""); setPage(1); };
  const hasFilters = Boolean(search || filterCategory || filterClientId || minCost || maxCost);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const avgCost = services.length > 0 ? services.reduce((sum, s) => sum + s.estimated_cost, 0) / services.filter(s => s.estimated_cost > 0).length || 0 : 0;
  const providers = new Set(services.map(s => s.provider_name).filter(Boolean)).size;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 pb-32 space-y-6">

      {/* ── Hero Header ────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-zinc-800 rounded-2xl">
            <Store className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-zinc-100">{t("marketplace.catalog_title")}</h1>
            <p className="text-slate-500 dark:text-zinc-400 text-sm font-medium mt-0.5">
              {t("marketplace.catalog_desc")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
            {total} {t("marketplace.services")}
          </span>
          <motion.button
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black transition-colors shadow-md shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" /> {t("marketplace.add_service")}
          </motion.button>
        </div>
      </div>

      {/* ── KPI Stats ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Store, label: t("marketplace.total_services"), value: total, color: "text-indigo-500", bg: "bg-indigo-50" },
          { icon: Tag, label: t("marketplace.categories"), value: categories.length, color: "text-violet-500", bg: "bg-violet-50" },
          { icon: Building2, label: t("marketplace.providers"), value: providers, color: "text-emerald-500", bg: "bg-emerald-50" },
          { icon: DollarSign, label: t("marketplace.avg_cost"), value: avgCost > 0 ? `$${avgCost.toFixed(0)}` : "—", color: "text-amber-500", bg: "bg-amber-50" },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className={`p-2.5 ${bg} rounded-xl`}><Icon className={`w-5 h-5 ${color}`} /></div>
            <div>
              <p className="text-2xl font-black text-slate-800 dark:text-zinc-100">{value}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder={t("marketplace.search_services")}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
          />
        </div>
        <select
          value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
          className="px-3 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium min-w-[150px]"
        >
          <option value="">{t("marketplace.all_categories")}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterClientId} onChange={e => { setFilterClientId(e.target.value); setPage(1); }}
          className="px-3 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium min-w-[170px]"
        >
          <option value="">All Client Providers</option>
          {clients.map(c => <option key={c.id} value={String(c.id)}>{c.companyName}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">{t("marketplace.cost")}:</span>
          <input type="number" value={minCost} onChange={e => { setMinCost(e.target.value); setPage(1); }} placeholder={`${t("marketplace.min")} $`}
            className="w-20 px-3 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
          <span className="text-slate-300">–</span>
          <input type="number" value={maxCost} onChange={e => { setMaxCost(e.target.value); setPage(1); }} placeholder={`${t("marketplace.max")} $`}
            className="w-20 px-3 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-slate-500 dark:text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-slate-200 dark:border-zinc-700">
            <X className="w-3.5 h-3.5" /> {t("marketplace.clear")}
          </button>
        )}
        {compareIds.length >= 2 && (
          <motion.button initial={{ scale: 0.9 }} animate={{ scale: 1 }}
            onClick={() => setShowCompareDrawer(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white text-xs font-black rounded-xl hover:bg-violet-700 transition-colors shadow-md"
          >
            <GitCompare className="w-3.5 h-3.5" /> {t("marketplace.compare")} ({compareIds.length})
          </motion.button>
        )}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl border border-slate-200 dark:border-zinc-700 ml-auto">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${viewMode === "grid" ? "bg-white dark:bg-zinc-900 text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200"}`}
            title="Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${viewMode === "list" ? "bg-white dark:bg-zinc-900 text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200"}`}
            title="List View"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Service Cards Grid ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-sm font-bold text-slate-400">{t("marketplace.loading")}</p>
        </div>
      ) : services.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-3xl">
          <div className="p-4 bg-slate-50 dark:bg-zinc-950 rounded-2xl"><Store className="w-8 h-8 text-slate-300" /></div>
          <div className="text-center">
            <p className="text-lg font-black text-slate-700 dark:text-zinc-200">{t("marketplace.no_services")}</p>
            <p className="text-sm text-slate-400 mt-1">{hasFilters ? t("marketplace.try_clearing") : t("marketplace.add_first_service")}</p>
          </div>
          {!hasFilters && (
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" /> {t("marketplace.add_first_service_btn")}
            </button>
          )}
        </div>
      ) : viewMode === "list" ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  <th className="py-3 px-4">Service</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Provider Client</th>
                  <th className="py-3 px-4">Estimated Cost</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 text-xs">
                {services.map(s => {
                  const isCompared = compareIds.includes(s.id);
                  const isCategorizing = categorizingId === s.id;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-zinc-100 text-sm">
                          {s.normalized_name || s.service_name}
                        </div>
                        {s.description && (
                          <div className="text-[11px] text-slate-400 line-clamp-1 max-w-md">{s.description}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <CategoryBadge category={s.category} />
                      </td>
                      <td className="py-3 px-4">
                        {s.provider_name ? (
                          s.provider_client_id ? (
                            <Link href={`/admin/clients/${s.provider_client_id}`} className="font-semibold text-indigo-600 hover:underline flex items-center gap-1">
                              {s.provider_name} <ExternalLink className="w-2.5 h-2.5" />
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-700 dark:text-zinc-300">{s.provider_name}</span>
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-extrabold text-slate-900 dark:text-white">
                          {s.estimated_cost > 0 ? `$${s.estimated_cost.toLocaleString()}` : "Price on Request"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openUpsell(s)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold transition cursor-pointer"
                          >
                            <Zap className="w-3 h-3 text-amber-500 fill-amber-500" /> Upsell
                          </button>
                          <button
                            onClick={() => handleAICategorize(s.id)}
                            disabled={isCategorizing}
                            className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition"
                          >
                            {isCategorizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => toggleCompare(s.id)}
                            className={`p-1.5 rounded-lg transition ${isCompared ? "bg-violet-100 text-violet-600" : "hover:bg-slate-100 dark:bg-zinc-800 text-slate-400"}`}
                          >
                            <GitCompare className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {services.map(s => {
              const isCompared = compareIds.includes(s.id);
              const isCategorizing = categorizingId === s.id;
              return (
                <motion.div
                  key={s.id} layout
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                  className={`bg-white dark:bg-zinc-900 border rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col group overflow-hidden ${isCompared ? "border-violet-400 ring-2 ring-violet-200" : "border-slate-200 dark:border-zinc-700 hover:border-indigo-200"}`}
                >
                  {/* Card Top */}
                  <div className="p-5 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <CategoryBadge category={s.category} />
                      {s.source === "scraper" && (
                        <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wider">{t("marketplace.auto")}</span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-black text-slate-800 dark:text-zinc-100 text-base leading-tight line-clamp-2 group-hover:text-indigo-700 transition-colors">
                        {s.normalized_name || s.service_name}
                      </h3>
                      {s.normalized_name && s.normalized_name !== s.service_name && (
                        <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{t("marketplace.raw")}: {s.service_name}</p>
                      )}
                    </div>
                    {s.description && (
                      <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed line-clamp-2">{s.description}</p>
                    )}
                    {/* Provider */}
                    {s.provider_name && (
                      <div className="flex items-center gap-2 pt-1">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-[9px] font-black shrink-0">
                          {s.provider_name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          {s.provider_client_id ? (
                            <Link href={`/admin/clients/${s.provider_client_id}`} className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1 truncate">
                              {s.provider_name} <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </Link>
                          ) : (
                            <p className="text-xs font-bold text-slate-600 dark:text-zinc-300 truncate">{s.provider_name}</p>
                          )}
                          {s.provider_industry && <p className="text-[10px] text-slate-400 truncate">{s.provider_industry}</p>}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="px-5 py-3 border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 flex items-center justify-between gap-2">
                    <div>
                      {s.estimated_cost > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-black text-slate-800 dark:text-zinc-100">${s.estimated_cost.toLocaleString()}</span>
                          {s.cost_is_estimated && (
                            <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">{t("marketplace.est")}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-slate-400">{t("marketplace.price_on_request")}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {/* Upsell to client */}
                      <button
                        onClick={() => openUpsell(s)}
                        title="Upsell / Quote Service to Client"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        <Zap className="w-3 h-3 text-amber-500 fill-amber-500" /> Upsell
                      </button>
                      {/* AI Categorize */}
                      <button
                        onClick={() => handleAICategorize(s.id)}
                        disabled={isCategorizing}
                        title={t("marketplace.ai_categorize")}
                        className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
                      >
                        {isCategorizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      </button>
                      {/* Compare toggle */}
                      <button
                        onClick={() => toggleCompare(s.id)}
                        title={isCompared ? t("marketplace.remove_from_compare") : t("marketplace.add_to_compare")}
                        className={`p-1.5 rounded-lg transition-colors ${isCompared ? "bg-violet-100 text-violet-600" : "hover:bg-slate-100 dark:bg-zinc-800 text-slate-400 hover:text-violet-600"}`}
                      >
                        <GitCompare className="w-3.5 h-3.5" />
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(s.id)}
                        title={t("marketplace.remove_from_marketplace")}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:bg-zinc-950 disabled:opacity-40 transition-colors">
            <ChevronLeft className="w-4 h-4" /> {t("marketplace.previous")}
          </button>
          <span className="text-sm font-bold text-slate-600 dark:text-zinc-300">{t("marketplace.page")} {page} {t("marketplace.of")} {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:bg-zinc-950 disabled:opacity-40 transition-colors">
            {t("marketplace.next")} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Add Service Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}
          >
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white dark:bg-zinc-900/20 rounded-xl"><Plus className="w-4 h-4 text-white" /></div>
                  <div>
                    <h2 className="text-base font-black text-white">{t("marketplace.add_marketplace_service")}</h2>
                    <p className="text-xs text-indigo-200">{t("marketplace.manually_list_service")}</p>
                  </div>
                </div>
                <button onClick={() => setShowAddModal(false)} className="text-white/60 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Modal Body */}
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-black text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">{t("marketplace.service_name")} *</label>
                    <input value={form.service_name} onChange={e => setForm(f => ({ ...f, service_name: e.target.value }))}
                      placeholder={t("marketplace.ph_local_seo")}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">{t("marketplace.category")}</label>
                    <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      list="categories-list" placeholder="e.g., SEO"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                    <datalist id="categories-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">{t("marketplace.estimated_cost")} ($)</label>
                    <input type="number" value={form.estimated_cost} onChange={e => setForm(f => ({ ...f, estimated_cost: e.target.value }))}
                      placeholder={t("marketplace.ph_on_request")}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-black text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">{t("marketplace.description")}</label>
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder={t("marketplace.ph_description")} rows={3}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium resize-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-black text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">{t("marketplace.provider_crm_client")}</label>
                    <select value={form.provider_client_id} onChange={e => setForm(f => ({ ...f, provider_client_id: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium">
                      <option value="">— {t("marketplace.select_client_optional")} —</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">{t("marketplace.or_enter_manually")}</p>
                    <input value={form.provider_name} onChange={e => setForm(f => ({ ...f, provider_name: e.target.value }))}
                      placeholder={t("marketplace.ph_company_name")}
                      className="mt-1 w-full px-4 py-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                  <AlertCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <p className="text-[10px] text-slate-400">{t("marketplace.after_saving")} <strong className="text-indigo-600">✦ AI</strong> {t("marketplace.after_saving_2")}</p>
                </div>
              </div>
              {/* Modal Footer */}
              <div className="px-6 pb-6 flex items-center justify-end gap-3">
                <button onClick={() => setShowAddModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:bg-zinc-800 rounded-xl transition-colors">
                  {t("marketplace.cancel")}
                </button>
                <button onClick={handleAdd} disabled={!form.service_name.trim() || saving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-xl transition-colors disabled:opacity-50 shadow-md">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {saving ? t("marketplace.saving") : saveSuccess ? t("marketplace.saved") : t("marketplace.add_service")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Compare Drawer ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCompareDrawer && compareServices.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-700 shadow-2xl max-h-[70vh] overflow-y-auto"
          >
            <div className="max-w-7xl mx-auto p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-violet-100 rounded-xl"><GitCompare className="w-4 h-4 text-violet-600" /></div>
                  <h2 className="text-base font-black text-slate-800 dark:text-zinc-100">{t("marketplace.comparing_services")} {compareServices.length}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCompareIds([])} className="text-xs font-bold text-slate-500 dark:text-zinc-400 hover:text-red-500 transition-colors px-3 py-1.5 hover:bg-red-50 rounded-lg">
                    {t("marketplace.clear_all")}
                  </button>
                  <button onClick={() => setShowCompareDrawer(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:text-zinc-300 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-zinc-800">
                      <th className="text-left text-[10px] font-black text-slate-400 uppercase tracking-wider pb-3 pr-4 w-32">{t("marketplace.field")}</th>
                      {compareServices.map(s => (
                        <th key={s.id} className="text-left pb-3 px-4 font-black text-slate-700 dark:text-zinc-200 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            {s.normalized_name || s.service_name}
                            <button onClick={() => toggleCompare(s.id)} className="text-slate-300 hover:text-red-400 transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[
                      { label: t("marketplace.category"), key: "category" as const, render: (s: MarketplaceService) => <CategoryBadge category={s.category} /> },
                      { label: t("marketplace.provider"), key: "provider_name" as const, render: (s: MarketplaceService) => s.provider_name || "—" },
                      { label: "Industry", key: "provider_industry" as const, render: (s: MarketplaceService) => s.provider_industry || "—" },
                      { label: "Cost", key: "estimated_cost" as const, render: (s: MarketplaceService) => s.estimated_cost > 0 ? `$${s.estimated_cost.toLocaleString()}${s.cost_is_estimated ? " (Est.)" : ""}` : "On request" },
                      { label: "Description", key: "description" as const, render: (s: MarketplaceService) => s.description || "—" },
                      { label: "Source", key: "source" as const, render: (s: MarketplaceService) => <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${s.source === "scraper" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300"}`}>{s.source}</span> },
                    ].map(row => (
                      <tr key={row.label}>
                        <td className="py-3 pr-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">{row.label}</td>
                        {compareServices.map(s => (
                          <td key={s.id} className="py-3 px-4 text-sm text-slate-600 dark:text-zinc-300">{row.render(s)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Upsell / Quote Service Modal ── */}
      <AnimatePresence>
        {upsellTargetService && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50">
                    <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Upsell Service to Client
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                      Create an official Proposal or Invoice with admin price control
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setUpsellTargetService(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Service info banner */}
              <div className="rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/80 p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {upsellTargetService.normalized_name || upsellTargetService.service_name}
                  </span>
                  <CategoryBadge category={upsellTargetService.category} />
                </div>
                {upsellTargetService.provider_name && (
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Extracted from provider: <span className="font-semibold text-slate-700 dark:text-zinc-300">{upsellTargetService.provider_name}</span>
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    Select Target Client *
                  </label>
                  <select
                    value={upsellClientId}
                    onChange={(e) => setUpsellClientId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    {clients.map(c => (
                      <option key={c.id} value={String(c.id)}>
                        {c.companyName} {c.id === upsellTargetService.provider_client_id ? "(Current Provider)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                      Negotiated Unit Price ($) *
                    </label>
                    <input
                      type="number"
                      value={upsellNegotiatedPrice}
                      onChange={(e) => setUpsellNegotiatedPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-slate-400 font-medium">Admin price control override</span>
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={upsellQuantity}
                      onChange={(e) => setUpsellQuantity(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    Proposal / Invoice Scope & Notes
                  </label>
                  <textarea
                    rows={2}
                    value={upsellNotes}
                    onChange={(e) => setUpsellNotes(e.target.value)}
                    placeholder="Deliverables, scope, or terms for this client..."
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setUpsellTargetService(null)}
                  disabled={upsellBusy}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateUpsellProposal}
                  disabled={upsellBusy || !upsellClientId}
                  className="px-4 py-2 text-xs font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {upsellBusy ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                  Create Proposal
                </button>
                <button
                  type="button"
                  onClick={handleCreateUpsellInvoice}
                  disabled={upsellBusy || !upsellClientId}
                  className="px-4 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {upsellBusy ? <Loader2 size={13} className="animate-spin" /> : <DollarSign size={13} />}
                  Create Invoice
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
