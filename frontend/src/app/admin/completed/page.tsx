"use client";

import { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2, Search, Calendar, User, Building2,
  TrendingUp, Clock, Award, Filter, X
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { motion, AnimatePresence } from "framer-motion";

interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  due_date?: string;
  client_name?: string;
  assignee_name?: string;
  created_at: string;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  Low:    { label: "Low",    color: "text-slate-500 bg-slate-100 dark:bg-zinc-800 dark:text-zinc-400", dot: "bg-slate-400" },
  Medium: { label: "Medium", color: "text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400",  dot: "bg-amber-500" },
  High:   { label: "High",   color: "text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400", dot: "bg-orange-500" },
  Urgent: { label: "Urgent", color: "text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400", dot: "bg-red-500" },
};

export default function CompletedTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE_URL}/tasks?status=done`)
      .then(r => r.json())
      .then(d => setTasks(Array.isArray(d.tasks) ? d.tasks : []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        (t.client_name || "").toLowerCase().includes(q) ||
        (t.assignee_name || "").toLowerCase().includes(q);
      const matchPriority = priorityFilter === "All" || t.priority === priorityFilter;
      return matchSearch && matchPriority;
    });
  }, [tasks, search, priorityFilter]);

  const thisMonth = tasks.filter(t => {
    if (!t.created_at) return false;
    const d = new Date(t.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const stats = [
    { label: "Total Completed",     value: tasks.length,  icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "This Month",          value: thisMonth,      icon: Calendar,     color: "text-indigo-500",  bg: "bg-indigo-500/10"  },
    { label: "High / Urgent Done",  value: tasks.filter(t => t.priority === "High" || t.priority === "Urgent").length, icon: TrendingUp, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Assigned Tasks Done", value: tasks.filter(t => t.assignee_name).length, icon: User, color: "text-violet-500", bg: "bg-violet-500/10" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-4 md:p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
          <CheckCircle2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-zinc-100">Completed Tasks</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400">All tasks marked as Done across projects and clients</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm"
          >
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="text-2xl font-black text-slate-800 dark:text-zinc-100">{loading ? "—" : value}</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 font-medium">{label}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks, clients, assignees..."
            className="w-full pl-9 pr-9 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          {["All", "Low", "Medium", "High", "Urgent"].map(p => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                priorityFilter === p
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Task List */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-sm overflow-hidden">

        {/* Table header */}
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-6 py-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50">
          {["Task", "Priority", "Assignee", "Client", "Date"].map(h => (
            <p key={h} className="text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</p>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading completed tasks…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
              <Award className="w-8 h-8 text-emerald-500 opacity-60" />
            </div>
            <p className="text-base font-bold text-slate-700 dark:text-zinc-200">
              {search || priorityFilter !== "All" ? "No tasks match your filters" : "No completed tasks yet"}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {search || priorityFilter !== "All" ? "Try adjusting your filters." : "Tasks marked as Done will appear here."}
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {filtered.map((task, i) => {
              const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.Low;
              const dateStr = task.created_at
                ? new Date(task.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "—";
              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 md:gap-4 items-center px-6 py-4 border-b border-slate-100 dark:border-zinc-800 last:border-0 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-zinc-100 line-clamp-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{task.description}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide ${pc.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
                      {pc.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-600 dark:text-zinc-300 font-medium">
                      {task.assignee_name || <span className="text-slate-400 italic">Unassigned</span>}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-600 dark:text-zinc-300 font-medium">
                      {task.client_name || <span className="text-slate-400 italic">—</span>}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">{dateStr}</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {!loading && filtered.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/30">
            <p className="text-xs text-slate-400 font-medium">
              Showing <span className="font-black text-slate-600 dark:text-zinc-300">{filtered.length}</span> of{" "}
              <span className="font-black text-slate-600 dark:text-zinc-300">{tasks.length}</span> completed tasks
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
