"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarCheck,
  CalendarX,
  CalendarClock,
  Clock,
  Building2,
  CheckCircle2,
  X,
  AlertCircle,
  Plus,
  Loader2,
  ArrowRight,
  MessageSquare
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";

export default function MeetingOutcomePromptModal() {
  const { language } = useLanguage();
  const [pendingMeetings, setPendingMeetings] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Resolution mode: 'ask' | 'complete' | 'reschedule' | 'cancel'
  const [mode, setMode] = useState<"ask" | "complete" | "reschedule" | "cancel">("ask");

  // Completion form
  const [outcome, setOutcome] = useState<string>("Meeting completed successfully");
  const [notes, setNotes] = useState<string>("");
  const [createFollowup, setCreateFollowup] = useState<boolean>(false);
  const [followupDate, setFollowupDate] = useState<string>("");
  const [followupTitle, setFollowupTitle] = useState<string>("");
  const [followupType, setFollowupType] = useState<string>("Follow-up");

  // Reschedule form
  const [rescheduleDate, setRescheduleDate] = useState<string>("");
  const [rescheduleReason, setRescheduleReason] = useState<string>("");

  // Cancel form
  const [cancelReason, setCancelReason] = useState<string>("");

  const [busy, setBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Poll / check pending meetings on mount and every 60s
  useEffect(() => {
    checkPendingMeetings();
    checkReminders();
    const interval = setInterval(() => {
      checkPendingMeetings();
      checkReminders();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const checkReminders = async () => {
    try {
      await fetch(`${API_BASE_URL}/meetings/check-reminders`, {
        headers: getAuthHeaders()
      });
    } catch (e) {
      // background silent
    }
  };

  const checkPendingMeetings = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/meetings/pending-outcomes`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.pending_meetings || [];
        if (list.length > 0) {
          setPendingMeetings(list);
          setCurrentIndex(0);
          setIsOpen(true);
        }
      }
    } catch (e) {
      console.error("Failed to check pending meeting outcomes", e);
    }
  };

  const currentMeeting = pendingMeetings[currentIndex];

  const handleNextOrClose = () => {
    setMode("ask");
    setErrorMsg(null);
    setNotes("");
    setOutcome("Meeting completed successfully");
    setCreateFollowup(false);
    setFollowupDate("");
    setRescheduleDate("");
    setRescheduleReason("");
    setCancelReason("");

    if (currentIndex + 1 < pendingMeetings.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsOpen(false);
      setPendingMeetings([]);
    }
  };

  const handleComplete = async () => {
    if (!outcome.trim()) {
      setErrorMsg(language === "es" ? "Ingresa un resultado para la reunión." : "Please enter meeting outcome.");
      return;
    }
    if (createFollowup && !followupDate) {
      setErrorMsg(language === "es" ? "Selecciona la fecha y hora para el seguimiento." : "Please select a follow-up date and time.");
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/meetings/${currentMeeting.id}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          outcome: outcome.trim(),
          notes: notes.trim() || undefined,
          create_followup: createFollowup,
          followup_date: followupDate || undefined,
          followup_title: followupTitle || undefined,
          followup_type: followupType
        })
      });
      if (res.ok) {
        handleNextOrClose();
      } else {
        const data = await res.json();
        setErrorMsg(data.detail || "Error completing meeting");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error completing meeting");
    } finally {
      setBusy(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleDate) {
      setErrorMsg(language === "es" ? "Selecciona una nueva fecha y hora." : "Please select a new date and time.");
      return;
    }
    if (!rescheduleReason.trim()) {
      setErrorMsg(language === "es" ? "Ingresa el motivo de la reprogramación." : "Please provide a reason for rescheduling.");
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/meetings/${currentMeeting.id}/reschedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          scheduled_at: rescheduleDate,
          reason: rescheduleReason.trim()
        })
      });
      if (res.ok) {
        handleNextOrClose();
      } else {
        const data = await res.json();
        setErrorMsg(data.detail || "Error rescheduling meeting");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error rescheduling meeting");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      setErrorMsg(language === "es" ? "Ingresa el motivo de la cancelación." : "Please provide a reason for cancellation.");
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/meetings/${currentMeeting.id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          reason: cancelReason.trim()
        })
      });
      if (res.ok) {
        handleNextOrClose();
      } else {
        const data = await res.json();
        setErrorMsg(data.detail || "Error cancelling meeting");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error cancelling meeting");
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen || !currentMeeting) return null;

  const dt = currentMeeting.scheduled_at ? new Date(currentMeeting.scheduled_at) : null;
  const timeLabel = dt
    ? dt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
      }) +
      " at " +
      dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "Past meeting";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden text-slate-900 dark:text-zinc-100"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0 bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-purple-50/80 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-purple-950/40">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <CalendarCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold leading-tight">
                  {language === "es" ? "Revisión de Resultado de Reunión" : "Meeting Outcome Review"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  {pendingMeetings.length > 1
                    ? `Reunión ${currentIndex + 1} de ${pendingMeetings.length}`
                    : "Actualiza el estado y registra el resultado"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition"
              title="Review later"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Meeting Details Card */}
          <div className="p-5 space-y-4 overflow-y-auto">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {currentMeeting.title}
                </h3>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900 shrink-0">
                  {currentMeeting.meeting_type || "Meeting"}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{timeLabel}</span>
                </span>
                {currentMeeting.company_name && (
                  <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-zinc-300">
                    <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>{currentMeeting.company_name}</span>
                  </span>
                )}
              </div>
            </div>

            {/* MODE SELECTION */}
            {mode === "ask" && (
              <div className="space-y-3 pt-1">
                <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300 text-center">
                  {language === "es"
                    ? "¿Se llevó a cabo esta reunión?"
                    : "Did this scheduled meeting take place?"}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setMode("complete")}
                    className="p-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 flex flex-col items-center justify-center gap-1.5 transition text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>{language === "es" ? "Sí, Completada" : "Yes, Done"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("reschedule")}
                    className="p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/70 text-amber-800 dark:text-amber-300 flex flex-col items-center justify-center gap-1.5 transition text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <CalendarClock className="w-5 h-5 text-amber-600" />
                    <span>{language === "es" ? "Reprogramar" : "Reschedule"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("cancel")}
                    className="p-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 text-rose-800 dark:text-rose-300 flex flex-col items-center justify-center gap-1.5 transition text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <CalendarX className="w-5 h-5 text-rose-600" />
                    <span>{language === "es" ? "Cancelar" : "Cancel"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* COMPLETE FORM */}
            {mode === "complete" && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    {language === "es" ? "Registrar Reunión Completada" : "Record Completed Meeting"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMode("ask")}
                    className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 underline"
                  >
                    {language === "es" ? "Cambiar opción" : "Change choice"}
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    {language === "es" ? "Resultado / Conclusión *" : "Outcome / Summary *"}
                  </label>
                  <input
                    type="text"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    placeholder="e.g., Client interested in proposal, requested follow-up next week"
                    className="w-full text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    {language === "es" ? "Notas Adicionales" : "Discussion Notes"}
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Key items discussed, action items, next steps..."
                    className="w-full text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-2.5 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>

                {/* Follow-up Checkbox */}
                <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/30 space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-blue-900 dark:text-blue-300">
                    <input
                      type="checkbox"
                      checked={createFollowup}
                      onChange={(e) => setCreateFollowup(e.target.checked)}
                      className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{language === "es" ? "Agendar seguimiento inmediato basado en esta reunión" : "Schedule immediate follow-up based on this meeting"}</span>
                  </label>

                  {createFollowup && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                          {language === "es" ? "Fecha y Hora *" : "Follow-up Date & Time *"}
                        </label>
                        <input
                          type="datetime-local"
                          value={followupDate}
                          onChange={(e) => setFollowupDate(e.target.value)}
                          className="w-full text-xs bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                          {language === "es" ? "Tipo de Seguimiento" : "Type"}
                        </label>
                        <select
                          value={followupType}
                          onChange={(e) => setFollowupType(e.target.value)}
                          className="w-full text-xs bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
                        >
                          <option value="Follow-up">Follow-up Meeting</option>
                          <option value="Call">Phone Call</option>
                          <option value="Demo">Demo</option>
                          <option value="Contract Review">Contract Review</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setMode("ask")}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                  >
                    {language === "es" ? "Atrás" : "Back"}
                  </button>
                  <button
                    type="button"
                    onClick={handleComplete}
                    disabled={busy || !outcome.trim() || (createFollowup && !followupDate)}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>{language === "es" ? "Guardar y Completar" : "Save & Complete"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* RESCHEDULE FORM */}
            {mode === "reschedule" && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <CalendarClock className="w-4 h-4" />
                    {language === "es" ? "Reprogramar Reunión" : "Reschedule Meeting"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMode("ask")}
                    className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 underline"
                  >
                    {language === "es" ? "Cambiar opción" : "Change choice"}
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    {language === "es" ? "Nueva Fecha y Hora *" : "New Date & Time *"}
                  </label>
                  <input
                    type="datetime-local"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="w-full text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    {language === "es" ? "Motivo de la Reprogramación *" : "Reason for Rescheduling *"}
                  </label>
                  <textarea
                    rows={2}
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                    placeholder="e.g., Client requested change of time, conflicting priority..."
                    className="w-full text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-2.5 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setMode("ask")}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                  >
                    {language === "es" ? "Atrás" : "Back"}
                  </button>
                  <button
                    type="button"
                    onClick={handleReschedule}
                    disabled={busy || !rescheduleDate || !rescheduleReason.trim()}
                    className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                    <span>{language === "es" ? "Reprogramar Reunión" : "Reschedule Meeting"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* CANCEL FORM */}
            {mode === "cancel" && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                    <CalendarX className="w-4 h-4" />
                    {language === "es" ? "Cancelar Reunión" : "Cancel Meeting"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMode("ask")}
                    className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 underline"
                  >
                    {language === "es" ? "Cambiar opción" : "Change choice"}
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    {language === "es" ? "Motivo de la Cancelación *" : "Reason for Cancellation *"}
                  </label>
                  <textarea
                    rows={2}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="e.g., Prospect did not attend, decided not to proceed..."
                    className="w-full text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-2.5 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setMode("ask")}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                  >
                    {language === "es" ? "Atrás" : "Back"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={busy || !cancelReason.trim()}
                    className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarX className="w-3.5 h-3.5" />}
                    <span>{language === "es" ? "Confirmar Cancelación" : "Confirm Cancellation"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
