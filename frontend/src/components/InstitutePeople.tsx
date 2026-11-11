"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Users,
  GraduationCap,
  ArrowUpRight,
  Loader2,
  DollarSign,
  Download,
  CheckCircle2,
  Shield,
  FileText,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/config";
import { useTenantConfig } from "@/context/TenantConfigContext";
import LocalizedText from "@/components/LocalizedText";

export interface Person {
  id?: number;
  user_id?: number | null;
  name: string;
  email?: string;
  role?: string;
  expertise?: string;
  leads_converted?: number;
  leads_assigned?: number;
  conversion_rate?: number;
  revenue_collected?: number;
  students?: number;
  batches_completed?: number;
  avg_rating?: number;
}

type SalesMetric = "revenue_collected" | "leads_converted" | "conversion_rate" | "leads_assigned";
type TeachingMetric = "avg_rating" | "students" | "batches_completed";
type PeriodType = "today" | "week" | "month" | "all";

function getInitials(name: string): string {
  if (!name) return "??";
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function calculateWinRate(converted: number = 0, assigned: number = 0): number {
  if (assigned > 0) return Math.min(100, Math.round((converted / assigned) * 1000) / 10);
  return converted > 0 ? 100 : 0;
}

export default function InstitutePeople({ leaderboard = false }: { leaderboard?: boolean }) {
  const { settings } = useTenantConfig();
  const [sales, setSales] = useState<Person[]>([]);
  const [instructors, setInstructors] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  // Filters & State
  const [activeTab, setActiveTab] = useState<"sales" | "instructors">("sales");
  const [period, setPeriod] = useState<PeriodType>("month");
  const [searchQuery, setSearchQuery] = useState("");
  const [salesMetric, setSalesMetric] = useState<SalesMetric>("revenue_collected");
  const [teachingMetric, setTeachingMetric] = useState<TeachingMetric>("avg_rating");

  useEffect(() => {
    let alive = true;
    async function read(path: string) {
      const response = await fetch(`${API_BASE_URL}${path}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load institute team");
      return data;
    }
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (leaderboard) {
          const data = await read("/institute/team-performance");
          if (alive) {
            setSales(data.sales || []);
            setInstructors(data.instructors || []);
          }
        } else {
          const [users, teachers] = await Promise.all([
            read("/users?role=Employee,SalesManager,Sales"),
            read("/instructors")
          ]);
          if (alive) {
            setSales(users.users || []);
            setInstructors(teachers.instructors || []);
          }
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Could not load institute team");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [leaderboard, retry]);

  const currency = settings.default_currency || "INR";
  const money = useCallback(
    (value: number = 0) =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency,
        maximumFractionDigits: 0
      }).format(value || 0),
    [currency]
  );

  // Sorting
  const sortedSales = useMemo(() => {
    const list = [...sales];
    list.sort((a, b) => {
      if (salesMetric === "revenue_collected") {
        return (
          (b.revenue_collected || 0) - (a.revenue_collected || 0) ||
          (b.leads_converted || 0) - (a.leads_converted || 0) ||
          a.name.localeCompare(b.name)
        );
      }
      if (salesMetric === "leads_converted") {
        return (
          (b.leads_converted || 0) - (a.leads_converted || 0) ||
          (b.revenue_collected || 0) - (a.revenue_collected || 0) ||
          a.name.localeCompare(b.name)
        );
      }
      if (salesMetric === "conversion_rate") {
        const rateA = a.conversion_rate ?? calculateWinRate(a.leads_converted, a.leads_assigned);
        const rateB = b.conversion_rate ?? calculateWinRate(b.leads_converted, b.leads_assigned);
        return rateB - rateA || (b.revenue_collected || 0) - (a.revenue_collected || 0);
      }
      if (salesMetric === "leads_assigned") {
        return (
          (b.leads_assigned || 0) - (a.leads_assigned || 0) ||
          (b.leads_converted || 0) - (a.leads_converted || 0)
        );
      }
      return 0;
    });
    return list;
  }, [sales, salesMetric]);

  const sortedInstructors = useMemo(() => {
    const list = [...instructors];
    list.sort((a, b) => {
      if (teachingMetric === "avg_rating") {
        return (
          (b.avg_rating || 0) - (a.avg_rating || 0) ||
          (b.batches_completed || 0) - (a.batches_completed || 0) ||
          a.name.localeCompare(b.name)
        );
      }
      if (teachingMetric === "students") {
        return (
          (b.students || 0) - (a.students || 0) ||
          (b.batches_completed || 0) - (a.batches_completed || 0)
        );
      }
      if (teachingMetric === "batches_completed") {
        return (
          (b.batches_completed || 0) - (a.batches_completed || 0) ||
          (b.avg_rating || 0) - (a.avg_rating || 0)
        );
      }
      return 0;
    });
    return list;
  }, [instructors, teachingMetric]);

  const currentList = activeTab === "sales" ? sortedSales : sortedInstructors;

  // Search filter
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return currentList;
    return currentList.filter((p) =>
      [p.name, p.email, p.expertise, p.role].some((v) =>
        v?.toLowerCase().includes(q)
      )
    );
  }, [currentList, searchQuery]);

  const top3 = useMemo(() => currentList.slice(0, 3), [currentList]);

  // Export CSV
  const handleExportCsv = useCallback(() => {
    if (currentList.length === 0) return;
    const isSales = activeTab === "sales";
    const headers = isSales
      ? ["Rank", "Name", "Role", "Revenue", "Enrolled Leads", "Assigned Leads", "Win Rate %"]
      : ["Rank", "Name", "Expertise", "Rating", "Batches Completed", "Active Students"];

    const rows = filteredList.map((p, index) => {
      if (isSales) {
        const winRate = p.conversion_rate ?? calculateWinRate(p.leads_converted, p.leads_assigned);
        return [
          index + 1,
          `"${p.name.replace(/"/g, '""')}"`,
          `"${(p.role || "Sales Manager").replace(/"/g, '""')}"`,
          `"${money(p.revenue_collected || 0).replace(/"/g, '""')}"`,
          p.leads_converted || 0,
          p.leads_assigned || 0,
          `"${winRate}%"`
        ];
      } else {
        return [
          index + 1,
          `"${p.name.replace(/"/g, '""')}"`,
          `"${(p.expertise || "Instructor").replace(/"/g, '""')}"`,
          p.avg_rating ? p.avg_rating.toFixed(1) : "Unrated",
          p.batches_completed || 0,
          p.students || 0
        ];
      }
    });

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", `institute_${activeTab}_leaderboard_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [currentList, filteredList, activeTab, money]);

  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 p-16 text-xs text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        <span>Loading rankings...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="p-4 rounded-2xl border border-rose-200 bg-rose-50 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300 flex items-center justify-between"
      >
        <span>{error}</span>
        <button className="font-semibold underline ml-2" onClick={() => setRetry((v) => v + 1)}>
          Try again
        </button>
      </div>
    );
  }

  // If this component is used as a directory (non-leaderboard) on /teams page:
  if (!leaderboard) {
    return (
      <div className="space-y-4">
        {/* KPI Metric Strip */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                <LocalizedText text="Sales Team" />
              </p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{sales.length}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                <LocalizedText text="Instructors" />
              </p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{instructors.length}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white dark:bg-[#111111]/90 p-2 sm:px-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, role, expertise..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Directory List */}
        <div className="space-y-2">
          {filteredList.map((person) => (
            <div
              key={person.id || person.user_id}
              className="flex items-center justify-between p-3 bg-white dark:bg-[#111111] rounded-xl border border-slate-200/80 dark:border-white/10"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-xs">
                  {person.name?.charAt(0).toUpperCase() || "?"}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{person.name}</p>
                  <p className="text-[11px] text-slate-500">{person.expertise || person.role || "Team Member"}</p>
                </div>
              </div>
              {person.email && (
                <a href={`mailto:${person.email}`} className="text-xs text-blue-600 hover:underline">
                  {person.email}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // =========================================================================
  // LEADERBOARD MODE (EXACT STITCH DESIGN MATCH)
  // =========================================================================

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full pb-12 font-sans">
      {/* BEGIN: Header Controls Section */}
      <section
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#141414] p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-sm"
        data-purpose="dashboard-controls"
      >
        {/* Title & Live Badge */}
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-snug">
              {activeTab === "sales" ? "Sales Rankings" : "Instructor Rankings"}
            </h1>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/40">
                <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Tracking
              </span>
              <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                {currentList.length} of {currentList.length} active team members
              </span>
            </div>
          </div>
        </div>

        {/* Tab Switcher, Time Duration & Rank Selector */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Tabs: Sales Team / Instructors */}
          <div className="inline-flex p-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200/60 dark:border-white/10 text-xs font-medium">
            <button
              onClick={() => setActiveTab("sales")}
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all",
                activeTab === "sales"
                  ? "bg-white dark:bg-[#1e1e1e] text-indigo-600 dark:text-indigo-400 font-bold shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <DollarSign className="w-3.5 h-3.5 text-amber-500" />
              <span>Sales ({sales.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("instructors")}
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all",
                activeTab === "instructors"
                  ? "bg-white dark:bg-[#1e1e1e] text-indigo-600 dark:text-indigo-400 font-bold shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
              <span>Instructors ({instructors.length})</span>
            </button>
          </div>

          {/* Time Duration Switcher */}
          <div className="inline-flex p-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200/60 dark:border-white/10 text-xs font-medium text-slate-600 dark:text-zinc-400">
            <button
              type="button"
              onClick={() => setPeriod("today")}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-colors",
                period === "today"
                  ? "bg-white dark:bg-[#1e1e1e] text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs"
                  : "hover:text-slate-900 dark:hover:text-white"
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setPeriod("week")}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-colors",
                period === "week"
                  ? "bg-white dark:bg-[#1e1e1e] text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs"
                  : "hover:text-slate-900 dark:hover:text-white"
              )}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setPeriod("month")}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-colors",
                period === "month"
                  ? "bg-white dark:bg-[#1e1e1e] text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs"
                  : "hover:text-slate-900 dark:hover:text-white"
              )}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => setPeriod("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-colors",
                period === "all"
                  ? "bg-white dark:bg-[#1e1e1e] text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs"
                  : "hover:text-slate-900 dark:hover:text-white"
              )}
            >
              All Time
            </button>
          </div>

          {/* Rank By Selector */}
          <div className="flex items-center space-x-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-600 dark:text-zinc-300">
            <span className="text-slate-400 dark:text-zinc-500 font-medium">Rank by:</span>
            {activeTab === "sales" ? (
              <select
                value={salesMetric}
                onChange={(e) => setSalesMetric(e.target.value as SalesMetric)}
                className="bg-transparent font-semibold text-slate-800 dark:text-zinc-100 border-none p-0 focus:ring-0 text-xs cursor-pointer pr-4 outline-none"
              >
                <option value="revenue_collected" className="dark:bg-[#1a1a1a]">Revenue collected</option>
                <option value="leads_converted" className="dark:bg-[#1a1a1a]">Deals Enrolled</option>
                <option value="conversion_rate" className="dark:bg-[#1a1a1a]">Conversion Rate</option>
                <option value="leads_assigned" className="dark:bg-[#1a1a1a]">Assigned Leads</option>
              </select>
            ) : (
              <select
                value={teachingMetric}
                onChange={(e) => setTeachingMetric(e.target.value as TeachingMetric)}
                className="bg-transparent font-semibold text-slate-800 dark:text-zinc-100 border-none p-0 focus:ring-0 text-xs cursor-pointer pr-4 outline-none"
              >
                <option value="avg_rating" className="dark:bg-[#1a1a1a]">Student Rating</option>
                <option value="students" className="dark:bg-[#1a1a1a]">Active Students</option>
                <option value="batches_completed" className="dark:bg-[#1a1a1a]">Completed Batches</option>
              </select>
            )}
          </div>

          {/* Export CSV */}
          <button
            onClick={handleExportCsv}
            type="button"
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-xl text-slate-700 dark:text-zinc-300 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
        </div>
      </section>

      {/* =========================================================
          TOP 3 PODIUM SECTION (EXACT STITCH DESIGN - OPTIMIZED)
         ========================================================= */}
      {top3.length > 0 && (
        <section
          className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-3.5 lg:gap-4.5"
          data-purpose="top-performers-showcase"
        >
          {activeTab === "sales" ? (
            <>
              {top3[0] && <SalesPodiumGold person={top3[0]} totalList={currentList} money={money} />}
              {top3[1] && <SalesPodiumSilver person={top3[1]} totalList={currentList} money={money} />}
              {top3[2] && <SalesPodiumBronze person={top3[2]} totalList={currentList} money={money} />}
            </>
          ) : (
            <>
              {top3[0] && <InstructorPodiumCard person={top3[0]} rank={1} totalList={currentList} />}
              {top3[1] && <InstructorPodiumCard person={top3[1]} rank={2} totalList={currentList} />}
              {top3[2] && <InstructorPodiumCard person={top3[2]} rank={3} totalList={currentList} />}
            </>
          )}
        </section>
      )}

      {/* =========================================================
          COMPREHENSIVE PERFORMANCE TABLE (EXACT STITCH MATCH - OPTIMIZED)
         ========================================================= */}
      <section
        className="bg-white dark:bg-[#141414] rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-white/10 shadow-sm p-4 sm:p-6 lg:p-7 space-y-4 sm:space-y-5"
        data-purpose="full-leaderboard-list"
      >
        {/* Header: Title, Subtitle and Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {activeTab === "sales" ? "Comprehensive Rep Performance" : "Comprehensive Instructor Performance"}
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
              {activeTab === "sales"
                ? "Rankings updated automatically based on closed & cleared revenue"
                : "Rankings based on student reviews, batches completed & active learners"}
            </p>
          </div>

          {/* Search representative input */}
          <div className="relative w-full sm:w-64 lg:w-72">
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search representative..."
              className="w-full pl-8 sm:pl-9 pr-7 sm:pr-8 py-1.5 sm:py-2 text-xs bg-white dark:bg-black/30 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-300 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* List of Rows */}
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {filteredList.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No representative found matching &quot;{searchQuery}&quot;
            </div>
          ) : activeTab === "sales" ? (
            filteredList.map((person, index) => (
              <SalesTableRow
                key={person.user_id || person.id || index}
                person={person}
                rank={index + 1}
                money={money}
              />
            ))
          ) : (
            filteredList.map((person, index) => (
              <InstructorTableRow
                key={person.id || person.user_id || index}
                person={person}
                rank={index + 1}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

/* =========================================================================
   SALES PODIUM CARDS (EXACT MATCH TO STITCH SCREENSHOT)
========================================================================= */

function SalesPodiumGold({
  person,
  money
}: {
  person: Person;
  totalList: Person[];
  money: (val: number) => string;
}) {
  const winRate = person.conversion_rate ?? calculateWinRate(person.leads_converted, person.leads_assigned);
  const initials = getInitials(person.name);

  return (
    <div className="relative bg-white dark:bg-[#141414] rounded-2xl lg:rounded-3xl p-3.5 sm:p-4 lg:p-5 flex flex-col justify-between border-2 border-amber-300 dark:border-amber-400/80 shadow-[0_0_24px_rgba(251,191,36,0.25)] transition-all">
      <div>
        {/* Top Header: Badge & Champion Pill */}
        <div className="flex items-center justify-between gap-1.5 mb-2.5 sm:mb-3">
          <div className="inline-flex items-center gap-1 bg-[#f59e0b] text-white text-[10px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full shadow-xs whitespace-nowrap">
            <span className="text-[10px] sm:text-xs">★</span>
            <span>#1 LEADER</span>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-[#fef3c7] text-[#b45309] dark:bg-amber-950/60 dark:text-amber-300 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse"></span>
            Champion
          </span>
        </div>

        {/* Profile: Avatar & Name */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 mb-2 sm:mb-2.5">
          <div className="relative shrink-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 lg:w-12 lg:h-12 rounded-xl sm:rounded-2xl bg-[#f59e0b] text-white flex items-center justify-center font-bold text-sm sm:text-base shadow-xs">
              {initials}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#d97706] text-white rounded-full flex items-center justify-center border-2 border-white dark:border-[#141414] shadow-2xs">
              <CheckCircle2 className="w-2.5 h-2.5 text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-1">
              <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">
                {person.name}
              </h3>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#f59e0b] fill-[#f59e0b] text-white shrink-0" />
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 font-medium mt-0.5 capitalize truncate">
              {person.role === "SalesManager" ? "Sales Manager" : person.role || "Sales Manager"}
            </p>
          </div>
        </div>

        {/* Revenue Figure */}
        <div className="my-2 sm:my-2.5">
          <div className="flex items-baseline justify-between gap-1.5 flex-wrap sm:flex-nowrap">
            <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight tabular-nums truncate">
              {money(person.revenue_collected || 0)}
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-[#ecfdf5] text-[#059669] dark:bg-emerald-950/50 dark:text-emerald-400 shrink-0 whitespace-nowrap">
              +100% Target
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
            <div className="w-3 h-3 rounded-full border border-slate-400 flex items-center justify-center text-[8px] font-bold text-slate-500 shrink-0">
              $
            </div>
            <span className="truncate">Total Revenue collected</span>
          </div>
        </div>

        {/* Micro Modular Metric Tiles */}
        <div className="grid grid-cols-3 gap-1 sm:gap-1.5 lg:gap-2 my-2 sm:my-2.5">
          <div className="bg-[#f8fafc] dark:bg-white/5 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center border border-slate-100 dark:border-white/5">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-tight block truncate">
              ASSIGNED
            </span>
            <span className="text-xs sm:text-sm lg:text-base font-extrabold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
              {person.leads_assigned || 0}
            </span>
          </div>
          <div className="bg-[#f8fafc] dark:bg-white/5 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center border border-slate-100 dark:border-white/5">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-tight block truncate">
              ENROLLED
            </span>
            <span className="text-xs sm:text-sm lg:text-base font-extrabold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
              {person.leads_converted || 0}
            </span>
          </div>
          <div className="bg-[#ecfdf5] dark:bg-emerald-950/40 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center border border-emerald-100 dark:border-emerald-800/30">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold text-[#059669] dark:text-emerald-400 tracking-tight block truncate">
              WIN RATE
            </span>
            <span className="text-xs sm:text-sm lg:text-base font-extrabold text-[#059669] dark:text-emerald-400 mt-0.5 block tabular-nums">
              {winRate}%
            </span>
          </div>
        </div>
      </div>

      {/* Target Progress Bar */}
      <div className="space-y-1 pt-1">
        <div className="flex justify-between items-center text-[10px] sm:text-[11px]">
          <span className="text-slate-400 dark:text-zinc-500 font-medium truncate">Target Contribution</span>
          <span className="text-[#b45309] dark:text-amber-400 font-bold shrink-0">100% (High)</span>
        </div>
        <div className="w-full bg-[#f1f5f9] dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-[#f59e0b] h-full rounded-full transition-all duration-700"
            style={{ width: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}

function SalesPodiumSilver({
  person,
  totalList,
  money
}: {
  person: Person;
  totalList: Person[];
  money: (val: number) => string;
}) {
  const top1Revenue = totalList[0]?.revenue_collected || 0;
  const sharePercent =
    top1Revenue > 0
      ? Math.min(100, Math.round(((person.revenue_collected || 0) / top1Revenue) * 1000) / 10)
      : 0;

  const winRate = person.conversion_rate ?? calculateWinRate(person.leads_converted, person.leads_assigned);
  const initials = getInitials(person.name);

  return (
    <div className="relative bg-white dark:bg-[#141414] rounded-2xl lg:rounded-3xl p-3.5 sm:p-4 lg:p-5 flex flex-col justify-between border border-slate-200/90 dark:border-white/10 shadow-sm transition-all">
      <div>
        <div className="flex items-center justify-between gap-1.5 mb-2.5 sm:mb-3">
          <div className="inline-flex items-center gap-1 bg-[#f1f5f9] dark:bg-white/5 text-slate-700 dark:text-zinc-300 text-[10px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full whitespace-nowrap">
            <Shield className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-slate-500 shrink-0" />
            <span>#2 RUNNER-UP</span>
          </div>
          <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-[#eef2ff] text-[#4f46e5] dark:bg-indigo-950/50 dark:text-indigo-300 whitespace-nowrap">
            Silver Podium
          </span>
        </div>

        <div className="flex items-center space-x-2.5 sm:space-x-3 mb-2.5 sm:mb-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 lg:w-12 lg:h-12 rounded-xl sm:rounded-2xl bg-[#4338ca] text-white flex items-center justify-center font-bold text-sm sm:text-base shadow-xs shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">
              {person.name}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 font-medium mt-0.5 capitalize truncate">
              {person.role === "SalesManager" ? "Sales Manager" : person.role || "Sales Manager"}
            </p>
          </div>
        </div>

        <div className="my-2 sm:my-2.5">
          <div className="flex items-baseline justify-between gap-1.5 flex-wrap sm:flex-nowrap">
            <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight tabular-nums truncate">
              {money(person.revenue_collected || 0)}
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-[#eef2ff] text-[#4f46e5] dark:bg-indigo-950/50 dark:text-indigo-300 shrink-0 whitespace-nowrap">
              {sharePercent}% Share
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
            <div className="w-3 h-3 rounded-full border border-slate-400 flex items-center justify-center text-[8px] font-bold text-slate-500 shrink-0">
              $
            </div>
            <span className="truncate">Total Revenue collected</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 sm:gap-1.5 lg:gap-2 my-2 sm:my-2.5">
          <div className="bg-[#f8fafc] dark:bg-white/5 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center border border-slate-100 dark:border-white/5">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-tight block truncate">
              ASSIGNED
            </span>
            <span className="text-xs sm:text-sm lg:text-base font-extrabold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
              {person.leads_assigned || 0}
            </span>
          </div>
          <div className="bg-[#f8fafc] dark:bg-white/5 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center border border-slate-100 dark:border-white/5">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-tight block truncate">
              ENROLLED
            </span>
            <span className="text-xs sm:text-sm lg:text-base font-extrabold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
              {person.leads_converted || 0}
            </span>
          </div>
          <div className="bg-[#ecfdf5] dark:bg-emerald-950/40 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center border border-emerald-100 dark:border-emerald-800/30">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold text-[#059669] dark:text-emerald-400 tracking-tight block truncate">
              WIN RATE
            </span>
            <span className="text-xs sm:text-sm lg:text-base font-extrabold text-[#059669] dark:text-emerald-400 mt-0.5 block tabular-nums">
              {winRate}%
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1 pt-1">
        <div className="flex justify-between items-center text-[10px] sm:text-[11px]">
          <span className="text-slate-400 dark:text-zinc-500 font-medium truncate">Target Contribution</span>
          <span className="text-[#4f46e5] dark:text-indigo-400 font-bold shrink-0">{sharePercent}%</span>
        </div>
        <div className="w-full bg-[#f1f5f9] dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-[#4f46e5] h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.max(4, sharePercent)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function SalesPodiumBronze({
  person,
  totalList,
  money
}: {
  person: Person;
  totalList: Person[];
  money: (val: number) => string;
}) {
  const top1Revenue = totalList[0]?.revenue_collected || 0;
  const sharePercent =
    top1Revenue > 0
      ? Math.min(100, Math.round(((person.revenue_collected || 0) / top1Revenue) * 1000) / 10)
      : 0;

  const winRate = person.conversion_rate ?? calculateWinRate(person.leads_converted, person.leads_assigned);
  const initials = getInitials(person.name);

  return (
    <div className="relative bg-white dark:bg-[#141414] rounded-2xl lg:rounded-3xl p-3.5 sm:p-4 lg:p-5 flex flex-col justify-between border border-slate-200/90 dark:border-white/10 shadow-sm transition-all">
      <div>
        <div className="flex items-center justify-between gap-1.5 mb-2.5 sm:mb-3">
          <div className="inline-flex items-center gap-1 bg-[#fff7ed] dark:bg-orange-950/40 text-[#c2410c] dark:text-orange-300 text-[10px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full whitespace-nowrap">
            <FileText className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-[#c2410c] shrink-0" />
            <span>#3 PODIUM</span>
          </div>
          <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-[#fff7ed] text-[#c2410c] dark:bg-orange-950/40 dark:text-orange-300 whitespace-nowrap">
            Bronze Tier
          </span>
        </div>

        <div className="flex items-center space-x-2.5 sm:space-x-3 mb-2.5 sm:mb-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 lg:w-12 lg:h-12 rounded-xl sm:rounded-2xl bg-[#9a3412] text-white flex items-center justify-center font-bold text-sm sm:text-base shadow-xs shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">
              {person.name}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 font-medium mt-0.5 capitalize truncate">
              {person.role === "SalesManager" ? "Sales Manager" : person.role || "Sales Manager"}
            </p>
          </div>
        </div>

        <div className="my-2 sm:my-2.5">
          <div className="flex items-baseline justify-between gap-1.5 flex-wrap sm:flex-nowrap">
            <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight tabular-nums truncate">
              {money(person.revenue_collected || 0)}
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-[#f1f5f9] text-slate-600 dark:bg-white/10 dark:text-zinc-300 shrink-0 whitespace-nowrap">
              {(person.revenue_collected || 0) > 0 ? `${sharePercent}% Share` : "In Pipeline"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
            <div className="w-3 h-3 rounded-full border border-slate-400 flex items-center justify-center text-[8px] font-bold text-slate-500 shrink-0">
              $
            </div>
            <span className="truncate">Total Revenue collected</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 sm:gap-1.5 lg:gap-2 my-2 sm:my-2.5">
          <div className="bg-[#f8fafc] dark:bg-white/5 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center border border-slate-100 dark:border-white/5">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-tight block truncate">
              ASSIGNED
            </span>
            <span className="text-xs sm:text-sm lg:text-base font-extrabold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
              {person.leads_assigned || 0}
            </span>
          </div>
          <div className="bg-[#f8fafc] dark:bg-white/5 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center border border-slate-100 dark:border-white/5">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-tight block truncate">
              ENROLLED
            </span>
            <span className="text-xs sm:text-sm lg:text-base font-extrabold text-slate-500 dark:text-zinc-400 mt-0.5 block tabular-nums">
              {person.leads_converted || 0}
            </span>
          </div>
          <div className="bg-[#f8fafc] dark:bg-white/5 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center border border-slate-100 dark:border-white/5">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-tight block truncate">
              WIN RATE
            </span>
            <span className="text-xs sm:text-sm lg:text-base font-extrabold text-slate-400 dark:text-zinc-500 mt-0.5 block tabular-nums">
              {winRate}%
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1 pt-1">
        <div className="flex justify-between items-center text-[10px] sm:text-[11px]">
          <span className="text-slate-400 dark:text-zinc-500 font-medium truncate">Target Contribution</span>
          <span className="text-slate-400 dark:text-zinc-500 font-bold shrink-0">{sharePercent}%</span>
        </div>
        <div className="w-full bg-[#f1f5f9] dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-slate-300 dark:bg-zinc-700 h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.max(0, sharePercent)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   SALES TABLE ROW (EXACT MATCH TO STITCH SCREENSHOT)
========================================================================= */

function SalesTableRow({
  person,
  rank,
  money
}: {
  person: Person;
  rank: number;
  money: (val: number) => string;
}) {
  const winRate = person.conversion_rate ?? calculateWinRate(person.leads_converted, person.leads_assigned);
  const initials = getInitials(person.name);

  return (
    <article className="py-3 sm:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 transition-colors">
      {/* Left: Rank Pill, Avatar, Name & Role */}
      <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 sm:min-w-[220px] flex-1 sm:flex-initial">
        {/* Rank Pill */}
        <div
          className={cn(
            "w-8 h-6.5 sm:w-9 sm:h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0",
            rank === 1
              ? "bg-[#fef3c7] text-[#b45309] dark:bg-amber-950/50 dark:text-amber-300"
              : rank === 2
              ? "bg-[#eef2ff] text-[#4f46e5] dark:bg-indigo-950/50 dark:text-indigo-300"
              : rank === 3
              ? "bg-[#fff7ed] text-[#c2410c] dark:bg-orange-950/50 dark:text-orange-300"
              : "bg-[#f1f5f9] text-slate-500 dark:bg-white/5 dark:text-zinc-400"
          )}
        >
          #{rank}
        </div>

        {/* Circular Avatar */}
        <div
          className={cn(
            "w-9 h-9 sm:w-10 sm:h-10 rounded-full font-bold text-xs sm:text-sm flex items-center justify-center shrink-0 shadow-2xs",
            rank === 1
              ? "bg-[#f59e0b] text-white"
              : rank === 2
              ? "bg-[#0f172a] text-white dark:bg-indigo-900"
              : rank === 3
              ? "bg-[#e0e7ff] text-[#4338ca] dark:bg-zinc-800 dark:text-zinc-200"
              : "bg-[#f1f5f9] text-slate-600 dark:bg-white/10 dark:text-zinc-300"
          )}
        >
          {initials}
        </div>

        {/* Name with Leader pill and Role */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
              {person.name}
            </span>
            {rank === 1 && (
              <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold bg-[#fef3c7] text-[#b45309] dark:bg-amber-950/50 dark:text-amber-300 rounded-md shrink-0">
                Leader
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium capitalize mt-0.5 truncate">
            {person.role === "SalesManager" ? "Sales Manager" : person.role || "Sales Manager"}
          </p>
        </div>
      </div>

      {/* Right: Metrics Columns matching Stitch */}
      <div className="grid grid-cols-2 sm:grid-cols-4 items-center gap-3 sm:gap-6 lg:gap-8 flex-1 justify-end text-left sm:text-right">
        {/* REVENUE */}
        <div>
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500 block">
            REVENUE
          </span>
          <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tabular-nums block mt-0.5">
            {money(person.revenue_collected || 0)}
          </span>
        </div>

        {/* ASSIGNED */}
        <div>
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500 block">
            ASSIGNED
          </span>
          <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-zinc-300 tabular-nums block mt-0.5">
            {person.leads_assigned || 0} Leads
          </span>
        </div>

        {/* ENROLLED */}
        <div>
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500 block">
            ENROLLED
          </span>
          <span
            className={cn(
              "text-xs sm:text-sm font-bold tabular-nums block mt-0.5",
              (person.leads_converted || 0) > 0
                ? "text-[#4f46e5] dark:text-indigo-400"
                : "text-slate-400 dark:text-zinc-500"
            )}
          >
            {person.leads_converted || 0} Won
          </span>
        </div>

        {/* CONV. RATE with Progress Bar */}
        <div className="sm:min-w-[120px] lg:min-w-[140px]">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500">
              CONV. RATE
            </span>
            <span
              className={cn(
                "font-bold text-xs tabular-nums",
                winRate > 0
                  ? "text-[#059669] dark:text-emerald-400"
                  : "text-slate-400 dark:text-zinc-500"
              )}
            >
              {winRate}%
            </span>
          </div>
          <div className="w-full bg-[#f1f5f9] dark:bg-white/10 rounded-full h-1.5 sm:h-2 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                winRate > 0 ? "bg-[#059669] dark:bg-emerald-500" : "bg-transparent"
              )}
              style={{ width: `${Math.min(100, Math.max(0, winRate))}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

/* =========================================================================
   INSTRUCTOR PODIUM & TABLE ROWS
========================================================================= */

function InstructorPodiumCard({
  person,
  rank,
  totalList
}: {
  person: Person;
  rank: 1 | 2 | 3;
  totalList: Person[];
}) {
  const top1Rating = totalList[0]?.avg_rating || 5;
  const ratingPercent = Math.min(100, Math.round(((person.avg_rating || 0) / top1Rating) * 100));
  const initials = getInitials(person.name);

  return (
    <div
      className={cn(
        "relative rounded-2xl lg:rounded-3xl p-3.5 sm:p-4 lg:p-5 flex flex-col justify-between transition-all",
        rank === 1
          ? "bg-white dark:bg-[#141414] border-2 border-indigo-400 shadow-[0_0_24px_rgba(99,102,241,0.22)]"
          : "bg-white dark:bg-[#141414] border border-slate-200/90 dark:border-white/10 shadow-sm"
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-1.5 mb-2.5 sm:mb-3">
          <div
            className={cn(
              "inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full whitespace-nowrap",
              rank === 1
                ? "bg-indigo-600 text-white shadow-xs"
                : rank === 2
                ? "bg-[#f1f5f9] text-slate-700 dark:bg-white/5 dark:text-zinc-300"
                : "bg-[#fff7ed] text-[#c2410c] dark:bg-orange-950/40 dark:text-orange-300"
            )}
          >
            {rank === 1 ? "★ #1 INSTRUCTOR" : rank === 2 ? "🛡 #2 RUNNER-UP" : "📋 #3 PODIUM"}
          </div>
          <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 whitespace-nowrap">
            {rank === 1 ? "Lead Faculty" : rank === 2 ? "Senior Faculty" : "Associate Faculty"}
          </span>
        </div>

        <div className="flex items-center space-x-2.5 sm:space-x-3 mb-2.5 sm:mb-3">
          <div
            className={cn(
              "w-10 h-10 sm:w-11 sm:h-11 lg:w-12 lg:h-12 rounded-xl sm:rounded-2xl text-white flex items-center justify-center font-bold text-sm sm:text-base shadow-xs shrink-0",
              rank === 1 ? "bg-indigo-600" : rank === 2 ? "bg-slate-800" : "bg-[#9a3412]"
            )}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">
              {person.name}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 font-medium mt-0.5 capitalize truncate">
              {person.expertise || "Instructor"}
            </p>
          </div>
        </div>

        <div className="my-2 sm:my-2.5">
          <div className="flex items-baseline justify-between gap-1.5 flex-wrap sm:flex-nowrap">
            <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight tabular-nums truncate">
              {person.avg_rating ? `${person.avg_rating.toFixed(1)} ★` : "5.0 ★"}
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 shrink-0 whitespace-nowrap">
              {person.batches_completed || 0} Batches
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">Average Student Rating</p>
        </div>

        <div className="grid grid-cols-3 gap-1 sm:gap-1.5 lg:gap-2 my-2 sm:my-2.5">
          <div className="bg-[#f8fafc] dark:bg-white/5 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center border border-slate-100 dark:border-white/5">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-tight block truncate">STUDENTS</span>
            <span className="text-xs sm:text-sm lg:text-base font-extrabold text-slate-900 dark:text-white mt-0.5 block tabular-nums">{person.students || 0}</span>
          </div>
          <div className="bg-[#f8fafc] dark:bg-white/5 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center border border-slate-100 dark:border-white/5">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-tight block truncate">BATCHES</span>
            <span className="text-xs sm:text-sm lg:text-base font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5 block tabular-nums">{person.batches_completed || 0}</span>
          </div>
          <div className="bg-[#ecfdf5] dark:bg-emerald-950/40 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center border border-emerald-100 dark:border-emerald-800/30">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold text-[#059669] dark:text-emerald-400 tracking-tight block truncate">RATING</span>
            <span className="text-xs sm:text-sm lg:text-base font-extrabold text-[#059669] dark:text-emerald-400 mt-0.5 block tabular-nums">
              {person.avg_rating ? person.avg_rating.toFixed(1) : "5.0"}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1 pt-1">
        <div className="flex justify-between items-center text-[10px] sm:text-[11px]">
          <span className="text-slate-400 dark:text-zinc-500 font-medium truncate">Overall Quality Score</span>
          <span className="text-indigo-600 dark:text-indigo-400 font-bold shrink-0">{ratingPercent}%</span>
        </div>
        <div className="w-full bg-[#f1f5f9] dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-indigo-600 h-full rounded-full transition-all duration-700"
            style={{ width: `${ratingPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function InstructorTableRow({
  person,
  rank
}: {
  person: Person;
  rank: number;
}) {
  const initials = getInitials(person.name);

  return (
    <article className="py-3 sm:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 transition-colors">
      <div className="flex items-center space-x-2.5 sm:space-x-3.5 min-w-0 sm:min-w-[220px] flex-1 sm:flex-initial">
        <div
          className={cn(
            "w-9 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0",
            rank === 1
              ? "bg-[#eef2ff] text-[#4f46e5]"
              : rank === 2
              ? "bg-[#f1f5f9] text-slate-600"
              : rank === 3
              ? "bg-[#fff7ed] text-[#c2410c]"
              : "bg-[#f1f5f9] text-slate-500"
          )}
        >
          #{rank}
        </div>

        <div className="w-10 h-10 rounded-full font-bold text-sm flex items-center justify-center shrink-0 bg-indigo-600 text-white">
          {initials}
        </div>

        <div className="min-w-0">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
              {person.name}
            </span>
            {rank === 1 && (
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-100 text-indigo-700 rounded-md">
                Top Rated
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-medium capitalize mt-0.5">
            {person.expertise || "Instructor"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 items-center gap-6 sm:gap-8 flex-1 justify-end text-left sm:text-right">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">RATING</span>
          <span className="text-base font-extrabold text-indigo-600 tabular-nums block mt-0.5">
            {person.avg_rating ? `${person.avg_rating.toFixed(1)} / 5` : "5.0 / 5"}
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">BATCHES</span>
          <span className="text-sm font-semibold text-slate-700 dark:text-zinc-300 tabular-nums block mt-0.5">
            {person.batches_completed || 0} Done
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">STUDENTS</span>
          <span className="text-sm font-bold text-emerald-600 tabular-nums block mt-0.5">
            {person.students || 0} Active
          </span>
        </div>

        <div className="sm:min-w-[110px] flex items-center justify-end">
          {person.id && (
            <Link
              href={`/instructors/${person.id}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition"
            >
              <span>Profile</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
