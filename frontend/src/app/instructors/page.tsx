"use client";
import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";
import { motion, AnimatePresence } from "framer-motion";
import { UserCog, Plus, Search, Star, Layers, Users, Mail, Phone, X, Loader2, Edit2, Trash2, Eye, Award, Briefcase } from "lucide-react";
import Link from "next/link";
import CreateInstituteLoginButton from "@/components/CreateInstituteLoginButton";

interface Instructor { id: number; user_id?: number | null; name: string; email?: string; phone?: string; bio?: string; expertise?: string; qualification?: string; experience_years?: number; photo_url?: string; is_active: boolean; avg_rating: number; batch_count: number; active_batches: number; upcoming_batches: number; past_batches: number; total_students: number; created_at: string; }

export default function InstructorsPage() {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editInstructor, setEditInstructor] = useState<Instructor | null>(null);
  const [form, setForm] = useState({ name:"", email:"", phone:"", bio:"", expertise:"", qualification:"", experience_years:"", is_active:true });
  const [saving, setSaving] = useState(false);

  const fetch_ = async () => { setLoading(true); try { const r = await fetch(`${API_BASE_URL}/instructors`); const d = await r.json(); setInstructors(d.instructors||[]); } catch(e){} finally { setLoading(false); } };
  useEffect(()=>{ fetch_(); },[]);

  const filtered = instructors.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.expertise||"").toLowerCase().includes(search.toLowerCase()));

  const openCreate = () => { setEditInstructor(null); setForm({ name:"",email:"",phone:"",bio:"",expertise:"",qualification:"",experience_years:"",is_active:true }); setShowModal(true); };
  const openEdit = (i: Instructor) => { setEditInstructor(i); setForm({ name:i.name, email:i.email||"", phone:i.phone||"", bio:i.bio||"", expertise:i.expertise||"", qualification:i.qualification||"", experience_years:i.experience_years?.toString()||"", is_active:i.is_active }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, experience_years: form.experience_years ? parseInt(form.experience_years) : null };
      const url = editInstructor ? `${API_BASE_URL}/instructors/${editInstructor.id}` : `${API_BASE_URL}/instructors`;
      await fetch(url, { method:editInstructor?"PATCH":"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
      setShowModal(false); fetch_();
    } catch(e){} finally { setSaving(false); }
  };
  const handleDelete = async (id: number) => { if(!confirm("Delete instructor?")) return; await fetch(`${API_BASE_URL}/instructors/${id}`,{method:"DELETE"}); fetch_(); };

  const renderStars = (rating: number) => Array.from({length:5},(_,i)=><Star key={i} className={`w-3.5 h-3.5 ${i<Math.round(rating)?"text-amber-400 fill-amber-400":"text-zinc-600"}`} />);

  return (
    <div className="institute-ops-page space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center"><UserCog className="w-5 h-5 text-white" /></div>
            Instructors
          </h1>
          <p className="text-zinc-400 mt-1">Manage instructors and track their performance</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 whitespace-nowrap px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold hover:opacity-90 transition shadow-lg shadow-amber-500/20">
          <Plus className="w-4 h-4" /> Add Instructor
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{l:"Total Instructors",v:instructors.length,c:"amber"},{l:"Active",v:instructors.filter(i=>i.is_active).length,c:"green"},{l:"Avg Rating",v:instructors.length?((instructors.reduce((a,i)=>a+i.avg_rating,0)/instructors.length).toFixed(1)):"—",c:"yellow"},{l:"Total Students",v:instructors.reduce((a,i)=>a+i.total_students,0),c:"blue"}].map((s,i)=>(
          <motion.div key={s.l} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}} className="glass-card rounded-2xl p-5 border border-white/10">
            <p className={`text-${s.c}-400 text-sm mb-2`}>{s.l}</p>
            <p className="text-3xl font-bold text-white">{s.v}</p>
          </motion.div>
        ))}
      </div>

      <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search instructors..." className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500" /></div>

      {loading ? <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((ins,i)=>(
            <motion.div key={ins.id} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.04}} className="glass-card rounded-2xl border border-white/10 overflow-hidden hover:border-amber-500/40 transition-all">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-lg">{ins.name[0]}</div>
                    <div>
                      <h3 className="text-white font-semibold text-lg">{ins.name}</h3>
                      {ins.expertise&&<p className="text-amber-400 text-xs font-medium">{ins.expertise}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <CreateInstituteLoginButton profileId={ins.id} profileKind="instructors" hasAccount={Boolean(ins.user_id)} hasEmail={Boolean(ins.email)} onCreated={fetch_} />
                    <button onClick={()=>openEdit(ins)} className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={()=>handleDelete(ins.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-zinc-400 hover:text-red-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                <div className="flex items-center gap-1 mb-4">{renderStars(ins.avg_rating)}<span className="text-amber-400 text-sm ml-1 font-medium">{ins.avg_rating||"—"}</span></div>

                {ins.bio&&<p className="text-zinc-400 text-sm mb-4 line-clamp-2">{ins.bio}</p>}

                <div className="grid grid-cols-2 gap-2 mb-4 sm:grid-cols-4">
                  <div className="text-center p-2 bg-white/5 rounded-xl"><p className="text-xl font-bold text-white">{ins.total_students}</p><p className="text-xs text-zinc-500">Students</p></div>
                  <div className="text-center p-2 bg-white/5 rounded-xl"><p className="text-xl font-bold text-white">{ins.active_batches}</p><p className="text-xs text-zinc-500">Ongoing</p></div>
                  <div className="text-center p-2 bg-white/5 rounded-xl"><p className="text-xl font-bold text-white">{ins.upcoming_batches}</p><p className="text-xs text-zinc-500">Upcoming</p></div>
                  <div className="text-center p-2 bg-white/5 rounded-xl"><p className="text-xl font-bold text-white">{ins.past_batches}</p><p className="text-xs text-zinc-500">Past</p></div>
                </div>

                <div className="space-y-1.5">
                  {ins.email&&<div className="flex items-center gap-2 text-sm text-zinc-400"><Mail className="w-3.5 h-3.5" />{ins.email}</div>}
                  {ins.phone&&<div className="flex items-center gap-2 text-sm text-zinc-400"><Phone className="w-3.5 h-3.5" />{ins.phone}</div>}
                  {ins.qualification&&<div className="flex items-center gap-2 text-sm text-zinc-400"><Award className="w-3.5 h-3.5" />{ins.qualification}</div>}
                  {ins.experience_years&&<div className="flex items-center gap-2 text-sm text-zinc-400"><Briefcase className="w-3.5 h-3.5" />{ins.experience_years} years experience</div>}
                </div>

                {!ins.is_active&&<div className="mt-3 px-2 py-1 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium text-center">Inactive</div>}
                <Link href={`/instructors/${ins.id}`} className="mt-4 flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/40 text-zinc-300 hover:text-amber-300 text-sm font-medium transition">
                  <Eye className="w-4 h-4" /> View Performance
                </Link>
              </div>
            </motion.div>
          ))}
          {filtered.length===0&&<div className="col-span-3 text-center py-20 text-zinc-500"><UserCog className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No instructors found</p></div>}
        </div>
      )}

      <AnimatePresence>
        {showModal&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}} className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">{editInstructor?"Edit Instructor":"Add Instructor"}</h2>
                <button onClick={()=>setShowModal(false)} className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[{l:"Full Name *",k:"name",p:"Instructor name",col:2},{l:"Email",k:"email",p:"email@example.com"},{l:"Phone",k:"phone",p:"+91 XXXXX"},{l:"Expertise",k:"expertise",p:"e.g. Python, Web Dev"},{l:"Qualification",k:"qualification",p:"e.g. M.Tech, B.E"},{l:"Experience (Years)",k:"experience_years",p:"e.g. 5",t:"number"}].map((f:any)=>(
                  <div key={f.k} className={f.col===2?"col-span-2":""}>
                    <label className="block text-sm text-zinc-400 mb-1.5">{f.l}</label>
                    <input type={f.t||"text"} value={(form as any)[f.k]} onChange={e=>setForm({...form,[f.k]:e.target.value})} placeholder={f.p} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500" />
                  </div>
                ))}
                <div className="col-span-2"><label className="block text-sm text-zinc-400 mb-1.5">Bio</label><textarea value={form.bio} onChange={e=>setForm({...form,bio:e.target.value})} rows={3} placeholder="Short bio..." className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 resize-none" /></div>
                <div className="col-span-2 flex items-center gap-3"><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})} className="w-4 h-4 accent-amber-500" /><span className="text-sm text-zinc-300">Instructor is Active</span></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={()=>setShowModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving&&<Loader2 className="w-4 h-4 animate-spin" />}{editInstructor?"Update":"Add Instructor"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
