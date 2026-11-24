"use client";
import LocalizedText from "@/components/LocalizedText";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock, CalendarCheck, Video, PhoneCall, Loader2, Check,
  RotateCcw, XCircle, AlertTriangle, GraduationCap, MapPin, UserX,
  ExternalLink, Search, RefreshCw, Clock, Calendar, LayoutList, CalendarDays,
  ChevronLeft, ChevronRight, Lock, Plus
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import LeadScheduleModal, { SchedulePayload } from "@/components/LeadScheduleModal";
import CalendarAvailabilityModal from "@/components/CalendarAvailabilityModal";

type Kind = "all" | "webinar" | "demo" | "followup" | "walkin";

interface ScheduleItem {
  id: number;
  type: "webinar" | "demo" | "followup" | "walkin";
  source?: "followups" | "legacy";
  title?: string | null;
  record?: { type: "lead" | "student" | "client"; id: number; name: string | null } | null;
  lead_id: number | null;
  lead_name: string;
  phone?: string | null;
  email?: string | null;
  course?: string | null;
  owner_id?: number | null;
  owner_name?: string | null;
  scheduled_at: string;
  status: string;
  notes?: string | null;
  meeting_url?: string | null;
  location?: string | null;
}

const GROUPS = ["Overdue", "Today", "Tomorrow", "This week", "Later"] as const;
type Group = typeof GROUPS[number];

const GROUP_CONFIG: Record<Group, { dot: string; text: string; bg: string; border: string }> = {
  Overdue: {
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-500/10",
    border: "border-rose-200 dark:border-rose-500/20"
  },
  Today: {
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/20"
  },
  Tomorrow: {
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/20"
  },
  "This week": {
    dot: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-500/10",
    border: "border-violet-200 dark:border-violet-500/20"
  },
  Later: {
    dot: "bg-slate-400",
    text: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-white/5",
    border: "border-slate-200 dark:border-white/10"
  },
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function groupOf(iso: string): Group {
  const when = new Date(iso);
  const now = new Date();
  if (when.getTime() < now.getTime()) return "Overdue";
  const days = Math.round((startOfDay(when).getTime() - startOfDay(now).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return "This week";
  return "Later";
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SchedulePage() {
  const { role } = useRole();
  const router = useRouter();
  const isAdmin = role === "Admin" || (role as string) === "SuperAdmin";

  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<Kind>("all");
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reschedule, setReschedule] = useState<ScheduleItem | null>(null);
  const [error, setError] = useState("");

  // Views & Calendar State
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);

  useEffect(() => {
    if (role && !["Admin", "Employee", "Intern", "SalesManager", "Demo", "Admissions", "Sales"].includes(role as string) && !isAdmin) {
      router.replace("/");
    }
  }, [role, isAdmin, router]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/schedule/upcoming`);
      if (!res.ok) throw new Error("Could not load the schedule.");
      setItems((await res.json()).items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the schedule.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBlocked = useCallback(async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_BASE_URL}/calendar/blocked-slots`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setBlockedSlots(data.blocked_slots || []);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    load();
    fetchBlocked();
  }, [load, fetchBlocked]);

  const matchesKind = (itemType: string, selectedKind: Kind) => {
    if (selectedKind === "all") return true;
    if (selectedKind === "webinar" || selectedKind === "demo") return itemType === "webinar" || itemType === "demo";
    return itemType === selectedKind;
  };

  const visible = useMemo(() => {
    return items
      .filter(i => {
        const matchesType = matchesKind(i.type, kind);
        const matchesSearch = !search ||
          (i.lead_name || "").toLowerCase().includes(search.toLowerCase()) ||
          (i.phone || "").toLowerCase().includes(search.toLowerCase()) ||
          (i.course || "").toLowerCase().includes(search.toLowerCase()) ||
          (i.owner_name || "").toLowerCase().includes(search.toLowerCase()) ||
          (i.notes || "").toLowerCase().includes(search.toLowerCase());
        return matchesType && matchesSearch;
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [items, kind, search]);

  const grouped = useMemo(() => {
    const map = new Map<Group, ScheduleItem[]>();
    visible.forEach(i => {
      const g = groupOf(i.scheduled_at);
      map.set(g, [...(map.get(g) || []), i]);
    });
    return GROUPS.filter(g => map.has(g)).map(g => ({ group: g, rows: map.get(g)! }));
  }, [visible]);

  const counts = useMemo(() => ({
    all: items.length,
    webinar: items.filter(i => i.type === "webinar" || i.type === "demo").length,
    followup: items.filter(i => i.type === "followup").length,
    walkin: items.filter(i => i.type === "walkin").length,
    today: items.filter(i => groupOf(i.scheduled_at) === "Today").length,
    overdue: items.filter(i => groupOf(i.scheduled_at) === "Overdue").length,
  }), [items]);

  const isNewFollowUp = (item: ScheduleItem) => item.type === "followup" && item.source === "followups";
  const itemKey = (item: ScheduleItem) => `${item.type}-${item.source || "legacy"}-${item.id}`;
  const itemHref = (item: ScheduleItem) => {
    if (!isNewFollowUp(item)) return `/leads/${item.lead_id}`;
    const r = item.record;
    if (!r) return `/leads/${item.lead_id || ""}`;
    if (r.type === "student") return `/students/${r.id}`;
    if (r.type === "client") return `/clients/${r.id}`;
    return `/leads/${r.id}`;
  };

  const patch = async (item: ScheduleItem, body: Record<string, unknown>) => {
    const key = itemKey(item);
    setBusyKey(key);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      let url = "";
      if (isNewFollowUp(item)) {
        url = `${API_BASE_URL}/follow-ups/${item.id}`;
      } else {
        const plural = item.type === "webinar" ? "webinars" : item.type === "demo" ? "demo-sessions" : item.type === "walkin" ? "walk-ins" : "follow-ups";
        url = `${API_BASE_URL}/lead-${plural}/${item.id}`;
      }
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not update appointment.");
      }
    } finally {
      setBusyKey(null);
    }
  };

  const act = async (item: ScheduleItem, action: "done" | "not_attended" | "cancel") => {
    setBusyKey(itemKey(item));
    try {
      if (isNewFollowUp(item)) {
        const st = action === "done" ? "Completed" : "Cancelled";
        await patch(item, { status: st });
      } else {
        const st = action === "done" ? (item.type === "followup" ? "Done" : "Attended") : action === "not_attended" ? "Not Attended" : "Cancelled";
        await patch(item, { status: st });
      }
      await load(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusyKey(null);
    }
  };

  const submitReschedule = async (p: SchedulePayload) => {
    if (!reschedule) return;
    if (isNewFollowUp(reschedule)) {
      await patch(reschedule, { due_at: p.scheduled_at, notes: p.notes || null, tz_offset: new Date().getTimezoneOffset() });
      setReschedule(null);
      await load(true);
      return;
    }
    const body: Record<string, unknown> = { scheduled_at: p.scheduled_at, notes: p.notes || null };
    if (reschedule.type === "webinar" || reschedule.type === "demo") body.meeting_url = p.meeting_url || null;
    if (reschedule.type === "walkin") body.location = p.location || "Campus Front Desk";
    await patch(reschedule, body);
    setReschedule(null);
    await load(true);
  };

  // ── Month Calendar Generation ──
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startDayOfWeek = firstDay.getDay() - 1; // Monday = 0
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days = [];
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const dateStr = new Date(year, month - 1, d).toISOString().slice(0, 10);
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
      });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
      });
    }

    const remaining = 35 - days.length > 0 ? 35 - days.length : 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const dateStr = new Date(year, month + 1, d).toISOString().slice(0, 10);
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [year, month]);

  const monthLabel = calendarDate.toLocaleString("default", { month: "long", year: "numeric" });

  const prevMonth = () => setCalendarDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCalendarDate(new Date(year, month + 1, 1));
  const gotoToday = () => setCalendarDate(new Date());

  const tabs: { id: Kind; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "webinar", label: "Webinars & Demos", count: counts.webinar },
    { id: "followup", label: "Follow-ups", count: counts.followup },
    { id: "walkin", label: "Walk-ins", count: counts.walkin },
  ];

  return (
    <div className="space-y-4">
      {/* Compact Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
            <CalendarClock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none">
                <LocalizedText text={"Important Dates & Follow-ups Calendar"} />
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {items.length} <LocalizedText text={"scheduled"} />
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              {isAdmin
                ? "Track appointments, webinars, walk-ins, follow-ups, and manage blackout/available times"
                : "Your upcoming appointments, webinars & follow-ups"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Availability & Blocked Times Button */}
          <button
            type="button"
            onClick={() => setShowAvailabilityModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 hover:bg-amber-100 text-xs font-bold transition shadow-2xs cursor-pointer"
            title="Configure working hours & blackout / blocked dates"
          >
            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Availability & Blocked Times</span>
          </button>

          {/* View Switcher: Calendar vs List */}
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-white/5 p-0.5 border border-slate-200 dark:border-white/10">
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === "calendar"
                  ? "bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === "list"
                  ? "bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => { load(); fetchBlocked(); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
            <span className="hidden sm:inline"><LocalizedText text={"Refresh"} /></span>
          </button>

          <Link
            href="/follow-ups"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 transition shadow-2xs"
            title="Open unified follow-ups board"
          >
            <span>Follow-ups Board →</span>
          </Link>
        </div>
      </div>

      {/* 4-KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider"><LocalizedText text={"Total Scheduled"} /></p>
            <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight mt-0.5">{counts.all}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Calendar className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider"><LocalizedText text={"Due Today"} /></p>
            <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5">{counts.today}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider"><LocalizedText text={"Overdue"} /></p>
            <p className="text-base sm:text-lg font-bold text-rose-600 dark:text-rose-400 leading-tight mt-0.5">{counts.overdue}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider"><LocalizedText text={"Webinars & Demos"} /></p>
            <p className="text-base sm:text-lg font-bold text-indigo-600 dark:text-indigo-400 leading-tight mt-0.5">{counts.webinar}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Video className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Single-Row Search + Kind Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white dark:bg-[#111111]/90 p-2 sm:px-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search lead, phone, course, rep, notes..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Kind Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {tabs.map(tab => {
            const active = kind === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setKind(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  active
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5"
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    active ? "bg-white/20 text-white" : "bg-slate-200/70 dark:bg-white/10 text-slate-500 dark:text-zinc-400"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => load()} className="font-semibold underline ml-2 cursor-pointer"><LocalizedText text={"Retry"} /></button>
        </div>
      ) : viewMode === "calendar" ? (
        /* ── Full Interactive Calendar View ── */
        <div className="space-y-3">
          {/* Calendar Month Navigation Header */}
          <div className="flex items-center justify-between bg-white dark:bg-[#111111]/90 p-3 rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white px-2">
                {monthLabel}
              </h2>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition cursor-pointer"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={gotoToday}
                className="ml-2 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Today
              </button>
            </div>

            {/* Quick Legend */}
            <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500 dark:text-zinc-400">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500"></span> Webinar/Demo
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500"></span> Follow-up
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-sky-500"></span> Walk-in
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-600"></span> Blocked Slot
              </span>
            </div>
          </div>

          {/* Monday-first Calendar Grid */}
          <div className="border border-slate-200/90 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-950 shadow-xs">
            <div className="grid grid-cols-7 border-b border-slate-200/90 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayName) => (
                <div
                  key={dayName}
                  className="py-2 text-center text-xs font-bold text-slate-500 dark:text-zinc-400 select-none uppercase tracking-wider"
                >
                  {dayName}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-zinc-800">
              {calendarDays.map((cd, idx) => {
                const dayItems = visible.filter(item => (item.scheduled_at || "").slice(0, 10) === cd.dateStr);
                const dayBlocked = blockedSlots.filter(b => (b.date || "").slice(0, 10) === cd.dateStr);
                const isToday = cd.dateStr === new Date().toISOString().slice(0, 10);

                return (
                  <div
                    key={`${cd.dateStr}-${idx}`}
                    className={`min-h-[110px] sm:min-h-[125px] p-1.5 flex flex-col justify-between transition ${
                      !cd.isCurrentMonth
                        ? "bg-slate-50/40 dark:bg-zinc-950/40 opacity-40"
                        : "bg-white dark:bg-zinc-950"
                    }`}
                  >
                    {/* Day number */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs ${
                          isToday
                            ? "bg-blue-600 text-white rounded-md px-1.5 py-0.5 font-bold shadow-xs"
                            : "text-slate-700 dark:text-zinc-300 font-semibold"
                        }`}
                      >
                        {cd.dayNum}
                      </span>

                      {cd.isCurrentMonth && (
                        <button
                          type="button"
                          onClick={() => setShowAvailabilityModal(true)}
                          className="opacity-0 hover:opacity-100 p-0.5 text-slate-400 hover:text-amber-500 transition cursor-pointer"
                          title="Block this day / Add working hours"
                        >
                          <Lock className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>

                    {/* Day events stack */}
                    <div className="space-y-1 my-1 overflow-y-auto max-h-24 scrollbar-none">
                      {/* Blocked Slots */}
                      {dayBlocked.map((b) => (
                        <div
                          key={b.id}
                          onClick={() => setShowAvailabilityModal(true)}
                          className="w-full px-1.5 py-0.5 rounded-xs bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-semibold truncate flex items-center gap-1 shadow-2xs transition cursor-pointer"
                          title={`Blocked: ${b.reason || "Unavailable"}`}
                        >
                          <Lock className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">Blocked: {b.reason || "Blackout"}</span>
                        </div>
                      ))}

                      {/* Scheduled Items */}
                      {dayItems.map((item) => {
                        const isWebinar = item.type === "webinar" || item.type === "demo";
                        const isWalkIn = item.type === "walkin";
                        const isOverdue = groupOf(item.scheduled_at) === "Overdue";

                        const chipClass = isOverdue
                          ? "bg-rose-500 hover:bg-rose-600 text-white"
                          : isWebinar
                          ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                          : isWalkIn
                          ? "bg-sky-600 hover:bg-sky-700 text-white"
                          : "bg-amber-600 hover:bg-amber-700 text-white";

                        const Icon = isWebinar ? Video : isWalkIn ? MapPin : PhoneCall;

                        return (
                          <div
                            key={itemKey(item)}
                            onClick={() => setReschedule(item)}
                            className={`w-full px-1.5 py-0.5 rounded-xs text-[10px] font-medium truncate flex items-center gap-1 shadow-2xs transition cursor-pointer ${chipClass}`}
                            title={`${fmtTime(item.scheduled_at)} · ${item.lead_name} (${item.type})`}
                          >
                            <Icon className="w-2.5 h-2.5 shrink-0" />
                            <span className="font-bold shrink-0">{fmtTime(item.scheduled_at)}</span>
                            <span className="truncate">{item.lead_name}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="text-[10px] text-slate-400 dark:text-zinc-500">
                      {dayItems.length > 0 && <span>{dayItems.length} item{dayItems.length > 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10">
          <CalendarCheck className="w-8 h-8 mx-auto mb-2 text-slate-400 dark:text-zinc-600" />
          <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300"><LocalizedText text={"Nothing scheduled"} /></p>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
            <LocalizedText text={"Move a lead to Follow-up, Webinar Scheduled, or Walk-in Scheduled in"} />{" "}
            <Link href="/leads" className="text-blue-600 hover:underline"><LocalizedText text={"Student Leads"} /></Link>.
          </p>
        </div>
      ) : (
        /* ── Grouped List View ── */
        <div className="space-y-4">
          {grouped.map(({ group, rows }) => {
            const grpCfg = GROUP_CONFIG[group];
            return (
              <div key={group} className="space-y-1.5">
                {/* Group label */}
                <div className="flex items-center gap-2 px-1">
                  <span className={`w-2 h-2 rounded-full ${grpCfg.dot}`} />
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${grpCfg.text}`}>
                    {group}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-medium bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-zinc-400">
                    {rows.length}
                  </span>
                </div>

                {/* Rows / Cards */}
                <div className="space-y-1.5">
                  {rows.map(item => {
                    const key = itemKey(item);
                    const isWebinar = item.type === "webinar" || item.type === "demo";
                    const isWalkIn = item.type === "walkin";
                    const busy = busyKey === key;
                    const Icon = isWebinar ? Video : isWalkIn ? MapPin : PhoneCall;
                    const overdue = group === "Overdue";

                    const badgeStyle = isWebinar
                      ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30"
                      : isWalkIn
                      ? "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/30"
                      : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30";

                    return (
                      <div
                        key={key}
                        className={`group relative flex flex-col md:flex-row md:items-center justify-between gap-2.5 p-2.5 sm:px-4 sm:py-2 bg-white dark:bg-[#111111]/90 rounded-xl border ${
                          overdue
                            ? "border-rose-300 dark:border-rose-500/40 bg-rose-50/10"
                            : "border-slate-200/90 dark:border-white/10"
                        } hover:border-blue-500/60 dark:hover:border-blue-500/50 hover:shadow-xs transition-all duration-150`}
                      >
                        {/* Left: Type Icon + Date/Time + Lead info */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${badgeStyle}`}>
                            <Icon className="w-4 h-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link
                                href={itemHref(item)}
                                className="font-bold text-xs text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate hover:underline"
                              >
                                {item.lead_name}
                              </Link>

                              <span className={`px-2 py-0.2 rounded-full text-[10px] font-semibold border ${badgeStyle}`}>
                                {isWebinar ? "Webinar" : isWalkIn ? "Walk-in" : "Follow-up"}
                              </span>

                              {overdue && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                  <LocalizedText text={"Overdue"} />
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-slate-500 dark:text-zinc-400 flex-wrap mt-0.5">
                              <span className={`font-medium flex items-center gap-1 ${overdue ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-700 dark:text-zinc-200"}`}>
                                <Clock className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                                {fmtDateTime(item.scheduled_at)}
                              </span>

                              {item.course && (
                                <span className="flex items-center gap-1">
                                  <GraduationCap className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                                  <span className="truncate max-w-[140px]">{item.course}</span>
                                </span>
                              )}

                              {item.phone && <span>{item.phone}</span>}

                              {isAdmin && item.owner_name && (
                                <span className="text-slate-400">→ {item.owner_name}</span>
                              )}

                              {item.meeting_url && (
                                <a
                                  href={item.meeting_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span><LocalizedText text={"Join Meeting"} /></span>
                                </a>
                              )}

                              {item.notes && (
                                <span className="truncate max-w-[200px] italic text-slate-400 dark:text-zinc-500">
                                  &quot;{item.notes}&quot;
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Action Buttons */}
                        <div className="flex items-center gap-1 shrink-0 self-end md:self-center">
                          <button
                            onClick={() => act(item, "done")}
                            disabled={busy}
                            title={(isWebinar || isWalkIn) ? "Mark attended" : "Mark done"}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/20 text-xs font-semibold disabled:opacity-40 transition cursor-pointer"
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">{(isWebinar || isWalkIn) ? "Attended" : "Done"}</span>
                          </button>

                          {(isWebinar || isWalkIn) && (
                            <button
                              onClick={() => act(item, "not_attended")}
                              disabled={busy}
                              title="Not attended"
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-500/20 disabled:opacity-40 transition cursor-pointer"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => setReschedule(item)}
                            disabled={busy}
                            title="Reschedule"
                            className="p-1.5 rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 disabled:opacity-40 transition cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => act(item, "cancel")}
                            disabled={busy}
                            title="Cancel"
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30 border border-slate-200 dark:border-white/10 disabled:opacity-40 transition cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reschedule Modal */}
      <AnimatePresence>
        {reschedule && (
          <LeadScheduleModal
            key={itemKey(reschedule)}
            type={reschedule.type}
            leadName={reschedule.lead_name}
            initial={{
              scheduled_at: reschedule.scheduled_at,
              notes: reschedule.notes || "",
              meeting_url: reschedule.meeting_url || "",
              location: reschedule.location || ""
            }}
            submitLabel="Save new time"
            onClose={() => setReschedule(null)}
            onSubmit={submitReschedule}
          />
        )}
      </AnimatePresence>

      {/* Availability & Blocked Times Modal */}
      <CalendarAvailabilityModal
        isOpen={showAvailabilityModal}
        onClose={() => setShowAvailabilityModal(false)}
        onUpdated={() => {
          fetchBlocked();
        }}
      />
    </div>
  );
}
