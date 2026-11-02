"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PieChart as PieChartIcon,
  TrendingUp,
  Users,
  CheckCircle2,
  ArrowUpRight,
  Search,
  Globe,
  RefreshCw,
  Sparkles,
  Award,
  ChevronRight,
  AlertCircle,
  GraduationCap,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import LeadSourceCatalog from "@/components/LeadSourceCatalog";

interface SourceItem {
  source: string;
  total: number;
  converted: number;
  lost: number;
  active: number;
  win_rate: number;
  inquiry_share: number;
}

interface RecentLead {
  id: number;
  company_name: string;
  source: string;
  status: string;
  is_converted: boolean;
  course_interest_title?: string | null;
  website?: string | null;
  created_at: string;
  owner_name?: string | null;
}

interface AnalyticsData {
  summary: {
    total_leads: number;
    total_converted: number;
    overall_win_rate: number;
    top_source: string;
    top_win_rate_source: string;
  };
  sources: SourceItem[];
  recent: RecentLead[];
}

const PALETTE = [
  "#ec4899", // pink
  "#8b5cf6", // purple
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f97316", // orange
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#e11d48", // rose
];

export default function LeadSourcesPage() {
  const { role } = useRole();
  const router = useRouter();
  const isAdmin = role === "Admin" || (role as string) === "SuperAdmin";

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/lead-sources/overview`);
      if (!res.ok) throw new Error("Could not load lead sources analytics.");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sourcesList = useMemo(() => data?.sources || [], [data?.sources]);
  const summary = data?.summary || {
    total_leads: 0,
    total_converted: 0,
    overall_win_rate: 0,
    top_source: "—",
    top_win_rate_source: "—",
  };

  const filteredSources = useMemo(() => {
    return sourcesList.filter((s) =>
      s.source.toLowerCase().includes(search.toLowerCase())
    );
  }, [sourcesList, search]);

  const pieData = useMemo(() => {
    return sourcesList.map((s) => ({
      name: s.source,
      value: s.total,
      win_rate: s.win_rate,
      converted: s.converted,
    }));
  }, [sourcesList]);

  const barData = useMemo(() => {
    return sourcesList.map((s) => ({
      source: s.source,
      win_rate: s.win_rate,
      total: s.total,
      converted: s.converted,
    }));
  }, [sourcesList]);

  const recentFiltered = useMemo(() => {
    const list = data?.recent || [];
    if (!selectedSource) return list;
    return list.filter((l) => l.source === selectedSource);
  }, [data?.recent, selectedSource]);

  const topWinRateItem = useMemo(() => {
    if (!sourcesList.length) return null;
    return [...sourcesList]
      .filter((s) => s.total >= 1)
      .sort((a, b) => b.win_rate - a.win_rate)[0] || null;
  }, [sourcesList]);

  return (
    <div className="flex h-full flex-col bg-[#f8fafc] dark:bg-black overflow-y-auto">
      {isAdmin && <LeadSourceCatalog />}
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-black">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-600 p-2.5 text-white shadow-md">
              <PieChartIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Lead Sources &amp; Conversion Intelligence
                </h1>
                <span className="rounded-full bg-pink-500/10 px-2.5 py-0.5 text-xs font-bold text-pink-600 dark:text-pink-400">
                  Analytics
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Performance analysis across acquisition channels, lead conversions, and win rate metrics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/leads"
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-all"
            >
              <Users className="h-3.5 w-3.5" /> View All Leads
            </Link>
          </div>
        </div>

        {/* 4 KPI Summary Cards */}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Inquiries
              </p>
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
              {loading ? "—" : summary.total_leads}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Across {sourcesList.length} distinct channels
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Converted Admissions
              </p>
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {loading ? "—" : summary.total_converted}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Converted leads from inquiries
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Overall Win Rate
              </p>
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
              {loading ? "—" : `${summary.overall_win_rate}%`}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Average conversion effectiveness
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Top Performing Source
              </p>
              <div className="rounded-lg bg-pink-500/10 p-2 text-pink-600 dark:text-pink-400">
                <Award className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 truncate text-xl font-black text-pink-600 dark:text-pink-400">
              {loading ? "—" : topWinRateItem ? topWinRateItem.source : summary.top_source}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {topWinRateItem ? `${topWinRateItem.win_rate}% win rate (${topWinRateItem.converted} enrolled)` : "Highest conversions"}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 space-y-6 p-6">
        {error ? (
          <div className="mx-auto max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle className="mx-auto mb-2 h-6 w-6" />
            <p className="font-semibold">{error}</p>
            <button
              onClick={() => fetchData()}
              className="mt-3 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Visual Charts Grid: Donut + Bar */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Donut Chart: Acquisition Distribution */}
              <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-zinc-950">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <PieChartIcon className="h-4 w-4 text-pink-500" />
                      Lead Volume by Acquisition Channel
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Share of incoming inquiries across each source
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded dark:bg-slate-800 dark:text-slate-300">
                    {sourcesList.length} Channels
                  </span>
                </div>

                <div className="mt-4 flex flex-1 flex-col sm:flex-row items-center gap-4">
                  <div className="relative h-60 w-full sm:w-60 shrink-0">
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {pieData.map((_, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={PALETTE[index % PALETTE.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const p = payload[0].payload;
                              return (
                                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-black">
                                  <p className="font-bold text-slate-900 dark:text-white">
                                    {p.name}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                    Inquiries: <span className="font-bold">{p.value}</span>
                                  </p>
                                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                    Converted: <span className="font-bold">{p.converted}</span>
                                  </p>
                                  <p className="text-xs text-pink-600 dark:text-pink-400 font-semibold">
                                    Win Rate: {p.win_rate}%
                                  </p>
                                </div>
                              );
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">
                        No data
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-2xl font-black text-slate-900 dark:text-white">
                        {summary.total_leads}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Total Leads
                      </span>
                    </div>
                  </div>

                  {/* Channel Breakdown List */}
                  <div className="flex-1 w-full space-y-2 overflow-y-auto max-h-56 pr-1">
                    {sourcesList.map((item, idx) => (
                      <button
                        key={item.source}
                        onClick={() =>
                          setSelectedSource(
                            selectedSource === item.source ? null : item.source
                          )
                        }
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all ${
                          selectedSource === item.source
                            ? "bg-pink-500/10 border border-pink-500/30"
                            : "hover:bg-slate-50 dark:hover:bg-slate-900 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                          />
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {item.source}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {item.total}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            ({item.inquiry_share}%)
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bar Chart: Win Rate Percentage by Source */}
              <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-zinc-950">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      Win Rate Percentage by Channel
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Conversion efficiency: percentage of leads converted
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded dark:text-emerald-400">
                    Avg: {summary.overall_win_rate}%
                  </span>
                </div>

                <div className="mt-4 flex-1 h-64 w-full">
                  {barData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={barData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
                        <XAxis
                          dataKey="source"
                          axisLine={false}
                          tickLine={false}
                          interval={0}
                          tick={({ x, y, payload }) => (
                            <g transform={`translate(${x},${y})`}>
                              <text
                                x={0}
                                y={0}
                                dy={12}
                                textAnchor="end"
                                fill="#888"
                                transform="rotate(-25)"
                                fontSize={10}
                                fontWeight={600}
                              >
                                {payload.value.length > 12
                                  ? `${payload.value.slice(0, 10)}…`
                                  : payload.value}
                              </text>
                            </g>
                          )}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "#888" }}
                          domain={[0, 100]}
                          unit="%"
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const p = payload[0].payload;
                            return (
                              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-black">
                                <p className="font-bold text-slate-900 dark:text-white">
                                  {p.source}
                                </p>
                                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                                  Win Rate: {p.win_rate}%
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-300">
                                  Total Inquiries: {p.total}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-300">
                                  Enrolled Students: {p.converted}
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          dataKey="win_rate"
                          name="Win Rate %"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={40}
                        >
                          {barData.map((_, index) => (
                            <Cell
                              key={`cell-bar-${index}`}
                              fill={PALETTE[index % PALETTE.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">
                      No data
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Detailed Sources Breakdown Table */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-zinc-950">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    Acquisition Channel Performance Matrix
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Comprehensive conversion and outcome metrics per source
                  </p>
                </div>

                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search source..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                    <tr>
                      <th className="px-5 py-3.5">Lead Source</th>
                      <th className="px-4 py-3.5 text-center">Inquiries</th>
                      <th className="px-4 py-3.5 text-center">Converted</th>
                      <th className="px-4 py-3.5 text-center">Active Pipeline</th>
                      <th className="px-4 py-3.5 text-center">Lost</th>
                      <th className="px-5 py-3.5">Win Rate %</th>
                      <th className="px-4 py-3.5 text-center">Channel Share</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                    {filteredSources.map((s, idx) => (
                      <tr
                        key={s.source}
                        className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                            />
                            <span className="font-bold text-slate-900 dark:text-white">
                              {s.source}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center font-bold text-slate-800 dark:text-slate-200">
                          {s.total}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md font-bold text-emerald-700 bg-emerald-500/10 dark:text-emerald-400">
                            {s.converted}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center text-slate-600 dark:text-slate-300">
                          {s.active}
                        </td>
                        <td className="px-4 py-3.5 text-center text-slate-400">
                          {s.lost}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5 min-w-[130px]">
                            <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-pink-500 to-emerald-500"
                                style={{ width: `${Math.min(100, s.win_rate)}%` }}
                              />
                            </div>
                            <span className="font-bold text-slate-900 dark:text-white text-xs w-10 text-right">
                              {s.win_rate}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center text-slate-500 dark:text-slate-400">
                          {s.inquiry_share}%
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Link
                            href={`/leads?search=${encodeURIComponent(s.source)}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                          >
                            Filter Leads <ChevronRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {filteredSources.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          No lead sources found matching your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Leads Activity by Source */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-zinc-950">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-500" />
                    Recent Leads Acquisition Feed
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Latest incoming inquiries, acquisition origin, and pipeline stages
                  </p>
                </div>

                {selectedSource && (
                  <button
                    onClick={() => setSelectedSource(null)}
                    className="text-xs font-semibold text-pink-600 hover:underline dark:text-pink-400"
                  >
                    Clear Filter ({selectedSource})
                  </button>
                )}
              </div>

              <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {recentFiltered.map((lead) => (
                  <div
                    key={lead.id}
                    onClick={() => router.push(`/leads/${lead.id}`)}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-xl transition-colors dark:hover:bg-slate-900/50"
                  >
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 shrink-0">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white text-sm">
                          {lead.company_name}
                          <ArrowUpRight className="h-3 w-3 opacity-40 group-hover:opacity-100" />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {lead.course_interest_title || "General Inquiry"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <Globe className="h-3 w-3 text-slate-400" />
                        {lead.source}
                      </span>
                      {lead.website && (
                        <a
                          href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-blue-600 hover:underline max-w-[140px] truncate hidden sm:inline-block"
                        >
                          {lead.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          lead.is_converted || lead.status === "Converted"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : lead.status === "Lost"
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                        }`}
                      >
                        {lead.status}
                      </span>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(lead.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                ))}

                {recentFiltered.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-400">
                    No recent inquiries found for this channel.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
