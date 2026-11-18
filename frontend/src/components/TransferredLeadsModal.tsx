"use client";

import React, { useState, useEffect } from "react";
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
  Clock
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
  const [searchQuery, setSearchQuery] = useState<string>("");

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_BASE_URL}/leads/transfers?limit=200`, {
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

  const filtered = transfers.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.lead_name || "").toLowerCase().includes(q) ||
      (t.from_user_name || "").toLowerCase().includes(q) ||
      (t.to_user_name || "").toLowerCase().includes(q) ||
      (t.transferred_by_name || "").toLowerCase().includes(q) ||
      (t.reason || "").toLowerCase().includes(q)
    );
  });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-900 dark:text-zinc-100"
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
                className="p-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Search bar & Metrics */}
          <div className="px-6 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-3 bg-white dark:bg-zinc-900 shrink-0">
            <div className="relative flex-1 max-w-md">
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
            <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
              {filtered.length} {language === "es" ? "registros encontrados" : "records found"}
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
                  {language === "es" ? "No se encontraron transferencias" : "No transfer records found"}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mt-0.5">
                  {language === "es"
                    ? "Los prospectos transferidos en lote o individualmente aparecerán aquí con su registro de auditoría."
                    : "Transferred leads will be logged here with date, source, destination, and reason."}
                </p>
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
          <div className="px-6 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-900/60 flex items-center justify-end shrink-0">
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

