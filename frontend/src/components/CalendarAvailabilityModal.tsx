"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Clock, Lock, Trash2, CalendarCheck, AlertTriangle } from "lucide-react";
import { API_BASE_URL } from "@/config";

interface CalendarAvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export default function CalendarAvailabilityModal({
  isOpen,
  onClose,
  onUpdated,
}: CalendarAvailabilityModalProps) {
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
  const [availabilityHours, setAvailabilityHours] = useState({
    start_time: "09:00",
    end_time: "18:00",
    work_days: [1, 2, 3, 4, 5],
  });
  const [blockForm, setBlockForm] = useState({
    date: "",
    start_time: "",
    end_time: "",
    reason: "",
    all_day: true,
  });
  const [savingBlock, setSavingBlock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const getAuthHeaders = useCallback((extra: Record<string, string> = {}) => {
    const token = typeof window !== "undefined" ? (localStorage.getItem("token") || localStorage.getItem("crm_token") || localStorage.getItem("access_token")) : null;
    const userStr = typeof window !== "undefined" ? (localStorage.getItem("crm_user") || localStorage.getItem("user")) : null;
    let uid = "";
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        if (u?.id) uid = String(u.id);
      } catch {}
    }
    return {
      ...extra,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(uid ? { "X-User-ID": uid } : {}),
    };
  }, []);

  const fetchBlockedSlots = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/calendar/blocked-slots`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setBlockedSlots(data.blocked_slots || []);
      }
    } catch {
      // silent
    }
  }, [getAuthHeaders]);

  const fetchAvailability = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/calendar/availability`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.availability) {
          setAvailabilityHours({
            start_time: data.availability.start_time || "09:00",
            end_time: data.availability.end_time || "18:00",
            work_days: data.availability.working_days || [1, 2, 3, 4, 5],
          });
        }
        if (data.blocked_slots) {
          setBlockedSlots(data.blocked_slots);
        }
      }
    } catch {
      // silent
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setStatusMsg(null);
      Promise.all([fetchBlockedSlots(), fetchAvailability()]).finally(() => setLoading(false));
    }
  }, [isOpen, fetchBlockedSlots, fetchAvailability]);

  const handleSaveAvailability = async () => {
    setSavingBlock(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/calendar/availability`, {
        method: "POST",
        credentials: "include",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          working_days: availabilityHours.work_days,
          start_time: availabilityHours.start_time,
          end_time: availabilityHours.end_time,
          slot_duration_minutes: 30,
        }),
      });
      if (res.ok) {
        setStatusMsg({ text: "Working hours updated successfully!", type: "success" });
        onUpdated?.();
      } else {
        const err = await res.json().catch(() => ({}));
        setStatusMsg({ text: err.detail || "Could not update availability.", type: "error" });
      }
    } catch {
      setStatusMsg({ text: "Network error saving availability.", type: "error" });
    } finally {
      setSavingBlock(false);
    }
  };

  const handleCreateBlockedSlot = async () => {
    if (!blockForm.date) return;
    setSavingBlock(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/calendar/blocked-slots`, {
        method: "POST",
        credentials: "include",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          date: blockForm.date,
          start_time: blockForm.start_time || null,
          end_time: blockForm.end_time || null,
          reason: blockForm.reason || "Blackout / Unavailable",
          all_day: !blockForm.start_time && !blockForm.end_time,
        }),
      });
      if (res.ok) {
        setBlockForm({ date: "", start_time: "", end_time: "", reason: "", all_day: true });
        await fetchBlockedSlots();
        setStatusMsg({ text: "Blocked date/time slot created!", type: "success" });
        onUpdated?.();
      } else {
        const err = await res.json().catch(() => ({}));
        setStatusMsg({ text: err.detail || "Could not create blocked slot.", type: "error" });
      }
    } catch {
      setStatusMsg({ text: "Network error saving blocked slot.", type: "error" });
    } finally {
      setSavingBlock(false);
    }
  };

  const handleDeleteBlockedSlot = async (slotId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/calendar/blocked-slots/${slotId}`, {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        await fetchBlockedSlots();
        setStatusMsg({ text: "Blocked slot removed.", type: "success" });
        onUpdated?.();
      }
    } catch {
      // silent
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/10 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Calendar Availability & Blackout Times
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Define available working hours and block blackout dates or times
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {statusMsg && (
          <div
            className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              statusMsg.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
            }`}
          >
            {statusMsg.type === "success" ? <CalendarCheck className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Section 1: Standard Working Hours */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-white/5 space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-zinc-300">
            1. Standard Daily Working Hours (Available Times)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={availabilityHours.start_time}
                onChange={(e) =>
                  setAvailabilityHours({ ...availabilityHours, start_time: e.target.value })
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                End Time
              </label>
              <input
                type="time"
                value={availabilityHours.end_time}
                onChange={(e) =>
                  setAvailabilityHours({ ...availabilityHours, end_time: e.target.value })
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveAvailability}
            disabled={savingBlock}
            className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            Save Working Hours
          </button>
        </div>

        {/* Section 2: Blackout / Blocked Date or Times */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-white/5 space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-zinc-300">
            2. Block Specific Date or Blackout Time
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                Date to Block *
              </label>
              <input
                type="date"
                value={blockForm.date}
                onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                Start Time (Optional)
              </label>
              <input
                type="time"
                value={blockForm.start_time}
                onChange={(e) => setBlockForm({ ...blockForm, start_time: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                End Time (Optional)
              </label>
              <input
                type="time"
                value={blockForm.end_time}
                onChange={(e) => setBlockForm({ ...blockForm, end_time: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
              Reason / Blackout Description
            </label>
            <input
              type="text"
              placeholder="e.g. National Holiday, Admissions Review, Staff Meeting, Offsite"
              value={blockForm.reason}
              onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white"
            />
          </div>

          <button
            type="button"
            onClick={handleCreateBlockedSlot}
            disabled={savingBlock || !blockForm.date}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" /> Block This Date / Slot
          </button>
        </div>

        {/* Section 3: List of Active Blocked Slots */}
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-2">
            Active Blackout / Blocked Dates ({blockedSlots.length})
          </h4>
          {blockedSlots.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No dates or times are currently blocked.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {blockedSlots.map((slot) => (
                <div
                  key={slot.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-zinc-900 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <div>
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        {slot.date}
                      </span>
                      {slot.start_time && slot.end_time && (
                        <span className="text-[11px] text-slate-500 dark:text-zinc-400 ml-1.5">
                          ({slot.start_time} - {slot.end_time})
                        </span>
                      )}
                      <span className="text-slate-600 dark:text-zinc-300 ml-2">
                        — {slot.reason || "Blocked slot"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteBlockedSlot(slot.id)}
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                    title="Remove blocked slot"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

