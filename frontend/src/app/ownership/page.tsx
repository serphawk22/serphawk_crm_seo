"use client";
import LocalizedText from "@/components/LocalizedText";

import { useEffect, useState, useCallback } from "react";
import { Users, UserCheck, ArrowRightLeft, Shield, RefreshCw, Search, CheckCircle2, AlertCircle, TrendingUp, IndianRupee, Briefcase } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Currency = "INR" | "USD";
const EXCHANGE = 83.5;

function fmt(amount: number, currency: Currency) {
  if (currency === "INR") return "\u20B9" + Math.round(amount).toLocaleString("en-IN");
  return "$" + Math.round(amount / EXCHANGE).toLocaleString("en-US");
}

export default function OwnershipPage() {
  const { role, loading: roleLoading } = useRole();
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState<Currency>("INR");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!roleLoading && role !== "Admin" && role !== "SuperAdmin" && role !== "SalesManager") {
      router.replace("/");
    }
  }, [role, roleLoading, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(API_BASE_URL + "/ownership/report", {
        headers: token ? { Authorization: "Bearer " + token } : {},
      });
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const owners = data?.owners ?? [];
  const recentTransfers = data?.recent_transfers ?? [];

  const filteredOwners = owners.filter((o: any) =>
    !search || o.name?.toLowerCase().includes(search.toLowerCase()) || o.role?.toLowerCase().includes(search.toLowerCase())
  );

  const totalWonRevenue = filteredOwners.reduce((s: number, o: any) => s + (o.won_revenue || 0), 0);
  const totalLeads = filteredOwners.reduce((s: number, o: any) => s + (o.current_leads || 0), 0);
  const totalClients = filteredOwners.reduce((s: number, o: any) => s + (o.current_clients || 0), 0);

  if (roleLoading) return null;
  if (role !== "Admin" && role !== "SuperAdmin" && role !== "SalesManager") return null;

  return (
    <div className="space-y-4">
      {/* Compact Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none">
                Ownership & Reassignment
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                {owners.length} reps
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Current account owners, historical transitions & workload balance
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Currency toggle */}
          <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 p-0.5">
            {(["INR", "USD"] as Currency[]).map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className={cn("flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition-all",
                  currency === c ? "bg-white dark:bg-white/10 text-indigo-600 dark:text-indigo-300 shadow-xs" : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white")}>
                {c === "INR" ? "₹ INR" : "$ USD"}
              </button>
            ))}
          </div>

          <button onClick={load} disabled={loading}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300 transition-colors">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-indigo-500")} />
          </button>
        </div>
      </div>

      {/* 4-KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Active Reps</p>
            <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight mt-0.5">{filteredOwners.length}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Users className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Current Leads</p>
            <p className="text-base sm:text-lg font-bold text-cyan-600 dark:text-cyan-400 leading-tight mt-0.5">{totalLeads}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <Briefcase className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Current Clients</p>
            <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5">{totalClients}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <UserCheck className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Won Revenue</p>
            <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5 font-mono">{fmt(totalWonRevenue, currency)}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-2 bg-white dark:bg-[#111111]/90 p-2 sm:px-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter by rep name or role..."
          className="w-full bg-transparent text-xs text-slate-800 dark:text-zinc-200 outline-none placeholder:text-slate-400"
        />
      </div>

      {/* Current Owner Workload Table */}
      <div className="bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-white">Sales Team Workload & History</h2>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
            {filteredOwners.length} members
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 border-b border-slate-200/80 dark:border-white/10">
              <tr>
                <th className="px-4 py-2.5">Rep Name</th>
                <th className="px-4 py-2.5"><LocalizedText text={"Role"} /></th>
                <th className="px-4 py-2.5">Current Leads</th>
                <th className="px-4 py-2.5">Current Clients</th>
                <th className="px-4 py-2.5">Lifetime Leads</th>
                <th className="px-4 py-2.5">Lifetime Clients</th>
                <th className="px-4 py-2.5">Transferred In</th>
                <th className="px-4 py-2.5">Transferred Out</th>
                <th className="px-4 py-2.5">Won Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredOwners.length ? filteredOwners.map((o: any) => (
                <tr key={o.user_id} className="hover:bg-slate-50/60 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-slate-900 dark:text-white">{o.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-zinc-300">
                      {o.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-bold text-cyan-600 dark:text-cyan-400">{o.current_leads}</td>
                  <td className="px-4 py-2.5 font-bold text-emerald-600 dark:text-emerald-400">{o.current_clients}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-zinc-400">{o.historical_leads}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-zinc-400">{o.historical_clients}</td>
                  <td className="px-4 py-2.5 text-indigo-600 dark:text-indigo-400 font-semibold">+{o.transferred_in}</td>
                  <td className="px-4 py-2.5 text-rose-600 dark:text-rose-400 font-semibold">−{o.transferred_out}</td>
                  <td className="px-4 py-2.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(o.won_revenue ?? 0, currency)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-xs text-slate-400 dark:text-zinc-500">
                    {loading ? "Loading team owners…" : "No team members found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Transfer Audit Log */}
      <div className="bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-amber-500" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-white">Recent Ownership Reassignments</h2>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
            {recentTransfers.length} events
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 border-b border-slate-200/80 dark:border-white/10">
              <tr>
                <th className="px-4 py-2.5">Entity</th>
                <th className="px-4 py-2.5">From Rep</th>
                <th className="px-4 py-2.5">To Rep</th>
                <th className="px-4 py-2.5">Reason</th>
                <th className="px-4 py-2.5">Reassigned By</th>
                <th className="px-4 py-2.5"><LocalizedText text={"Date"} /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {recentTransfers.length ? recentTransfers.map((t: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-slate-900 dark:text-white">
                    <span className="capitalize">{t.entity_type}</span> #{t.entity_id}
                  </td>
                  <td className="px-4 py-2.5 text-rose-600 dark:text-rose-400">{t.from_user || "Unassigned"}</td>
                  <td className="px-4 py-2.5 text-emerald-600 dark:text-emerald-400 font-semibold">{t.to_user || "Unassigned"}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-zinc-400 italic">{t.reason || "No reason given"}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-zinc-300">{t.changed_by || "System"}</td>
                  <td className="px-4 py-2.5 text-slate-400 dark:text-zinc-500">{(t.changed_at ?? "").slice(0, 16).replace("T", " ")}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-xs text-slate-400 dark:text-zinc-500">
                    No reassignments recorded yet.
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
