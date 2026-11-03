"use client";
import LocalizedText from "@/components/LocalizedText";

import { useState, useEffect } from "react";
import { Ticket, DollarSign, Trophy, Award, TrendingUp, Users, Phone, Calendar, Target, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/config";
import { useTenantConfig } from "@/context/TenantConfigContext";
import InstitutePeople from "@/components/InstitutePeople";

interface LeaderboardEntry {
  user_id: number;
  name: string;
  role: string;
  deals_closed: number;
  revenue_closed: number;
  meetings_booked: number;
  calls_made: number;
  leads_managed?: number;
  clients_managed?: number;
  tickets_assigned?: number;
  tickets_in_production?: number;
  tickets_completed?: number;
}

function RankingHighlights({ top3, tickets = false }: { top3: LeaderboardEntry[]; tickets?: boolean }) {
  const { settings } = useTenantConfig();
  const money = (value: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: settings.default_currency || "USD",
      maximumFractionDigits: 0
    }).format(value || 0);

  const rankColors = [
    { badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-700/50", border: "border-amber-200/90 dark:border-amber-500/20" },
    { badge: "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border-slate-300 dark:border-zinc-700", border: "border-slate-200/90 dark:border-white/10" },
    { badge: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 border-orange-300 dark:border-orange-700/50", border: "border-orange-200/90 dark:border-orange-500/20" }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      {top3.map((entry, index) => {
        const style = rankColors[index] || rankColors[1];
        return (
          <article
            key={entry.user_id}
            className={cn(
              "rounded-xl border p-3 bg-white dark:bg-[#111111]/90 shadow-xs flex items-center justify-between",
              style.border
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold border", style.badge)}>
                {index === 0 ? <Trophy className="w-4 h-4 text-amber-600 dark:text-amber-400" /> : `#${index + 1}`}
              </span>
              <div className="min-w-0">
                <p className="font-bold text-xs text-slate-900 dark:text-white truncate">{entry.name}</p>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 capitalize">{entry.role || "Sales Rep"}</p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums">
                {tickets ? entry.tickets_assigned || 0 : money(entry.revenue_closed)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                {tickets ? "Tickets" : "Revenue"}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function LeaderboardPage() {
  const { loaded, isOn } = useTenantConfig();
  if (!loaded) return <p role="status" className="p-6 text-xs text-slate-500">Loading leaderboard configuration…</p>;
  return isOn('institute') ? <InstitutePeople leaderboard /> : <StandardLeaderboardPage />;
}

function StandardLeaderboardPage() {
  const { settings } = useTenantConfig();
  const money = (value: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: settings.default_currency || "USD",
      maximumFractionDigits: 0
    }).format(value || 0);

  const [salesLeaderboard, setSalesLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [ticketsLeaderboard, setTicketsLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"sales" | "tickets">("sales");
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const [salesResponse, ticketsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/leaderboard?kind=sales`),
          fetch(`${API_BASE_URL}/leaderboard?kind=tickets`),
        ]);
        if (!salesResponse.ok || !ticketsResponse.ok) setLoadError(true);
        if (salesResponse.ok) setSalesLeaderboard(await salesResponse.json());
        if (ticketsResponse.ok) setTicketsLeaderboard(await ticketsResponse.json());
      } catch (error) {
        setLoadError(true);
        console.error("Failed to fetch leaderboard", error);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  const salesBoard = [...salesLeaderboard].sort(
    (a, b) => (b.revenue_closed || 0) - (a.revenue_closed || 0) || (b.deals_closed || 0) - (a.deals_closed || 0) || a.name.localeCompare(b.name)
  );
  const salesTop3 = salesBoard.slice(0, 3);
  const ticketsBoard = [...ticketsLeaderboard].sort(
    (a, b) => (b.tickets_assigned ?? 0) - (a.tickets_assigned ?? 0) || (b.tickets_in_production ?? 0) - (a.tickets_in_production ?? 0) || a.name.localeCompare(b.name)
  );
  const ticketsTop3 = ticketsBoard.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Compact Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none">Team Leaderboard</h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <LocalizedText text={"Rankings"} /> </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Sales revenue outcomes and ticket delivery performance
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-lg border border-slate-200/80 dark:border-white/10">
          <button
            onClick={() => setActiveTab("sales")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition",
              activeTab === "sales"
                ? "bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white shadow-xs"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white"
            )}
          >
            <DollarSign className="w-3.5 h-3.5 text-amber-500" />
            <span>Sales ({salesBoard.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("tickets")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition",
              activeTab === "tickets"
                ? "bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-white shadow-xs"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white"
            )}
          >
            <Ticket className="w-3.5 h-3.5 text-cyan-500" />
            <span>Tickets ({ticketsBoard.length})</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Some rankings could not be loaded. Refresh the page to try again.
        </div>
      )}

      {/* SALES VIEW */}
      {activeTab === "sales" && (
        <div className="space-y-3">
          {salesTop3.length > 0 && <RankingHighlights top3={salesTop3} />}

          {/* Desktop Column Header */}
          <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
            <div className="col-span-1"><LocalizedText text={"Rank"} /></div>
            <div className="col-span-4"><LocalizedText text={"Salesperson"} /></div>
            <div className="col-span-2 text-right"><LocalizedText text={"Revenue Closed"} /></div>
            <div className="col-span-1 text-center"><LocalizedText text={"Deals"} /></div>
            <div className="col-span-1 text-center"><LocalizedText text={"Meetings"} /></div>
            <div className="col-span-1 text-center"><LocalizedText text={"Calls"} /></div>
            <div className="col-span-1 text-center"><LocalizedText text={"Leads"} /></div>
            <div className="col-span-1 text-center"><LocalizedText text={"Clients"} /></div>
          </div>

          {salesBoard.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10">
              <DollarSign className="w-8 h-8 mx-auto mb-2 text-slate-400 dark:text-zinc-600" />
              <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">No sales activity to show yet</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {salesBoard.map((entry, index) => (
                <div
                  key={entry.user_id}
                  className="group relative flex flex-col lg:grid lg:grid-cols-12 gap-2 lg:gap-3 items-start lg:items-center p-2.5 sm:px-4 sm:py-2 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 hover:border-amber-500/60 dark:hover:border-amber-500/50 hover:shadow-xs transition-all duration-150"
                >
                  {/* Rank */}
                  <div className="col-span-1 flex items-center">
                    <span
                      className={cn(
                        "w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs border",
                        index === 0
                          ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700/50"
                          : index === 1
                          ? "bg-slate-100 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                          : index === 2
                          ? "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-700/50"
                          : "bg-slate-50 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-zinc-400 dark:border-white/10"
                      )}
                    >
                      {index + 1}
                    </span>
                  </div>

                  {/* Salesperson */}
                  <div className="col-span-4 flex items-center gap-2.5 min-w-0 w-full">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center font-bold text-xs shrink-0">
                      {entry.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs text-slate-900 dark:text-white truncate">{entry.name}</p>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 capitalize">{entry.role || "Sales Rep"}</p>
                    </div>
                  </div>

                  {/* Revenue */}
                  <div className="col-span-2 text-left lg:text-right w-full">
                    <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {money(entry.revenue_closed)}
                    </span>
                  </div>

                  {/* Deals Won */}
                  <div className="col-span-1 text-left lg:text-center w-full">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 tabular-nums">
                      {entry.deals_closed}
                    </span>
                  </div>

                  {/* Meetings */}
                  <div className="col-span-1 text-left lg:text-center text-xs text-slate-700 dark:text-zinc-300 tabular-nums">
                    {entry.meetings_booked}
                  </div>

                  {/* Calls */}
                  <div className="col-span-1 text-left lg:text-center text-xs text-slate-700 dark:text-zinc-300 tabular-nums">
                    {entry.calls_made}
                  </div>

                  {/* Leads */}
                  <div className="col-span-1 text-left lg:text-center text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                    {entry.leads_managed || 0}
                  </div>

                  {/* Clients */}
                  <div className="col-span-1 text-left lg:text-center text-xs font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {entry.clients_managed || 0}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TICKETS VIEW */}
      {activeTab === "tickets" && (
        <div className="space-y-3">
          {ticketsTop3.length > 0 && ticketsTop3.some(e => (e.tickets_assigned ?? 0) > 0) && (
            <RankingHighlights top3={ticketsTop3} tickets />
          )}

          {/* Desktop Column Header */}
          <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
            <div className="col-span-1"><LocalizedText text={"Rank"} /></div>
            <div className="col-span-5"><LocalizedText text={"Employee"} /></div>
            <div className="col-span-2 text-center">Tickets Assigned</div>
            <div className="col-span-2 text-center">In Production</div>
            <div className="col-span-2 text-center"><LocalizedText text={"Completed"} /></div>
          </div>

          {ticketsBoard.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10">
              <Ticket className="w-8 h-8 mx-auto mb-2 text-slate-400 dark:text-zinc-600" />
              <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">No ticket activity to show yet</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {ticketsBoard.map((entry, index) => (
                <div
                  key={entry.user_id}
                  className="group relative flex flex-col lg:grid lg:grid-cols-12 gap-2 lg:gap-3 items-start lg:items-center p-2.5 sm:px-4 sm:py-2 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 hover:border-cyan-500/60 dark:hover:border-cyan-500/50 hover:shadow-xs transition-all duration-150"
                >
                  {/* Rank */}
                  <div className="col-span-1 flex items-center">
                    <span
                      className={cn(
                        "w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs border",
                        index === 0
                          ? "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-700/50"
                          : index === 1
                          ? "bg-slate-100 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                          : index === 2
                          ? "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700/50"
                          : "bg-slate-50 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-zinc-400 dark:border-white/10"
                      )}
                    >
                      {index + 1}
                    </span>
                  </div>

                  {/* Employee */}
                  <div className="col-span-5 flex items-center gap-2.5 min-w-0 w-full">
                    <div className="w-7 h-7 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 flex items-center justify-center font-bold text-xs shrink-0">
                      {entry.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs text-slate-900 dark:text-white truncate">{entry.name}</p>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 capitalize">{entry.role || "Team Member"}</p>
                    </div>
                  </div>

                  {/* Tickets Assigned */}
                  <div className="col-span-2 text-left lg:text-center w-full">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 tabular-nums">
                      {entry.tickets_assigned || 0}
                    </span>
                  </div>

                  {/* In Production */}
                  <div className="col-span-2 text-left lg:text-center w-full">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 tabular-nums">
                      {entry.tickets_in_production || 0}
                    </span>
                  </div>

                  {/* Completed */}
                  <div className="col-span-2 text-left lg:text-center w-full">
                    <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400 tabular-nums">
                      {entry.tickets_completed || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
