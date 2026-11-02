"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Users, GraduationCap, Trophy, ArrowUpRight, Loader2, DollarSign, Award, Star } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useTenantConfig } from "@/context/TenantConfigContext";

interface Person {
  id?: number;
  user_id?: number | null;
  name: string;
  email?: string;
  role?: string;
  expertise?: string;
  leads_converted?: number;
  leads_assigned?: number;
  revenue_collected?: number;
  students?: number;
  batches_completed?: number;
  avg_rating?: number;
}

type Metric = "revenue_collected" | "leads_converted" | "leads_assigned" | "avg_rating" | "students" | "batches_completed";

const salesMetrics: { key: Metric; label: string }[] = [
  { key: "revenue_collected", label: "Revenue collected" },
  { key: "leads_converted", label: "Leads enrolled" },
  { key: "leads_assigned", label: "Leads assigned" },
];

const teachingMetrics: { key: Metric; label: string }[] = [
  { key: "avg_rating", label: "Student rating" },
  { key: "students", label: "Active students" },
  { key: "batches_completed", label: "Completed batches" },
];

export default function InstitutePeople({ leaderboard = false }: { leaderboard?: boolean }) {
  const { settings } = useTenantConfig();
  const [sales, setSales] = useState<Person[]>([]);
  const [instructors, setInstructors] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [salesMetric, setSalesMetric] = useState<Metric>("revenue_collected");
  const [teachingMetric, setTeachingMetric] = useState<Metric>("avg_rating");

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

  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 p-12 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
        <span>Loading institute team...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300 flex items-center justify-between">
        <span>{error}</span>
        <button className="font-semibold underline ml-2" onClick={() => setRetry(v => v + 1)}>Try again</button>
      </div>
    );
  }

  const money = (value = 0) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: settings.default_currency || "INR",
      maximumFractionDigits: 0
    }).format(value);

  const matches = (person: Person) =>
    [person.name, person.email, person.expertise, person.role].some(value =>
      value?.toLowerCase().includes(query.trim().toLowerCase())
    );

  const rank = (people: Person[], metric: Metric) =>
    [...people].sort(
      (a, b) =>
        (b[metric] || 0) - (a[metric] || 0) ||
        (metric === "avg_rating" ? (b.batches_completed || 0) - (a.batches_completed || 0) : 0) ||
        a.name.localeCompare(b.name)
    );

  return (
    <div className="space-y-4">
      {/* Compact Executive Header (when used in leaderboard page) */}
      {leaderboard && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none">Institute Leaderboard</h1>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Performance
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Sales outcomes and teaching impact across all recorded activity
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5">
        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Sales Team</p>
            <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight mt-0.5">{sales.length}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Users className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Instructors</p>
            <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight mt-0.5">{instructors.length}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <GraduationCap className="w-3.5 h-3.5" />
          </div>
        </div>

        {leaderboard && (
          <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs col-span-2 sm:col-span-1">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Revenue Collected</p>
              <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5">
                {money(sales.reduce((sum, p) => sum + (p.revenue_collected || 0), 0))}
              </p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
        )}
      </div>

      {/* Single-Row Search Toolbar */}
      <div className="bg-white dark:bg-[#111111]/90 p-2 sm:px-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
          <input
            aria-label="Search salespeople and instructors"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, email, role, expertise..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Ranking Sections */}
      {[
        {
          title: leaderboard ? "Sales Rankings" : "Sales Team",
          people: leaderboard ? rank(sales, salesMetric) : sales,
          teachers: false,
          metric: salesMetric,
          setMetric: setSalesMetric,
          options: salesMetrics
        },
        {
          title: leaderboard ? "Instructor Rankings" : "Instructors",
          people: leaderboard ? rank(instructors, teachingMetric) : instructors,
          teachers: true,
          metric: teachingMetric,
          setMetric: setTeachingMetric,
          options: teachingMetrics
        }
      ].map(group => {
        const visible = group.people
          .map((person, index) => ({ person, position: index + 1 }))
          .filter(({ person }) => matches(person));

        return (
          <section key={group.title} className="space-y-2">
            {/* Group Header Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <span className={`p-1.5 rounded-lg border ${
                  group.teachers
                    ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
                    : "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20"
                }`}>
                  {group.teachers ? <GraduationCap className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-900 dark:text-white leading-none">{group.title}</h2>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">{visible.length} of {group.people.length} members</p>
                </div>
              </div>

              {leaderboard && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
                  <span className="text-[11px]">Rank by:</span>
                  <select
                    aria-label={`Rank ${group.teachers ? "instructors" : "salespeople"} by`}
                    value={group.metric}
                    onChange={e => group.setMetric(e.target.value as Metric)}
                    className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                  >
                    {group.options.map(m => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* List Cards */}
            {!visible.length ? (
              <div className="p-8 text-center bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10">
                <Users className="mx-auto mb-2 h-7 w-7 text-slate-300 dark:text-zinc-600" />
                <p className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                  {query ? "No matching members found" : `No ${group.teachers ? "instructors" : "salespeople"} yet`}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {visible.map(({ person, position }) => {
                  return (
                    <article
                      key={person.user_id || person.id || position}
                      className="group relative flex flex-col md:flex-row md:items-center justify-between gap-2.5 p-2.5 sm:px-4 sm:py-2 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 hover:border-blue-500/60 dark:hover:border-blue-500/50 hover:shadow-xs transition-all duration-150"
                    >
                      {/* Left: Rank & Avatar & Info */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {leaderboard ? (
                          <span
                            aria-label={`Rank ${position}`}
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold border ${
                              position === 1
                                ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700/50"
                                : position === 2
                                ? "bg-slate-100 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                                : position === 3
                                ? "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-700/50"
                                : "bg-slate-50 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-zinc-400 dark:border-white/10"
                            }`}
                          >
                            {position === 1 ? <Trophy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> : `#${position}`}
                          </span>
                        ) : (
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20"
                          >
                            {person.name?.charAt(0).toUpperCase() || "?"}
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-xs text-slate-900 dark:text-white truncate">{person.name}</h3>
                            <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
                              {group.teachers ? person.expertise || "Instructor" : person.role === "SalesManager" ? "Sales Manager" : person.role || "Salesperson"}
                            </span>
                          </div>
                          {!leaderboard && person.email && (
                            <a
                              className="text-[11px] text-blue-600 hover:underline dark:text-blue-400 truncate block mt-0.5"
                              href={`mailto:${person.email}`}
                            >
                              {person.email}
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Center/Right: Metrics breakdown */}
                      {leaderboard && (
                        <div className="flex items-center gap-4 sm:gap-6 text-xs shrink-0">
                          {(group.teachers
                            ? [
                                { label: "Student Rating", value: person.avg_rating ? `${person.avg_rating.toFixed(1)} / 5` : "Unrated" },
                                { label: "Batches", value: person.batches_completed || 0 },
                                { label: "Students", value: person.students || 0 }
                              ]
                            : [
                                { label: "Revenue", value: money(person.revenue_collected) },
                                { label: "Assigned", value: person.leads_assigned || 0 },
                                { label: "Enrolled", value: person.leads_converted || 0 }
                              ]
                          ).map(item => (
                            <div key={item.label} className="text-right">
                              <span className="block text-[10px] uppercase tracking-wider text-slate-400 dark:text-zinc-500">{item.label}</span>
                              <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs tabular-nums">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Right: Actions */}
                      {group.teachers && person.id && (
                        <Link
                          href={`/instructors/${person.id}`}
                          aria-label={`View ${person.name}'s profile`}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition shrink-0 self-end md:self-center border border-blue-200 dark:border-blue-500/20"
                        >
                          <span>Profile</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
