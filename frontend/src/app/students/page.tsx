"use client";
import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, Plus, Search, Phone, Mail, X, Loader2, Edit2, Trash2, Eye, ChevronRight, Filter, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import CreateInstituteLoginButton from "@/components/CreateInstituteLoginButton";
import { useRole } from "@/context/RoleContext";

interface Student { id: number; user_id?: number | null; name: string; email?: string; phone?: string; address?: string; gender?: string; qualification?: string; course_interest?: string; education_level?: string; gpa?: number | null; academic_background?: string; career_goal?: string; guardian_name?: string; guardian_phone?: string; assigned_salesperson_id?: number | null; source?: string; status: string; enrollment_count: number; active_course?: string; active_batch?: string; active_course_id?: number | null; active_batch_id?: number | null; created_at: string; }
interface Salesperson { id: number; name: string; role: string; }

const SOURCES = ["Walk-in","Referral","Online","Lead","Social Media","Phone Call","Other"];
const STATUSES = ["Active","Inactive","Dropped","Completed"];
const STATUS_STYLES: Record<string,string> = { Active:"bg-green-500/20 text-green-400 border-green-500/30", Inactive:"bg-zinc-500/20 text-zinc-400 border-zinc-500/30", Dropped:"bg-red-500/20 text-red-400 border-red-500/30", Completed:"bg-blue-500/20 text-blue-400 border-blue-500/30" };

export default function StudentsPage() {
  const { role } = useRole();
  const canManageStudents = ["Admin", "Employee", "Demo", "SuperAdmin"].includes(role);
  const canCreateLogin = ["Admin", "SuperAdmin"].includes(role);
  const [students, setStudents] = useState<Student[]>([]);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [form, setForm] = useState({ name:"", email:"", phone:"", address:"", gender:"", qualification:"", course_interest:"", education_level:"", gpa:"", academic_background:"", career_goal:"", guardian_name:"", guardian_phone:"", assigned_salesperson_id:"", source:"Walk-in", notes:"" });
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");

  const fetch_ = async () => {
    setLoading(true);
    setPageError("");
    try {
      const res = await fetch(`${API_BASE_URL}/students`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not load students.");
      setStudents(Array.isArray(data.students) ? data.students : []);
      fetch(`${API_BASE_URL}/users?role=SalesManager,Employee`).then(async response => {
        if (!response.ok) return;
        const usersData = await response.json();
        setSalespeople(Array.isArray(usersData.users) ? usersData.users : []);
      }).catch(() => setSalespeople([]));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not load students.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(()=>{ fetch_(); },[]);

  const filtered = students.filter(s => {
    const query = search.toLowerCase();
    const matchSearch = !query || s.name.toLowerCase().includes(query) || (s.email||"").toLowerCase().includes(query) || (s.phone||"").toLowerCase().includes(query);
    const matchStatus = filterStatus==="All" || s.status===filterStatus;
    return matchSearch && matchStatus;
  });

  const openCreate = () => { setEditStudent(null); setFormError(""); setForm({ name:"",email:"",phone:"",address:"",gender:"",qualification:"",course_interest:"",education_level:"",gpa:"",academic_background:"",career_goal:"",guardian_name:"",guardian_phone:"",assigned_salesperson_id:"",source:"Walk-in",notes:"" }); setShowModal(true); };
  const openEdit = (s: Student) => { setEditStudent(s); setFormError(""); setForm({ name:s.name, email:s.email||"", phone:s.phone||"", address:s.address||"", gender:s.gender||"", qualification:s.qualification||"", course_interest:s.course_interest||"", education_level:s.education_level||"", gpa:s.gpa == null ? "" : String(s.gpa), academic_background:s.academic_background||"", career_goal:s.career_goal||"", guardian_name:s.guardian_name||"", guardian_phone:s.guardian_phone||"", assigned_salesperson_id:s.assigned_salesperson_id == null ? "" : String(s.assigned_salesperson_id), source:s.source||"Walk-in", notes:"" }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError("Enter the student's name."); return; }
    if (form.gpa && (!Number.isFinite(Number(form.gpa)) || Number(form.gpa) < 0 || Number(form.gpa) > 10)) { setFormError("GPA must be between 0 and 10."); return; }
    setSaving(true);
    setFormError("");
    try {
      const url = editStudent ? `${API_BASE_URL}/students/${editStudent.id}` : `${API_BASE_URL}/students`;
      const response = await fetch(url, { method:editStudent?"PATCH":"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...form, gpa:form.gpa ? Number(form.gpa) : null, assigned_salesperson_id:form.assigned_salesperson_id && form.assigned_salesperson_id !== "auto" ? Number(form.assigned_salesperson_id) : null, auto_assign_salesperson:form.assigned_salesperson_id === "auto" }) });
      const data = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(data.detail) ? data.detail.map((item: any) => item.msg).join("; ") : data.detail;
        throw new Error(detail || "Could not save student.");
      }
      setShowModal(false); fetch_();
    } catch(error) {
      setFormError(error instanceof Error ? error.message : "Could not save student.");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this student?")) return;
    try {
      const response = await fetch(`${API_BASE_URL}/students/${id}`, { method:"DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not delete student.");
      fetch_();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not delete student.");
    }
  };

  const total = students.length, active = students.filter(s=>s.status==="Active").length, completed = students.filter(s=>s.status==="Completed").length, dropped = students.filter(s=>s.status==="Dropped").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-xl font-bold text-slate-900 dark:text-white sm:text-3xl">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center"><GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-white" /></div>
            Students
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Manage all enrolled and prospective students</p>
        </div>
        {canManageStudents && <button onClick={openCreate} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:opacity-90 sm:w-auto">
          <Plus className="w-4 h-4" /> Add Student
        </button>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{l:"Total Students",v:total,c:"emerald"},{l:"Active",v:active,c:"green"},{l:"Completed",v:completed,c:"blue"},{l:"Dropped",v:dropped,c:"red"}].map((s,i)=>(
          <motion.div key={s.l} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}} className="glass-card rounded-2xl p-4 sm:p-5 border border-white/10">
            <p className={`text-${s.c}-400 text-xs sm:text-sm mb-2`}>{s.l}</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{s.v}</p>
          </motion.div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, email, phone..." className="w-full rounded-xl border border-slate-200 bg-white px-10 py-2.5 text-slate-900 placeholder-slate-500 focus:border-emerald-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-zinc-500" /></div>
        <div className="flex flex-wrap gap-2">{["All",...STATUSES].map(st=><button key={st} onClick={()=>setFilterStatus(st)} className={`min-h-9 px-3 py-1.5 rounded-lg text-sm font-medium transition ${filterStatus===st?"bg-emerald-600 text-white":"bg-white/5 text-zinc-400 hover:text-white border border-white/10"}`}>{st}</button>)}</div>
      </div>

      {pageError && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{pageError}</div>}

      {loading ? <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div> : (
        <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-white/10 bg-white/5">
                {["Student","Contact","Course / Batch","Enrollments","Status","Actions"].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.length===0 ? <tr><td colSpan={6} className="text-center py-16 text-zinc-500"><GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No students found</p></td></tr> :
                filtered.map((s,i)=>(
                  <motion.tr key={s.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.02}} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold text-sm">{s.name[0]}</div>
                        <div><p className="font-medium text-slate-900 dark:text-white">{s.name}</p><p className="text-xs text-slate-500 dark:text-zinc-500">{s.course_interest || s.source || "—"}</p><p className="text-[11px] text-emerald-700 dark:text-emerald-300">{salespeople.find(person => person.id === s.assigned_salesperson_id)?.name || "Unassigned"}</p></div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.email&&<div className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-zinc-300 mb-1"><Mail className="w-3 h-3 text-zinc-500" />{s.email}</div>}
                      {s.phone&&<div className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-zinc-300"><Phone className="w-3 h-3 text-zinc-500" />{s.phone}</div>}
                      {!s.email&&!s.phone&&<span className="text-zinc-600 text-sm">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {s.active_course ? <div><Link href={`/courses/${s.active_course_id}`} className="text-sm font-medium text-slate-900 hover:underline dark:text-white">{s.active_course}</Link>{s.active_batch_id ? <Link href={`/batches/${s.active_batch_id}`} className="block text-xs text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300">{s.active_batch}</Link> : <p className="text-xs text-slate-500 dark:text-zinc-500">{s.active_batch||"—"}</p>}</div> : <span className="text-sm text-slate-500 dark:text-zinc-600">Not enrolled</span>}
                    </td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded-full text-xs font-medium">{s.enrollment_count}</span></td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_STYLES[s.status]||STATUS_STYLES.Active}`}>{s.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/students/${s.id}`} className="p-1.5 hover:bg-emerald-500/20 rounded-lg text-zinc-400 hover:text-emerald-400 transition"><Eye className="w-4 h-4" /></Link>
                        {canCreateLogin && <CreateInstituteLoginButton profileId={s.id} profileKind="students" hasAccount={Boolean(s.user_id)} hasEmail={Boolean(s.email)} onCreated={fetch_} />}
                        {canManageStudents && <><button onClick={()=>openEdit(s)} aria-label={`Edit ${s.name}`} className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={()=>handleDelete(s.id)} aria-label={`Delete ${s.name}`} className="p-1.5 hover:bg-red-500/20 rounded-lg text-zinc-400 hover:text-red-400 transition"><Trash2 className="w-4 h-4" /></button></>}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showModal&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}} className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">{editStudent?"Edit Student":"Add New Student"}</h2>
                <button onClick={()=>setShowModal(false)} className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              {formError && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">{formError}</div>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[{l:"Full Name *",k:"name",p:"Student's full name",col:2},{l:"Email",k:"email",p:"email@example.com"},{l:"Phone",k:"phone",p:"+91 XXXXX XXXXX"},{l:"Course Interest",k:"course_interest",p:"Course or program"},{l:"Education Level",k:"education_level",p:"Highest completed education"},{l:"GPA (0-10)",k:"gpa",p:"e.g. 8.2",type:"number"},{l:"Gender",k:"gender",p:"Male/Female/Other"},{l:"Qualification",k:"qualification",p:"Qualification or certification"},{l:"Guardian Name",k:"guardian_name",p:"Parent/Guardian"},{l:"Guardian Phone",k:"guardian_phone",p:"+91 XXXXX XXXXX"},{l:"Address",k:"address",p:"Full address",col:2}].map((f:any)=>(
                  <div key={f.k} className={f.col===2?"sm:col-span-2":""}>
                    <label className="block text-sm text-zinc-400 mb-1.5">{f.l}</label>
                    <input type={f.type || "text"} min={f.type === "number" ? 0 : undefined} max={f.type === "number" ? 10 : undefined} step={f.type === "number" ? 0.1 : undefined} value={(form as any)[f.k]} onChange={e=>setForm({...form,[f.k]:e.target.value})} placeholder={f.p} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500" />
                  </div>
                ))}
                <div className="sm:col-span-2"><label className="block text-sm text-zinc-400 mb-1.5">Academic / work background</label><textarea value={form.academic_background} onChange={e=>setForm({...form,academic_background:e.target.value})} rows={3} className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none" placeholder="Previous study, experience, strengths, and skills" /></div>
                <div className="sm:col-span-2"><label className="block text-sm text-zinc-400 mb-1.5">Career goal</label><textarea value={form.career_goal} onChange={e=>setForm({...form,career_goal:e.target.value})} rows={2} className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none" placeholder="Target role, industry, or learning outcome" /></div>
                <div><label className="block text-sm text-zinc-400 mb-1.5">Source</label><select value={form.source} onChange={e=>setForm({...form,source:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-emerald-500">{SOURCES.map(s=><option key={s} value={s} className="bg-zinc-800">{s}</option>)}</select></div>
                <div className="sm:col-span-2"><label className="block text-sm text-zinc-400 mb-1.5">Salesperson</label><select value={form.assigned_salesperson_id} onChange={e=>setForm({...form,assigned_salesperson_id:e.target.value})} className="w-full rounded-xl border border-white/10 bg-zinc-800 px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none"><option value="">Use source lead owner / leave unassigned</option><option value="auto">Auto-assign by collected revenue</option>{salespeople.map(person=><option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</select></div>
                <div className="sm:col-span-2"><label className="block text-sm text-zinc-400 mb-1.5">Notes</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={2} placeholder="Additional notes..." className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 resize-none" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={()=>setShowModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving&&<Loader2 className="w-4 h-4 animate-spin" />}{editStudent?"Update":"Add Student"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
