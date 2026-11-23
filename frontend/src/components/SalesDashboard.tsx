"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Users,
  Target,
  DollarSign,
  TrendingUp,
  Calendar,
  Clock,
  Sparkles,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Phone,
  Mail,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  PieChart,
  Activity,
  Layers,
  MapPin,
  ExternalLink
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";
import LocalizedText from "@/components/LocalizedText";

interface SalesKPIData {
  assigned_leads: number;
  converted_leads: number;
  conversion_rate: number;
  advance_collected: number;
  total_business_made: number;
}

interface UpcomingMeeting {
  id: number;
  title: string;
  meeting_type: string;
  scheduled_at: string | null;
  lead_id: number | null;
  lead_name: string | null;
  status: string;
  notes: string | null;
}

interface LeadRecord {
  id: number;
  company_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  is_converted: boolean;
  city: string | null;
  country: string | null;
  created_at: string;
}

interface SourceReportItem {
  source: string;
  total_leads: number;
  converted_count: number;
  conversion_rate: number;
  advance_collected: number;
  leads: LeadRecord[];
}

interface ActivityItem {
  id: number;
  action: string;
  details: string;
  lead_id: number | null;
  createdAt: string;
}

interface DashboardPayload {
  salesperson: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
  kpis: SalesKPIData;
  upcoming_meetings: UpcomingMeeting[];
  lead_sources_report: SourceReportItem[];
  recent_activities: ActivityItem[];
}

export function SalesDashboard({ salespersonId, name }: { salespersonId?: number; name?: string }) {
  const { t } = useLanguage();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "sources" | "activities">("overview");
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") || localStorage.getItem("crm_token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const url = new URL(`${API_BASE_URL}/analytics/salesperson/dashboard`, window.location.origin);
      if (salespersonId) url.searchParams.append("salesperson_id", String(salespersonId));

      const res = await fetch(url.toString(), { headers });
      if (!res.ok) throw new Error("Could not load sales dashboard data");
      const json = await res.json();
      setData(json);
      if (json.lead_sources_report?.length > 0 && !expandedSource) {
        setExpandedSource(json.lead_sources_report[0].source);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Error loading dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [salespersonId]);

  const kpis = data?.kpis || {
    assigned_leads: 0,
    converted_leads: 0,
    conversion_rate: 0,
    advance_collected: 0,
    total_business_made: 0
  };

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse p-4 sm:p-6">
        <div className="h-32 rounded-3xl bg-slate-200 dark:bg-zinc-800 w-full" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-200 dark:bg-zinc-800" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-slate-200 dark:bg-zinc-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-2 sm:p-4 lg:p-6 max-w-7xl mx-auto">
      {/* ── HEADER BANNER ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-blue-950 border border-indigo-900/50 p-6 sm:p-8 text-white shadow-xl">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Sales Instance · Activity Workspace
              </span>
              <span className="text-xs text-indigo-200/60 font-medium">
                {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, {data?.salesperson?.name || name || "Sales Rep"}
            </h1>
            <p className="text-sm text-indigo-200/80 mt-1 max-w-xl">
              Track your lead conversions, upcoming client meetings, advance business collected, and individual lead sources.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={loadData}
              disabled={loading}
              title="Refresh data"
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/10 transition-colors shadow-xs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <Link
              href="/calls?action=log"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-white/10 hover:bg-white/15 text-white border border-white/20 transition active:scale-95"
            >
              <Phone className="w-4 h-4 text-emerald-400" /> Log Call
            </Link>
            <Link
              href="/task-sheet"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-white/10 hover:bg-white/15 text-white border border-white/20 transition active:scale-95"
            >
              <Activity className="w-4 h-4 text-amber-400" /> Daily Tasksheet
            </Link>
            <Link
              href="/leads?action=add"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition active:scale-95"
            >
              <Plus className="w-4 h-4" /> Add Lead
            </Link>
            <Link
              href="/meetings?new=true"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-white/10 hover:bg-white/15 text-white border border-white/20 transition active:scale-95"
            >
              <Calendar className="w-4 h-4" /> Follow-up / Demo
            </Link>
          </div>
        </div>
      </div>

      {/* ── KPI METRICS STRIP ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* KPI 1 */}
        <Link
          href="/leads"
          className="group rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-4 shadow-sm hover:border-blue-500/50 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Assigned Leads</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-2">
            {kpis.assigned_leads}
          </p>
          <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-1 group-hover:underline">
            View My Pipeline <ArrowUpRight className="w-3 h-3" />
          </span>
        </Link>

        {/* KPI 2 */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Converted</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-2">
            {kpis.converted_leads}
          </p>
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1 block">
            Won Deals / Students
          </span>
        </div>

        {/* KPI 3 */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Conversion Rate</span>
            <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-2">
            {kpis.conversion_rate}%
          </p>
          <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-violet-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, kpis.conversion_rate)}%` }}
            />
          </div>
        </div>

        {/* KPI 4 */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Advance Collected</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-2">
            ₹{kpis.advance_collected.toLocaleString()}
          </p>
          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 mt-1 block">
            Credited to you
          </span>
        </div>

        {/* KPI 5 */}
        <div className="col-span-2 lg:col-span-1 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Total Business</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-2">
            ₹{kpis.total_business_made.toLocaleString()}
          </p>
          <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 mt-1 block">
            Total Contract Value
          </span>
        </div>
      </div>

      {/* ── NAVIGATION TABS ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
            activeTab === "overview"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
          }`}
        >
          <Calendar className="w-4 h-4" />
          Follow-ups & Meetings ({data?.upcoming_meetings?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab("sources")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
            activeTab === "sources"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
          }`}
        >
          <PieChart className="w-4 h-4" />
          Individual Lead Sources ({data?.lead_sources_report?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab("activities")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
            activeTab === "activities"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
          }`}
        >
          <Activity className="w-4 h-4" />
          My Activity Stream
        </button>
      </div>

      {/* ── TAB 1: FOLLOW-UPS & MEETINGS ── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              Scheduled Meetings & Upcoming Follow-ups
            </h2>
            <Link
              href="/meetings"
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              Open Full Calendar <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {(!data?.upcoming_meetings || data.upcoming_meetings.length === 0) ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 p-8 text-center bg-white/50 dark:bg-zinc-900/50">
              <Calendar className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">No scheduled meetings pending</p>
              <p className="text-xs text-slate-400 mt-1">Schedule a follow-up or meeting from any lead's profile.</p>
              <Link
                href="/leads"
                className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
              >
                Go to Leads
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.upcoming_meetings.map((m) => {
                const dateObj = m.scheduled_at ? new Date(m.scheduled_at) : null;
                const isToday = dateObj ? dateObj.toDateString() === new Date().toDateString() : false;
                return (
                  <div
                    key={m.id}
                    className="rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-4 shadow-sm space-y-3 hover:border-indigo-500/50 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          isToday ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                        }`}>
                          {m.meeting_type} {isToday ? "· Today" : ""}
                        </span>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1.5 truncate">
                          {m.title}
                        </h3>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 dark:text-zinc-300 border-t border-slate-100 dark:border-white/5 pt-2">
                      {m.lead_name && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold truncate">{m.lead_name}</span>
                        </div>
                      )}
                      {dateObj && (
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            {dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at{" "}
                            {dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
                      {m.lead_id && (
                        <Link
                          href={`/leads/${m.lead_id}`}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200"
                        >
                          View Lead
                        </Link>
                      )}
                      <Link
                        href={`/meetings`}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 shadow-xs"
                      >
                        Complete
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: INDIVIDUAL LEAD SOURCES & REPORTS (SCM1-423, P1-773, P1-774) ── */}
      {activeTab === "sources" && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PieChart className="w-4 h-4 text-indigo-600" />
                Individual Lead Source Reports & Analytics
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Breakdown of leads assigned to you by acquisition source, conversion rate, and individual lead records.
              </p>
            </div>
            <Link
              href="/lead-source-analytics"
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              Full Analytics Workspace <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Sources Summary Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data?.lead_sources_report?.map((item) => {
              const isSelected = expandedSource === item.source;
              return (
                <button
                  key={item.source}
                  type="button"
                  onClick={() => setExpandedSource(item.source)}
                  className={`text-left rounded-2xl border p-4 transition shadow-xs ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20"
                      : "border-slate-200 dark:border-white/10 bg-white dark:bg-[#111111]/90 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {item.source}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                      {item.total_leads} leads
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Converted:</span>
                    <span className="font-bold text-emerald-600">{item.converted_count} ({item.conversion_rate}%)</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-zinc-800 rounded-full h-1 mt-2">
                    <div
                      className="bg-indigo-600 h-1 rounded-full"
                      style={{ width: `${Math.min(100, item.conversion_rate)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Expanded Source Details & Individual Leads List (Ticket P1-774) */}
          {expandedSource && (
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111111]/90 overflow-hidden shadow-sm">
              <div className="px-5 py-4 bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-white/10 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    Leads from {expandedSource}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
                    {data?.lead_sources_report?.find((s) => s.source === expandedSource)?.total_leads || 0} Total
                  </span>
                </div>
                <span className="text-xs text-slate-500 dark:text-zinc-400">
                  Individual per-lead analytics for sales instance
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/10 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                      <th className="px-4 py-3">Lead / Company</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Stage / Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {data?.lead_sources_report
                      ?.find((s) => s.source === expandedSource)
                      ?.leads?.map((lead) => (
                        <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                            <Link href={`/leads/${lead.id}`} className="hover:text-blue-600 flex items-center gap-1.5">
                              {lead.company_name}
                              <ArrowUpRight className="w-3 h-3 text-slate-400" />
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-zinc-400">
                            {lead.email && <div className="truncate max-w-[150px]">{lead.email}</div>}
                            {lead.phone && <div className="text-[11px] text-slate-400">{lead.phone}</div>}
                            {!lead.email && !lead.phone && <span className="italic text-slate-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {lead.city || lead.country ? (
                              <span className="flex items-center gap-1 truncate max-w-[130px]">
                                <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                                {lead.city || lead.country}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                lead.is_converted
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                              }`}
                            >
                              {lead.is_converted ? "Converted" : lead.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/leads/${lead.id}`}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200"
                            >
                              Open Profile
                            </Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: RECENT ACTIVITY ── */}
      {activeTab === "activities" && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" />
            Your Recent Sales & Client Activity
          </h2>
          {(!data?.recent_activities || data.recent_activities.length === 0) ? (
            <div className="p-8 text-center text-sm text-slate-400 border border-dashed rounded-2xl">
              No recent activity recorded yet.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111111]/90 divide-y divide-slate-100 dark:divide-white/5">
              {data.recent_activities.map((act) => (
                <div key={act.id} className="p-4 flex items-start gap-3 hover:bg-slate-50/50 dark:hover:bg-white/5 transition">
                  <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{act.action}</p>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">{act.details}</p>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      {new Date(act.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {act.lead_id && (
                    <Link
                      href={`/leads/${act.lead_id}`}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                    >
                      Lead #{act.lead_id}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SalesDashboard;

