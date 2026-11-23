"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRightLeft,
  Filter,
  CheckCircle2,
  AlertCircle,
  Users,
  Layers,
  Hash,
  X,
  Search,
  Check,
  ChevronRight,
  Sparkles,
  Loader2,
  Clock,
  Send
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";

interface BulkLeadTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  leads: any[];
  employees: { id: number; name: string }[];
  isAdmin: boolean;
  currentUserId?: number;
  onTransferred: () => void;
  onViewHistory?: () => void;
}

export default function BulkLeadTransferModal({
  isOpen,
  onClose,
  leads,
  employees,
  isAdmin,
  currentUserId,
  onTransferred,
  onViewHistory
}: BulkLeadTransferModalProps) {
  const { language } = useLanguage();

  // Filters
  const [sourceId, setSourceId] = useState<string>(isAdmin ? "0" : String(currentUserId || ""));
  const [selectedStage, setSelectedStage] = useState<string>("All");
  const [selectionMode, setSelectionMode] = useState<"count" | "specific">("count");
  const [transferCount, setTransferCount] = useState<number>(10);
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
  const [destinationId, setDestinationId] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [searchLeadQuery, setSearchLeadQuery] = useState<string>("");

  const [busy, setBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [internalEmployees, setInternalEmployees] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (employees && employees.length > 0) {
        setInternalEmployees(employees);
      } else {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        fetch(`${API_BASE_URL}/employees/workload`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.employees?.length) {
              setInternalEmployees(data.employees);
            }
          })
          .catch(() => {});
      }
    }
  }, [isOpen, employees]);

  const activeEmployeeList = internalEmployees.length > 0 ? internalEmployees : employees;

  // Initialize source if role changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
      setSelectedLeadIds([]);
      if (!isAdmin && currentUserId) {
        setSourceId(String(currentUserId));
      }
    }
  }, [isOpen, isAdmin, currentUserId]);

  // Compute matching leads from local props
  const matchingLeads = useMemo(() => {
    return leads.filter((l) => {
      // Source filter
      if (sourceId === "0" || sourceId === "unassigned") {
        if (l.owner_id) return false;
      } else if (sourceId) {
        if (String(l.owner_id) !== String(sourceId)) return false;
      }

      // Stage filter
      if (selectedStage !== "All" && selectedStage !== "") {
        if ((l.status || "New").toLowerCase() !== selectedStage.toLowerCase()) return false;
      }

      return true;
    });
  }, [leads, sourceId, selectedStage]);

  // Filtered specific leads for picker
  const filteredSpecificLeads = useMemo(() => {
    if (!searchLeadQuery.trim()) return matchingLeads;
    const q = searchLeadQuery.toLowerCase();
    return matchingLeads.filter(
      (l) =>
        (l.company_name || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q) ||
        (l.city || "").toLowerCase().includes(q)
    );
  }, [matchingLeads, searchLeadQuery]);

  // Stages available
  const availableStages = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      if (l.status) set.add(l.status);
    });
    return ["All", ...Array.from(set)];
  }, [leads]);

  // Effective count to transfer
  const effectiveCount =
    selectionMode === "count"
      ? Math.min(transferCount, matchingLeads.length)
      : selectedLeadIds.length;

  const handleSelectAllSpecific = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedLeadIds(filteredSpecificLeads.map((l) => l.id));
    } else {
      setSelectedLeadIds([]);
    }
  };

  const handleToggleLead = (id: number) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleQuickReason = (text: string) => {
    setReason(text);
  };

  const handleExecuteTransfer = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!destinationId) {
      setErrorMsg(language === "es" ? "Selecciona un vendedor de destino." : "Please select a destination salesperson.");
      return;
    }

    if (String(destinationId) === String(sourceId)) {
      setErrorMsg(language === "es" ? "El vendedor de destino no puede ser el mismo que el origen." : "Destination cannot be the same as the source.");
      return;
    }

    if (!reason.trim()) {
      setErrorMsg(language === "es" ? "Ingresa un motivo para la transferencia." : "Please provide a reason for the transfer.");
      return;
    }

    if (selectionMode === "specific" && selectedLeadIds.length === 0) {
      setErrorMsg(language === "es" ? "Selecciona al menos un lead." : "Please select at least one lead.");
      return;
    }

    if (selectionMode === "count" && (transferCount <= 0 || matchingLeads.length === 0)) {
      setErrorMsg(language === "es" ? "No hay leads que coincidan con los filtros para transferir." : "No matching leads found to transfer.");
      return;
    }

    setBusy(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const payload: any = {
        employee_id: Number(destinationId),
        reason: reason.trim()
      };

      if (selectionMode === "specific") {
        payload.lead_ids = selectedLeadIds;
      } else {
        payload.source_employee_id = sourceId === "0" ? 0 : Number(sourceId);
        payload.stage = selectedStage === "All" ? null : selectedStage;
        payload.count = transferCount;
      }

      const res = await fetch(`${API_BASE_URL}/leads/bulk-transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || "Failed to transfer leads");
      }

      setSuccessMsg(data.message || `Successfully transferred ${data.transferred} lead(s)!`);
      setTimeout(() => {
        onTransferred();
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || "Error transferring leads");
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-slate-900 dark:text-zinc-100"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0 bg-slate-50/70 dark:bg-zinc-900/60">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold leading-tight">
                  {language === "es" ? "Transferencia Masiva de Leads" : "Bulk Transfer Leads"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  {language === "es"
                    ? "Filtra, selecciona y reasigna prospectos con registro de auditoría."
                    : "Filter, select, and reassign leads across team members with audited history."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onViewHistory && (
                <button
                  type="button"
                  onClick={onViewHistory}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-zinc-700 transition flex items-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>{language === "es" ? "Ver Historial" : "View History"}</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* STEP 1: Filter Criteria */}
            <div className="p-4 rounded-xl border border-slate-200/90 dark:border-white/10 bg-slate-50/50 dark:bg-zinc-900/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-300">
                    {language === "es" ? "1. Filtrar Prospectos a Transferir" : "1. Filter Source Leads"}
                  </span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {matchingLeads.length} {language === "es" ? "leads coinciden" : "leads match"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Source Assignee */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">
                    {language === "es" ? "Origen (Asignado Actual)" : "Source Assignee"}
                  </label>
                  {isAdmin ? (
                    <select
                      value={sourceId}
                      onChange={(e) => setSourceId(e.target.value)}
                      className="w-full text-xs font-medium bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
                    >
                      <option value="0">{language === "es" ? "No asignados (Sin vendedor)" : "Unassigned Leads"}</option>
                      {activeEmployeeList.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300">
                      {language === "es" ? "Mis Prospectos Asignados" : "My Assigned Leads"}
                    </div>
                  )}
                </div>

                {/* Stage */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">
                    {language === "es" ? "Etapa / Estado" : "Lead Stage"}
                  </label>
                  <select
                    value={selectedStage}
                    onChange={(e) => setSelectedStage(e.target.value)}
                    className="w-full text-xs font-medium bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
                  >
                    {availableStages.map((st) => (
                      <option key={st} value={st}>
                        {st === "All" ? (language === "es" ? "Todas las Etapas" : "All Stages") : st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* STEP 2: Selection Mode (Count vs Specific) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-300">
                  {language === "es" ? "2. Cantidad o Selección" : "2. Quantity or Selection"}
                </span>
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectionMode("count")}
                    className={`px-3 py-1 rounded-lg font-bold transition ${
                      selectionMode === "count"
                        ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                        : "text-slate-500 dark:text-zinc-400 hover:text-slate-800"
                    }`}
                  >
                    {language === "es" ? "Por Cantidad" : "By Quantity"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectionMode("specific")}
                    className={`px-3 py-1 rounded-lg font-bold transition ${
                      selectionMode === "specific"
                        ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                        : "text-slate-500 dark:text-zinc-400 hover:text-slate-800"
                    }`}
                  >
                    {language === "es" ? "Elegir Específicos" : "Pick Specific Leads"}
                  </button>
                </div>
              </div>

              {selectionMode === "count" ? (
                <div className="p-3.5 rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-zinc-900 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-600 dark:text-zinc-400 font-medium">
                      {language === "es"
                        ? "Número de leads a transferir (más recientes primero):"
                        : "Number of leads to transfer (most recent first):"}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max={matchingLeads.length || 500}
                        value={transferCount}
                        onChange={(e) => setTransferCount(Math.max(1, Number(e.target.value) || 1))}
                        className="w-20 px-2.5 py-1 text-center text-sm font-bold bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-blue-600 dark:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {[5, 10, 25, 50, 100].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setTransferCount(num)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                          transferCount === num
                            ? "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300"
                            : "bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:border-slate-300"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                    {matchingLeads.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTransferCount(matchingLeads.length)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                          transferCount === matchingLeads.length
                            ? "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300"
                            : "bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:border-slate-300"
                        }`}
                      >
                        {language === "es" ? `Todos (${matchingLeads.length})` : `All (${matchingLeads.length})`}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-zinc-900 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder={language === "es" ? "Buscar por empresa, correo o ciudad..." : "Search matching leads..."}
                        value={searchLeadQuery}
                        onChange={(e) => setSearchLeadQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-800 dark:text-zinc-200 focus:outline-none"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={
                          filteredSpecificLeads.length > 0 &&
                          selectedLeadIds.length === filteredSpecificLeads.length
                        }
                        onChange={handleSelectAllSpecific}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{language === "es" ? "Marcar todos" : "Select all"}</span>
                    </label>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1 divide-y divide-slate-100 dark:divide-zinc-800/60 border border-slate-200 dark:border-zinc-700/60 rounded-xl p-1.5">
                    {filteredSpecificLeads.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4 italic">
                        {language === "es" ? "No hay prospectos que coincidan." : "No matching leads found."}
                      </p>
                    ) : (
                      filteredSpecificLeads.map((lead) => {
                        const isChecked = selectedLeadIds.includes(lead.id);
                        return (
                          <label
                            key={lead.id}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition ${
                              isChecked
                                ? "bg-blue-50/70 dark:bg-blue-950/40"
                                : "hover:bg-slate-50 dark:hover:bg-zinc-800/50"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleLead(lead.id)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              <div className="truncate min-w-0">
                                <span className="font-bold text-slate-800 dark:text-zinc-200 truncate block">
                                  {lead.company_name}
                                </span>
                                <span className="text-[10px] text-slate-400 truncate block">
                                  {lead.email || lead.phone || lead.city || "No contact info"}
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 shrink-0">
                              {lead.status || "New"}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 flex justify-between">
                    <span>
                      {selectedLeadIds.length} {language === "es" ? "seleccionados" : "selected"}
                    </span>
                    <span>
                      {matchingLeads.length} {language === "es" ? "totales disponibles" : "total available"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 3: Destination Salesperson & Reason */}
            <div className="p-4 rounded-xl border border-slate-200/90 dark:border-white/10 bg-slate-50/50 dark:bg-zinc-900/30 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-300 block">
                {language === "es" ? "3. Destino y Motivo" : "3. Destination & Audit Reason"}
              </span>

              <div>
                <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">
                  {language === "es" ? "Asignar A (Vendedor Destino) *" : "Assign To (Destination Salesperson) *"}
                </label>
                <select
                  value={destinationId}
                  onChange={(e) => setDestinationId(e.target.value)}
                  className="w-full text-xs font-semibold bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
                >
                  <option value="">{language === "es" ? "Selecciona un vendedor..." : "Select destination salesperson..."}</option>
                  {activeEmployeeList
                    .filter((e) => String(e.id) !== String(sourceId))
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">
                  {language === "es" ? "Motivo de la Transferencia *" : "Reason for Transfer *"}
                </label>
                <textarea
                  rows={2}
                  maxLength={1000}
                  placeholder={
                    language === "es"
                      ? "ej. Reasignación de territorio, balance de carga de trabajo, rotación de equipo..."
                      : "e.g., Workload rebalancing, territory coverage, specialist handover..."
                  }
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-2.5 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none shadow-xs"
                />
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  <span className="text-[10px] text-slate-400 font-semibold">{language === "es" ? "Rápido:" : "Quick:"}</span>
                  {[
                    "Workload rebalance",
                    "Territory reassignment",
                    "Senior sales handover",
                    "Direct coverage"
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleQuickReason(preset)}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 font-medium transition cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="px-5 py-3.5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-900/80 flex items-center justify-between shrink-0">
            <div className="text-xs text-slate-500 dark:text-zinc-400">
              <span className="font-bold text-slate-800 dark:text-zinc-200">{effectiveCount}</span>{" "}
              {language === "es" ? "prospectos serán transferidos" : "leads will be transferred"}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                {language === "es" ? "Cancelar" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleExecuteTransfer}
                disabled={busy || effectiveCount === 0 || !destinationId || !reason.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition cursor-pointer"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{language === "es" ? "Transfiriendo..." : "Transferring..."}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {language === "es" ? `Transferir ${effectiveCount} Leads` : `Transfer ${effectiveCount} Leads`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

