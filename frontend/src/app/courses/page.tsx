"use client";
import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, Search, Users, Clock, DollarSign, Edit2, Trash2, Eye, ChevronRight, X, Loader2, GraduationCap, Layers, Star } from "lucide-react";
import Link from "next/link";

interface Course { id: number; title: string; description?: string; category?: string; duration_weeks?: number; duration_hours?: number; price: number; advance_amount: number; thumbnail_url?: string; is_active: boolean; batch_count: number; enrollment_count: number; created_at: string; }

const CATEGORIES = ["Programming", "Design", "Data Science", "Business", "Marketing", "Finance", "Healthcare", "Engineering", "Language", "Other"];
const GRADIENTS: Record<string,string> = { Programming:"from-violet-500 to-indigo-600", Design:"from-pink-500 to-rose-500", "Data Science":"from-cyan-500 to-blue-600", Business:"from-amber-500 to-orange-500", Marketing:"from-green-500 to-emerald-600", Finance:"from-teal-500 to-cyan-600", Healthcare:"from-red-500 to-pink-600", Engineering:"from-slate-500 to-gray-600", Language:"from-purple-500 to-violet-600", Other:"from-zinc-500 to-neutral-600" };

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [form, setForm] = useState({ title:"", description:"", category:"Programming", duration_weeks:"", duration_hours:"", price:"", advance_amount:"", prerequisites:"", is_active:true });
  const [saving, setSaving] = useState(false);

  const fetchCourses = async () => { setLoading(true); try { const res = await fetch(`${API_BASE_URL}/courses`); const data = await res.json(); if (!res.ok) throw new Error(data.detail || "Could not load courses."); setCourses(Array.isArray(data.courses) ? data.courses : []); } catch(e) { setCourses([]); } finally { setLoading(false); } };
  useEffect(() => { fetchCourses(); }, []);

  const filtered = courses.filter(c => (!search || c.title.toLowerCase().includes(search.toLowerCase()) || (c.category||"").toLowerCase().includes(search.toLowerCase())) && (filterCat === "All" || c.category === filterCat));

  const openCreate = () => { setEditCourse(null); setForm({ title:"", description:"", category:"Programming", duration_weeks:"", duration_hours:"", price:"", advance_amount:"", prerequisites:"", is_active:true }); setShowModal(true); };
  const openEdit = (c: Course) => { setEditCourse(c); setForm({ title:c.title, description:c.description||"", category:c.category||"Programming", duration_weeks:c.duration_weeks?.toString()||"", duration_hours:c.duration_hours?.toString()||"", price:c.price.toString(), advance_amount:c.advance_amount.toString(), prerequisites:"", is_active:c.is_active }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = { title:form.title, description:form.description, category:form.category, duration_weeks:form.duration_weeks?parseInt(form.duration_weeks):null, duration_hours:form.duration_hours?parseInt(form.duration_hours):null, price:parseFloat(form.price)||0, advance_amount:parseFloat(form.advance_amount)||0, prerequisites:form.prerequisites, is_active:form.is_active };
      await fetch(editCourse ? `${API_BASE_URL}/courses/${editCourse.id}` : `${API_BASE_URL}/courses`, { method: editCourse?"PATCH":"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
      setShowModal(false); fetchCourses();
    } catch(e){} finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => { if (!confirm("Delete this course?")) return; await fetch(`${API_BASE_URL}/courses/${id}`, { method:"DELETE" }); fetchCourses(); };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center"><BookOpen className="w-5 h-5 text-white" /></div>
            Course Catalog
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 mt-1">Manage all courses offered by the institute</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:opacity-90 transition shadow-lg shadow-violet-500/20">
          <Plus className="w-4 h-4" /> Add Course
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{label:"Total Courses",value:courses.length,icon:BookOpen,color:"violet"},{label:"Active",value:courses.filter(c=>c.is_active).length,icon:Star,color:"green"},{label:"Total Batches",value:courses.reduce((a,c)=>a+c.batch_count,0),icon:Layers,color:"blue"},{label:"Students Enrolled",value:courses.reduce((a,c)=>a+c.enrollment_count,0),icon:GraduationCap,color:"amber"}].map((s,i)=>(
          <motion.div key={s.label} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}} className="glass-card rounded-2xl p-5 border border-white/10">
            <div className="flex items-center justify-between mb-3"><p className="text-slate-500 dark:text-zinc-400 text-sm">{s.label}</p><s.icon className={`w-4 h-4 text-${s.color}-400`} /></div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{s.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search courses..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-500 focus:outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-zinc-500" /></div>
        <div className="flex gap-2 flex-wrap">{["All",...CATEGORIES].map(cat=><button key={cat} onClick={()=>setFilterCat(cat)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filterCat===cat?"bg-violet-600 text-white":"border border-slate-200 bg-white text-slate-600 hover:text-violet-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-white"}`}>{cat}</button>)}</div>
      </div>

      {loading ? <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-violet-400" /></div> : filtered.length===0 ? <div className="text-center py-20 text-zinc-500"><BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-medium">No courses found</p></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((course,i)=>(
            <motion.div key={course.id} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.04}} className="glass-card rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden hover:border-violet-500/40 transition-all">
              <div className={`h-28 bg-gradient-to-br ${GRADIENTS[course.category||"Other"]||GRADIENTS.Other} relative flex items-center justify-center`}>
                <BookOpen className="w-12 h-12 text-white/30" />
                <div className="absolute top-3 right-3 flex gap-2">
                  <button onClick={()=>openEdit(course)} className="p-1.5 bg-black/30 rounded-lg hover:bg-black/50 transition"><Edit2 className="w-3.5 h-3.5 text-white" /></button>
                  <button onClick={()=>handleDelete(course.id)} className="p-1.5 bg-black/30 rounded-lg hover:bg-red-500/50 transition"><Trash2 className="w-3.5 h-3.5 text-white" /></button>
                </div>
                {!course.is_active&&<div className="absolute top-3 left-3 px-2 py-0.5 bg-red-500/80 rounded-full text-xs text-white">Inactive</div>}
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-slate-900 dark:text-white font-semibold text-lg leading-tight">{course.title}</h3>
                    {course.category&&<span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded-full text-xs font-medium whitespace-nowrap">{course.category}</span>}
                  </div>
                  {course.description&&<p className="text-slate-600 dark:text-zinc-400 text-sm mt-1 line-clamp-2">{course.description}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-zinc-300"><DollarSign className="w-3.5 h-3.5 text-green-500" /><span>₹{course.price.toLocaleString()}</span></div>
                  {course.duration_weeks&&<div className="flex items-center gap-1.5 text-slate-700 dark:text-zinc-300"><Clock className="w-3.5 h-3.5 text-blue-500" /><span>{course.duration_weeks} weeks</span></div>}
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-zinc-300"><Layers className="w-3.5 h-3.5 text-amber-500" /><span>{course.batch_count} batches</span></div>
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-zinc-300"><Users className="w-3.5 h-3.5 text-violet-500" /><span>{course.enrollment_count} enrolled</span></div>
                </div>
                <Link href={`/courses/${course.id}`} className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-500/40 hover:bg-violet-50 hover:text-violet-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-violet-500/20 dark:hover:text-violet-300 text-sm font-medium transition">
                  <Eye className="w-4 h-4" /> View Details <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}} className="bg-white border border-slate-200 dark:bg-zinc-900 dark:border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{editCourse?"Edit Course":"Add New Course"}</h2>
                <button onClick={()=>setShowModal(false)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2"><label className="block text-sm text-slate-600 dark:text-zinc-400 mb-1.5">Course Title *</label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Full Stack Web Development" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-zinc-600" /></div>
                  <div><label className="block text-sm text-slate-600 dark:text-zinc-400 mb-1.5">Category</label><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white">{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                  <div><label className="block text-sm text-slate-600 dark:text-zinc-400 mb-1.5">Course Price (₹)</label><input value={form.price} onChange={e=>setForm({...form,price:e.target.value})} type="number" placeholder="0" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-zinc-600" /></div>
                  <div><label className="block text-sm text-slate-600 dark:text-zinc-400 mb-1.5">Advance Amount (₹)</label><input value={form.advance_amount} onChange={e=>setForm({...form,advance_amount:e.target.value})} type="number" placeholder="0" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-zinc-600" /></div>
                  <div><label className="block text-sm text-slate-600 dark:text-zinc-400 mb-1.5">Duration (Weeks)</label><input value={form.duration_weeks} onChange={e=>setForm({...form,duration_weeks:e.target.value})} type="number" placeholder="e.g. 12" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-zinc-600" /></div>
                  <div><label className="block text-sm text-slate-600 dark:text-zinc-400 mb-1.5">Total Hours</label><input value={form.duration_hours} onChange={e=>setForm({...form,duration_hours:e.target.value})} type="number" placeholder="e.g. 120" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-zinc-600" /></div>
                  <div className="col-span-2"><label className="block text-sm text-slate-600 dark:text-zinc-400 mb-1.5">Description</label><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={3} placeholder="Course overview..." className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 resize-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-zinc-600" /></div>
                  <div className="col-span-2"><label className="block text-sm text-slate-600 dark:text-zinc-400 mb-1.5">Prerequisites</label><textarea value={form.prerequisites} onChange={e=>setForm({...form,prerequisites:e.target.value})} rows={2} placeholder="What students need to know..." className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 resize-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-zinc-600" /></div>
                  <div className="col-span-2 flex items-center gap-3"><input type="checkbox" id="is_active" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})} className="w-4 h-4 accent-violet-500" /><label htmlFor="is_active" className="text-sm text-slate-700 dark:text-zinc-300">Course is Active</label></div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={()=>setShowModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:text-white transition">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving&&<Loader2 className="w-4 h-4 animate-spin" />}{editCourse?"Update":"Create Course"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
