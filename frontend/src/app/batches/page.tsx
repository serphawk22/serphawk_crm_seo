"use client";
import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Plus, Search, Users, Calendar, X, Loader2, Edit2, Trash2, Eye, MapPin, Monitor, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";

interface Batch { id: number; batch_name: string; batch_code?: string; course_id: number; course_title?: string; instructor_id?: number; instructor_name?: string; start_date?: string; end_date?: string; schedule?: string; session_duration_hours?: number; assignment_strategy?: string; mode: string; max_seats: number; enrolled_count: number; available_seats: number; status: string; room_or_link?: string; }
interface Course { id: number; title: string; }
interface Instructor { id: number; name: string; }

const STATUS_STYLES: Record<string,string> = { Upcoming:"bg-blue-500/20 text-blue-400 border-blue-500/30", Active:"bg-green-500/20 text-green-400 border-green-500/30", Completed:"bg-zinc-500/20 text-zinc-400 border-zinc-500/30", Cancelled:"bg-red-500/20 text-red-400 border-red-500/30" };
const MODE_ICONS: Record<string,any> = { Online:Monitor, Offline:MapPin, Hybrid:Monitor };

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editBatch, setEditBatch] = useState<Batch | null>(null);
  const [form, setForm] = useState({ course_id:"", instructor_id:"", batch_name:"", batch_code:"", start_date:"", end_date:"", schedule:"", session_duration_hours:"1", auto_assign_instructor:true, assignment_strategy:"round_robin", mode:"Offline", max_seats:"30", status:"Upcoming", room_or_link:"", notes:"" });
  const [saving, setSaving] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try {
      const [br, cr, ir] = await Promise.all([fetch(`${API_BASE_URL}/batches`), fetch(`${API_BASE_URL}/courses`), fetch(`${API_BASE_URL}/instructors`)]);
      const [bd, cd, id_] = await Promise.all([br.json(), cr.json(), ir.json()]);
      setBatches(bd.batches||[]); setCourses(cd.courses||[]); setInstructors(id_.instructors||[]);
    } catch(e){} finally { setLoading(false); }
  };
  useEffect(()=>{ fetch_(); },[]);

  const filtered = batches.filter(b => (!search || b.batch_name.toLowerCase().includes(search.toLowerCase()) || (b.course_title||"").toLowerCase().includes(search.toLowerCase())) && (filterStatus==="All" || b.status===filterStatus));

  const openCreate = () => { setEditBatch(null); setForm({ course_id:"",instructor_id:"",batch_name:"",batch_code:"",start_date:"",end_date:"",schedule:"",session_duration_hours:"1",auto_assign_instructor:true,assignment_strategy:"round_robin",mode:"Offline",max_seats:"30",status:"Upcoming",room_or_link:"",notes:"" }); setShowModal(true); };
  const openEdit = (b: Batch) => { setEditBatch(b); setForm({ course_id:b.course_id.toString(),instructor_id:b.instructor_id?.toString()||"",batch_name:b.batch_name,batch_code:b.batch_code||"",start_date:b.start_date?.split("T")[0]||"",end_date:b.end_date?.split("T")[0]||"",schedule:b.schedule||"",session_duration_hours:String(b.session_duration_hours||1),auto_assign_instructor:false,assignment_strategy:b.assignment_strategy||"manual",mode:b.mode,max_seats:b.max_seats.toString(),status:b.status,room_or_link:b.room_or_link||"",notes:"" }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.batch_name.trim() || !form.course_id) return;
    setSaving(true);
    try {
      const payload = { ...form, course_id:parseInt(form.course_id), instructor_id:form.instructor_id?parseInt(form.instructor_id):null, session_duration_hours:parseInt(form.session_duration_hours), auto_assign_instructor:!editBatch && form.auto_assign_instructor, assignment_strategy:editBatch ? "manual" : form.assignment_strategy, max_seats:parseInt(form.max_seats)||30, start_date:form.start_date||null, end_date:form.end_date||null };
      const url = editBatch ? `${API_BASE_URL}/batches/${editBatch.id}` : `${API_BASE_URL}/batches`;
      await fetch(url, { method:editBatch?"PATCH":"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
      setShowModal(false); fetch_();
    } catch(e){} finally { setSaving(false); }
  };
  const handleDelete = async (id: number) => { if(!confirm("Delete batch?")) return; await fetch(`${API_BASE_URL}/batches/${id}`,{method:"DELETE"}); fetch_(); };

  const fillRate = (b: Batch) => b.max_seats > 0 ? Math.round((b.enrolled_count / b.max_seats) * 100) : 0;

  return (
    <div className="institute-ops-page space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center"><Layers className="w-5 h-5 text-white" /></div>
            Batches
          </h1>
          <p className="text-zinc-400 mt-1">Manage course batches and schedules</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 whitespace-nowrap px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold hover:opacity-90 transition shadow-lg shadow-blue-500/20">
          <Plus className="w-4 h-4" /> Create Batch
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{l:"Total",v:batches.length,c:"blue"},{l:"Active",v:batches.filter(b=>b.status==="Active").length,c:"green"},{l:"Upcoming",v:batches.filter(b=>b.status==="Upcoming").length,c:"cyan"},{l:"Completed",v:batches.filter(b=>b.status==="Completed").length,c:"zinc"}].map((s,i)=>(
          <motion.div key={s.l} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}} className="glass-card rounded-2xl p-5 border border-white/10">
            <p className={`text-${s.c}-400 text-sm mb-2`}>{s.l} Batches</p>
            <p className="text-3xl font-bold text-white">{s.v}</p>
          </motion.div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search batches or courses..." className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" /></div>
        <div className="flex flex-wrap gap-2">{["All","Upcoming","Active","Completed","Cancelled"].map(st=><button key={st} onClick={()=>setFilterStatus(st)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filterStatus===st?"bg-blue-600 text-white":"bg-white/5 text-zinc-400 hover:text-white border border-white/10"}`}>{st}</button>)}</div>
      </div>

      {loading ? <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.length===0 ? <div className="col-span-3 text-center py-20 text-zinc-500"><Layers className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No batches found</p></div> :
          filtered.map((b,i)=>{
            const fr = fillRate(b);
            const ModeIcon = MODE_ICONS[b.mode]||MapPin;
            return (
              <motion.div key={b.id} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.04}} className="glass-card rounded-2xl border border-white/10 p-5 hover:border-blue-500/40 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[b.status]||STATUS_STYLES.Upcoming}`}>{b.status}</span>
                      <span className="px-2 py-0.5 bg-white/10 rounded-full text-xs text-zinc-400 flex items-center gap-1"><ModeIcon className="w-3 h-3" />{b.mode}</span>
                    </div>
                    <h3 className="text-white font-semibold text-lg">{b.batch_name}</h3>
                    {b.batch_code&&<p className="text-zinc-500 text-xs">Code: {b.batch_code}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={()=>openEdit(b)} className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={()=>handleDelete(b.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-zinc-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                {b.course_title&&<p className="text-blue-400 text-sm font-medium mb-3">{b.course_title}</p>}
                {b.instructor_name&&<p className="text-zinc-400 text-sm mb-1">Instructor: {b.instructor_name}</p>}
                <p className="text-zinc-500 text-xs mb-3">{b.session_duration_hours || 1} hour slot · {b.assignment_strategy === "performance" ? "Performance assigned" : b.assignment_strategy === "round_robin" ? "Round-robin assigned" : "Manual assignment"}</p>

                <div className="space-y-1.5 mb-3 text-sm text-zinc-400">
                  {b.schedule&&<div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" />{b.schedule}</div>}
                  {b.start_date&&<div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" />{new Date(b.start_date).toLocaleDateString()} {b.end_date?`→ ${new Date(b.end_date).toLocaleDateString()}`:""}</div>}
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs text-zinc-400 mb-1.5"><span>{b.enrolled_count} / {b.max_seats} seats</span><span>{fr}% full</span></div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${fr>=90?"bg-red-500":fr>=70?"bg-amber-500":"bg-blue-500"}`} style={{width:`${fr}%`}} /></div>
                </div>

                <Link href={`/batches/${b.id}`} className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-white/5 hover:bg-blue-500/20 border border-white/10 hover:border-blue-500/40 text-zinc-300 hover:text-blue-300 text-sm font-medium transition">
                  <Eye className="w-4 h-4" /> View Students <ChevronRight className="w-4 h-4" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showModal&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}} className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">{editBatch?"Edit Batch":"Create New Batch"}</h2>
                <button onClick={()=>setShowModal(false)} className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm text-zinc-400 mb-1.5">Course *</label><select value={form.course_id} onChange={e=>setForm({...form,course_id:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500"><option value="" className="bg-zinc-800">Select course</option>{courses.map(c=><option key={c.id} value={c.id} className="bg-zinc-800">{c.title}</option>)}</select></div>
                <div><label className="block text-sm text-zinc-400 mb-1.5">Instructor</label><select value={form.instructor_id} disabled={!editBatch && form.auto_assign_instructor} onChange={e=>setForm({...form,instructor_id:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"><option value="" className="bg-zinc-800">{form.auto_assign_instructor && !editBatch ? "Assigned automatically" : "Select instructor"}</option>{instructors.map(i=><option key={i.id} value={i.id} className="bg-zinc-800">{i.name}</option>)}</select></div>
                {!editBatch && <div className="col-span-2 grid gap-3 sm:grid-cols-[1fr_1fr]"><label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={form.auto_assign_instructor} onChange={e=>setForm({...form,auto_assign_instructor:e.target.checked})} className="accent-emerald-500" />Auto-assign instructor</label><select aria-label="Instructor assignment method" value={form.assignment_strategy} onChange={e=>setForm({...form,assignment_strategy:e.target.value})} disabled={!form.auto_assign_instructor} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white disabled:opacity-50"><option value="round_robin" className="bg-zinc-800">Balanced round-robin</option><option value="performance" className="bg-zinc-800">Highest instructor performance</option></select></div>}
                <div><label className="block text-sm text-zinc-400 mb-1.5">Batch Name *</label><input value={form.batch_name} onChange={e=>setForm({...form,batch_name:e.target.value})} placeholder="e.g. Batch Jan 2025" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" /></div>
                <div><label className="block text-sm text-zinc-400 mb-1.5">Batch Code</label><input value={form.batch_code} onChange={e=>setForm({...form,batch_code:e.target.value})} placeholder="e.g. WD-JAN-25" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" /></div>
                <div><label className="block text-sm text-zinc-400 mb-1.5">Start Date</label><input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500" /></div>
                <div><label className="block text-sm text-zinc-400 mb-1.5">End Date</label><input type="date" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500" /></div>
                <div><label className="block text-sm text-zinc-400 mb-1.5">Class slot length</label><select value={form.session_duration_hours} onChange={e=>setForm({...form,session_duration_hours:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500">{[1,2,3,4].map(hours=><option key={hours} value={hours} className="bg-zinc-800">{hours} hour{hours===1?"":"s"}</option>)}</select></div>
                <div><label className="block text-sm text-zinc-400 mb-1.5">Mode</label><select value={form.mode} onChange={e=>setForm({...form,mode:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500"><option className="bg-zinc-800">Online</option><option className="bg-zinc-800">Offline</option><option className="bg-zinc-800">Hybrid</option></select></div>
                <div><label className="block text-sm text-zinc-400 mb-1.5">Max Seats</label><input type="number" value={form.max_seats} onChange={e=>setForm({...form,max_seats:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500" /></div>
                <div><label className="block text-sm text-zinc-400 mb-1.5">Status</label><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500"><option className="bg-zinc-800">Upcoming</option><option className="bg-zinc-800">Active</option><option className="bg-zinc-800">Completed</option><option className="bg-zinc-800">Cancelled</option></select></div>
                <div><label className="block text-sm text-zinc-400 mb-1.5">Room / Link</label><input value={form.room_or_link} onChange={e=>setForm({...form,room_or_link:e.target.value})} placeholder="Room no. or meeting link" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" /></div>
                <div className="col-span-2"><label className="block text-sm text-zinc-400 mb-1.5">Schedule</label><input value={form.schedule} onChange={e=>setForm({...form,schedule:e.target.value})} placeholder="e.g. Mon-Wed-Fri 10am-12pm" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={()=>setShowModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving&&<Loader2 className="w-4 h-4 animate-spin" />}{editBatch?"Update":"Create Batch"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
