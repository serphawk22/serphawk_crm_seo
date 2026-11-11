"use client";
import LocalizedText from "@/components/LocalizedText";
import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Plus, Search, Users, Calendar, X, Loader2, Edit2, Trash2, Eye, MapPin, Monitor, ChevronRight, Clock, List, LayoutGrid, ArrowUpRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

interface Batch {
  id: number;
  batch_name: string;
  batch_code?: string;
  course_id: number;
  course_title?: string;
  instructor_id?: number;
  instructor_name?: string;
  start_date?: string;
  end_date?: string;
  schedule?: string;
  session_duration_hours?: number;
  assignment_strategy?: string;
  mode: string;
  max_seats: number;
  enrolled_count: number;
  available_seats: number;
  status: string;
  room_or_link?: string;
}
interface Course { id: number; title: string; }
interface Instructor { id: number; name: string; }

const STATUS_STYLES: Record<string, string> = {
  Upcoming: "bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
  Active: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  Completed: "bg-slate-100 text-slate-700 border-slate-200/80 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  Cancelled: "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30"
};
const MODE_ICONS: Record<string, any> = { Online: Monitor, Offline: MapPin, Hybrid: Monitor };

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [showModal, setShowModal] = useState(false);
  const [editBatch, setEditBatch] = useState<Batch | null>(null);
  const [form, setForm] = useState({ course_id: "", instructor_id: "", batch_name: "", batch_code: "", start_date: "", end_date: "", schedule: "", session_duration_hours: "1", auto_assign_instructor: true, assignment_strategy: "round_robin", mode: "Offline", max_seats: "30", status: "Upcoming", room_or_link: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const fetch_ = async () => {
    setLoading(true);
    try {
      const [br, cr, ir] = await Promise.all([fetch(`${API_BASE_URL}/batches`), fetch(`${API_BASE_URL}/courses`), fetch(`${API_BASE_URL}/instructors`)]);
      const [bd, cd, id_] = await Promise.all([br.json(), cr.json(), ir.json()]);
      setBatches(bd.batches || []);
      setCourses(cd.courses || []);
      setInstructors(id_.instructors || []);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetch_(); }, []);

  const filtered = batches.filter(b =>
    (!search || b.batch_name.toLowerCase().includes(search.toLowerCase()) || (b.course_title || "").toLowerCase().includes(search.toLowerCase()) || (b.batch_code || "").toLowerCase().includes(search.toLowerCase())) &&
    (filterStatus === "All" || b.status === filterStatus)
  );

  const openCreate = () => {
    setSaveError("");
    setEditBatch(null);
    setForm({ course_id: "", instructor_id: "", batch_name: "", batch_code: "", start_date: "", end_date: "", schedule: "", session_duration_hours: "1", auto_assign_instructor: true, assignment_strategy: "round_robin", mode: "Offline", max_seats: "30", status: "Upcoming", room_or_link: "", notes: "" });
    setShowModal(true);
  };
  const openEdit = (b: Batch) => {
    setSaveError("");
    setEditBatch(b);
    setForm({ course_id: b.course_id.toString(), instructor_id: b.instructor_id?.toString() || "", batch_name: b.batch_name, batch_code: b.batch_code || "", start_date: b.start_date?.split("T")[0] || "", end_date: b.end_date?.split("T")[0] || "", schedule: b.schedule || "", session_duration_hours: String(b.session_duration_hours || 1), auto_assign_instructor: false, assignment_strategy: b.assignment_strategy || "manual", mode: b.mode, max_seats: b.max_seats.toString(), status: b.status, room_or_link: b.room_or_link || "", notes: "" });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.batch_name.trim() || !form.course_id) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload = { ...form, course_id: parseInt(form.course_id), instructor_id: form.instructor_id ? parseInt(form.instructor_id) : null, session_duration_hours: parseInt(form.session_duration_hours), auto_assign_instructor: !editBatch && form.auto_assign_instructor, assignment_strategy: editBatch ? "manual" : form.assignment_strategy, max_seats: parseInt(form.max_seats) || 30, start_date: form.start_date || null, end_date: form.end_date || null };
      const url = editBatch ? `${API_BASE_URL}/batches/${editBatch.id}` : `${API_BASE_URL}/batches`;
      const response = await fetch(url, { method: editBatch ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(typeof data.detail === "string" ? data.detail : data.detail?.message || "Could not save. Please try again."); }
      setShowModal(false);
      fetch_();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete batch?")) return;
    await fetch(`${API_BASE_URL}/batches/${id}`, { method: "DELETE" });
    fetch_();
  };

  const fillRate = (b: Batch) => b.max_seats > 0 ? Math.round((b.enrolled_count / b.max_seats) * 100) : 0;
  const activeCount = batches.filter(b => b.status === "Active").length;
  const upcomingCount = batches.filter(b => b.status === "Upcoming").length;
  const completedCount = batches.filter(b => b.status === "Completed").length;

  return (
    <div className="space-y-4">
      {saveError && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
      {/* Executive Compact Header */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-xs shrink-0">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                <LocalizedText text={"Course Batches"} /></h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-300 border border-slate-200/80 dark:border-white/5">
                {batches.length} <LocalizedText text={"total"} /> </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              <LocalizedText text={"Manage student cohorts, class timings, and seat availability"} /></p>
          </div>
        </div>

        <button
          onClick={openCreate}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs shadow-blue-500/20 transition-all hover:opacity-95 active:scale-95"
        >
          <Plus className="w-4 h-4" /> <LocalizedText text={"Create Batch"} /></button>
      </div>

      {/* High-density Compact Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: "Total Batches", value: batches.length, icon: Layers, c: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10" },
          { label: "Active Cohorts", value: activeCount, icon: CheckCircle2, c: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
          { label: "Upcoming", value: upcomingCount, icon: Calendar, c: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-500/10" },
          { label: "Completed", value: completedCount, icon: Clock, c: "text-slate-600 dark:text-zinc-400", bg: "bg-slate-100 dark:bg-white/5" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-slate-200/90 dark:border-white/10 bg-white/90 dark:bg-[#111111]/90 p-2 sm:px-3 sm:py-2 flex items-center justify-between shadow-xs hover:border-slate-300 dark:hover:border-white/20 transition-all"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-7 h-7 rounded-lg ${s.bg} border border-slate-200/40 dark:border-white/5 flex items-center justify-center shrink-0`}>
                <s.icon className={`w-3.5 h-3.5 ${s.c}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">{s.label}</p>
                <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none mt-0.5">{loading ? "—" : s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Streamlined Toolbar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 flex-wrap gap-2.5 shadow-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search batches by name, course, batch code..."
            className="w-full h-8 pl-9 pr-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/5 p-0.5 rounded-lg border border-slate-200/60 dark:border-white/5">
            {["All", "Active", "Upcoming", "Completed", "Cancelled"].map(st => {
              const count = st === "All" ? batches.length : batches.filter(b => b.status === st).length;
              return (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                    filterStatus === st
                      ? "bg-blue-600 text-white shadow-xs font-semibold"
                      : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <span>{st}</span>
                  <span className={`text-[10px] px-1 py-0.2 rounded-full ${filterStatus === st ? "bg-blue-700 text-white" : "bg-slate-200/80 dark:bg-white/10 text-slate-600 dark:text-zinc-400"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-white/10 pl-2">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List Card View"
              className={`p-1.5 rounded-lg border transition-all ${
                viewMode === "list"
                  ? "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40"
                  : "border-slate-200/80 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-[#111111]"
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Grid Card View"
              className={`p-1.5 rounded-lg border transition-all ${
                viewMode === "grid"
                  ? "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40"
                  : "border-slate-200/80 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-[#111111]"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500 w-8 h-8" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 text-center">
          <Layers className="w-10 h-10 text-slate-300 dark:text-zinc-600 mb-2" />
          <p className="text-slate-600 dark:text-zinc-400 font-semibold text-sm"><LocalizedText text={"No batches found matching criteria"} /></p>
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-2">
          {/* Subtle column headers for desktop */}
          <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
            <div className="col-span-3"><LocalizedText text={"Batch & Course"} /></div>
            <div className="col-span-3"><LocalizedText text={"Faculty & Mode"} /></div>
            <div className="col-span-2"><LocalizedText text={"Schedule & Timing"} /></div>
            <div className="col-span-2"><LocalizedText text={"Capacity & Fill Rate"} /></div>
            <div className="col-span-2 text-right"><LocalizedText text={"Status & Actions"} /></div>
          </div>

          {filtered.map((b, i) => {
            const fr = fillRate(b);
            const ModeIcon = MODE_ICONS[b.mode] || MapPin;

            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.25) }}
                className="group rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-2.5 shadow-xs hover:border-blue-500/60 dark:hover:border-blue-500/50 hover:shadow-md transition-all duration-150"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
                  {/* Batch & Course */}
                  <div className="col-span-1 sm:col-span-2 lg:col-span-3 min-w-0 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs">
                      {b.batch_name[0]?.toUpperCase() || "B"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/batches/${b.id}`}
                        className="font-semibold text-sm text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate flex items-center gap-1"
                        title={b.batch_name}
                      >
                        <span className="truncate">{b.batch_name}</span>
                        <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 shrink-0" />
                      </Link>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] truncate">
                        {b.batch_code && (
                          <span className="font-mono text-slate-400 dark:text-zinc-500 text-[10.5px] truncate">
                            {b.batch_code}
                          </span>
                        )}
                        {b.course_title && (
                          <span className="text-blue-600 dark:text-blue-400 font-medium truncate">
                            • {b.course_title}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Faculty & Mode */}
                  <div className="col-span-1 lg:col-span-3 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-white/10 rounded-md text-[11px] font-medium text-slate-700 dark:text-zinc-300 border border-slate-200/60 dark:border-white/5 truncate max-w-[130px]">
                        <ModeIcon className="w-3 h-3 text-cyan-500 shrink-0" />
                        <span>{b.mode}</span>
                      </span>
                      {b.instructor_name ? (
                        <span className="text-xs text-slate-700 dark:text-zinc-300 font-medium truncate">
                          {b.instructor_name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic"><LocalizedText text={"No instructor"} /></span>
                      )}
                    </div>
                  </div>

                  {/* Schedule */}
                  <div className="col-span-1 lg:col-span-2 min-w-0">
                    {b.schedule ? (
                      <p className="text-xs text-slate-700 dark:text-zinc-300 font-medium truncate flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{b.schedule}</span>
                      </p>
                    ) : b.start_date ? (
                      <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                        <span><LocalizedText text={"Starts"} />{new Date(b.start_date).toLocaleDateString()}</span>
                      </p>
                    ) : (
                      <span className="text-xs text-slate-400 italic"><LocalizedText text={"Flexible timing"} /></span>
                    )}
                  </div>

                  {/* Capacity & Fill Rate */}
                  <div className="col-span-1 lg:col-span-2 min-w-0">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                      <span>{b.enrolled_count}/{b.max_seats} <LocalizedText text={"seats"} /></span>
                      <span className={fr >= 90 ? "text-rose-600 font-bold" : fr >= 70 ? "text-amber-600" : "text-blue-600"}>{fr}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${fr >= 90 ? "bg-rose-500" : fr >= 70 ? "bg-amber-500" : "bg-blue-500"}`}
                        style={{ width: `${Math.min(fr, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Status & Actions */}
                  <div className="col-span-1 sm:col-span-2 lg:col-span-2 flex items-center justify-end gap-1.5">
                    <span className={`inline-flex items-center text-[10.5px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap shadow-xs ${STATUS_STYLES[b.status] || STATUS_STYLES.Upcoming}`}>
                      {b.status}
                    </span>

                    <Link
                      href={`/batches/${b.id}`}
                      title="View Students in Batch"
                      className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 dark:hover:bg-blue-500/20 dark:hover:text-blue-300 text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => openEdit(b)}
                      title="Edit Batch"
                      className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      title="Delete Batch"
                      className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 dark:hover:bg-rose-900/30 text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        /* Grid Mode */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((b, i) => {
            const fr = fillRate(b);
            const ModeIcon = MODE_ICONS[b.mode] || MapPin;
            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.25) }}
                className="rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-4 shadow-xs hover:border-blue-500/50 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`px-2 py-0.2 rounded-full text-[10.5px] font-semibold border ${STATUS_STYLES[b.status] || STATUS_STYLES.Upcoming}`}>{b.status}</span>
                        <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-white/10 rounded-md text-[10.5px] text-slate-600 dark:text-zinc-400 flex items-center gap-1"><ModeIcon className="w-3 h-3" />{b.mode}</span>
                      </div>
                      <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{b.batch_name}</h3>
                      {b.course_title && <p className="text-xs text-blue-600 dark:text-blue-400 font-medium truncate">{b.course_title}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(b)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(b.id)} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-slate-500 dark:text-zinc-400 py-2 border-y border-slate-100 dark:border-white/5 mb-3">
                    {b.instructor_name && <p className="truncate"><LocalizedText text={"Instructor:"} /><span className="font-medium text-slate-800 dark:text-zinc-200">{b.instructor_name}</span></p>}
                    {b.schedule && <p className="flex items-center gap-1 truncate"><Clock className="w-3 h-3" />{b.schedule}</p>}
                  </div>

                  <div className="mb-3">
                    <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                      <span>{b.enrolled_count} / {b.max_seats} <LocalizedText text={"seats"} /></span>
                      <span className="font-semibold">{fr}<LocalizedText text={"% full"} /></span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${fr >= 90 ? "bg-rose-500" : fr >= 70 ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${fr}%` }} />
                    </div>
                  </div>
                </div>

                <Link href={`/batches/${b.id}`} className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 text-xs font-semibold transition">
                  <Eye className="w-3.5 h-3.5" /> <LocalizedText text={"View Students"} /></Link>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white border border-slate-200 dark:bg-zinc-900 dark:border-white/10 rounded-2xl p-5 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-zinc-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editBatch ? "Edit Batch" : "Create New Batch"}</h2>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Course *"} /></label>
                  <select value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })} className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-blue-500">
                    <option value="">Select course</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Instructor"} /></label>
                  <select value={form.instructor_id} disabled={!editBatch && form.auto_assign_instructor} onChange={e => setForm({ ...form, instructor_id: e.target.value })} className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-blue-500 disabled:opacity-50">
                    <option value="">{form.auto_assign_instructor && !editBatch ? "Assigned automatically" : "Select instructor"}</option>
                    {instructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                {!editBatch && <div className="col-span-2 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.auto_assign_instructor} onChange={e => setForm({ ...form, auto_assign_instructor: e.target.checked })} />Auto-assign instructor</label>
                  <select aria-label="Instructor assignment method" value={form.assignment_strategy} disabled={!form.auto_assign_instructor} onChange={e => setForm({ ...form, assignment_strategy: e.target.value })} className="rounded-xl border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-zinc-800">
                    <option value="round_robin">Balanced round-robin</option><option value="performance">Highest instructor performance</option>
                  </select>
                </div>}
                <div>
                  <label htmlFor="batch-session-hours" className="block text-xs font-semibold mb-1">Session duration (hours)</label>
                  <select id="batch-session-hours" value={form.session_duration_hours} onChange={e => setForm({ ...form, session_duration_hours: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-zinc-800">
                    {[1, 2, 3, 4].map(hours => <option key={hours} value={hours}>{hours} {hours === 1 ? "hour" : "hours"}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Batch Name *"} /></label>
                  <input value={form.batch_name} onChange={e => setForm({ ...form, batch_name: e.target.value })} placeholder="e.g. Batch Jan 2025" className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Batch Code"} /></label>
                  <input value={form.batch_code} onChange={e => setForm({ ...form, batch_code: e.target.value })} placeholder="e.g. WD-JAN-25" className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Start Date"} /></label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"End Date"} /></label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Mode"} /></label>
                  <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })} className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-blue-500">
                    <option>Online</option>
                    <option>Offline</option>
                    <option>Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Max Seats"} /></label>
                  <input type="number" value={form.max_seats} onChange={e => setForm({ ...form, max_seats: e.target.value })} className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Status"} /></label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-blue-500">
                    <option>Upcoming</option>
                    <option value={"Active"}><LocalizedText text={"Active"} /></option>
                    <option value={"Completed"}><LocalizedText text={"Completed"} /></option>
                    <option value={"Cancelled"}><LocalizedText text={"Cancelled"} /></option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Schedule"} /></label>
                  <input value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })} placeholder="e.g. Mon-Wed-Fri 10am-12pm" className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              {saveError && <p role="alert" className="mt-3 text-sm text-red-600">{saveError}</p>}
              <div className="flex gap-2.5 mt-5">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 transition text-xs sm:text-sm font-semibold"><LocalizedText text={"Cancel"} /></button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold hover:opacity-95 transition disabled:opacity-50 flex items-center justify-center gap-2 text-xs sm:text-sm shadow-xs">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editBatch ? "Update" : "Create Batch"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
