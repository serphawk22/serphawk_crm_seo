"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/context/RoleContext";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";
import { 
  Kanban, Plus, MoreVertical, DollarSign, Calendar, Clock, MapPin, Search, Pencil,
  TrendingUp, Award, Layers, CheckCircle2, X
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Deal {
  id: number;
  title: string;
  value: number;
  client_id: number;
  client_name: string;
  assigned_to: number | null;
  assigned_name?: string;
  stage: string;
  expected_close_date: string | null;
  created_at: string;
}

const STAGES = ["Lead", "Discovery", "Demo", "Negotiation", "Closed Won", "Closed Lost"];

export default function PipelinePage() {
  const { t } = useLanguage();
  const { role, user } = useRole();
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [salesPerformance, setSalesPerformance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draggedDeal, setDraggedDeal] = useState<Deal | null>(null);
  const [sortBy, setSortBy] = useState<"latest" | "oldest" | "highest_value" | "lowest_value" | "stale">("latest");

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [newDeal, setNewDeal] = useState({ title: "", value: "", client_id: "", assigned_to: "", stage: "Lead", expected_close_date: "" });
  const [clients, setClients] = useState<{ id: number; email: string; companyName?: string }[]>([]);
  const [salesUsers, setSalesUsers] = useState<{ id: number; name: string; email: string }[]>([]);

  useEffect(() => {
    if (role === "Client") {
      router.push("/login");
      return;
    }
    fetchDeals();
    fetchClients();
    fetch(`${API_BASE_URL}/users?role=SalesManager,Employee`).then(r => r.json()).then(data => setSalesUsers(data.users || [])).catch(() => {});
  }, [role, router]);

  const fetchDeals = async () => {
    try {
      const url = role === "SalesManager" ? `${API_BASE_URL}/deals?user_id=${user?.id || ""}` : `${API_BASE_URL}/deals`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch deals");
      const data = await res.json();
      setDeals(data.deals);
      setSalesPerformance(data.sales_performance || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/clients`);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch (err) {
      console.error("Failed to fetch clients for dropdown", err);
    }
  };

  const handleDragStart = (e: React.DragEvent, deal: Deal) => {
    setDraggedDeal(deal);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", deal.id.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, newStage: string) => {
    e.preventDefault();
    if (!draggedDeal || draggedDeal.stage === newStage) {
      setDraggedDeal(null);
      return;
    }

    const updatedDeals = deals.map(d => d.id === draggedDeal.id ? { ...d, stage: newStage } : d);
    setDeals(updatedDeals);

    try {
      const res = await fetch(`${API_BASE_URL}/deals/${draggedDeal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage })
      });
      if (!res.ok) throw new Error("Failed to update deal stage");
    } catch (err) {
      console.error(err);
      fetchDeals();
    }
    setDraggedDeal(null);
  };

  const handleAddDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isEditing = Boolean(editingDeal);
      const res = await fetch(`${API_BASE_URL}/deals${isEditing ? `/${editingDeal?.id}` : ""}`, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newDeal.title,
          value: parseFloat(newDeal.value) || 0.0,
          client_id: parseInt(newDeal.client_id),
          assigned_to: role === "SalesManager" ? user?.id || null : (newDeal.assigned_to ? Number(newDeal.assigned_to) : null),
          stage: newDeal.stage,
          expected_close_date: newDeal.expected_close_date || null
        })
      });
      if (res.ok) {
        setShowAddModal(false);
        setEditingDeal(null);
        setNewDeal({ title: "", value: "", client_id: "", assigned_to: "", stage: "Lead", expected_close_date: "" });
        fetchDeals();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openEditDeal = (deal: Deal) => {
    setEditingDeal(deal);
    setNewDeal({
      title: deal.title,
      value: String(deal.value ?? ""),
      client_id: String(deal.client_id),
      assigned_to: String(deal.assigned_to || ""),
      stage: deal.stage,
      expected_close_date: deal.expected_close_date || "",
    });
    setShowAddModal(true);
  };

  const sortedDeals = [...deals].sort((a, b) => {
    if (sortBy === "highest_value") return (b.value || 0) - (a.value || 0);
    if (sortBy === "lowest_value") return (a.value || 0) - (b.value || 0);
    if (sortBy === "oldest") return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    if (sortBy === "stale") {
      const age = (deal: Deal) => Date.now() - new Date(deal.created_at || 0).getTime();
      return age(b) - age(a);
    }
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  const dealsByStage = STAGES.reduce((acc, stage) => {
    acc[stage] = sortedDeals.filter(d => d.stage === stage);
    return acc;
  }, {} as Record<string, Deal[]>);

  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
  const wonDealsCount = dealsByStage["Closed Won"]?.length || 0;
  const avgDealValue = deals.length ? Math.round(totalValue / deals.length) : 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24 text-slate-400 text-sm">
        {t("pipeline.loading_pipeline")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Kanban className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none">
                {t("pipeline.sales_pipeline")}
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                {deals.length} deals
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              {t("pipeline.manage_track_deals")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={event => setSortBy(event.target.value as typeof sortBy)}
            className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-zinc-300 outline-none cursor-pointer"
            aria-label="Sort deals"
          >
            <option value="latest" className="dark:bg-zinc-900">Latest first</option>
            <option value="oldest" className="dark:bg-zinc-900">Oldest first</option>
            <option value="highest_value" className="dark:bg-zinc-900">Highest value</option>
            <option value="lowest_value" className="dark:bg-zinc-900">Lowest value</option>
            <option value="stale" className="dark:bg-zinc-900">Stale longest</option>
          </select>

          <button 
            onClick={() => { setEditingDeal(null); setNewDeal({ title: "", value: "", client_id: "", assigned_to: "", stage: "Lead", expected_close_date: "" }); setShowAddModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("pipeline.add_deal")}</span>
          </button>
        </div>
      </div>

      {/* 4-KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">{t("pipeline.total_pipeline")}</p>
            <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight mt-0.5 font-mono">${totalValue.toLocaleString()}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <DollarSign className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Active Deals</p>
            <p className="text-base sm:text-lg font-bold text-indigo-600 dark:text-indigo-400 leading-tight mt-0.5">{deals.length}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Layers className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Closed Won</p>
            <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5">{wonDealsCount}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Award className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Average Deal</p>
            <p className="text-base sm:text-lg font-bold text-cyan-600 dark:text-cyan-400 leading-tight mt-0.5 font-mono">${avgDealValue.toLocaleString()}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-semibold">{error}</div>}

      {/* Sales Performance (Admin only) */}
      {role === "Admin" && salesPerformance.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/90 shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 border-b border-slate-200/80 dark:border-white/10">
              <tr>
                <th className="px-4 py-2.5">Salesperson</th>
                <th className="px-4 py-2.5">Deals</th>
                <th className="px-4 py-2.5">Pipeline</th>
                <th className="px-4 py-2.5">Won Revenue</th>
                <th className="px-4 py-2.5">Lead</th>
                <th className="px-4 py-2.5">Negotiation</th>
                <th className="px-4 py-2.5">Won</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {salesPerformance.map(item => (
                <tr key={item.assigned_to || "unassigned"} className="hover:bg-slate-50/60 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-2 font-bold text-slate-900 dark:text-white">{item.salesperson}</td>
                  <td className="px-4 py-2">{item.deals}</td>
                  <td className="px-4 py-2 font-mono">${Number(item.pipeline_value).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono font-bold text-emerald-600 dark:text-emerald-400">${Number(item.won_revenue).toLocaleString()}</td>
                  <td className="px-4 py-2">{item.stages.Lead || 0}</td>
                  <td className="px-4 py-2">{item.stages.Negotiation || 0}</td>
                  <td className="px-4 py-2 font-bold text-emerald-600">{item.stages["Closed Won"] || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-2.5 pb-6">
        {STAGES.map(stage => {
          const stageTotal = dealsByStage[stage]?.reduce((sum, d) => sum + (d.value || 0), 0) || 0;
          return (
            <div 
              key={stage}
              className="min-w-0 min-h-[360px] bg-slate-50/80 dark:bg-white/5 rounded-xl border border-slate-200/90 dark:border-white/10 flex flex-col shadow-xs"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage)}
            >
              <div className="px-3 py-2 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-white dark:bg-[#111111]/90 rounded-t-xl">
                <h3 className="font-bold text-xs text-slate-800 dark:text-zinc-200 flex items-center gap-1.5 truncate">
                  <span className="truncate">{stage}</span>
                  <span className="bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-400 text-[10px] py-0.2 px-1.5 rounded-full font-bold">
                    {dealsByStage[stage]?.length || 0}
                  </span>
                </h3>
                <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-zinc-400 shrink-0">
                  ${stageTotal.toLocaleString()}
                </span>
              </div>
              
              <div className="p-2 flex-1 overflow-y-auto space-y-2 max-h-[calc(100vh-280px)]">
                {dealsByStage[stage]?.map(deal => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, deal)}
                    className="bg-white dark:bg-[#111111]/90 p-2.5 rounded-lg border border-slate-200/90 dark:border-white/10 shadow-xs cursor-grab active:cursor-grabbing hover:border-indigo-400/80 dark:hover:border-indigo-500/80 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <h4 className="min-w-0 flex-1 break-words whitespace-normal pr-1.5 font-bold text-xs text-slate-800 dark:text-zinc-100 leading-tight" title={deal.title}>
                        {deal.title}
                      </h4>
                      <button 
                        type="button" 
                        onClick={() => openEditDeal(deal)} 
                        title="Edit deal" 
                        className="text-slate-400 hover:text-indigo-600 dark:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                    
                    <div className="min-w-0 text-[11px] text-slate-500 dark:text-zinc-400 mb-2 flex items-start gap-1">
                      <MapPin className="w-3 h-3 shrink-0 mt-0.5 text-slate-400" />
                      <span className="min-w-0 break-words whitespace-normal font-medium">{deal.client_name}</span>
                    </div>
                    
                    <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
                      <div className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-mono font-bold text-xs">
                        <DollarSign className="w-3.5 h-3.5" />
                        {deal.value.toLocaleString()}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
                        {deal.assigned_name && (
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold truncate max-w-[110px]">
                            {deal.assigned_name}
                          </span>
                        )}
                        {deal.expected_close_date && (
                          <div className="flex shrink-0 items-center gap-1 text-slate-400 font-medium ml-auto">
                            <Calendar className="w-3 h-3" />
                            {new Date(deal.expected_close_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {(!dealsByStage[stage] || dealsByStage[stage].length === 0) && (
                  <div className="h-20 flex items-center justify-center border border-dashed border-slate-200/80 dark:border-white/10 rounded-lg text-[11px] text-slate-400">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Deal Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#111111] rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl w-full max-w-md overflow-hidden text-slate-900 dark:text-white">
            <div className="px-5 py-4 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Kanban className="w-4 h-4 text-indigo-600" />
                {editingDeal ? "Edit Deal" : t("pipeline.create_new_deal")}
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddDeal} className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">{t("pipeline.deal_title")} *</label>
                <input required type="text" value={newDeal.title} onChange={e => setNewDeal({...newDeal, title: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs outline-none focus:border-indigo-500" placeholder="e.g. Website Redesign" />
              </div>
              {role !== "SalesManager" && <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">Assign Sales Owner</label>
                <select required value={newDeal.assigned_to} onChange={e => setNewDeal({...newDeal, assigned_to: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-white/10 rounded-xl text-xs outline-none focus:border-indigo-500">
                  <option value="" className="dark:bg-zinc-900">Select salesperson</option>
                  {salesUsers.map(salesUser => <option key={salesUser.id} value={salesUser.id} className="dark:bg-zinc-900">{salesUser.name || salesUser.email} · {salesUser.email}</option>)}
                </select>
              </div>}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">{t("pipeline.client")} *</label>
                <select required value={newDeal.client_id} onChange={e => setNewDeal({...newDeal, client_id: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-white/10 rounded-xl text-xs outline-none focus:border-indigo-500">
                  <option value="" className="dark:bg-zinc-900">{t("pipeline.select_client")}</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id} className="dark:bg-zinc-900">{c.companyName || c.email}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">{t("pipeline.value_label")}</label>
                  <input type="number" step="0.01" value={newDeal.value} onChange={e => setNewDeal({...newDeal, value: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs outline-none focus:border-indigo-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">{t("pipeline.close_date")}</label>
                  <input type="date" value={newDeal.expected_close_date} onChange={e => setNewDeal({...newDeal, expected_close_date: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">{t("pipeline.starting_stage")}</label>
                <select value={newDeal.stage} onChange={e => setNewDeal({...newDeal, stage: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-white/10 rounded-xl text-xs outline-none focus:border-indigo-500">
                  {STAGES.map(s => <option key={s} value={s} className="dark:bg-zinc-900">{s}</option>)}
                </select>
              </div>
              
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/80 dark:border-white/10">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-3 py-1.5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 font-semibold rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                  {t("pipeline.cancel")}
                </button>
                <button type="submit" className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs transition-colors shadow-xs">
                  {editingDeal ? "Save Changes" : t("pipeline.create_deal")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
