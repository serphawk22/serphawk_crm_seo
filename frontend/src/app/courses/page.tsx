"use client";
import LocalizedText from "@/components/LocalizedText";
import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, Search, Users, Clock, DollarSign, Edit2, Trash2, Eye, ChevronRight, X, Loader2, GraduationCap, Layers, Star, List, LayoutGrid, ArrowUpRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

interface Course {
  id: number;
  title: string;
  description?: string;
  category?: string;
  duration_weeks?: number;
  duration_hours?: number;
  prerequisites?: string;
  price: number;
  advance_amount: number;
  thumbnail_url?: string;
  is_active: boolean;
  batch_count: number;
  enrollment_count: number;
  created_at: string;
}

const CATEGORIES = ["Programming", "Design", "Data Science", "Business", "Marketing", "Finance", "Healthcare", "Engineering", "Language", "Other"];
const GRADIENTS: Record<string, string> = {
  Programming: "from-violet-500 to-indigo-600",
  Design: "from-pink-500 to-rose-500",
  "Data Science": "from-cyan-500 to-blue-600",
  Business: "from-amber-500 to-orange-500",
  Marketing: "from-green-500 to-emerald-600",
  Finance: "from-teal-500 to-cyan-600",
  Healthcare: "from-red-500 to-pink-600",
  Engineering: "from-slate-500 to-gray-600",
  Language: "from-purple-500 to-violet-600",
  Other: "from-zinc-500 to-neutral-600"
};

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [showModal, setShowModal] = useState(false);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [form, setForm] = useState({ title: "", description: "", category: "Programming", duration_weeks: "", duration_hours: "", price: "", advance_amount: "", prerequisites: "", is_active: true });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/courses`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not load courses.");
      setCourses(Array.isArray(data.courses) ? data.courses : []);
    } catch (e) {
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchCourses(); }, []);

  const filtered = courses.filter(c =>
    (!search || c.title.toLowerCase().includes(search.toLowerCase()) || (c.category || "").toLowerCase().includes(search.toLowerCase())) &&
    (filterCat === "All" || c.category === filterCat)
  );

  const openCreate = () => {
    setSaveError("");
    setEditCourse(null);
    setForm({ title: "", description: "", category: "Programming", duration_weeks: "", duration_hours: "", price: "", advance_amount: "", prerequisites: "", is_active: true });
    setShowModal(true);
  };
  const openEdit = (c: Course) => {
    setSaveError("");
    setEditCourse(c);
    setForm({ title: c.title, description: c.description || "", category: c.category || "Programming", duration_weeks: c.duration_weeks?.toString() || "", duration_hours: c.duration_hours?.toString() || "", price: c.price.toString(), advance_amount: c.advance_amount.toString(), prerequisites: c.prerequisites || "", is_active: c.is_active });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload = { title: form.title, description: form.description, category: form.category, duration_weeks: form.duration_weeks ? parseInt(form.duration_weeks) : null, duration_hours: form.duration_hours ? parseInt(form.duration_hours) : null, price: parseFloat(form.price) || 0, advance_amount: parseFloat(form.advance_amount) || 0, prerequisites: form.prerequisites, is_active: form.is_active };
      const response = await fetch(editCourse ? `${API_BASE_URL}/courses/${editCourse.id}` : `${API_BASE_URL}/courses`, { method: editCourse ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(typeof data.detail === "string" ? data.detail : data.detail?.message || "Could not save. Please try again."); }
      setShowModal(false);
      fetchCourses();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this course?")) return;
    await fetch(`${API_BASE_URL}/courses/${id}`, { method: "DELETE" });
    fetchCourses();
  };

  const activeCount = courses.filter(c => c.is_active).length;
  const totalEnrolled = courses.reduce((a, c) => a + (c.enrollment_count || 0), 0);
  const totalBatches = courses.reduce((a, c) => a + (c.batch_count || 0), 0);

  return (
    <div className="space-y-4">
      {saveError && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
      {/* Executive Compact Header */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-xs shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                <LocalizedText text={"Course Catalog"} /></h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-300 border border-slate-200/80 dark:border-white/5">
                {courses.length} <LocalizedText text={"courses"} /></span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              <LocalizedText text={"Manage all institute academic programs, pricing, and syllabi"} /></p>
          </div>
        </div>

        <button
          onClick={openCreate}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs shadow-violet-500/20 transition-all hover:opacity-95 active:scale-95"
        >
          <Plus className="w-4 h-4" /> <LocalizedText text={"Create Course"} /></button>
      </div>

      {/* High-density Compact Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: "Total Courses", value: courses.length, icon: BookOpen, c: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-500/10" },
          { label: "Active Programs", value: activeCount, icon: CheckCircle2, c: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
          { label: "Total Batches", value: totalBatches, icon: Layers, c: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10" },
          { label: "Total Students", value: totalEnrolled, icon: Users, c: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10" },
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
            placeholder="Search courses by title, category, description..."
            className="w-full h-8 pl-9 pr-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-violet-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/5 p-0.5 rounded-lg border border-slate-200/60 dark:border-white/5 overflow-x-auto max-w-[420px] scrollbar-none">
            {["All", ...CATEGORIES].map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  filterCat === cat
                    ? "bg-violet-600 text-white shadow-xs font-semibold"
                    : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-white/10 pl-2">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List Card View"
              className={`p-1.5 rounded-lg border transition-all ${
                viewMode === "list"
                  ? "bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/40"
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
                  ? "bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/40"
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
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-violet-500 w-8 h-8" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 dark:text-zinc-600 mb-2" />
          <p className="text-slate-600 dark:text-zinc-400 font-semibold text-sm"><LocalizedText text={"No courses found matching criteria"} /></p>
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-2">
          {/* Subtle column headers for desktop */}
          <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
            <div className="col-span-4"><LocalizedText text={"Course Program"} /></div>
            <div className="col-span-2"><LocalizedText text={"Tuition & Advance"} /></div>
            <div className="col-span-3"><LocalizedText text={"Duration & Batches"} /></div>
            <div className="col-span-2"><LocalizedText text={"Enrollments & Status"} /></div>
            <div className="col-span-1 text-right"><LocalizedText text={"Actions"} /></div>
          </div>

          {filtered.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.25) }}
              className="group rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-2.5 shadow-xs hover:border-violet-500/60 dark:hover:border-violet-500/50 hover:shadow-md transition-all duration-150"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
                {/* Course Program */}
                <div className="col-span-1 sm:col-span-2 lg:col-span-4 min-w-0 flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${GRADIENTS[c.category || "Other"] || GRADIENTS.Other} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs`}>
                    <BookOpen className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/courses/${c.id}`}
                      className="font-semibold text-sm text-slate-900 dark:text-white hover:text-violet-600 dark:hover:text-violet-400 transition-colors truncate flex items-center gap-1"
                      title={c.title}
                    >
                      <span className="truncate">{c.title}</span>
                      <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-violet-500 shrink-0" />
                    </Link>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] truncate">
                      {c.category && (
                        <span className="inline-flex items-center text-[10.5px] font-medium text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 px-1.5 py-0.2 rounded border border-violet-200/60 dark:border-violet-800/40 truncate">
                          {c.category}
                        </span>
                      )}
                      {c.description && (
                        <span className="text-slate-400 dark:text-zinc-500 truncate" title={c.description}>
                          {c.description}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tuition & Advance */}
                <div className="col-span-1 lg:col-span-2 min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span>₹{c.price.toLocaleString()}</span>
                  </p>
                  {c.advance_amount > 0 ? (
                    <p className="text-[10.5px] text-slate-500 dark:text-zinc-400 mt-0.5">
                      <LocalizedText text={"Advance: ₹"} />{c.advance_amount.toLocaleString()}
                    </p>
                  ) : null}
                </div>

                {/* Duration & Batches */}
                <div className="col-span-1 lg:col-span-3 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {c.duration_weeks ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-zinc-300 bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded border border-slate-200/60 dark:border-white/5">
                        <Clock className="w-2.5 h-2.5 text-blue-500" />
                        <span>{c.duration_weeks} <LocalizedText text={"wks"} /></span>
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-zinc-300 bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded border border-slate-200/60 dark:border-white/5">
                      <Layers className="w-2.5 h-2.5 text-amber-500" />
                      <span>{c.batch_count} <LocalizedText text={"batches"} /></span>
                    </span>
                  </div>
                </div>

                {/* Enrollments & Status */}
                <div className="col-span-1 lg:col-span-2 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-200/60 dark:border-violet-700/30 whitespace-nowrap shadow-xs">
                    <Users className="w-2.5 h-2.5" />
                    <span>{c.enrollment_count} <LocalizedText text={"enrolled"} /></span>
                  </span>
                  <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.2 rounded-full border whitespace-nowrap ${
                    c.is_active
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300"
                  }`}>
                    {c.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Actions */}
                <div className="col-span-1 sm:col-span-2 lg:col-span-1 flex items-center justify-end gap-1.5">
                  <Link
                    href={`/courses/${c.id}`}
                    title="View Course"
                    className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 hover:bg-violet-50 hover:text-violet-600 hover:border-violet-300 dark:hover:bg-violet-500/20 dark:hover:text-violet-300 text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={() => openEdit(c)}
                    title="Edit Course"
                    className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    title="Delete Course"
                    className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 dark:hover:bg-rose-900/30 text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        /* Grid Mode */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((course, i) => (
            <motion.div
              key={course.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.25) }}
              className="rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/90 overflow-hidden shadow-xs hover:border-violet-500/50 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className={`h-20 bg-gradient-to-br ${GRADIENTS[course.category || "Other"] || GRADIENTS.Other} relative flex items-center justify-center p-3`}>
                <BookOpen className="w-8 h-8 text-white/30" />
                <div className="absolute top-2 right-2 flex gap-1">
                  <button onClick={() => openEdit(course)} className="p-1 bg-black/30 rounded-lg hover:bg-black/50 text-white transition"><Edit2 className="w-3 h-3" /></button>
                  <button onClick={() => handleDelete(course.id)} className="p-1 bg-black/30 rounded-lg hover:bg-red-500/60 text-white transition"><Trash2 className="w-3 h-3" /></button>
                </div>
                {!course.is_active && <div className="absolute top-2 left-2 px-1.5 py-0.2 bg-red-500/80 rounded-full text-[10px] text-white"><LocalizedText text={"Inactive"} /></div>}
              </div>

              <div className="p-3.5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-1.5 mb-1">
                    <h3 className="text-slate-900 dark:text-white font-semibold text-sm leading-tight truncate">{course.title}</h3>
                    {course.category && <span className="px-1.5 py-0.2 bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 rounded text-[10.5px] font-medium shrink-0">{course.category}</span>}
                  </div>
                  {course.description && <p className="text-slate-500 dark:text-zinc-400 text-xs line-clamp-2 mb-2">{course.description}</p>}

                  <div className="grid grid-cols-2 gap-1.5 text-xs text-slate-700 dark:text-zinc-300 py-2 border-y border-slate-100 dark:border-white/5 mb-3">
                    <div className="flex items-center gap-1 font-semibold text-emerald-600">₹{course.price.toLocaleString()}</div>
                    <div className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-500" />{course.duration_weeks || 0} <LocalizedText text={"wks"} /></div>
                    <div className="flex items-center gap-1"><Layers className="w-3 h-3 text-amber-500" />{course.batch_count} <LocalizedText text={"batches"} /></div>
                    <div className="flex items-center gap-1"><Users className="w-3 h-3 text-violet-500" />{course.enrollment_count} <LocalizedText text={"enrolled"} /></div>
                  </div>
                </div>

                <Link href={`/courses/${course.id}`} className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-violet-50 hover:text-violet-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-violet-500/20 text-xs font-semibold transition">
                  <Eye className="w-3.5 h-3.5" /> <LocalizedText text={"View Program Details"} /></Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white border border-slate-200 dark:bg-zinc-900 dark:border-white/10 rounded-2xl p-5 sm:p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-zinc-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editCourse ? "Edit Course" : "Create New Course"}</h2>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Course Title *"} /></label>
                    <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Full Stack Web Development" className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Category"} /></label>
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-zinc-800 dark:text-white focus:outline-none focus:border-violet-500">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Course Price (₹)"} /></label>
                    <input value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} type="number" placeholder="0" className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Advance Amount (₹)"} /></label>
                    <input value={form.advance_amount} onChange={e => setForm({ ...form, advance_amount: e.target.value })} type="number" placeholder="0" className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Duration (Weeks)"} /></label>
                    <input value={form.duration_weeks} onChange={e => setForm({ ...form, duration_weeks: e.target.value })} type="number" placeholder="e.g. 12" className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:outline-none focus:border-violet-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1"><LocalizedText text={"Description"} /></label>
                    <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Course overview..." className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:outline-none focus:border-violet-500 resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" htmlFor="course-hours">Total hours</label>
                    <input id="course-hours" type="number" min="1" step="1" value={form.duration_hours} onChange={e => setForm({ ...form, duration_hours: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-transparent px-3.5 py-2 dark:border-white/10" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold mb-1" htmlFor="course-prerequisites">Prerequisites</label>
                    <textarea id="course-prerequisites" rows={2} value={form.prerequisites} onChange={e => setForm({ ...form, prerequisites: e.target.value })} placeholder="What students need to know before joining" className="w-full rounded-xl border border-slate-200 bg-transparent px-3.5 py-2 dark:border-white/10" />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 accent-violet-500" />
                    <label htmlFor="is_active" className="text-xs font-semibold text-slate-700 dark:text-zinc-300"><LocalizedText text={"Course is Active"} /></label>
                  </div>
                </div>
              </div>
              {saveError && <p role="alert" className="mt-3 text-sm text-red-600">{saveError}</p>}
              <div className="flex gap-2.5 mt-5">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 transition text-xs sm:text-sm font-semibold"><LocalizedText text={"Cancel"} /></button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:opacity-95 transition disabled:opacity-50 flex items-center justify-center gap-2 text-xs sm:text-sm shadow-xs">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editCourse ? "Update" : "Create Course"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
