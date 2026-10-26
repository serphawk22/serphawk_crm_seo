"use client";
import React, { useState, useEffect, useMemo } from "react";
import { API_BASE_URL } from "@/config";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis
} from "recharts";
import {
  TrendingUp, Users, BookOpen, Layers, GraduationCap, DollarSign, Star, Target,
  Loader2, BarChart2, UserCog, PieChart as PieChartIcon, ArrowUpRight, Phone, Video,
  CheckCircle2, Clock, AlertCircle, RefreshCw, Download, Sparkles, Award, Activity,
  ChevronDown, CalendarDays, UserCheck, Filter
} from "lucide-react";
import { useRole } from "@/context/RoleContext";

const COLORS = ["#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#6366f1","#14b8a6","#f97316","#64748b"];

const STAGE_COLORS: Record<string, string> = {
  "New": "#3b82f6",
  "Contacted": "#8b5cf6",
  "Not Responded": "#64748b",
  "Follow-up": "#f59e0b",
  "Webinar Scheduled": "#6366f1",
  "Webinar Attended": "#14b8a6",
  "Webinar Not Attended": "#71717a",
  "Walk-in Scheduled": "#0ea5e9",
  "Walk-in Attended": "#06b6d4",
  "Walk-in Not Attended": "#f97316",
  "Converted": "#10b981",
  "Lost": "#ef4444",
};

// ── TYPES ──────────────────────────────────────────────────────────────────

interface SalesKPIs {
  leads_assigned: number;
  total_leads_all_time: number;
  demos_scheduled: number;
  demos_successful: number;
  demo_success_rate: number;
  followups_count: number;
  students_enrolled: number;
  conversion_rate: number;
  tuition_booked: number;
  advance_collected: number;
  pending_due: number;
}

interface LeadSource {
  source: string;
  total_leads: number;
  converted_students: number;
  conversion_rate: number;
}

interface PipelineStage {
  stage: string;
  count: number;
  percentage: number;
}

interface InstituteData {
  revenue?: { total_collected?: number; total_due?: number };
  students?: { total?: number; active?: number };
  courses?: { active?: number; total?: number };
  batches?: { active?: number; total?: number };
  leads?: { conversion_rate?: number; converted?: number; total?: number };
  enrollments?: { total?: number; active?: number };
  monthly_revenue?: { month: string; revenue: number; enrollments: number }[];
  revenue_by_course?: { course: string; revenue: number }[];
  instructor_stats?: { id: number; name: string; batches: number; students: number; avg_rating?: string }[];
  sales_stats?: { user_id: number; name: string; leads_assigned: number; leads_converted: number; conversion_rate: number }[];
}

interface SalesReport {
  company_overview?: SalesKPIs & {
    total_tuition_value: number;
    overall_conversion_rate: number;
  };
  lead_sources?: LeadSource[];
  lead_pipeline_stages?: PipelineStage[];
  daily_trends?: { date: string; leads: number; demos: number; enrollments: number }[];
  monthly_trends?: { month: string; leads: number; demos: number; enrollments: number; advance_collected: number }[];
}

// ── STAT CARD ──────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, sub, delay = 0 }: {
  label: string; value: string | number; icon: any; color: string; sub?: string; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="glass-card rounded-2xl p-5 border border-white/10 relative overflow-hidden"
    >
      <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${color} opacity-10 rounded-bl-3xl`} />
      <div className="flex items-center justify-between mb-3">
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">{label}</p>
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </motion.div>
  );
}

// ── CUSTOM PIE LABEL ───────────────────────────────────────────────────────

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════

export default function InstituteAnalyticsPage() {
  const { role, user } = useRole();
  const isAdmin = role === "Admin" || role === "SuperAdmin" || role === "Demo";
  const isSalesPerson = role === "Employee" || role === "SalesManager";

  // ── Institute-level data (admin) ──
  const [instData, setInstData] = useState<InstituteData | null>(null);
  const [instLoading, setInstLoading] = useState(isAdmin);

  // ── Personal sales data ──
  const [salesData, setSalesData] = useState<SalesReport | null>(null);
  const [salesLoading, setSalesLoading] = useState(true);

  // ── Date range ──
  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(thirtyAgo);
  const [endDate, setEndDate] = useState(today);
  const [isAllTime, setIsAllTime] = useState(false);

  const applyPreset = (p: "today" | "week" | "month" | "all") => {
    setIsAllTime(false);
    if (p === "today") { setStartDate(today); setEndDate(today); }
    else if (p === "week") { setStartDate(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)); setEndDate(today); }
    else if (p === "month") { setStartDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)); setEndDate(today); }
    else { setIsAllTime(true); }
  };

  const getAuthHeaders = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const userStr = typeof window !== "undefined" ? localStorage.getItem("crm_user") : null;
    let userId: string | null = null;
    if (userStr) { try { userId = String(JSON.parse(userStr)?.id); } catch {} }
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { "X-User-ID": userId } : {}),
    };
  };

  // Load institute-wide analytics (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    setInstLoading(true);
    fetch(`${API_BASE_URL}/institute/analytics`)
      .then(async r => { const p = await r.json(); if (!r.ok) throw new Error(); setInstData(p); })
      .catch(() => setInstData(null))
      .finally(() => setInstLoading(false));
  }, [isAdmin]);

  // Load personal sales report (scoped to self when isSalesPerson)
  const loadSalesReport = async () => {
    setSalesLoading(true);
    try {
      const params = new URLSearchParams();
      if (isAllTime) { params.set("all_time", "true"); }
      else { params.set("start_date", startDate); params.set("end_date", endDate); }
      // If sales person — filter to self only
      if (isSalesPerson && user?.id) params.set("salesperson_id", String(user.id));
      const res = await fetch(`${API_BASE_URL}/reports/summary?${params.toString()}`, { headers: getAuthHeaders() });
      const payload = await res.json();
      if (!res.ok) throw new Error();
      setSalesData(payload);
    } catch {
      setSalesData(null);
    } finally {
      setSalesLoading(false);
    }
  };

  useEffect(() => {
    loadSalesReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, isAllTime, user?.id, role]);

  // ── Derived data ──
  const sourceData = useMemo(() => (salesData?.lead_sources || []).filter(s => s.total_leads > 0), [salesData]);
  const pipelineData = useMemo(() => (salesData?.lead_pipeline_stages || []).filter(s => s.count > 0), [salesData]);
  const overview = salesData?.company_overview;
  const monthlyTrends = salesData?.monthly_trends || [];

  // ── Loading state ──
  if ((isAdmin && instLoading) || (isSalesPerson && salesLoading && !salesData)) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-violet-400" />
          <p className="text-zinc-500 text-sm">Loading your analytics…</p>
        </div>
      </div>
    );
  }

  // ── Date filter bar (shared) ──
  const DateFilter = () => (
    <div className="flex flex-wrap items-center gap-2">
      {(["today", "week", "month", "all"] as const).map(p => (
        <button key={p}
          onClick={() => applyPreset(p)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            (p === "all" && isAllTime) || (!isAllTime && (
              (p === "today" && startDate === today && endDate === today) ||
              (p === "week" && startDate === new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10) && endDate === today) ||
              (p === "month" && endDate === today && startDate <= today)
            ))
              ? "bg-violet-600 text-white shadow-sm"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          {p === "today" ? "Today" : p === "week" ? "Last 7 Days" : p === "month" ? "This Month" : "All Time"}
        </button>
      ))}
      {!isAllTime && (
        <>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500" />
          <span className="text-slate-400 text-xs">to</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </>
      )}
      <button onClick={loadSalesReport} className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-violet-500 transition-colors">
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  return (
    <div className="space-y-8 pb-16">

      {/* ── PAGE HEADER ── */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              <Sparkles className="h-3.5 w-3.5" />
              {isSalesPerson ? "Personal Analytics" : "Institute Analytics"}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-white" />
            </div>
            {isSalesPerson ? `My Performance Dashboard` : "Institute Analytics"}
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 mt-1">
            {isSalesPerson
              ? `Showing leads & conversions assigned to you, ${user?.name || ""}. Use the date filter to adjust the reporting window.`
              : "Comprehensive overview of institute performance across all staff."}
          </p>
        </div>
        <DateFilter />
      </div>

      {/* ══════════════════════════════════════════════════════
          SALES PERSON VIEW — Personal KPIs & Reports
         ══════════════════════════════════════════════════════ */}
      {isSalesPerson && (
        <>
          {salesLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
            </div>
          ) : !salesData ? (
            <div className="text-center text-zinc-500 py-20">
              <AlertCircle className="w-10 h-10 mx-auto mb-3 text-zinc-400" />
              <p>Could not load your analytics. Try refreshing.</p>
            </div>
          ) : (
            <>
              {/* Personal KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                <StatCard label="Leads Assigned" value={overview?.leads_assigned ?? 0} icon={Users} color="from-blue-500 to-indigo-600" sub={`${overview?.total_leads_all_time ?? 0} all time`} delay={0} />
                <StatCard label="Students Enrolled" value={overview?.students_enrolled ?? 0} icon={GraduationCap} color="from-emerald-500 to-teal-600" sub={`${overview?.conversion_rate ?? 0}% conversion`} delay={0.05} />
                <StatCard label="Demos Scheduled" value={overview?.demos_scheduled ?? 0} icon={Video} color="from-indigo-500 to-violet-600" sub={`${overview?.demos_successful ?? 0} successful (${overview?.demo_success_rate ?? 0}%)`} delay={0.1} />
                <StatCard label="Follow-ups" value={overview?.followups_count ?? 0} icon={Phone} color="from-amber-500 to-orange-600" sub="calls & check-ins" delay={0.15} />
                <StatCard label="Tuition Booked" value={`₹${(overview?.tuition_booked ?? 0).toLocaleString()}`} icon={DollarSign} color="from-green-500 to-emerald-600" sub="total course value" delay={0.2} />
                <StatCard label="Advance Collected" value={`₹${(overview?.advance_collected ?? 0).toLocaleString()}`} icon={CheckCircle2} color="from-teal-500 to-cyan-600" sub="amount received" delay={0.25} />
                <StatCard label="Pending Due" value={`₹${(overview?.pending_due ?? 0).toLocaleString()}`} icon={Clock} color="from-rose-500 to-pink-600" sub="outstanding balance" delay={0.3} />
                <StatCard label="Conversion Rate" value={`${overview?.conversion_rate ?? 0}%`} icon={Target} color="from-pink-500 to-rose-600" sub="lead → student" delay={0.35} />
              </div>

              {/* Source Distribution + Pipeline — side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Source Distribution Pie */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                  className="glass-card rounded-2xl p-6 border border-white/10">
                  <h2 className="text-slate-900 dark:text-white font-semibold text-lg mb-1 flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-violet-500" /> My Lead Source Distribution
                  </h2>
                  <p className="text-xs text-zinc-500 mb-5">Where your leads are coming from</p>
                  {sourceData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-56 text-zinc-500">
                      <PieChartIcon className="w-10 h-10 mb-3 text-zinc-400" />
                      <p className="text-sm">No lead source data for this period</p>
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={sourceData} dataKey="total_leads" nameKey="source" cx="50%" cy="50%"
                            outerRadius={90} labelLine={false} label={renderCustomLabel}>
                            {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fff" }}
                            formatter={(v: any, name: any) => [`${v} leads`, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-2 mt-4">
                        {sourceData.map((s, i) => (
                          <div key={s.source} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                            {s.source} ({s.total_leads})
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </motion.div>

                {/* Source → Conversion Table */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                  className="glass-card rounded-2xl p-6 border border-white/10">
                  <h2 className="text-slate-900 dark:text-white font-semibold text-lg mb-1 flex items-center gap-2">
                    <Target className="w-5 h-5 text-emerald-500" /> Source Performance
                  </h2>
                  <p className="text-xs text-zinc-500 mb-5">Leads vs conversions by source channel</p>
                  {sourceData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-56 text-zinc-500">
                      <AlertCircle className="w-10 h-10 mb-3 text-zinc-400" />
                      <p className="text-sm">No data for selected period</p>
                    </div>
                  ) : (
                    <div className="space-y-3 overflow-y-auto max-h-[280px] pr-1">
                      {sourceData.sort((a, b) => b.total_leads - a.total_leads).map((s, i) => (
                        <div key={s.source} className="p-3 bg-white/5 dark:bg-white/5 rounded-xl border border-white/10">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">{s.source}</span>
                            </div>
                            <span className="text-xs font-bold text-emerald-500">{s.conversion_rate}%</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-zinc-500">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {s.total_leads} leads</span>
                            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> {s.converted_students} enrolled</span>
                          </div>
                          <div className="mt-2 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.min(s.conversion_rate, 100)}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Pipeline Stages Bar Chart */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                className="glass-card rounded-2xl p-6 border border-white/10">
                <h2 className="text-slate-900 dark:text-white font-semibold text-lg mb-1 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-500" /> My Lead Pipeline
                </h2>
                <p className="text-xs text-zinc-500 mb-5">How your leads are distributed across stages</p>
                {pipelineData.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-zinc-500">No pipeline data for this period</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={pipelineData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis dataKey="stage" stroke="#71717a" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} />
                        <YAxis stroke="#71717a" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fff" }}
                          formatter={(v: any, _: any, props: any) => [`${v} leads (${props.payload.percentage}%)`, props.payload.stage]} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {pipelineData.map((entry, i) => (
                            <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] || COLORS[i % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {pipelineData.map((s, i) => (
                        <div key={s.stage} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: STAGE_COLORS[s.stage] || COLORS[i % COLORS.length] }} />
                          {s.stage} ({s.count})
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </motion.div>

              {/* Monthly Trend */}
              {monthlyTrends.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
                  className="glass-card rounded-2xl p-6 border border-white/10">
                  <h2 className="text-slate-900 dark:text-white font-semibold text-lg mb-5 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-violet-500" /> Monthly Activity Trend
                  </h2>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={monthlyTrends} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradEnroll" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradDemos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                      <XAxis dataKey="month" stroke="#71717a" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#71717a" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fff" }} />
                      <Legend />
                      <Area type="monotone" dataKey="leads" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradLeads)" name="Leads" />
                      <Area type="monotone" dataKey="demos" stroke="#06b6d4" strokeWidth={2} fill="url(#gradDemos)" name="Demos" />
                      <Area type="monotone" dataKey="enrollments" stroke="#10b981" strokeWidth={2} fill="url(#gradEnroll)" name="Enrollments" />
                    </AreaChart>
                  </ResponsiveContainer>
                </motion.div>
              )}

              {/* Self-Assessment Panel */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                className="glass-card rounded-2xl p-6 border border-white/10">
                <h2 className="text-slate-900 dark:text-white font-semibold text-lg mb-1 flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" /> Self-Assessment & Evaluation
                </h2>
                <p className="text-xs text-zinc-500 mb-5">How you're performing against key targets</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Conversion health */}
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-500" /> Conversion Health
                    </p>
                    {[
                      { label: "Lead → Student", value: overview?.conversion_rate ?? 0, threshold: 20, unit: "%" },
                      { label: "Demo success rate", value: overview?.demo_success_rate ?? 0, threshold: 50, unit: "%" },
                    ].map(({ label, value, threshold, unit }) => {
                      const pct = Math.min((value / (threshold * 2)) * 100, 100);
                      const color = value >= threshold ? "#10b981" : value >= threshold * 0.5 ? "#f59e0b" : "#ef4444";
                      return (
                        <div key={label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-zinc-500">{label}</span>
                            <span className="font-bold" style={{ color }}>{value}{unit}</span>
                          </div>
                          <div className="bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                            <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Activity */}
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-500" /> Activity Metrics
                    </p>
                    {[
                      { label: "Demos scheduled", value: overview?.demos_scheduled ?? 0, target: 10 },
                      { label: "Follow-ups done", value: overview?.followups_count ?? 0, target: 20 },
                    ].map(({ label, value, target }) => {
                      const pct = Math.min((value / target) * 100, 100);
                      const color = value >= target ? "#10b981" : value >= target * 0.5 ? "#f59e0b" : "#ef4444";
                      return (
                        <div key={label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-zinc-500">{label}</span>
                            <span className="font-bold" style={{ color }}>{value} / {target}</span>
                          </div>
                          <div className="bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                            <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Revenue */}
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-green-500" /> Revenue Contribution
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Tuition Booked</span>
                        <span className="font-bold text-violet-400">₹{(overview?.tuition_booked ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Advance Collected</span>
                        <span className="font-bold text-emerald-400">₹{(overview?.advance_collected ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Still Pending</span>
                        <span className="font-bold text-rose-400">₹{(overview?.pending_due ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-white/10">
                        {(overview?.advance_collected ?? 0) + (overview?.pending_due ?? 0) > 0 ? (
                          <>
                            <p className="text-xs text-zinc-500 mb-1">Collection progress</p>
                            <div className="bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                              <div className="h-2 rounded-full bg-emerald-500" style={{
                                width: `${Math.min(((overview?.advance_collected ?? 0) / ((overview?.advance_collected ?? 0) + (overview?.pending_due ?? 0))) * 100, 100).toFixed(0)}%`
                              }} />
                            </div>
                            <p className="text-xs text-emerald-400 mt-1">
                              {Math.min(((overview?.advance_collected ?? 0) / ((overview?.advance_collected ?? 0) + (overview?.pending_due ?? 0))) * 100, 100).toFixed(1)}% collected
                            </p>
                          </>
                        ) : <p className="text-xs text-zinc-500">No revenue data yet</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          ADMIN / DEMO VIEW — Full institute analytics
         ══════════════════════════════════════════════════════ */}
      {isAdmin && (
        <>
          {/* Admin also gets the full sales report with date filters */}
          {salesLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
            </div>
          ) : (
            <>
              {/* Institute KPI Cards */}
              {instData && (() => {
                const kpis = [
                  { label: "Total Revenue", value: `₹${(instData.revenue?.total_collected || 0).toLocaleString()}`, icon: DollarSign, color: "from-green-500 to-emerald-600", sub: `₹${(instData.revenue?.total_due || 0).toLocaleString()} pending` },
                  { label: "Total Students", value: instData.students?.total || 0, icon: GraduationCap, color: "from-violet-500 to-indigo-600", sub: `${instData.students?.active || 0} active` },
                  { label: "Active Courses", value: instData.courses?.active || 0, icon: BookOpen, color: "from-amber-500 to-orange-600", sub: `${instData.courses?.total || 0} total` },
                  { label: "Active Batches", value: instData.batches?.active || 0, icon: Layers, color: "from-blue-500 to-cyan-600", sub: `${instData.batches?.total || 0} total` },
                  { label: "Lead Conversion", value: `${instData.leads?.conversion_rate || 0}%`, icon: Target, color: "from-pink-500 to-rose-600", sub: `${instData.leads?.converted || 0} / ${instData.leads?.total || 0} leads` },
                  { label: "Total Enrollments", value: instData.enrollments?.total || 0, icon: TrendingUp, color: "from-teal-500 to-cyan-600", sub: `${instData.enrollments?.active || 0} active` },
                ];
                return (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {kpis.map((k, i) => <StatCard key={k.label} {...k} delay={i * 0.05} />)}
                  </div>
                );
              })()}

              {/* Source Distribution (institute wide) */}
              {sourceData.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="glass-card rounded-2xl p-6 border border-white/10">
                    <h2 className="text-slate-900 dark:text-white font-semibold text-lg mb-1 flex items-center gap-2">
                      <PieChartIcon className="w-5 h-5 text-violet-500" /> Lead Source Distribution
                    </h2>
                    <p className="text-xs text-zinc-500 mb-5">All institute leads by acquisition channel</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={sourceData} dataKey="total_leads" nameKey="source" cx="50%" cy="50%"
                          outerRadius={90} labelLine={false} label={renderCustomLabel}>
                          {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fff" }}
                          formatter={(v: any, name: any) => [`${v} leads`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {sourceData.map((s, i) => (
                        <div key={s.source} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          {s.source} ({s.total_leads})
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                    className="glass-card rounded-2xl p-6 border border-white/10">
                    <h2 className="text-slate-900 dark:text-white font-semibold text-lg mb-1 flex items-center gap-2">
                      <BarChart2 className="w-5 h-5 text-blue-500" /> Pipeline Stages
                    </h2>
                    <p className="text-xs text-zinc-500 mb-5">Lead distribution across all pipeline stages</p>
                    {pipelineData.length === 0 ? (
                      <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">No data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={pipelineData} layout="vertical" margin={{ left: 10, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                          <XAxis type="number" stroke="#71717a" tick={{ fontSize: 11 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="stage" width={140} stroke="#71717a" tick={{ fontSize: 10 }} />
                          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fff" }} />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                            {pipelineData.map((entry, i) => (
                              <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] || COLORS[i % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </motion.div>
                </div>
              )}

              {/* Monthly Trend (admin) */}
              {monthlyTrends.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                    className="glass-card rounded-2xl p-6 border border-white/10">
                    <h2 className="text-slate-900 dark:text-white font-semibold text-lg mb-4 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-violet-500" /> Monthly Revenue Trend
                    </h2>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={instData?.monthly_revenue || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                        <XAxis dataKey="month" stroke="#71717a" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={v => `₹${v.toLocaleString()}`} />
                        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fff" }} formatter={(v: any) => [`₹${v.toLocaleString()}`, ""]} />
                        <Line type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2.5} dot={{ fill: "#8b5cf6", strokeWidth: 2 }} />
                        <Line type="monotone" dataKey="enrollments" stroke="#06b6d4" strokeWidth={2} dot={{ fill: "#06b6d4" }} />
                        <Legend />
                      </LineChart>
                    </ResponsiveContainer>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                    className="glass-card rounded-2xl p-6 border border-white/10">
                    <h2 className="text-slate-900 dark:text-white font-semibold text-lg mb-4 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-amber-500" /> Revenue by Course
                    </h2>
                    {(instData?.revenue_by_course || []).length === 0 ? (
                      <div className="flex items-center justify-center h-56 text-zinc-500"><p>No data yet</p></div>
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={instData?.revenue_by_course || []} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                          <XAxis type="number" stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={v => `₹${v.toLocaleString()}`} />
                          <YAxis type="category" dataKey="course" width={120} stroke="#71717a" tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fff" }} formatter={(v: any) => [`₹${v.toLocaleString()}`, ""]} />
                          <Bar dataKey="revenue" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </motion.div>
                </div>
              )}

              {/* Instructor + Sales Performance (admin) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                  className="glass-card rounded-2xl p-6 border border-white/10">
                  <h2 className="text-slate-900 dark:text-white font-semibold text-lg mb-4 flex items-center gap-2">
                    <UserCog className="w-5 h-5 text-amber-500" /> Instructor Performance
                  </h2>
                  <div className="space-y-3">
                    {(instData?.instructor_stats || []).length === 0 ? <p className="text-zinc-500 text-center py-8">No instructors yet</p> :
                      (instData?.instructor_stats || []).map((ins) => (
                        <div key={ins.id} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm">{ins.name[0]}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-900 dark:text-white font-medium text-sm truncate">{ins.name}</p>
                            <p className="text-zinc-500 text-xs">{ins.batches} batches · {ins.students} students</p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 justify-end"><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /><span className="text-amber-400 font-semibold text-sm">{ins.avg_rating || "—"}</span></div>
                          </div>
                        </div>
                      ))}
                  </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
                  className="glass-card rounded-2xl p-6 border border-white/10">
                  <h2 className="text-slate-900 dark:text-white font-semibold text-lg mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-green-500" /> Sales Team Performance
                  </h2>
                  <div className="space-y-3">
                    {(instData?.sales_stats || []).length === 0 ? <p className="text-zinc-500 text-center py-8">No sales data yet</p> :
                      (instData?.sales_stats || []).map((s) => (
                        <div key={s.user_id} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">{(s.name || "?")[0]}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-900 dark:text-white font-medium text-sm truncate">{s.name || "Unknown"}</p>
                            <p className="text-zinc-500 text-xs">{s.leads_assigned} leads · {s.leads_converted} converted</p>
                          </div>
                          <div className="text-right">
                            <p className="text-green-400 font-bold text-sm">{s.conversion_rate}%</p>
                            <p className="text-zinc-600 text-xs">conversion</p>
                          </div>
                        </div>
                      ))}
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
