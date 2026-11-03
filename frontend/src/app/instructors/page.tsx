"use client";
import LocalizedText from "@/components/LocalizedText";
import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";
import { motion, AnimatePresence } from "framer-motion";
import { UserCog, Plus, Search, Star, Layers, Users, Mail, Phone, X, Loader2, Edit2, Trash2, Eye, Award, Briefcase, List, LayoutGrid, ArrowUpRight, CheckCircle2, UserCheck } from "lucide-react";
import Link from "next/link";
import CreateInstituteLoginButton from "@/components/CreateInstituteLoginButton";

interface Instructor {
  id: number;
  user_id?: number | null;
  name: string;
  email?: string;
  phone?: string;
  bio?: string;
  expertise?: string;
  qualification?: string;
  experience_years?: number;
  photo_url?: string;
  is_active: boolean;
  avg_rating: number;
  batch_count: number;
  active_batches: number;
  upcoming_batches: number;
  past_batches: number;
  total_students: number;
  created_at: string;
}

export default function InstructorsPage() {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [showModal, setShowModal] = useState(false);
  const [editInstructor, setEditInstructor] = useState<Instructor | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", bio: "", expertise: "", qualification: "", experience_years: "", is_active: true });
  const [saving, setSaving] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/instructors`);
      const d = await r.json();
      setInstructors(d.instructors || []);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetch_(); }, []);

  const filtered = instructors.filter(i =>
    !search ||
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.expertise || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.phone || "").toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditInstructor(null);
    setForm({ name: "", email: "", phone: "", bio: "", expertise: "", qualification: "", experience_years: "", is_active: true });
    setShowModal(true);
  };
  const openEdit = (i: Instructor) => {
    setEditInstructor(i);
    setForm({ name: i.name, email: i.email || "", phone: i.phone || "", bio: i.bio || "", expertise: i.expertise || "", qualification: i.qualification || "", experience_years: i.experience_years?.toString() || "", is_active: i.is_active });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, experience_years: form.experience_years ? parseInt(form.experience_years) : null };
      const url = editInstructor ? `${API_BASE_URL}/instructors/${editInstructor.id}` : `${API_BASE_URL}/instructors`;
      await fetch(url, { method: editInstructor ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setShowModal(false);
      fetch_();
    } catch (e) {
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete instructor?")) return;
    await fetch(`${API_BASE_URL}/instructors/${id}`, { method: "DELETE" });
    fetch_();
  };

  const activeCount = instructors.filter(i => i.is_active).length;
  const avgRating = instructors.length ? (instructors.reduce((a, i) => a + (i.avg_rating || 0), 0) / instructors.length).toFixed(1) : "—";
  const totalStudents = instructors.reduce((a, i) => a + (i.total_students || 0), 0);

  return (
    <div className="space-y-4">
      {/* Executive Compact Header */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-xs shrink-0">
            <UserCog className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                <LocalizedText text={"Instructors"} /></h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-300 border border-slate-200/80 dark:border-white/5">
                {instructors.length} <LocalizedText text={"total"} /> </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              <LocalizedText text={"Manage faculty, course instructors, and teaching performance"} /></p>
          </div>
        </div>

        <button
          onClick={openCreate}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs shadow-amber-500/20 transition-all hover:opacity-95 active:scale-95"
        >
          <Plus className="w-4 h-4" /> <LocalizedText text={"Add Instructor"} /></button>
      </div>

      {/* High-density Compact Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: "Total Instructors", value: instructors.length, icon: UserCog, c: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10" },
          { label: "Active Faculty", value: activeCount, icon: CheckCircle2, c: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
          { label: "Average Rating", value: avgRating, icon: Star, c: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10" },
          { label: "Total Students", value: totalStudents, icon: Users, c: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10" },
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
            placeholder="Search by instructor name, expertise, email, phone..."
            className="w-full h-8 pl-9 pr-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-1 border-l border-slate-200 dark:border-white/10 pl-2">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            title="List Card View"
            className={`p-1.5 rounded-lg border transition-all ${
              viewMode === "list"
                ? "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40"
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
                ? "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40"
                : "border-slate-200/80 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-[#111111]"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-500 w-8 h-8" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 text-center">
          <UserCog className="w-10 h-10 text-slate-300 dark:text-zinc-600 mb-2" />
          <p className="text-slate-600 dark:text-zinc-400 font-semibold text-sm"><LocalizedText text={"No instructors found"} /></p>
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-2">
          {/* Subtle column headers for desktop */}
          <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
            <div className="col-span-3"><LocalizedText text={"Instructor & Expertise"} /></div>
            <div className="col-span-3"><LocalizedText text={"Contact & Qualification"} /></div>
            <div className="col-span-3"><LocalizedText text={"Batches & Students"} /></div>
            <div className="col-span-1"><LocalizedText text={"Rating"} /></div>
            <div className="col-span-2 text-right"><LocalizedText text={"Actions"} /></div>
          </div>

          {filtered.map((ins, i) => (
            <motion.div
              key={ins.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.25) }}
              className="group rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-2.5 shadow-xs hover:border-amber-500/60 dark:hover:border-amber-500/50 hover:shadow-md transition-all duration-150"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
                {/* Identity */}
                <div className="col-span-1 sm:col-span-2 lg:col-span-3 min-w-0 flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs">
                    {ins.name[0]?.toUpperCase() || "I"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/instructors/${ins.id}`}
                      className="font-semibold text-sm text-slate-900 dark:text-white hover:text-amber-600 dark:hover:text-amber-400 transition-colors truncate flex items-center gap-1"
                      title={ins.name}
                    >
                      <span className="truncate">{ins.name}</span>
                      <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-amber-500 shrink-0" />
                    </Link>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] truncate">
                      {ins.expertise ? (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.2 rounded border border-amber-200/60 dark:border-amber-800/40 truncate max-w-[140px]">
                          {ins.expertise}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-zinc-500"><LocalizedText text={"General"} /></span>
                      )}
                      {!ins.is_active && (
                        <span className="text-[10px] text-rose-500 font-semibold px-1 rounded bg-rose-50 dark:bg-rose-950/40"><LocalizedText text={"Inactive"} /></span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contact & Qualification */}
                <div className="col-span-1 lg:col-span-3 min-w-0">
                  {ins.email ? (
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-300 truncate" title={ins.email}>
                      <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                      <a href={`mailto:${ins.email}`} className="truncate hover:text-amber-600">{ins.email}</a>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                    {ins.phone && (
                      <span className="flex items-center gap-1 truncate">
                        <Phone className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                        <span className="truncate">{ins.phone}</span>
                      </span>
                    )}
                    {ins.experience_years ? (
                      <span>• {ins.experience_years} <LocalizedText text={"yrs exp"} /></span>
                    ) : null}
                  </div>
                </div>

                {/* Batches & Students */}
                <div className="col-span-1 lg:col-span-3 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-zinc-300 border border-slate-200/60 dark:border-white/5">
                      <Layers className="w-2.5 h-2.5 text-amber-500" />
                      <span>{ins.active_batches} <LocalizedText text={"active"} /></span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40">
                      <Users className="w-2.5 h-2.5 text-blue-500" />
                      <span>{ins.total_students} <LocalizedText text={"students"} /></span>
                    </span>
                  </div>
                </div>

                {/* Rating */}
                <div className="col-span-1 lg:col-span-1 min-w-0">
                  <div className="flex items-center gap-1 text-xs font-bold text-slate-800 dark:text-zinc-200">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                    <span>{ins.avg_rating > 0 ? ins.avg_rating.toFixed(1) : "—"}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="col-span-1 sm:col-span-2 lg:col-span-2 flex items-center justify-end gap-1.5">
                  <div className="shrink-0">
                    <CreateInstituteLoginButton profileId={ins.id} profileKind="instructors" hasAccount={Boolean(ins.user_id)} hasEmail={Boolean(ins.email)} onCreated={fetch_} />
                  </div>
                  <Link
                    href={`/instructors/${ins.id}`}
                    title="View Performance"
                    className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300 dark:hover:bg-amber-500/20 dark:hover:text-amber-300 text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={() => openEdit(ins)}
                    title="Edit Instructor"
                    className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(ins.id)}
                    title="Delete Instructor"
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
          {filtered.map((ins, i) => (
            <motion.div
              key={ins.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.25) }}
              className="rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-4 shadow-xs hover:border-amber-500/60 dark:hover:border-amber-500/50 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs">
                      {ins.name[0]?.toUpperCase() || "I"}
                    </div>
                    <div className="min-w-0">
                      <Link href={`/instructors/${ins.id}`} className="font-semibold text-sm text-slate-900 dark:text-white hover:text-amber-600 truncate block">
                        {ins.name}
                      </Link>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium truncate">{ins.expertise || "Instructor"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    <span>{ins.avg_rating > 0 ? ins.avg_rating.toFixed(1) : "—"}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 text-center mb-2.5">
                  <div><p className="text-sm font-bold text-slate-900 dark:text-white">{ins.active_batches}</p><p className="text-[10px] text-slate-400"><LocalizedText text={"Active"} /></p></div>
                  <div><p className="text-sm font-bold text-slate-900 dark:text-white">{ins.upcoming_batches}</p><p className="text-[10px] text-slate-400"><LocalizedText text={"Upcoming"} /></p></div>
                  <div><p className="text-sm font-bold text-slate-900 dark:text-white">{ins.total_students}</p><p className="text-[10px] text-slate-400"><LocalizedText text={"Students"} /></p></div>
                </div>

                <div className="space-y-1 text-xs text-slate-600 dark:text-zinc-300 mb-2.5">
                  {ins.email && <div className="flex items-center gap-1.5 truncate"><Mail className="w-3 h-3 text-slate-400 shrink-0" /><span className="truncate">{ins.email}</span></div>}
                  {ins.phone && <div className="flex items-center gap-1.5 truncate"><Phone className="w-3 h-3 text-slate-400 shrink-0" /><span className="truncate">{ins.phone}</span></div>}
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-1.5">
                <CreateInstituteLoginButton profileId={ins.id} profileKind="instructors" hasAccount={Boolean(ins.user_id)} hasEmail={Boolean(ins.email)} onCreated={fetch_} />
                <div className="flex items-center gap-1">
                  <Link href={`/instructors/${ins.id}`} title="View" className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-amber-50 text-slate-500">
                    <Eye className="w-3.5 h-3.5" />
                  </Link>
                  <button onClick={() => openEdit(ins)} title="Edit" className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-slate-100 text-slate-500">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(ins.id)} title="Delete" className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-rose-50 text-slate-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-zinc-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editInstructor ? "Edit Instructor" : "Add Instructor"}</h2>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { l: "Full Name *", k: "name", p: "Instructor name", col: 2 },
                  { l: "Email", k: "email", p: "email@example.com" },
                  { l: "Phone", k: "phone", p: "+91 XXXXX" },
                  { l: "Expertise", k: "expertise", p: "e.g. Python, Web Dev" },
                  { l: "Qualification", k: "qualification", p: "e.g. M.Tech, B.E" },
                  { l: "Experience (Years)", k: "experience_years", p: "e.g. 5", t: "number" }
                ].map((f: any) => (
                  <div key={f.k} className={f.col === 2 ? "col-span-2" : ""}>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-300 mb-1">{f.l}</label>
                    <input type={f.t || "text"} value={(form as any)[f.k]} onChange={e => setForm({ ...form, [f.k]: e.target.value })} placeholder={f.p} className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-amber-500" />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-300 mb-1"><LocalizedText text={"Bio"} /></label>
                  <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={2} placeholder="Short bio..." className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 resize-none" />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 accent-amber-500" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300"><LocalizedText text={"Instructor is Active"} /></span>
                </div>
              </div>
              <div className="flex gap-2.5 mt-5">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 font-semibold text-xs sm:text-sm hover:bg-slate-200"><LocalizedText text={"Cancel"} /></button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold text-xs sm:text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-xs">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editInstructor ? "Update" : "Add Instructor"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
