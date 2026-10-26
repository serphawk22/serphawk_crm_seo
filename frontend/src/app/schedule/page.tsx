"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock, CalendarCheck, Video, PhoneCall, Loader2, Check,
  RotateCcw, XCircle, AlertTriangle, GraduationCap, MapPin, UserX, ExternalLink,
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

const GROUP_DOT: Record<Group, string> = {
  Overdue: "bg-red-500",
  Today: "bg-emerald-500",
  Tomorrow: "bg-blue-500",
  "This week": "bg-violet-500",
  Later: "bg-slate-400",
};

const GROUP_LABEL: Record<Group, string> = {
  Overdue: "text-red-600 dark:text-red-400",
  Today: "text-emerald-600 dark:text-emerald-400",
  Tomorrow: "text-blue-600 dark:text-blue-400",
  "This week": "text-violet-600 dark:text-violet-400",
  Later: "text-slate-500 dark:text-slate-400",
};

function startOfDay(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
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
  return d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function SchedulePage() {
  const { role } = useRole();
  const router = useRouter();
  const isAdmin = role === "Admin" || (role as string) === "SuperAdmin";

  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<Kind>("all");
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

  const visible = useMemo(
    () => items
      .filter(i => matchesKind(i.type, kind))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [items, kind],
  );

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
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
        await load(true); return;
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
      setReschedule(null); await load(true); return;
    }
    const body: Record<string, unknown> = { scheduled_at: p.scheduled_at, notes: p.notes || null };
    if (reschedule.type === "webinar" || reschedule.type === "demo") body.meeting_url = p.meeting_url || null;
    if (reschedule.type === "walkin") body.location = p.location || "Campus Front Desk";
    await patch(reschedule, body);
    setReschedule(null); await load(true);
  };

  const tabs: { id: Kind; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "webinar", label: "Webinars", count: counts.webinar },
    { id: "followup", label: "Follow-ups", count: counts.followup },
    { id: "walkin", label: "Walk-ins", count: counts.walkin },
  ];

  return (
    <div className="flex h-full flex-col bg-[#f8fafc] dark:bg-black">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-black">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Important Dates</h1>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {isAdmin ? "Your team's scheduled dates" : "Your scheduled follow-ups, webinars & walk-ins"}
              </p>
            </div>
          </div>
          {/* Compact stats */}
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            {counts.overdue > 0 && (
              <span className="flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                {counts.overdue} overdue
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              {counts.today} today
            </span>
            <span>{counts.all} total</span>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mt-3 flex items-center gap-1">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setKind(tab.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${kind === tab.id
                ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-sm"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400"}`}>
              {tab.label}
              {tab.count > 0 && <span className="ml-1.5 opacity-60">{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error} <button onClick={() => load()} className="ml-2 font-semibold underline">Retry</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center px-4">
            <CalendarCheck className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Nothing scheduled</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs">
              Move a lead to Follow-up, Webinar Scheduled, or Walk-in Scheduled in{" "}
              <Link href="/leads" className="text-blue-600 hover:underline">Student Leads</Link>.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {grouped.map(({ group, rows }) => (
              <div key={group}>
                {/* Group label */}
                <div className={`px-6 py-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest bg-slate-50 dark:bg-zinc-900 ${GROUP_LABEL[group]}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${GROUP_DOT[group]}`} />
                  {group === "Overdue" && <AlertTriangle className="h-3 w-3" />}
                  {group}
                  <span className="ml-1 text-[10px] opacity-50 font-normal">{rows.length}</span>
                </div>
                {/* Rows */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map(item => {
                    const key = itemKey(item);
                    const isWebinar = item.type === "webinar" || item.type === "demo";
                    const isWalkIn = item.type === "walkin";
                    const busy = busyKey === key;
                    const Icon = isWebinar ? Video : isWalkIn ? MapPin : PhoneCall;
                    const typeColor = isWebinar
                      ? "text-indigo-600 dark:text-indigo-400"
                      : isWalkIn
                      ? "text-sky-600 dark:text-sky-400"
                      : "text-amber-600 dark:text-amber-400";
                    const overdue = group === "Overdue";

                    return (
                      <motion.div
                        key={key} layout
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className={`px-6 py-3 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors ${overdue ? "bg-red-50/30 dark:bg-red-950/10" : ""}`}
                      >
                        {/* Type icon */}
                        <div className={`shrink-0 ${typeColor}`}>
                          <Icon className="h-4 w-4" />
                        </div>

                        {/* Date/time */}
                        <div className="w-40 shrink-0">
                          <span className={`text-xs font-semibold ${overdue ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-200"}`}>
                            {fmtDateTime(item.scheduled_at)}
                          </span>
                        </div>

                        {/* Lead name + type */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={itemHref(item)}
                              className="text-sm font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate max-w-[200px]">
                              {item.lead_name}
                            </Link>
                            <span className={`text-[10px] font-bold uppercase tracking-wide ${typeColor}`}>
                              {isWebinar ? "Webinar" : isWalkIn ? "Walk-in" : "Follow-up"}
                            </span>
                            {overdue && <span className="text-[10px] font-bold uppercase text-red-500">Overdue</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 flex-wrap">
                            {item.course && <span className="flex items-center gap-1"><GraduationCap className="h-3 w-3" />{item.course}</span>}
                            {item.phone && <span>{item.phone}</span>}
                            {isAdmin && item.owner_name && <span className="text-slate-400">→ {item.owner_name}</span>}
                            {item.meeting_url && (
                              <a href={item.meeting_url} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 text-indigo-500 hover:underline">
                                <ExternalLink className="h-3 w-3" /> Join
                              </a>
                            )}
                            {item.notes && <span className="truncate max-w-[200px] italic">{item.notes}</span>}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => act(item, "done")} disabled={busy}
                            title={(isWebinar || isWalkIn) ? "Mark attended" : "Mark done"}
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-40 transition-colors">
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          </button>
                          {(isWebinar || isWalkIn) && (
                            <button onClick={() => act(item, "not_attended")} disabled={busy}
                              title="Not attended"
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 disabled:opacity-40 transition-colors">
                              <UserX className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => setReschedule(item)} disabled={busy}
                            title="Reschedule"
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => act(item, "cancel")} disabled={busy}
                            title="Cancel"
                            className="p-1.5 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 disabled:opacity-40 transition-colors">
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {reschedule && (
          <LeadScheduleModal
            key={itemKey(reschedule)}
            type={reschedule.type}
            leadName={reschedule.lead_name}
            initial={{ scheduled_at: reschedule.scheduled_at, notes: reschedule.notes || "", meeting_url: reschedule.meeting_url || "", location: reschedule.location || "" }}
            submitLabel="Save new time"
            onClose={() => setReschedule(null)}
            onSubmit={submitReschedule}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
