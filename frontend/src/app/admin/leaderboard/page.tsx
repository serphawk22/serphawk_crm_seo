"use client";

import { useState, useEffect } from "react";
import { Trophy, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";


interface LeaderboardEntry {
  user_id: number;
  name: string;
  role: string;
  deals_closed: number;
  revenue_closed: number;
  meetings_booked: number;
  calls_made: number;
}

export default function LeaderboardPage() {
  const { t } = useLanguage();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/leaderboard`);
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
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Get Top 3 for Podium
  const top3 = leaderboard.slice(0, 3);
  const remaining = leaderboard.slice(3);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 min-h-[calc(100vh-64px)]">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-3">
            <Trophy className="w-8 h-8 text-indigo-600" />
            {t("leaderboard.title")}
          </h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-zinc-400">{t("leaderboard.subtitle")}</p>
        </div>
      </div>

      {/* Podium Section */}
      {top3.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
          <div className="flex flex-col md:flex-row items-end justify-center gap-6 md:gap-12 min-h-[300px]">
            
            {/* 2nd Place */}
            {top3[1] && (
              <div className="flex flex-col items-center group w-full md:w-48 order-2 md:order-1">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shadow-lg border-4 border-slate-300 relative z-10 mb-[-20px] transition-transform group-hover:scale-110">
                  <span className="text-xl font-bold text-slate-600 dark:text-zinc-300">2</span>
                </div>
                <div className="w-full h-40 bg-gradient-to-t from-slate-200 to-slate-100 dark:from-zinc-800 dark:to-zinc-800/50 rounded-t-xl border border-b-0 border-slate-200 dark:border-zinc-700 flex flex-col items-center pt-8 px-4 transition-all group-hover:h-44">
                  <span className="font-bold text-slate-800 dark:text-zinc-200 truncate w-full text-center">{top3[1].name}</span>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-2">${top3[1].revenue_closed.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">{top3[1].deals_closed} {t("leaderboard.deals")}</span>
                </div>
              </div>
            )}

            {/* 1st Place */}
            {top3[0] && (
              <div className="flex flex-col items-center group w-full md:w-56 order-1 md:order-2">
                <div className="absolute top-10 pointer-events-none">
                  {/* Fake confetti effect */}
                  <Star className="w-6 h-6 text-yellow-400 absolute -left-10 -top-5 animate-pulse" />
                  <Star className="w-4 h-4 text-orange-400 absolute left-12 -top-10 animate-bounce" />
                </div>
                <div className="w-20 h-20 rounded-full bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center shadow-xl border-4 border-yellow-400 relative z-10 mb-[-25px] transition-transform group-hover:scale-110">
                  <Trophy className="w-8 h-8 text-yellow-500" />
                </div>
                <div className="w-full h-52 bg-gradient-to-t from-yellow-200 via-yellow-100 to-yellow-50 dark:from-yellow-900/40 dark:via-yellow-900/20 dark:to-transparent rounded-t-xl border border-b-0 border-yellow-300 dark:border-yellow-700/50 flex flex-col items-center pt-10 px-4 transition-all group-hover:h-56 shadow-[0_0_30px_rgba(250,204,21,0.2)]">
                  <span className="font-black text-lg text-yellow-900 dark:text-yellow-500 truncate w-full text-center">{top3[0].name}</span>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-2">${top3[0].revenue_closed.toLocaleString()}</span>
                  <span className="text-xs text-yellow-700 dark:text-yellow-600 uppercase tracking-wider mt-1 font-bold">{top3[0].deals_closed} {t("leaderboard.deals_won")}</span>
                </div>
              </div>
            )}

            {/* 3rd Place */}
            {top3[2] && (
              <div className="flex flex-col items-center group w-full md:w-48 order-3 md:order-3">
                <div className="w-16 h-16 rounded-full bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center shadow-lg border-4 border-orange-400 relative z-10 mb-[-20px] transition-transform group-hover:scale-110">
                  <span className="text-xl font-bold text-orange-600 dark:text-orange-500">3</span>
                </div>
                <div className="w-full h-32 bg-gradient-to-t from-orange-100 to-orange-50 dark:from-orange-900/30 dark:to-transparent rounded-t-xl border border-b-0 border-orange-200 dark:border-orange-800/50 flex flex-col items-center pt-8 px-4 transition-all group-hover:h-36">
                  <span className="font-bold text-slate-800 dark:text-zinc-200 truncate w-full text-center">{top3[2].name}</span>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-2">${top3[2].revenue_closed.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">{top3[2].deals_closed} {t("leaderboard.deals")}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Leaderboard Table */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/50 dark:bg-zinc-800/50 text-slate-500 dark:text-zinc-400">
              <tr>
                <th className="px-6 py-4 font-medium">{t("leaderboard.rank")}</th>
                <th className="px-6 py-4 font-medium">{t("leaderboard.employee")}</th>
                <th className="px-6 py-4 font-medium text-right">{t("leaderboard.revenue_closed")}</th>
                <th className="px-6 py-4 font-medium text-center">{t("leaderboard.deals_won")}</th>
                <th className="px-6 py-4 font-medium text-center">{t("leaderboard.meetings_booked")}</th>
                <th className="px-6 py-4 font-medium text-center">{t("leaderboard.calls_made")}</th>
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
                  <td className="px-6 py-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                    ${entry.revenue_closed.toLocaleString()}
                  </td>
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
    </div>
  );
}
