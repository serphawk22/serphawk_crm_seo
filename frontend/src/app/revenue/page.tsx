"use client";
import LocalizedText from "@/components/LocalizedText";

import { useEffect, useState } from "react";
import { 
  TrendingUp, TrendingDown, IndianRupee, RefreshCw, BarChart2, 
  Users, Target, Award, Calendar, Layers, CheckCircle2, DollarSign,
  PieChart, Briefcase, Wallet
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Currency = "INR" | "USD";
const EXCHANGE = 83.5; // 1 USD ≈ 83.5 INR

function fmt(amount: number, currency: Currency) {
  if (currency === "INR") {
    return "₹" + Math.round(amount).toLocaleString("en-IN");
  }
  const usd = amount / EXCHANGE;
  return "$" + Math.round(usd).toLocaleString("en-US");
}

export default function RevenueDashboard() {
  const { role, loading: roleLoading } = useRole();
  const router = useRouter();

  const [currency, setCurrency] = useState<Currency>("INR");
  const [monthsCount, setMonthsCount] = useState<number>(12);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [costsData, setCostsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!roleLoading && role !== "Admin" && role !== "SuperAdmin") {
      router.replace("/");
    }
  }, [role, roleLoading, router]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const h: any = token ? { Authorization: "Bearer " + token } : {};
      const [sumRes, costsRes] = await Promise.all([
        fetch(API_BASE_URL + "/revenue/summary?months=" + monthsCount, { headers: h }),
        fetch(API_BASE_URL + "/business-costs", { headers: h }),
      ]);
      if (sumRes.ok) setSummaryData(await sumRes.json());
      if (costsRes.ok) setCostsData(await costsRes.json());
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [monthsCount]);

  const totals = summaryData?.totals || {};
  const wonRevenue = totals.won_revenue ?? 0;
  const totalCosts = totals.costs ?? (costsData.reduce((s: number, c: any) => s + (c.amount || 0), 0));
  const netProfit = totals.net_profit ?? (wonRevenue - totalCosts);
  const marginPct = totals.margin_pct ?? (wonRevenue > 0 ? ((netProfit / wonRevenue) * 100).toFixed(1) : "0.0");

  if (roleLoading) return null;
  if (role !== "Admin" && role !== "SuperAdmin") return null;

  return (
    <div className="space-y-4">
      
      {/* Compact Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none">
                Revenue & Profitability
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {totals.won_deals ?? 0} closed deals
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Financial performance, closed revenue, operating expenses & margin analysis
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Currency Toggle */}
          <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 p-0.5">
            {(["INR", "USD"] as Currency[]).map(c => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition-all",
                  currency === c ? "bg-white dark:bg-white/10 text-indigo-600 dark:text-indigo-300 shadow-xs" : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                {c === "INR" ? "₹ INR" : "$ USD"}
              </button>
            ))}
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-zinc-300">
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
            <select
              value={monthsCount}
              onChange={e => setMonthsCount(Number(e.target.value))}
              className="bg-transparent text-slate-800 dark:text-zinc-200 outline-none cursor-pointer font-semibold text-xs"
            >
              <option value={3} className="dark:bg-zinc-900">3 Months</option>
              <option value={6} className="dark:bg-zinc-900">6 Months</option>
              <option value={12} className="dark:bg-zinc-900">12 Months</option>
              <option value={24} className="dark:bg-zinc-900">24 Months</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchAll}
            disabled={loading}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-indigo-500")} />
          </button>
        </div>
      </div>

      {/* Primary 4-KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Won Revenue</p>
            <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight mt-0.5 font-mono">{fmt(wonRevenue, currency)}</p>
            <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">{totals.won_deals ?? 0} won deals</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Operating Costs</p>
            <p className="text-base sm:text-lg font-bold text-rose-600 dark:text-rose-400 leading-tight mt-0.5 font-mono">{fmt(totalCosts, currency)}</p>
            <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">Expenses & salaries</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <BarChart2 className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Net Profit</p>
            <p className={cn("text-base sm:text-lg font-bold leading-tight mt-0.5 font-mono", netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
              {fmt(netProfit, currency)}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">{netProfit >= 0 ? "Profitable" : "Deficit"}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            {netProfit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Profit Margin</p>
            <p className="text-base sm:text-lg font-bold text-violet-600 dark:text-violet-400 leading-tight mt-0.5">{marginPct}%</p>
            <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">Net efficiency</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
            <Target className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Secondary Operational Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Invoiced Paid</span>
            <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight mt-0.5 font-mono">{fmt(totals.invoiced_paid ?? 0, currency)}</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-cyan-500 shrink-0" />
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Open Pipeline</span>
            <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight mt-0.5 font-mono">{fmt(totals.open_pipeline ?? 0, currency)}</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Avg Deal Size</span>
            <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight mt-0.5 font-mono">{fmt(totals.avg_deal_size ?? 0, currency)}</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider"><LocalizedText text={"Win Rate"} /></span>
            <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight mt-0.5">{totals.win_rate != null ? `${totals.win_rate}%` : "—"}</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        </div>
      </div>

      {/* Monthly Financial Breakdown Table */}
      <div className="bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-white">Monthly Financial Breakdown</h2>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
            {summaryData?.months?.length || 0} Months Tracked
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 border-b border-slate-200/80 dark:border-white/10">
              <tr>
                <th className="px-4 py-2.5">Month</th>
                <th className="px-4 py-2.5">Won Revenue</th>
                <th className="px-4 py-2.5">Invoiced Paid</th>
                <th className="px-4 py-2.5">Total Costs</th>
                <th className="px-4 py-2.5">Salaries</th>
                <th className="px-4 py-2.5">Net Profit</th>
                <th className="px-4 py-2.5 text-center">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {(summaryData?.months ?? []).map((m: any, idx: number) => {
                const isProfitable = (m.net_profit ?? 0) >= 0;
                const hasActivity = (m.won_revenue || 0) > 0 || (m.costs || 0) > 0;
                return (
                  <tr key={idx} className={cn("hover:bg-slate-50/60 dark:hover:bg-white/5 transition-colors", hasActivity && "font-medium")}>
                    <td className="px-4 py-2.5 font-mono text-slate-800 dark:text-zinc-200 font-bold">
                      {m.month}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {fmt(m.won_revenue ?? 0, currency)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-cyan-600 dark:text-cyan-400">
                      {fmt(m.invoiced_paid ?? 0, currency)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-rose-600 dark:text-rose-400">
                      {fmt(m.costs ?? 0, currency)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-amber-600 dark:text-amber-400">
                      {fmt(m.salary_costs ?? 0, currency)}
                    </td>
                    <td className="px-4 py-2.5 font-mono">
                      <span className={cn(
                        "px-2 py-0.5 rounded-md text-[11px] font-bold",
                        isProfitable 
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20"
                          : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 border border-rose-200 dark:border-rose-500/20"
                      )}>
                        {fmt(m.net_profit ?? 0, currency)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-bold text-slate-700 dark:text-zinc-300">
                      {m.margin_pct != null ? `${m.margin_pct}%` : "—"}
                    </td>
                  </tr>
                );
              })}
              {(!summaryData?.months || summaryData.months.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-xs text-slate-400 dark:text-zinc-500">
                    No monthly revenue data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2-Column Split: Sales Revenue by Rep & Costs by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Sales by Rep */}
        <div className="bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">Sales Revenue by Rep</h3>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
              {summaryData?.by_salesperson?.length || 0} reps
            </span>
          </div>
          <div className="p-2 flex-1">
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {(summaryData?.by_salesperson ?? []).map((s: any, idx: number) => (
                <div key={idx} className="py-2 px-2.5 flex items-center justify-between hover:bg-slate-50/60 dark:hover:bg-white/5 rounded-lg transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-200 dark:border-indigo-500/20">
                      {s.salesperson?.charAt(0) || "S"}
                    </div>
                    <div>
                      <p className="font-bold text-xs text-slate-900 dark:text-white">{s.salesperson}</p>
                      <p className="text-[10px] text-slate-400">{s.won_deals ?? 0} deals won</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                      {fmt(s.won_revenue ?? 0, currency)}
                    </p>
                  </div>
                </div>
              ))}
              {(!summaryData?.by_salesperson || summaryData.by_salesperson.length === 0) && (
                <div className="py-8 text-center text-xs text-slate-400">
                  No sales recorded for this period.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Costs by Category */}
        <div className="bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">Costs by Category</h3>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
              {summaryData?.cost_by_category?.length || 0} categories
            </span>
          </div>
          <div className="p-2 flex-1">
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {(summaryData?.cost_by_category ?? []).map((c: any, idx: number) => (
                <div key={idx} className="py-2 px-2.5 flex items-center justify-between hover:bg-slate-50/60 dark:hover:bg-white/5 rounded-lg transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-xs border border-rose-200 dark:border-rose-500/20">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <p className="font-bold text-xs text-slate-900 dark:text-white">{c.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-xs text-rose-600 dark:text-rose-400">
                      {fmt(c.amount ?? 0, currency)}
                    </p>
                  </div>
                </div>
              ))}
              {(!summaryData?.cost_by_category || summaryData.cost_by_category.length === 0) && (
                <div className="py-8 text-center text-xs text-slate-400">
                  No categorized expenses recorded.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top Won Deals */}
      <div className="bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">Top Closed Won Deals</h3>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
            {summaryData?.top_deals?.length || 0} deals
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 border-b border-slate-200/80 dark:border-white/10">
              <tr>
                <th className="px-4 py-2.5"><LocalizedText text={"Deal Title"} /></th>
                <th className="px-4 py-2.5"><LocalizedText text={"Client"} /></th>
                <th className="px-4 py-2.5">Sales Representative</th>
                <th className="px-4 py-2.5">Won Date</th>
                <th className="px-4 py-2.5 text-right"><LocalizedText text={"Deal Value"} /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {(summaryData?.top_deals ?? []).map((d: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-slate-900 dark:text-white">
                    {d.title}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-zinc-300">
                    {d.client_name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-zinc-400 text-xs">
                    {d.salesperson ?? "Unassigned"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs font-mono">
                    {(d.won_at ?? "").slice(0, 10) || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {fmt(d.amount ?? 0, currency)}
                  </td>
                </tr>
              ))}
              {(!summaryData?.top_deals || summaryData.top_deals.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                    No closed won deals recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
