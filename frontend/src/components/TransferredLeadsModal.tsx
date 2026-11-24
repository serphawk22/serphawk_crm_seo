"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  History,
  X,
  Search,
  ArrowRight,
  ExternalLink,
  Calendar,
  User,
  RefreshCw,
  Building2,
  FileText,
  Clock,
  Filter,
  Check
} from "lucide-react";
import Link from "next/link";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";

interface TransferredLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TransferredLeadsModal({
  isOpen,
  onClose
}: TransferredLeadsModalProps) {
  const { language } = useLanguage();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("all"); // 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month'
  const [selectedSalesperson, setSelectedSalesperson] = useState<string>("all");
  const [salespersonRole, setSalespersonRole] = useState<"either" | "from" | "to" | "by">("either");
  const [selectedStage, setSelectedStage] = useState<string>("all");

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_BASE_URL}/leads/transfers?limit=500`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        setTransfers(data.transfers || []);
      }
    } catch (e) {
      console.error("Failed to fetch lead transfer records", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTransfers();
    }
  }, [isOpen]);

  // Extract unique salespeople and stages
  const allSalespeople = useMemo(() => {
    const set = new Set<string>();
    transfers.forEach((t) => {
      if (t.from_user_name && t.from_user_name !== "Unassigned") set.add(t.from_user_name);
      if (t.to_user_name) set.add(t.to_user_name);
      if (t.transferred_by_name) set.add(t.transferred_by_name);
    });
    return Array.from(set).sort();
  }, [transfers]);

  const allStages = useMemo(() => {
    const set = new Set<string>();
    transfers.forEach((t) => {
      if (t.lead_stage) set.add(t.lead_stage);
    });
    return Array.from(set).sort();
  }, [transfers]);

  // Date filtering logic
  const isSameCalendarDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const checkDateMatches = (dateStr?: string, filter: string = "all") => {
    if (filter === "all") return true;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (filter === "today") {
      return isSameCalendarDay(d, today);
    }
    if (filter === "yesterday") {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return isSameCalendarDay(d, yesterday);
    }
    if (filter === "this_week") {
      const day = today.getDay();
      const diff = today.getDate() - (day === 0 ? 6 : day - 1);
      const startOfWeek = new Date(today.getFullYear(), today.getMonth(), diff);
      startOfWeek.setHours(0, 0, 0, 0);
      return d >= startOfWeek;
    }
    if (filter === "this_month") {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    return true;
  };

  const filtered = transfers.filter((t) => {
    // 1. Date filter
    if (!checkDateMatches(t.transferred_at, dateFilter)) return false;

    // 2. Salesperson filter
    if (selectedSalesperson !== "all") {
      const s = selectedSalesperson.toLowerCase();
      const from = (t.from_user_name || "").toLowerCase();
      const to = (t.to_user_name || "").toLowerCase();
      const by = (t.transferred_by_name || "").toLowerCase();

      if (salespersonRole === "from" && from !== s) return false;
      if (salespersonRole === "to" && to !== s) return false;
      if (salespersonRole === "by" && by !== s) return false;
      if (salespersonRole === "either" && from !== s && to !== s && by !== s) return false;
    }

    // 3. Stage filter
    if (selectedStage !== "all") {
      if ((t.lead_stage || "New").toLowerCase() !== selectedStage.toLowerCase()) return false;
    }

    // 4. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        (t.lead_name || "").toLowerCase().includes(q) ||
        (t.from_user_name || "").toLowerCase().includes(q) ||
        (t.to_user_name || "").toLowerCase().includes(q) ||
        (t.transferred_by_name || "").toLowerCase().includes(q) ||
        (t.reason || "").toLowerCase().includes(q) ||
        String(t.lead_id || "").includes(q);
      if (!match) return false;
    }

    return true;
  });

  const isFilterActive =
    dateFilter !== "all" ||
    selectedSalesperson !== "all" ||
    selectedStage !== "all" ||
    Boolean(searchQuery.trim());

  const handleResetFilters = () => {
    setDateFilter("all");
    setSelectedSalesperson("all");
    setSalespersonRole("either");
    setSelectedStage("all");
    setSearchQuery("");
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900 dark:text-zinc-100"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0 bg-slate-50/70 dark:bg-zinc-900/60">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold leading-tight">
                  {language === "es" ? "Historial de Leads Transferidos" : "Transferred Leads Audit Log"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  {language === "es"
                    ? "Registro oficial de fecha, vendedor de origen, destino y motivo de cada transferencia."
                    : "Complete audit record of date, from, to, and reason for all reassignments."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchTransfers}
                disabled={loading}
                title="Refresh history"
                className="p-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ── SEARCH & FILTER CONTROLS ── */}
          <div className="px-6 py-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-900 space-y-2.5 shrink-0">
            {/* Row 1: Search + Quick Date Filter Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    language === "es"
                      ? "Buscar por empresa, vendedor o motivo..."
                      : "Search by company, salesperson, or reason..."
                  }
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Date Presets */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                {[
                  { id: "all", label: language === "es" ? "Todos" : "All Time" },
                  { id: "today", label: language === "es" ? "Hoy" : "Today" },
                  { id: "yesterday", label: language === "es" ? "Ayer" : "Yesterday" },
                  { id: "this_week", label: language === "es" ? "Esta Semana" : "This Week" },
                  { id: "this_month", label: language === "es" ? "Este Mes" : "This Month" },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDateFilter(p.id)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      dateFilter === p.id
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: Salesperson, Role Direction, Stage, and Reset Filter */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-zinc-800/80">
              <div className="flex flex-wrap items-center gap-2">
                {/* Salesperson Filter */}
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={selectedSalesperson}
                    onChange={(e) => setSelectedSalesperson(e.target.value)}
                    className="text-xs font-semibold bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="all">
                      {language === "es" ? "Todos los vendedores" : "All Salespeople"}
                    </option>
                    {allSalespeople.map((sp) => (
                      <option key={sp} value={sp}>
                        {sp}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Salesperson Role Direction */}
                {selectedSalesperson !== "all" && (
                  <select
                    value={salespersonRole}
                    onChange={(e) => setSalespersonRole(e.target.value as any)}
                    className="text-xs font-semibold bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="either">
                      {language === "es" ? "Cualquiera (De o Para)" : "Either (From or To)"}
                    </option>
                    <option value="from">
                      {language === "es" ? "De (Origen)" : "From (Source)"}
                    </option>
                    <option value="to">
                      {language === "es" ? "Para (Destino)" : "To (Destination)"}
                    </option>
                    <option value="by">
                      {language === "es" ? "Por (Transferido por)" : "By (Operator)"}
                    </option>
                  </select>
                )}

                {/* Stage Filter */}
                {allStages.length > 0 && (
                  <select
                    value={selectedStage}
                    onChange={(e) => setSelectedStage(e.target.value)}
                    className="text-xs font-semibold bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="all">
                      {language === "es" ? "Todas las etapas" : "All Stages"}
                    </option>
                    {allStages.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                )}

                {/* Reset button */}
                {isFilterActive && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer ml-1"
                  >
                    <X className="w-3 h-3" /> {language === "es" ? "Limpiar filtros" : "Reset filters"}
                  </button>
                )}
              </div>

              <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                {filtered.length} {filtered.length === 1 ? "record" : "records"}
              </div>
            </div>
          </div>

          {/* Table Content */}
          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-56 gap-2 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                <span className="text-xs">{language === "es" ? "Cargando historial..." : "Loading transfer records..."}</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 text-center">
                <FileText className="w-10 h-10 text-slate-300 dark:text-zinc-700 mb-2" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                  {language === "es" ? "No se encontraron transferencias" : "No transfer records match your filters"}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mt-0.5">
                  {isFilterActive
                    ? language === "es"
                      ? "Intenta cambiar o limpiar los filtros seleccionados."
                      : "Try adjusting or clearing your date or salesperson filters."
                    : language === "es"
                    ? "Los prospectos transferidos en lote o individualmente aparecerán aquí con su registro de auditoría."
                    : "Transferred leads will be logged here with date, source, destination, and reason."}
                </p>
                {isFilterActive && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="mt-3 px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition"
                  >
                    {language === "es" ? "Limpiar filtros" : "Clear filters"}
                  </button>
                )}
              </div>
            ) : (
              <div className="border border-slate-200/90 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800/60 text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3.5">{language === "es" ? "Fecha" : "Date"}</th>
                      <th className="py-2.5 px-3.5">{language === "es" ? "Prospecto" : "Lead / Company"}</th>
                      <th className="py-2.5 px-3.5">{language === "es" ? "De → Para" : "From → To"}</th>
                      <th className="py-2.5 px-3.5">{language === "es" ? "Etapa" : "Stage"}</th>
                      <th className="py-2.5 px-3.5">{language === "es" ? "Por" : "By"}</th>
                      <th className="py-2.5 px-3.5">{language === "es" ? "Motivo" : "Reason"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {filtered.map((item) => {
                      const dt = item.transferred_at ? new Date(item.transferred_at) : null;
                      const dateStr = dt
                        ? dt.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric"
                          }) +
                          " " +
                          dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
                        : "—";

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          {/* Date */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-500 dark:text-zinc-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{dateStr}</span>
                            </span>
                          </td>

                          {/* Lead Name */}
                          <td className="py-2.5 px-3.5 font-bold text-slate-900 dark:text-white">
                            <Link
                              href={`/leads/${item.lead_id}`}
                              className="inline-flex items-center gap-1 hover:text-blue-600 transition truncate max-w-[160px]"
                            >
                              <span className="truncate">{item.lead_name}</span>
                              <ExternalLink className="w-3 h-3 text-slate-400" />
                            </Link>
                          </td>

                          {/* From -> To */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-medium">
                                {item.from_user_name}
                              </span>
                              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200/60 dark:border-blue-900">
                                {item.to_user_name}
                              </span>
                            </div>
                          </td>

                          {/* Stage */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap">
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                              {item.lead_stage || "New"}
                            </span>
                          </td>

                          {/* By */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600 dark:text-zinc-300 text-[11px]">
                            {item.transferred_by_name}
                          </td>

                          {/* Reason */}
                          <td className="py-2.5 px-3.5 text-slate-600 dark:text-zinc-300 max-w-xs">
                            <p className="truncate" title={item.reason}>
                              {item.reason}
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-900/60 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-500 dark:text-zinc-400">
              Showing {filtered.length} of {transfers.length} total transfers
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 transition cursor-pointer"
            >
              {language === "es" ? "Cerrar" : "Close"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

