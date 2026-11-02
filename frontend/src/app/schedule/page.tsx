"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock, CalendarCheck, Video, PhoneCall, Loader2, Check,
  RotateCcw, XCircle, AlertTriangle, GraduationCap, MapPin, UserX,
  ExternalLink, Search, RefreshCw, Clock, Calendar
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import LeadScheduleModal, { SchedulePayload } from "@/components/LeadScheduleModal";

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

  useEffect(() => {
    if (role && !["Admin", "Employee", "Intern", "SalesManager", "Demo"].includes(role as string) && !isAdmin) {
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

  useEffect(() => { load(); }, [load]);

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
    if (!r) return "/followups";
    const base = r.type === "student" ? "/students" : r.type === "client" ? "/admin/clients" : "/leads";
    return `${base}/${r.id}?tab=followups`;
  };

  const endpoint = (item: ScheduleItem) => {
    if (item.type === "webinar") return `${API_BASE_URL}/lead-webinars/${item.id}`;
    if (item.type === "demo") return `${API_BASE_URL}/lead-demo-sessions/${item.id}`;
    if (item.type === "walkin") return `${API_BASE_URL}/lead-walk-ins/${item.id}`;
    if (isNewFollowUp(item)) return `${API_BASE_URL}/followups/${item.id}`;
    return `${API_BASE_URL}/lead-follow-ups/${item.id}`;
  };

  const send = async (url: string, method: "PATCH" | "POST", body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      throw new Error(typeof d?.detail === "string" ? d.detail : "Update failed.");
    }
  };

  const patch = (item: ScheduleItem, body: Record<string, unknown>) => send(endpoint(item), "PATCH", body);

  const act = async (item: ScheduleItem, kindOfAction: "done" | "not_attended" | "cancel") => {
    const isWebinar = item.type === "webinar" || item.type === "demo";
    const itemLabel = isWebinar ? "webinar" : item.type === "walkin" ? "walk-in" : "follow-up";
    if (kindOfAction === "cancel" && !confirm(`Cancel this ${itemLabel} for ${item.lead_name}?`)) return;
    const key = itemKey(item);
    setBusyKey(key);
    try {
      if (isNewFollowUp(item)) {
        const tz_offset = new Date().getTimezoneOffset();
        if (kindOfAction === "done") await send(`${endpoint(item)}/complete`, "POST", { tz_offset });
        else await patch(item, { status: "Cancelled", tz_offset });
        await load(true);
        return;
      }
      let status = "Done";
      if (kindOfAction === "not_attended") status = "Not Attended";
      else if (kindOfAction === "cancel") status = "Cancelled";
      else if (kindOfAction === "done") status = (isWebinar || item.type === "walkin") ? "Attended" : "Done";
      await patch(item, { status });
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
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none">Important Dates</h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {items.length} scheduled
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              {isAdmin ? "Track scheduled follow-ups, webinars & walk-ins across the team" : "Your upcoming appointments, webinars & follow-ups"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => load()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
            <span>Refresh</span>
          </button>
          <Link
            href="/leads"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition"
          >
            <span>Go to Leads</span>
          </Link>
        </div>
      </div>

      {/* 4-KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Total Scheduled</p>
            <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight mt-0.5">{counts.all}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Calendar className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Due Today</p>
            <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5">{counts.today}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Overdue</p>
            <p className="text-base sm:text-lg font-bold text-rose-600 dark:text-rose-400 leading-tight mt-0.5">{counts.overdue}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Webinars & Demos</p>
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
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
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
          <button onClick={() => load()} className="font-semibold underline ml-2">Retry</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10">
          <CalendarCheck className="w-8 h-8 mx-auto mb-2 text-slate-400 dark:text-zinc-600" />
          <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Nothing scheduled</p>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
            Move a lead to Follow-up, Webinar Scheduled, or Walk-in Scheduled in{" "}
            <Link href="/leads" className="text-blue-600 hover:underline">Student Leads</Link>.
          </p>
        </div>
      ) : (
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
                                  Overdue
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
                                  <span>Join Meeting</span>
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
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/20 text-xs font-semibold disabled:opacity-40 transition"
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">{(isWebinar || isWalkIn) ? "Attended" : "Done"}</span>
                          </button>

                          {(isWebinar || isWalkIn) && (
                            <button
                              onClick={() => act(item, "not_attended")}
                              disabled={busy}
                              title="Not attended"
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-500/20 disabled:opacity-40 transition"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => setReschedule(item)}
                            disabled={busy}
                            title="Reschedule"
                            className="p-1.5 rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 disabled:opacity-40 transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => act(item, "cancel")}
                            disabled={busy}
                            title="Cancel"
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30 border border-slate-200 dark:border-white/10 disabled:opacity-40 transition"
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
    </div>
  );
}
