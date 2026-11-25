"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import {
  Calendar, Phone, CalendarClock, Users, TrendingUp, DollarSign,
  Target, CheckCircle2, AlertTriangle, ArrowRight, Plus, ExternalLink,
  Clock, Sparkles, Building2, Video, FileText, Zap, PhoneCall,
  Activity, ArrowUpRight, BarChart3, Briefcase, ChevronRight,
  GraduationCap, Building, Wallet, Layers, Award, ShieldCheck,
  Receipt, ArrowDownRight, RefreshCw, Layers3, Filter
} from "lucide-react";
import { dashboardDateLabel } from "@/lib/dashboardLocale";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { useDashboardSections } from "@/components/DashboardSection";
import { formatCurrency } from "@/i18n/config";
import FollowUpsWidget from "@/components/followups/FollowUpsWidget";
import DemoUsageMeter from "@/components/DemoUsageMeter";
import DashboardManagement from "@/components/DashboardManagement";
import SourceWinRates from "@/components/SourceWinRates";
import LocalizedText from "@/components/LocalizedText";

type Point = { name: string; value: number };
interface Operations {
  management?: { unassignedLeads?: number; todayTasks?: number };
  leadStages?: Point[]; leadSources?: Point[]; courseAdmissions?: Point[];
  feeHealth?: Point[]; salesWorkload?: Point[]; taskHealth?: Point[]; pendingTasks?: number;
  instituteSummary?: { students: number; activeStudents: number; booked: number; collected: number; due: number };
  sourceConversion?: { name: string; total: number; converted: number; rate: number }[];
  projectProgress?: { id: number; name: string; status: string; progress: number }[];
  feeRevenue?: { name: string; revenue: number; expenses: number }[];
}
export interface OverviewStats {
  revenue?: number; total?: number; pipelineValue?: number; operations?: Operations;
  revenueData?: { name: string; revenue: number; expenses: number }[];
  chartLabels?: string[]; activityChart?: number[]; emailChart?: number[]; callChart?: number[];
  recentActivities?: { id: number; action: string; content?: string; createdAt?: string | null }[];
  totalCalls?: number; totalEmailsSent?: number; totalActivities?: number;
  active?: number; pending?: number; hold?: number;
  totalQuotesValue?: number; acceptedQuotesValue?: number; totalQuotesCount?: number; acceptedQuotesCount?: number;
  totalSalesOrdersValue?: number; fulfilledSalesOrdersValue?: number; totalSalesOrdersCount?: number; fulfilledSalesOrdersCount?: number;
  totalInvoicesValue?: number; paidInvoicesValue?: number; sentInvoicesValue?: number; overdueInvoicesValue?: number;
}
const panel = "rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#111111]/90 p-5 min-w-0 shadow-xs transition-all";
const colors = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#14b8a6"];

function OverviewChart({ title, data, href, money = false, localizeNames = false }: { title: string; data: Point[]; href: string; money?: boolean; localizeNames?: boolean }) {
  const { t, language } = useLanguage();
  const { settings } = useTenantConfig();
  const total = data.reduce((sum, point) => sum + point.value, 0);
  const display = (n: number) => money ? formatCurrency(n, language, settings.default_currency || "USD") : n.toLocaleString(language);
  return (
    <section className={panel}>
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
        <Link href={href} className="text-sm font-bold text-slate-900 dark:text-white hover:text-blue-600 flex items-center gap-1">
          {t(title)} <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
        <span className="text-xs font-semibold text-slate-400 dark:text-zinc-500">
          Total: {display(total)}
        </span>
      </div>
      {total > 0 ? (
        <>
          <div className="h-52 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.map(point => ({ ...point, name: localizeNames ? t(point.name) : point.name }))} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="80%">
                  {data.map((point, index) => <Cell key={point.name} fill={colors[index % colors.length]} />)}
                </Pie>
                <Tooltip formatter={value => display(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1.5 text-xs mt-2 divide-y divide-slate-100 dark:divide-white/5">
            {data.map((point, idx) => (
              <li key={point.name} className="flex justify-between items-center pt-1.5">
                <span className="flex items-center gap-1.5 truncate text-slate-600 dark:text-zinc-300">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[idx % colors.length] }} />
                  {localizeNames ? t(point.name) : point.name}
                </span>
                <b className="font-semibold text-slate-900 dark:text-white shrink-0">{display(point.value)}</b>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="py-16 text-center text-sm text-[var(--text-secondary)]">{t("No data recorded yet")}</p>
      )}
    </section>
  );
}

export default function OperationsDashboard({
  stats,
  isDemo,
  callPitch,
  variant = "dashboard"
}: {
  stats: OverviewStats | null;
  isDemo?: boolean;
  callPitch: React.ReactNode;
  variant?: string;
}) {
  const { user } = useRole();
  const { t, language } = useLanguage();
  const { settings, hasFeature } = useTenantConfig();
  const show = useDashboardSections(variant);

  // 360 View Mode Filter: All Unified, B2B Enterprise, or B2C Direct / Institute
  const [viewMode, setViewMode] = useState<"all" | "b2b" | "b2c">(variant === "dashboard_b2c" ? "b2c" : "all");

  const [upgradeRequested, setUpgradeRequested] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");
  const [upgrading, setUpgrading] = useState(false);

  // Live 360 data feeds for Meetings and Calls
  const [meetings, setMeetings] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [loading360, setLoading360] = useState(true);

  useEffect(() => {
    let alive = true;
    const fetch360Data = async () => {
      try {
        const [meetRes, callRes] = await Promise.allSettled([
          fetch(`${API_BASE_URL}/meetings`),
          fetch(`${API_BASE_URL}/calls`)
        ]);
        if (alive) {
          if (meetRes.status === "fulfilled" && meetRes.value.ok) {
            const mData = await meetRes.value.json();
            setMeetings(mData.meetings || []);
          }
          if (callRes.status === "fulfilled" && callRes.value.ok) {
            const cData = await callRes.value.json();
            setCalls(cData.calls || []);
          }
        }
      } catch (err) {
        console.error("Failed to load 360 data feeds", err);
      } finally {
        if (alive) setLoading360(false);
      }
    };
    fetch360Data();
    return () => { alive = false; };
  }, []);

  const data = stats || {};
  const operations = data.operations || {};
  const institute = operations.instituteSummary;
  const money = (n: number) => formatCurrency(n, language, settings.default_currency || "USD");

  const upgrade = async () => {
    setUpgrading(true); setUpgradeError("");
    try {
      const response = await fetch(`${API_BASE_URL}/demo/request-upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email })
      });
      if (!response.ok) throw new Error(t("Could not request full access"));
      setUpgradeRequested(true);
    } catch (error) {
      setUpgradeError(error instanceof Error ? error.message : t("Could not request full access"));
    } finally {
      setUpgrading(false);
    }
  };

  // Pipeline metrics
  const leadStages = operations.leadStages || [];
  const totalLeadsCount = leadStages.reduce((sum, p) => sum + p.value, 0);
  const wonLeadsCount = leadStages.find(p => p.name.toLowerCase() === "won")?.value || 0;
  const leadWinRate = totalLeadsCount > 0 ? Math.round((wonLeadsCount / totalLeadsCount) * 100) : 0;

  // ── Executive Currency Calculations (Dynamic across All, B2B, B2C) ─────────────────
  const b2bPaid = data.paidInvoicesValue ?? data.revenue ?? 0;
  const b2bInvoiced = data.totalInvoicesValue ?? b2bPaid;
  const b2bPipeline = (data.pipelineValue ?? 0) + (data.totalQuotesValue ?? 0);
  const b2bReceivables = (data.overdueInvoicesValue ?? 0) + (data.sentInvoicesValue ?? 0);

  const b2cCollected = institute?.collected ?? 0;
  const b2cBooked = institute?.booked ?? 0;
  const b2cPipeline = Math.max(0, b2cBooked - b2cCollected);
  const b2cReceivables = institute?.due ?? 0;

  const totalCollected = viewMode === "b2b" ? b2bPaid : viewMode === "b2c" ? b2cCollected : (b2bPaid + b2cCollected);
  const totalContracted = viewMode === "b2b" ? b2bInvoiced : viewMode === "b2c" ? b2cBooked : (b2bInvoiced + b2cBooked);
  const totalPipeline = viewMode === "b2b" ? b2bPipeline : viewMode === "b2c" ? b2cPipeline : (b2bPipeline + b2cPipeline);
  const totalReceivables = viewMode === "b2b" ? b2bReceivables : viewMode === "b2c" ? b2cReceivables : (b2bReceivables + b2cReceivables);

  const activeCustomerCount = viewMode === "b2b" ? (data.active ?? data.total ?? 0)
    : viewMode === "b2c" ? (institute?.activeStudents ?? institute?.students ?? 0)
    : ((data.active ?? data.total ?? 0) + (institute?.activeStudents ?? institute?.students ?? 0));

  const avgLTV = activeCustomerCount > 0 ? Math.round(totalCollected / activeCustomerCount) : 0;
  const collectionRatio = totalContracted > 0 ? Math.min(100, Math.round((totalCollected / totalContracted) * 100)) : 100;

  // Primary 360 KPI cards (Adapts with viewMode)
  const kpiCards = [
    {
      title: viewMode === "b2c" ? "Collected Fees" : viewMode === "b2b" ? "Collected Revenue" : "Collected Cashflow",
      value: money(totalCollected),
      subtitle: totalContracted > 0 ? `Booked: ${money(totalContracted)} (${collectionRatio}%)` : "Paid invoices & fees",
      icon: DollarSign,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
      href: "/revenue"
    },
    {
      title: viewMode === "b2c" ? "Uncollected Fees" : viewMode === "b2b" ? "Active Pipeline" : "Total Pipeline Value",
      value: money(totalPipeline),
      subtitle: viewMode === "b2c" ? `${money(totalReceivables)} outstanding due` : `${leadStages.find(s => s.name === "Proposal Sent" || s.name === "Proposal")?.value || 0} active proposals`,
      icon: TrendingUp,
      color: "text-indigo-600 dark:text-indigo-400",
      bg: "bg-indigo-500/10 border-indigo-500/20",
      href: viewMode === "b2c" ? "/enrollments" : "/leads"
    },
    {
      title: viewMode === "b2c" ? "Students Enrolled" : viewMode === "b2b" ? "B2B Clients" : "Active Accounts & Students",
      value: activeCustomerCount,
      subtitle: viewMode === "b2c" ? `${institute?.activeStudents ?? 0} active in batches` : `${data.active ?? data.total ?? 0} active • ${data.pending ?? 0} onboarding`,
      icon: viewMode === "b2c" ? GraduationCap : Users,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
      href: viewMode === "b2c" ? "/students" : "/clients"
    },
    {
      title: "Inquiries & Win Rate",
      value: totalLeadsCount,
      subtitle: `${leadWinRate}% win rate (${wonLeadsCount} won)`,
      icon: Target,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-500/10 border-purple-500/20",
      href: "/leads"
    },
    {
      title: "Consultations & Agenda",
      value: meetings.length,
      subtitle: `${meetings.filter(m => m.status === 'Completed').length} completed • ${meetings.filter(m => m.status !== 'Completed').length} upcoming`,
      icon: Calendar,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
      href: "/meetings"
    },
    {
      title: "Calls & Follow-ups",
      value: (data.totalCalls || calls.length) + (operations.pendingTasks || 0),
      subtitle: `${calls.length} calls logged • ${operations.pendingTasks || 0} tasks pending`,
      icon: PhoneCall,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-500/10 border-rose-500/20",
      href: "/calls"
    }
  ];

  const charts = [
    { key: "lead_stages", module: "leads", title: "Lead pipeline stages", data: operations.leadStages, href: "/leads", mode: "b2b" },
    { key: "lead_sources", module: "leads", title: "Lead acquisition sources", data: operations.leadSources, href: hasFeature("lead_sources") ? "/lead-sources" : "/leads", mode: "all" },
    { key: "sales_workload", module: "teams", title: "Sales team workload", data: operations.salesWorkload, href: "/teams", mode: "all" },
    { key: "admissions", module: "institute", title: "Course admissions share", data: operations.courseAdmissions, href: "/courses", mode: "b2c" },
    { key: "fee_health", module: "institute", title: "Fee collection health", data: operations.feeHealth, href: "/enrollments", money: true, mode: "b2c" },
    { key: "task_health", module: "task_sheet", title: "Task sheet execution", data: operations.taskHealth, href: "/task-sheet", mode: "all" },
  ].filter(chart => show(chart.key, chart.module) && (viewMode === "all" || chart.mode === "all" || chart.mode === viewMode));

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto w-full pb-10">
      <DemoUsageMeter />

      {isDemo && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100 shadow-2xs">
          <h2 className="font-bold text-sm">{t("admin_dashboard.demo_banner_title")}</h2>
          <p className="text-xs">{t("Demo includes 5 records per module, 5 AI API calls and 2 phone calls per workspace.")}</p>
          <button disabled={upgrading || upgradeRequested} onClick={upgrade} className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
            {t(upgradeRequested ? "admin_dashboard.upgrade_sent" : "admin_dashboard.request_full_access")}
          </button>
          {upgradeError && <p role="alert">{upgradeError}</p>}
        </div>
      )}

      {/* ── 1. POST-LOGIN HERO FINANCIAL CURRENCY COCKPIT (THE HUGE CURRENCY BOX) ────────── */}
      <section className="relative overflow-hidden rounded-[26px] border border-slate-800/80 dark:border-white/10 bg-gradient-to-br from-[#0b0f19] via-[#0f172a] to-[#131b2e] text-white p-6 sm:p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)]">
        {/* Subtle Ambient Glow Overlays */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-blue-500/5 blur-3xl pointer-events-none" />

        {/* Top Header Row: Status Badge, Title & B2B/B2C Mode Filter */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Multi-Tenant Cashflow Ledger
              </span>
              <span className="text-[11px] text-slate-400 font-medium">Real-Time Enterprise P&amp;L</span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-200 mt-1 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-400" />
              {viewMode === "all" ? "Organization 360° Realized Financial Velocity" : viewMode === "b2b" ? "B2B Enterprise Contracts & Pipeline Revenue" : "B2C Consumer & Course Admissions Revenue"}
            </h2>
          </div>

          {/* Panoramic Mode Switch: 360 Unified | B2B Enterprise | B2C Consumer */}
          <div className="flex items-center p-1 rounded-xl bg-slate-900/80 border border-slate-700/80 backdrop-blur-md shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode("all")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                viewMode === "all"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers3 className="w-3.5 h-3.5" /> 360° Unified
            </button>
            <button
              type="button"
              onClick={() => setViewMode("b2b")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                viewMode === "b2b"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Building className="w-3.5 h-3.5" /> B2B Enterprise
            </button>
            <button
              type="button"
              onClick={() => setViewMode("b2c")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                viewMode === "b2c"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" /> B2C Consumer
            </button>
          </div>
        </div>

        {/* Main Centerpiece: HUGE COMMANDING CURRENCY METRIC */}
        <div className="relative z-10 my-6 sm:my-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1.5">
              <span>{viewMode === "all" ? "Total Gross Collected & Cleared Cash" : viewMode === "b2b" ? "B2B Paid Client Invoices" : "B2C Collected Course Fees"}</span>
            </p>
            <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
              <span className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-md">
                {money(totalCollected)}
              </span>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
                  <TrendingUp className="w-3.5 h-3.5" /> +{collectionRatio}% Realized
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  across {activeCustomerCount} active {viewMode === "b2c" ? "students" : viewMode === "b2b" ? "accounts" : "clients & students"}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Financial Shortcuts inside the Currency Hero */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/invoices"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/15 text-white shadow-xs transition-all active:scale-95"
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-400" /> New Invoice
            </Link>
            <Link
              href="/proposals"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/15 text-white shadow-xs transition-all active:scale-95"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" /> Send Proposal
            </Link>
            <Link
              href="/revenue"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
            >
              Financial Analytics <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* 4 High-Value Sub-Metrics Pillars directly under the Huge Number */}
        <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-3 pt-6 border-t border-white/10">
          <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
              Contracted &amp; Invoiced
            </span>
            <p className="text-lg sm:text-xl font-black text-white">{money(totalContracted)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {viewMode === "b2c" ? "Booked course fees" : "Invoices + orders issued"}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 block mb-0.5">
              In-Flight Pipeline
            </span>
            <p className="text-lg sm:text-xl font-black text-indigo-200">{money(totalPipeline)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {viewMode === "b2c" ? "Uncollected installments" : "Proposals & quotes awaiting close"}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block mb-0.5">
              Pending Receivables
            </span>
            <p className="text-lg sm:text-xl font-black text-amber-200">{money(totalReceivables)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {viewMode === "b2c" ? "Student fee dues pending" : "Overdue & sent unpaid invoices"}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 block mb-0.5">
              Avg Deal / Student Value
            </span>
            <p className="text-lg sm:text-xl font-black text-emerald-200">{money(avgLTV)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              Average realization per account
            </p>
          </div>
        </div>
      </section>

      {/* ── 2. QUICK 1-CLICK OPERATIONAL ACTIONS BAR ───────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-purple-600/10 border border-blue-500/20 px-4 py-3 rounded-2xl backdrop-blur-sm shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold tracking-wider uppercase bg-blue-600 text-white">
              360° Live Cockpit
            </span>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">Real-Time Operational Execution</span>
          </div>
          <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight mt-0.5">
            {viewMode === "b2c" ? "Consumer & Institute Operations" : viewMode === "b2b" ? "B2B Enterprise Pipeline Cockpit" : "Unified Enterprise 360° Command Center"}
          </h1>
        </div>

        {/* 1-Click Fast Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/leads"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 hover:border-blue-500 hover:text-blue-600 shadow-xs transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 text-blue-500" /> New Lead
          </Link>
          {viewMode !== "b2c" && (
            <Link
              href="/clients"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 hover:border-indigo-500 hover:text-indigo-600 shadow-xs transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-500" /> B2B Client
            </Link>
          )}
          {(viewMode === "b2c" || viewMode === "all") && (
            <Link
              href="/students"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 hover:border-emerald-500 hover:text-emerald-600 shadow-xs transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-500" /> Student
            </Link>
          )}
          <Link
            href="/meetings?new=true"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 hover:border-purple-500 hover:text-purple-600 shadow-xs transition-all active:scale-95"
          >
            <Calendar className="w-3.5 h-3.5 text-purple-500" /> Schedule Meeting
          </Link>
          <Link
            href="/calls"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 hover:border-amber-500 hover:text-amber-600 shadow-xs transition-all active:scale-95"
          >
            <Phone className="w-3.5 h-3.5 text-amber-500" /> Log Call
          </Link>
          <Link
            href="/followups"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs transition-all active:scale-95 hover:opacity-95"
          >
            <CalendarClock className="w-3.5 h-3.5" /> Follow-ups
          </Link>
        </div>
      </div>

      {/* ── 3. 6-CARD HIGH-IMPACT 360° KPI GRID ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map(c => {
          const Icon = c.icon;
          return (
            <Link
              key={c.title}
              href={c.href}
              className="rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/90 dark:bg-[#111111]/90 p-4 shadow-xs hover:border-blue-500/60 dark:hover:border-blue-500/50 hover:shadow-md transition-all group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <div className={`w-8 h-8 rounded-xl ${c.bg} border flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4 h-4 ${c.color}`} />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-colors" />
              </div>
              <div className="mt-3">
                <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
                  {c.value}
                </p>
                <p className="text-xs font-bold text-slate-700 dark:text-zinc-300 mt-1 truncate">
                  {c.title}
                </p>
                <p className="text-[10.5px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">
                  {c.subtitle}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Unassigned Leads & Workload Quick Bar */}
      <DashboardManagement
        variant={variant}
        unassignedLeads={operations.management?.unassignedLeads}
        todayTasks={operations.management?.todayTasks}
        institute={institute}
      />

      {/* ── 4. 360° TOUCHPOINTS GRID: MEETINGS, CALLS & FOLLOW-UPS ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Card 1: Meetings & Agenda (360° View) */}
        <div className={panel}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Calendar className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Meetings &amp; Agenda</h3>
                <p className="text-[10px] text-slate-400">Upcoming client &amp; admissions demos</p>
              </div>
            </div>
            <Link href="/meetings" className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="mt-3 space-y-2">
            {meetings.length > 0 ? (
              meetings.slice(0, 4).map(m => (
                <div key={m.id} className="p-3 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-zinc-800/40 hover:bg-slate-100/80 transition-colors flex items-center justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-100 truncate" title={m.title}>
                      {m.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                      {m.scheduled_at ? new Date(m.scheduled_at).toLocaleString(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "Flexible"}
                      {m.duration_minutes ? ` • ${m.duration_minutes}m` : ''}
                      {m.host_name ? ` • Host: ${m.host_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                      m.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' :
                      m.status === 'Cancelled' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' :
                      'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                    }`}>
                      {m.status || 'Scheduled'}
                    </span>
                    {m.location && m.location.startsWith('http') && (
                      <a href={m.location} target="_blank" rel="noreferrer" className="p-1 rounded bg-white dark:bg-zinc-700 text-indigo-600 hover:text-indigo-800 shadow-xs" title="Join Video Meeting">
                        <Video className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <Calendar className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-1.5" />
                <p className="text-xs text-slate-400">No scheduled meetings today</p>
                <Link href="/meetings?new=true" className="inline-block mt-2 text-xs font-bold text-indigo-600 hover:underline">
                  + Schedule a Meeting
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Calls & Touchpoints (360° View) */}
        <div className={panel}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Phone className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Calls &amp; Logs</h3>
                <p className="text-[10px] text-slate-400">Consultation calls &amp; outcomes</p>
              </div>
            </div>
            <Link href="/calls" className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-0.5">
              Open calls <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="mt-3 space-y-2">
            {calls.length > 0 ? (
              calls.slice(0, 4).map(c => (
                <div key={c.id} className="p-3 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-zinc-800/40 hover:bg-slate-100/80 transition-colors flex items-center justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-100 truncate" title={c.summary || c.phone_number || "Call logged"}>
                      {c.summary || c.phone_number || "Consultation Call"}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                      {c.phone_number ? `${c.phone_number} • ` : ''}
                      {c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s` : 'Logged'}
                      {c.assigned_to ? ` • Rep: ${c.assigned_to}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 block">
                      {c.createdAt || c.received_at ? new Date(c.createdAt || c.received_at).toLocaleDateString(language, { month: 'short', day: 'numeric' }) : ''}
                    </span>
                    {c.followup_needed && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                        Follow-up
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <Phone className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-1.5" />
                <p className="text-xs text-slate-400">No calls recorded today</p>
                <Link href="/calls" className="inline-block mt-2 text-xs font-bold text-amber-600 hover:underline">
                  + Log a Phone Call
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Urgent Follow-ups & Reminders (360° View) */}
        <div>
          <FollowUpsWidget />
        </div>
      </div>

      {/* AI Call Pitch Drawer */}
      {show("call_pitch", "calls") && hasFeature("clients") && !isDemo && callPitch}

      {/* ── 5. B2B ENTERPRISE VS B2C PANELS ACCORDING TO VIEW MODE ─────────────── */}
      {/* If All or B2B: Show Pipeline & Proposals */}
      {(viewMode === "all" || viewMode === "b2b") && (
        <section className={panel}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                  B2B Engine
                </span>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Building className="w-4 h-4 text-indigo-500" /> B2B Deal Pipeline &amp; Accounts
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Enterprise sales stages, contract values, and conversion velocity</p>
            </div>
            <Link href="/leads" className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
              Open Pipeline ↗
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
            {[
              { stage: "New Inquiries", key: "new", color: "from-blue-500 to-cyan-500" },
              { stage: "Contacted", key: "contacted", color: "from-cyan-500 to-teal-500" },
              { stage: "Qualified", key: "qualified", color: "from-indigo-500 to-purple-500" },
              { stage: "Proposal Sent", key: "proposal", color: "from-purple-500 to-pink-500" },
              { stage: "Closed Won", key: "won", color: "from-emerald-500 to-teal-600" },
            ].map(item => {
              const matched = leadStages.find(s => s.name.toLowerCase().includes(item.key))?.value || 0;
              return (
                <div key={item.stage} className="p-3.5 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-zinc-800/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{item.stage}</span>
                    <span className="text-xs font-black text-slate-700 dark:text-zinc-300">{matched}</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full mt-2.5 overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${item.color}`} style={{ width: `${totalLeadsCount > 0 ? (matched / totalLeadsCount) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* If All or B2C: Show Institute / Direct Consumer Admissions & Course Fees */}
      {(viewMode === "all" || viewMode === "b2c") && institute && (
        <section className={panel}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  B2C Consumer
                </span>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-emerald-500" /> Course Admissions &amp; Student Batches
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Enrollment trajectory, batch seat fill, and installment collections</p>
            </div>
            <Link href="/enrollments" className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1">
              All Enrollments ↗
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Total Enrolled Students</span>
              <p className="text-2xl font-black text-emerald-900 dark:text-emerald-100 mt-1">{institute.students}</p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">{institute.activeStudents} active in current batches</p>
            </div>
            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-50/40 dark:bg-blue-950/20">
              <span className="text-xs font-bold text-blue-800 dark:text-blue-300">Fee Realization</span>
              <p className="text-2xl font-black text-blue-900 dark:text-blue-100 mt-1">{money(institute.collected)}</p>
              <p className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">of {money(institute.booked)} total booked fees</p>
            </div>
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-50/40 dark:bg-amber-950/20">
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Outstanding Fee Dues</span>
              <p className="text-2xl font-black text-amber-900 dark:text-amber-100 mt-1">{money(institute.due)}</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">Pending student installment balance</p>
            </div>
          </div>
        </section>
      )}

      {/* ── 6. FINANCIAL REVENUE VELOCITY CHART ─────────────────────────────────── */}
      {show("financial_chart", institute ? "institute" : "invoices") && (
        <section className={panel}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-500" /> {t("admin_dashboard.financial_overview")}
              </h2>
              <p className="text-xs text-slate-400">Monthly billing velocity, collected revenue vs expenses</p>
            </div>
            <Link href="/revenue" className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1">
              Full Breakdown <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={operations.feeRevenue || data.revenueData || []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" tickFormatter={label => dashboardDateLabel(String(label), language)} />
                <YAxis />
                <Tooltip labelFormatter={label => dashboardDateLabel(String(label), language)} formatter={value => money(Number(value))} />
                <Legend />
                <Area dataKey="revenue" name={t("admin_dashboard.revenue")} stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                <Area dataKey="expenses" name={t("admin_dashboard.expenses")} stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── 7. CHARTS GRID: PIPELINE STAGES, SOURCES, SALES WORKLOAD ──────────── */}
      {charts.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {charts.map(chart => (
            <OverviewChart
              key={chart.key}
              title={chart.title}
              data={chart.data || []}
              href={chart.href}
              money={chart.money}
              localizeNames={["lead_stages", "fee_health", "task_health"].includes(chart.key)}
            />
          ))}
        </div>
      )}

      {/* ── 8. LEAD ACQUISITION WIN RATES & SOURCE CONVERSION ──────────────────── */}
      {show("source_conversion", "leads") && <SourceWinRates data={operations.sourceConversion || []} />}

      {show("source_conversion", "leads") && (
        <section className={panel}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-500" /> {t("Source conversion")}
              </h2>
              <p className="text-xs text-slate-400">Conversion efficiency and win rates by discovery channel (Google Ads, Meta Ads, Website)</p>
            </div>
            <Link href="/leads" className="text-xs font-bold text-purple-600 hover:underline">
              View All Leads ↗
            </Link>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/5 text-slate-400 text-xs font-semibold uppercase">
                  {["Source", "Inquiries", "Converted", "Conversion rate"].map(label => (
                    <th key={label} className="p-2.5">{t(label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {operations.sourceConversion?.map(row => (
                  <tr key={row.name} className="hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="p-2.5 font-semibold text-slate-800 dark:text-zinc-200">{row.name}</td>
                    <td className="p-2.5 text-slate-600 dark:text-zinc-400">{row.total}</td>
                    <td className="p-2.5 text-emerald-600 font-semibold">{row.converted}</td>
                    <td className="p-2.5">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                        {row.rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!operations.sourceConversion?.length && (
              <p className="p-4 text-sm text-[var(--text-secondary)]">{t("No data recorded yet")}</p>
            )}
          </div>
        </section>
      )}

      {/* ── 9. PROJECTS PROGRESS ──────────────────────────────────────────────── */}
      {show("projects", "projects") && (
        <section className={panel}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-500" /> {t("Project progress")}
              </h2>
              <p className="text-xs text-slate-400">Active client project milestones and ticket delivery</p>
            </div>
            <Link href="/projects" className="text-xs font-bold text-blue-600 hover:underline">
              All Projects ↗
            </Link>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {operations.projectProgress?.map(project => (
              <Link key={project.id} href={`/projects/${project.id}`} className="rounded-xl border border-slate-200/80 dark:border-white/10 p-3.5 bg-slate-50/50 dark:bg-zinc-800/40 hover:border-blue-500 transition-all">
                <b className="text-sm text-slate-900 dark:text-white">{project.name}</b>
                <p className="text-xs text-[var(--text-secondary)] mt-1">{t(project.status)} · {project.progress}% completed</p>
                <div className="w-full bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full mt-2.5 overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: `${project.progress}%` }} />
                </div>
              </Link>
            ))}
          </div>
          {!operations.projectProgress?.length && (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("No data recorded yet")}</p>
          )}
        </section>
      )}

      {/* ── 10. TEAM ENGAGEMENT & INTERACTION BAR CHART ────────────────────────── */}
      {show("engagement") && (
        <section className={panel}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" /> {t("admin_dashboard.team_engagement")}
              </h2>
              <p className="text-xs text-slate-400">Daily interaction volume: Activities, outreach emails, and logged calls</p>
            </div>
          </div>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(data.chartLabels || []).map((name, index) => ({
                name,
                activities: data.activityChart?.[index] || 0,
                emails: data.emailChart?.[index] || 0,
                calls: data.callChart?.[index] || 0
              }))}>
                <XAxis dataKey="name" tickFormatter={label => dashboardDateLabel(String(label), language)} />
                <YAxis />
                <Tooltip labelFormatter={label => dashboardDateLabel(String(label), language)} />
                <Legend />
                <Bar dataKey="activities" name={t("admin_dashboard.total_activities")} fill="#6366f1" radius={[4, 4, 0, 0]} />
                {hasFeature("email_agent") && <Bar dataKey="emails" name={t("admin_dashboard.emails_sent")} fill="#10b981" radius={[4, 4, 0, 0]} />}
                {hasFeature("calls") && <Bar dataKey="calls" name={t("admin_dashboard.calls_made")} fill="#f59e0b" radius={[4, 4, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── 11. RECENT AUDIT & ACTIVITY PULSE ──────────────────────────────────── */}
      {show("recent_activity") && (
        <section className={panel}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" /> {t("admin_dashboard.recent_activity")}
              </h2>
              <p className="text-xs text-slate-400">Live 360° company interaction and audit log</p>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/5">
            {data.recentActivities?.map(activity => (
              <li key={activity.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <b className="text-xs font-bold text-slate-800 dark:text-zinc-200 block truncate">{activity.action}</b>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">{activity.content}</p>
                </div>
                <time className="text-[11px] font-medium text-slate-400 shrink-0">
                  {activity.createdAt ? new Date(activity.createdAt).toLocaleString(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ""}
                </time>
              </li>
            ))}
          </ul>
          {!data.recentActivities?.length && (
            <p className="mt-3 text-sm text-slate-400">{t("admin_dashboard.no_activities")}</p>
          )}
        </section>
      )}
    </div>
  );
}
