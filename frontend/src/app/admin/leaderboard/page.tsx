"use client";

import { useState, useEffect } from "react";
import { Trophy, Star, Users, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/config";

interface LeaderboardEntry {
  user_id: number;
  name: string;
  role: string;
  deals_closed: number;
  revenue_closed: number;
  meetings_booked: number;
  calls_made: number;
  leads_managed: number;
  clients_managed: number;
  prod_tickets: number;
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"sales" | "employee">("sales");

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/leaderboard?filter_type=${filterType}`);
        if (response.ok) {
          const data = await response.json();
          setLeaderboard(data);
        }
      } catch (error) {
        console.error("Failed to fetch leaderboard", error);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, [filterType]);

  // Get Top 3 for Podium
  const top3 = leaderboard.slice(0, 3);
  const remaining = leaderboard.slice(3);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 min-h-[calc(100vh-64px)]">
      
      {/* Header and Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-3">
            <Trophy className="w-8 h-8 text-indigo-600" />
            {filterType === "sales" ? "Sales Leaderboard" : "Employee Leaderboard"}
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 mt-2 text-lg">
            {filterType === "sales" ? "Ranked by total clients and leads managed." : "Ranked by tickets in production."}
          </p>
        </div>
        <div className="flex bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl">
          <button
            onClick={() => setFilterType("sales")}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2",
              filterType === "sales" 
                ? "bg-white dark:bg-zinc-700 text-indigo-600 shadow-sm" 
                : "text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
          >
            <Briefcase className="w-4 h-4" />
            Sales
          </button>
          <button
            onClick={() => setFilterType("employee")}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2",
              filterType === "employee" 
                ? "bg-white dark:bg-zinc-700 text-indigo-600 shadow-sm" 
                : "text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
          >
            <Users className="w-4 h-4" />
            Employee
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="p-8 text-center text-slate-500 dark:text-zinc-400">
          No data available for this leaderboard.
        </div>
      ) : (
        <>
          {/* Podium for Top 3 */}
          <div className="flex justify-center items-end gap-2 md:gap-6 pt-12 pb-8 h-[340px]">
            {/* 2nd Place */}
            {top3[1] && (
              <div className="flex flex-col items-center animate-fade-in-up" style={{ animationDelay: "150ms" }}>
                <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-200 dark:bg-zinc-700 rounded-full border-4 border-white dark:border-zinc-900 shadow-lg mb-4 flex items-center justify-center text-2xl font-bold text-slate-500 z-10 relative">
                  {top3[1].name.charAt(0).toUpperCase()}
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center text-sm font-black text-slate-700 border-2 border-white dark:border-zinc-900">
                    2
                  </div>
                </div>
                <div className="text-center mb-4">
                  <p className="font-bold text-slate-800 dark:text-zinc-200">{top3[1].name}</p>
                  <p className="text-sm font-semibold text-emerald-600">
                    {filterType === "sales" 
                      ? `${top3[1].clients_managed + top3[1].leads_managed} Managed` 
                      : `${top3[1].prod_tickets} in Prod`}
                  </p>
                </div>
                <div className="w-24 md:w-32 h-32 bg-gradient-to-t from-slate-200 to-slate-100 dark:from-zinc-800 dark:to-zinc-700 rounded-t-xl shadow-[inset_0_4px_6px_rgba(255,255,255,0.5)] dark:shadow-[inset_0_4px_6px_rgba(255,255,255,0.05)] border border-slate-200 dark:border-zinc-700 border-b-0"></div>
              </div>
            )}

            {/* 1st Place */}
            {top3[0] && (
              <div className="flex flex-col items-center animate-fade-in-up">
                <Star className="w-8 h-8 text-yellow-400 mb-2 drop-shadow-md animate-pulse" fill="currentColor" />
                <div className="w-20 h-20 md:w-24 md:h-24 bg-yellow-100 dark:bg-yellow-900/40 rounded-full border-4 border-white dark:border-zinc-900 shadow-xl mb-4 flex items-center justify-center text-3xl font-bold text-yellow-600 dark:text-yellow-500 z-10 relative">
                  {top3[0].name.charAt(0).toUpperCase()}
                  <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center text-base font-black text-white border-2 border-white dark:border-zinc-900 shadow-sm">
                    1
                  </div>
                </div>
                <div className="text-center mb-4">
                  <p className="font-extrabold text-lg text-slate-900 dark:text-white">{top3[0].name}</p>
                  <p className="text-md font-bold text-emerald-600">
                    {filterType === "sales" 
                      ? `${top3[0].clients_managed + top3[0].leads_managed} Managed` 
                      : `${top3[0].prod_tickets} in Prod`}
                  </p>
                </div>
                <div className="w-28 md:w-36 h-40 bg-gradient-to-t from-yellow-200 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30 rounded-t-xl shadow-[inset_0_4px_6px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_4px_6px_rgba(255,255,255,0.1)] border border-yellow-300 dark:border-yellow-700 border-b-0"></div>
              </div>
            )}

            {/* 3rd Place */}
            {top3[2] && (
              <div className="flex flex-col items-center animate-fade-in-up" style={{ animationDelay: "300ms" }}>
                <div className="w-16 h-16 md:w-20 md:h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full border-4 border-white dark:border-zinc-900 shadow-lg mb-4 flex items-center justify-center text-2xl font-bold text-orange-600 z-10 relative">
                  {top3[2].name.charAt(0).toUpperCase()}
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-orange-300 rounded-full flex items-center justify-center text-sm font-black text-orange-900 border-2 border-white dark:border-zinc-900">
                    3
                  </div>
                </div>
                <div className="text-center mb-4">
                  <p className="font-bold text-slate-800 dark:text-zinc-200">{top3[2].name}</p>
                  <p className="text-sm font-semibold text-emerald-600">
                    {filterType === "sales" 
                      ? `${top3[2].clients_managed + top3[2].leads_managed} Managed` 
                      : `${top3[2].prod_tickets} in Prod`}
                  </p>
                </div>
                <div className="w-24 md:w-32 h-24 bg-gradient-to-t from-orange-200 to-orange-100 dark:from-orange-900/30 dark:to-orange-900/20 rounded-t-xl shadow-[inset_0_4px_6px_rgba(255,255,255,0.5)] dark:shadow-[inset_0_4px_6px_rgba(255,255,255,0.05)] border border-orange-200 dark:border-orange-800/50 border-b-0"></div>
              </div>
            )}
          </div>

          {/* Full Leaderboard Table */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/50 dark:bg-zinc-800/50 text-slate-500 dark:text-zinc-400">
                  <tr>
                    <th className="px-6 py-4 font-medium">Rank</th>
                    <th className="px-6 py-4 font-medium">Employee</th>
                    {filterType === "sales" && (
                      <>
                        <th className="px-6 py-4 font-medium text-center">Clients</th>
                        <th className="px-6 py-4 font-medium text-center">Leads</th>
                        <th className="px-6 py-4 font-medium text-right">Revenue Closed</th>
                      </>
                    )}
                    {filterType === "employee" && (
                      <th className="px-6 py-4 font-medium text-center">In Prod</th>
                    )}
                    <th className="px-6 py-4 font-medium text-center">Deals Won</th>
                    <th className="px-6 py-4 font-medium text-center">Meetings Booked</th>
                    <th className="px-6 py-4 font-medium text-center">Calls Made</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {leaderboard.map((entry, index) => (
                    <tr key={entry.user_id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs",
                          index === 0 ? "bg-yellow-100 text-yellow-700" :
                          index === 1 ? "bg-slate-100 text-slate-700" :
                          index === 2 ? "bg-orange-100 text-orange-700" :
                          "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                        )}>
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-700 dark:text-indigo-400">
                          {entry.name.charAt(0).toUpperCase()}
                        </div>
                        {entry.name}
                      </td>
                      {filterType === "sales" && (
                        <>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 font-bold">
                              {entry.clients_managed}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-400 font-bold">
                              {entry.leads_managed}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                            ${entry.revenue_closed.toLocaleString()}
                          </td>
                        </>
                      )}
                      {filterType === "employee" && (
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400 font-bold">
                            {entry.prod_tickets}
                          </span>
                        </td>
                      )}
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 font-bold">
                          {entry.deals_closed}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-medium text-slate-600 dark:text-zinc-300">
                        {entry.meetings_booked}
                      </td>
                      <td className="px-6 py-4 text-center font-medium text-slate-600 dark:text-zinc-300">
                        {entry.calls_made}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
