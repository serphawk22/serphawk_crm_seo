"use client";
import LocalizedText from "@/components/LocalizedText";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, CheckCheck, Trash2, ExternalLink, RefreshCw,
  Info, CheckCircle, AlertTriangle, XCircle, Filter,
  CalendarDays, Inbox, BellOff, Loader2, Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/context/NotificationContext";
import PageGuide from "@/components/PageGuide";

// ── Config ─────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string; border: string; badge: string }> = {
  info:    { icon: Info,          color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950/40",    border: "border-blue-200/60 dark:border-blue-800/40",    badge: "bg-blue-500" },
  success: { icon: CheckCircle,   color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200/60 dark:border-emerald-800/40", badge: "bg-emerald-500" },
  warning: { icon: AlertTriangle, color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/40",   border: "border-amber-200/60 dark:border-amber-800/40",   badge: "bg-amber-500" },
  error:   { icon: XCircle,       color: "text-rose-600",     bg: "bg-rose-50 dark:bg-rose-950/40",       border: "border-rose-200/60 dark:border-rose-800/40",       badge: "bg-rose-500" },
  alert:   { icon: AlertTriangle, color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/40",   border: "border-amber-200/60 dark:border-amber-800/40",   badge: "bg-amber-500" },
};

const TABS = [
  { key: "all", label: "All", icon: Inbox },
  { key: "unread", label: "Unread", icon: Flame },
  { key: "info", label: "Info", icon: Info },
  { key: "success", label: "Success", icon: CheckCircle },
  { key: "warning", label: "Warning", icon: AlertTriangle },
  { key: "error", label: "Error", icon: XCircle },
] as const;

type Tab = typeof TABS[number]["key"];

function getGroup(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  const notifDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (notifDay.getTime() === today.getTime()) return "Today";
  if (notifDay.getTime() === yesterday.getTime()) return "Yesterday";
  if (notifDay >= weekAgo) return "This Week";
  return "Older";
}

const GROUP_ORDER = ["Today", "Yesterday", "This Week", "Older"];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationsPage() {
  const {
    notifications, unreadCount, loading,
    markRead, markAllRead, deleteNotification, clearAll, refresh,
  } = useNotifications();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("all");
  const [clearing, setClearing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const filtered = useMemo(() => {
    if (tab === "all") return notifications;
    if (tab === "unread") return notifications.filter(n => !n.is_read);
    return notifications.filter(n => n.type === tab || (tab === "warning" && n.type === "alert"));
  }, [notifications, tab]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    for (const n of filtered) {
      const g = getGroup(n.created_at);
      if (!groups[g]) groups[g] = [];
      groups[g].push(n);
    }
    return groups;
  }, [filtered]);

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    await markAllRead();
    setMarkingAll(false);
  };

  const handleClearAll = async () => {
    setClearing(true);
    await clearAll();
    setClearing(false);
  };

  const tabCounts: Record<string, number> = {
    all: notifications.length,
    unread: notifications.filter(n => !n.is_read).length,
    info: notifications.filter(n => n.type === "info").length,
    success: notifications.filter(n => n.type === "success").length,
    warning: notifications.filter(n => n.type === "warning" || n.type === "alert").length,
    error: notifications.filter(n => n.type === "error").length,
  };

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-16 max-w-4xl mx-auto">
      {/* Compact Executive Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 relative">
            <Bell className="w-3.5 h-3.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate"><LocalizedText text={"Notifications"} /></h1>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700">
                {notifications.length}
              </span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-800/40">
                  {unreadCount} <LocalizedText text={"unread"} /> </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 leading-none mt-0.5 truncate">
              Real-time alerts for events in your CRM
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={refresh}
            title="Refresh notifications"
            className="p-1.5 rounded-lg border border-slate-200/80 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {unreadCount > 0 && (
            <button 
              onClick={handleMarkAllRead} 
              disabled={markingAll}
              className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/40 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors"
            >
              {markingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
              <span>Mark read</span>
            </button>
          )}
          {notifications.length > 0 && (
            <button 
              onClick={handleClearAll} 
              disabled={clearing}
              className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-800/40 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors"
            >
              {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              <span><LocalizedText text={"Clear"} /></span>
            </button>
          )}
        </div>
      </div>

      {/* Compact 4-KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Inbox className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">Total Alerts</div>
            <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{tabCounts.all}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200/50 dark:border-rose-800/40 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
            <Flame className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate"><LocalizedText text={"Unread"} /></div>
            <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{tabCounts.unread}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate"><LocalizedText text={"Success"} /></div>
            <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{tabCounts.success}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">Warnings</div>
            <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{tabCounts.warning}</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs Toolbar */}
      <div className="flex items-center gap-1 overflow-x-auto bg-white dark:bg-zinc-900 p-1 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-2xs hide-scrollbar">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
              tab === key
                ? "bg-indigo-600 text-white shadow-2xs"
                : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
            )}
          >
            <Icon className="w-3 h-3" />
            <span>{label}</span>
            {tabCounts[key] > 0 && (
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.2 rounded-full",
                tab === key ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-500"
              )}>
                {tabCounts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <PageGuide
        pageKey="notifications"
        title="How Notifications work"
        description="Stay informed with real-time alerts about every CRM event."
        steps={[
          { icon: "🔔", text: "Notifications fire automatically for: new leads, clients, tickets, tasks, invoices, projects, demo signups, and upgrade requests." },
          { icon: "🏷️", text: "Use the filter tabs to view by type: Info, Success, Warning, or Error." },
          { icon: "📅", text: "Notifications are grouped by date: Today, Yesterday, This Week, and Older." },
          { icon: "🗑️", text: "Dismiss individual notifications or clear all at once. The bell in the top bar shows your live unread count." },
        ]}
      />

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 text-center bg-white dark:bg-zinc-900 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800"
        >
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mb-2 shadow-2xs">
            <BellOff className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
            {tab === "unread" ? "No unread notifications!" : "No notifications here."}
          </p>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
            {tab === "all" ? "You're all caught up 🎉" : "Try switching to a different filter."}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {GROUP_ORDER.filter(g => grouped[g]?.length > 0).map(group => (
            <div key={group} className="space-y-1.5">
              {/* Group header */}
              <div className="flex items-center gap-2 px-1">
                <CalendarDays className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
                  {group}
                </span>
                <div className="flex-1 h-px bg-slate-200/80 dark:border-white/5" />
                <span className="text-[10px] text-slate-400 font-semibold">{grouped[group].length}</span>
              </div>

              {/* Notifications in group */}
              <div className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {grouped[group].map((n, i) => {
                    const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
                    return (
                      <motion.div
                        key={n.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 20, scale: 0.95 }}
                        transition={{ delay: i * 0.02 }}
                        className={cn(
                          "group relative rounded-xl border p-2.5 px-3 transition-all cursor-pointer shadow-2xs flex items-center justify-between gap-3",
                          n.is_read
                            ? "bg-white dark:bg-zinc-900 border-slate-200/80 dark:border-white/5 opacity-70 hover:opacity-100"
                            : cn("bg-white dark:bg-zinc-900 border-slate-200/90 dark:border-white/10 hover:border-indigo-500/60 dark:hover:border-indigo-500/50 hover:shadow-xs")
                        )}
                        onClick={() => {
                          if (!n.is_read) markRead(n.id);
                          if (n.link) router.push(n.link);
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* Icon */}
                          <div className={cn(
                            "w-7 h-7 rounded-lg border flex items-center justify-center shrink-0",
                            cfg.bg, cfg.border
                          )}>
                            <cfg.icon className={cn("w-3.5 h-3.5", cfg.color)} />
                          </div>

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className={cn(
                                "font-semibold text-xs truncate",
                                n.is_read ? "text-slate-600 dark:text-zinc-400" : "text-slate-900 dark:text-zinc-50"
                              )}>
                                {n.title}
                              </p>
                              {!n.is_read && (
                                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.badge)} />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                              {n.message}
                            </p>
                          </div>
                        </div>

                        {/* Meta and actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 whitespace-nowrap">
                            {timeAgo(n.created_at)}
                          </span>
                          {n.link && (
                            <Link
                              href={n.link}
                              onClick={(e) => { e.stopPropagation(); if (!n.is_read) markRead(n.id); }}
                              className={cn("p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors", cfg.color)}
                              title="View resource"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors opacity-0 group-hover:opacity-100"
                            title="Dismiss notification"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
