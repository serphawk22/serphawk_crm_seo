"use client";
import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Plus, Search, DollarSign, X, Loader2, Download, CheckCircle, AlertCircle, Clock } from "lucide-react";
import Link from "next/link";
import { jsPDF } from "jspdf";

interface Enrollment { id: number; student_id: number; student_name?: string; batch_id: number; batch_name?: string; course_id: number; course_title?: string; total_fee: number; amount_paid: number; amount_due: number; payment_status: string; status: string; enrollment_date: string; slip_number?: string; admission_slip_generated: boolean; advance_slip_generated: boolean; payment_mode?: string; discount: number; }
interface Student { id: number; name: string; }
interface Batch { id: number; batch_name: string; course_id: number; }
interface Course { id: number; title: string; price: number; advance_amount: number; }

const PAY_STATUS: Record<string,string> = { Paid:"bg-green-500/20 text-green-400 border-green-500/30", Partial:"bg-amber-500/20 text-amber-400 border-amber-500/30", Pending:"bg-red-500/20 text-red-400 border-red-500/30" };

export default function EnrollmentsPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ student_id:"", batch_id:"", course_id:"", total_fee:"", amount_paid:"", payment_mode:"Cash", discount:"0", discount_reason:"", notes:"" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [slipData, setSlipData] = useState<any>(null);
  const [slipType, setSlipType] = useState<"admission"|"advance">("admission");

  const fetch_ = async () => {
    setLoading(true);
    try {
      const [er, sr, br, cr] = await Promise.all([fetch(`${API_BASE_URL}/enrollments`), fetch(`${API_BASE_URL}/students`), fetch(`${API_BASE_URL}/batches`), fetch(`${API_BASE_URL}/courses`)]);
      const [ed, sd, bd, cd] = await Promise.all([er.json(), sr.json(), br.json(), cr.json()]);
      setEnrollments(ed.enrollments||[]); setStudents(sd.students||[]); setBatches(bd.batches||[]); setCourses(cd.courses||[]);
    } catch(e){} finally { setLoading(false); }
  };
  useEffect(()=>{ fetch_(); },[]);

  const onBatchChange = (bid: string) => {
    const batch = batches.find(b=>b.id.toString()===bid);
    if (batch) { const course = courses.find(c=>c.id===batch.course_id); if(course){ setForm(f=>({...f,batch_id:bid,course_id:course.id.toString(),total_fee:course.price.toString(),amount_paid:course.advance_amount.toString()})); return; } }
    setForm(f=>({...f,batch_id:bid}));
  };

  const handleSave = async () => {
    if (!form.student_id || !form.batch_id || !form.course_id) {
      setFormError("Select a student and a valid course batch.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = { student_id:parseInt(form.student_id), batch_id:parseInt(form.batch_id), course_id:parseInt(form.course_id), total_fee:parseFloat(form.total_fee)||0, amount_paid:parseFloat(form.amount_paid)||0, payment_mode:form.payment_mode, discount:parseFloat(form.discount)||0, discount_reason:form.discount_reason, notes:form.notes };
      const response = await fetch(`${API_BASE_URL}/enrollments`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not create enrollment.");
      setShowModal(false); fetch_();
    } catch(e) { setFormError(e instanceof Error ? e.message : "Could not create enrollment."); } finally { setSaving(false); }
  };

  const generateSlip = async (eid: number, type: "admission"|"advance") => {
    const res = await fetch(`${API_BASE_URL}/enrollments/${eid}/generate-${type}-slip`, {method:"POST"});
    const data = await res.json();
    setSlipData(data); setSlipType(type);
    fetch_();
  };

  const printSlip = () => {
    if (!slipData) return;
    const win = window.open("","_blank","width=700,height=900");
    if (!win) return;
    win.document.write(`
      <html><head><title>${slipType==="admission"?"Admission":"Advance"} Slip - ${slipData.slip_number}</title>
      <style>body{font-family:'Segoe UI',sans-serif;padding:30px;color:#1a1a2e}h1{color:#4338ca;margin-bottom:5px}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #4338ca;padding-bottom:15px;margin-bottom:20px}.slip-no{background:#4338ca;color:#fff;padding:5px 15px;border-radius:20px;font-size:14px}.table{width:100%;border-collapse:collapse;margin:15px 0}.table td{padding:8px 12px;border-bottom:1px solid #e5e7eb}.table td:first-child{font-weight:600;color:#4b5563;width:40%}.amount-box{background:#f3f4f6;border-radius:8px;padding:15px;margin-top:15px}.amount-row{display:flex;justify-content:space-between;padding:5px 0}.total-row{font-weight:700;font-size:16px;border-top:1px solid #d1d5db;margin-top:5px;padding-top:8px}.footer{margin-top:30px;display:flex;justify-content:space-between;font-size:12px;color:#9ca3af}.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;background:${slipData.payment_status==="Paid"?"#d1fae5":slipData.payment_status==="Partial"?"#fef3c7":"#fee2e2"};color:${slipData.payment_status==="Paid"?"#065f46":slipData.payment_status==="Partial"?"#92400e":"#991b1b"}}</style></head>
      <body>
        <div class="header"><div><h1>🎓 ${slipType==="admission"?"ADMISSION":"ADVANCE PAYMENT"} SLIP</h1><p style="color:#6b7280;margin:0">Institute of Excellence</p></div><span class="slip-no">${slipData.slip_number}</span></div>
        <table class="table">
          <tr><td>Student Name</td><td>${slipData.student_name}</td></tr>
          ${slipData.student_email?`<tr><td>Email</td><td>${slipData.student_email}</td></tr>`:""}
          ${slipData.student_phone?`<tr><td>Phone</td><td>${slipData.student_phone}</td></tr>`:""}
          <tr><td>Course</td><td><strong>${slipData.course_title}</strong></td></tr>
          <tr><td>Batch</td><td>${slipData.batch_name} ${slipData.batch_code?`(${slipData.batch_code})`:""}</td></tr>
          ${slipData.start_date?`<tr><td>Start Date</td><td>${new Date(slipData.start_date).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</td></tr>`:""}
          ${slipData.schedule?`<tr><td>Schedule</td><td>${slipData.schedule}</td></tr>`:""}
          ${slipData.mode?`<tr><td>Mode</td><td>${slipData.mode}</td></tr>`:""}
          ${slipData.instructor_name?`<tr><td>Instructor</td><td>${slipData.instructor_name}</td></tr>`:""}
          <tr><td>Enrollment Date</td><td>${new Date(slipData.enrollment_date||slipData.generated_at).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</td></tr>
        </table>
        <div class="amount-box">
          <div class="amount-row"><span>Total Course Fee</span><span>₹${(slipData.total_fee||0).toLocaleString()}</span></div>
          ${slipData.discount?`<div class="amount-row"><span>Discount</span><span style="color:#065f46">- ₹${slipData.discount.toLocaleString()}</span></div>`:""}
          <div class="amount-row"><span>Amount Paid</span><span style="color:#065f46">₹${(slipData.amount_paid||0).toLocaleString()}</span></div>
          ${slipData.amount_due!==undefined?`<div class="amount-row total-row"><span>Balance Due</span><span style="color:#991b1b">₹${slipData.amount_due.toLocaleString()}</span></div>`:""}
          <div class="amount-row"><span>Payment Status</span><span class="badge">${slipData.payment_status||"—"}</span></div>
        </div>
        <div class="footer"><span>Generated: ${new Date().toLocaleString("en-IN")}</span><div style="text-align:right;margin-top:30px"><div style="border-top:1px solid #000;width:150px;display:inline-block;margin-left:auto"></div><p style="margin:4px 0 0">Authorized Signature</p></div></div>
      </body></html>
    `);
    win.document.close(); win.print();
  };

  const downloadSlip = () => {
    if (!slipData) return;
    const pdf = new jsPDF();
    const title = slipType === "admission" ? "ADMISSION SLIP" : "ADVANCE PAYMENT SLIP";
    pdf.setFontSize(18);
    pdf.text("Institute of Excellence", 18, 20);
    pdf.setFontSize(14);
    pdf.text(title, 18, 31);
    pdf.setFontSize(10);
    pdf.text(`Slip No: ${slipData.slip_number || "—"}`, 18, 40);
    pdf.setDrawColor(16, 130, 85);
    pdf.line(18, 45, 192, 45);

    const details: Array<[string, string]> = [
      ["Student", slipData.student_name],
      ["Email", slipData.student_email],
      ["Phone", slipData.student_phone],
      ["Course", slipData.course_title],
      ["Batch", slipData.batch_name],
      ["Batch code", slipData.batch_code],
      ["Instructor", slipData.instructor_name],
      ["Schedule", slipData.schedule],
      ["Mode", slipData.mode],
      ["Enrollment date", slipData.enrollment_date || slipData.generated_at],
    ];
    let y = 55;
    for (const [label, rawValue] of details) {
      if (!rawValue) continue;
      const value = label === "Enrollment date" ? new Date(rawValue).toLocaleDateString("en-IN") : String(rawValue);
      const wrapped = pdf.splitTextToSize(value, 122);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${label}:`, 18, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(wrapped, 68, y);
      y += Math.max(7, wrapped.length * 5);
    }

    y += 5;
    pdf.setDrawColor(210, 210, 210);
    pdf.line(18, y, 192, y);
    y += 9;
    const amounts: Array<[string, number | undefined]> = [
      ["Total course fee", slipData.total_fee],
      ["Discount", slipData.discount],
      ["Amount paid", slipData.amount_paid],
      ["Balance due", slipData.amount_due],
    ];
    for (const [label, amount] of amounts) {
      if (amount === undefined) continue;
      pdf.text(label, 18, y);
      pdf.text(`INR ${Number(amount).toLocaleString("en-IN")}`, 192, y, { align: "right" });
      y += 7;
    }
    if (slipData.payment_status) {
      pdf.text(`Payment status: ${slipData.payment_status}`, 18, y + 2);
      y += 9;
    }
    pdf.setFontSize(8);
    pdf.setTextColor(110, 110, 110);
    pdf.text(`Generated ${new Date().toLocaleString("en-IN")}`, 18, Math.min(y + 10, 280));
    const safeNumber = String(slipData.slip_number || "enrollment").replace(/[^a-z0-9-]/gi, "-");
    pdf.save(`${slipType}-slip-${safeNumber}.pdf`);
  };

  const filtered = enrollments.filter(e => !search || (e.student_name||"").toLowerCase().includes(search.toLowerCase()) || (e.course_title||"").toLowerCase().includes(search.toLowerCase()) || (e.batch_name||"").toLowerCase().includes(search.toLowerCase()));

  const totalRevenue = enrollments.reduce((a,e)=>a+e.amount_paid,0);
  const totalDue = enrollments.reduce((a,e)=>a+e.amount_due,0);

  const exportEnrollments = () => {
    const columns = ["Student", "Course", "Batch", "Total Fee", "Amount Paid", "Amount Due", "Payment Status", "Enrollment Status", "Slip Number", "Enrollment Date"];
    const rows = filtered.map(item => [item.student_name, item.course_title, item.batch_name, item.total_fee, item.amount_paid, item.amount_due, item.payment_status, item.status, item.slip_number, item.enrollment_date]);
    const csv = [columns, ...rows].map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `enrollments-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="institute-ops-page space-y-8">
      <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center"><FileText className="w-4 h-4 sm:w-5 sm:h-5 text-white" /></div>
            Enrollments
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Manage student enrollments and generate admission slips</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button type="button" onClick={exportEnrollments} className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/5">
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button onClick={()=>{ setFormError(""); setShowModal(true); }} className="flex items-center justify-center gap-2 whitespace-nowrap px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold hover:opacity-90 transition shadow-lg shadow-green-500/20">
            <Plus className="w-4 h-4" /> New Enrollment
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{l:"Total Enrollments",v:enrollments.length,c:"green"},{l:"Active",v:enrollments.filter(e=>e.status==="Active").length,c:"emerald"},{l:"Revenue Collected",v:`₹${totalRevenue.toLocaleString()}`,c:"amber"},{l:"Pending Amount",v:`₹${totalDue.toLocaleString()}`,c:"red"}].map((s,i)=>(
          <motion.div key={s.l} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}} className="glass-card rounded-2xl p-5 border border-white/10">
            <p className={`text-${s.c}-400 text-sm mb-2`}>{s.l}</p>
            <p className="text-2xl font-bold text-white">{s.v}</p>
          </motion.div>
        ))}
      </div>

      <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by student, course, batch..." className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-green-500" /></div>

      {loading ? <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-green-400" /></div> : (
        <div className="glass-card rounded-2xl border border-white/10 overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-white/10 bg-white/5">{["Student","Course / Batch","Fee","Paid","Due","Pay Status","Slips",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {filtered.length===0 ? <tr><td colSpan={8} className="text-center py-16 text-zinc-500"><FileText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No enrollments</p></td></tr> :
              filtered.map((e,i)=>(
                <motion.tr key={e.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.02}} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="px-4 py-3">{e.student_id ? <Link href={`/students/${e.student_id}`} className="font-medium text-white hover:underline">{e.student_name||`Student #${e.student_id}`}</Link> : <span className="font-medium text-white">{e.student_name||"—"}</span>}<p className="text-xs text-zinc-500">{e.slip_number}</p></td>
                  <td className="px-4 py-3"><Link href={`/courses/${e.course_id}`} className="text-sm text-white hover:underline">{e.course_title||"—"}</Link><Link href={`/batches/${e.batch_id}`} className="block text-xs text-zinc-500 hover:text-zinc-300">{e.batch_name||"—"}</Link></td>
                  <td className="px-4 py-3 text-sm text-zinc-300">₹{e.total_fee.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-green-400 font-medium">₹{e.amount_paid.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-red-400 font-medium">₹{e.amount_due.toLocaleString()}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${PAY_STATUS[e.payment_status]||PAY_STATUS.Pending}`}>{e.payment_status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={()=>generateSlip(e.id,"admission")} title="Admission Slip" className={`p-1.5 rounded-lg text-xs transition flex items-center gap-1 ${e.admission_slip_generated?"bg-green-500/20 text-green-400":"bg-white/5 text-zinc-400 hover:text-white"}`}><FileText className="w-3 h-3" />{e.admission_slip_generated?"ADM✓":"ADM"}</button>
                      <button onClick={()=>generateSlip(e.id,"advance")} title="Advance Slip" className={`p-1.5 rounded-lg text-xs transition flex items-center gap-1 ${e.advance_slip_generated?"bg-amber-500/20 text-amber-400":"bg-white/5 text-zinc-400 hover:text-white"}`}><DollarSign className="w-3 h-3" />{e.advance_slip_generated?"ADV✓":"ADV"}</button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{new Date(e.enrollment_date).toLocaleDateString()}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Slip Preview */}
      <AnimatePresence>
        {slipData&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}} className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">{slipType==="admission"?"Admission":"Advance"} Slip Generated</h2>
                <button onClick={()=>setSlipData(null)} className="p-2 rounded-lg hover:bg-white/10 text-zinc-400"><X className="w-5 h-5" /></button>
              </div>
              <div className="bg-white/5 rounded-xl p-4 space-y-2 mb-4">
                <div className="flex justify-between"><span className="text-zinc-400 text-sm">Slip No.</span><span className="text-white font-mono font-bold">{slipData.slip_number}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400 text-sm">Student</span><span className="text-white">{slipData.student_name}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400 text-sm">Course</span><span className="text-white">{slipData.course_title}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400 text-sm">Batch</span><span className="text-white">{slipData.batch_name}</span></div>
                {slipData.total_fee&&<div className="flex justify-between"><span className="text-zinc-400 text-sm">Total Fee</span><span className="text-white">₹{slipData.total_fee?.toLocaleString()}</span></div>}
                <div className="flex justify-between"><span className="text-zinc-400 text-sm">Amount Paid</span><span className="text-green-400 font-bold">₹{slipData.amount_paid?.toLocaleString()}</span></div>
                {slipData.amount_due!==undefined&&<div className="flex justify-between"><span className="text-zinc-400 text-sm">Balance Due</span><span className="text-red-400 font-bold">₹{slipData.amount_due?.toLocaleString()}</span></div>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={downloadSlip} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 py-2.5 font-semibold text-white hover:opacity-90">
                  <Download className="h-4 w-4" /> Download PDF
                </button>
                <button onClick={printSlip} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 py-2.5 font-semibold text-zinc-200 hover:bg-white/5">
                  <FileText className="h-4 w-4" /> Print
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Enrollment Modal */}
      <AnimatePresence>
        {showModal&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}} className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">New Enrollment</h2>
                <button onClick={()=>setShowModal(false)} className="p-2 rounded-lg hover:bg-white/10 text-zinc-400"><X className="w-5 h-5" /></button>
              </div>
              {formError&&<div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">{formError}</div>}
              <div className="space-y-4">
                <div><label className="block text-sm text-zinc-400 mb-1.5">Student *</label><select value={form.student_id} onChange={e=>setForm({...form,student_id:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-green-500"><option value="" className="bg-zinc-800">Select student</option>{students.map(s=><option key={s.id} value={s.id} className="bg-zinc-800">{s.name}</option>)}</select></div>
                <div><label className="block text-sm text-zinc-400 mb-1.5">Batch *</label><select value={form.batch_id} onChange={e=>onBatchChange(e.target.value)} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-green-500"><option value="" className="bg-zinc-800">Select batch</option>{batches.map(b=><option key={b.id} value={b.id} className="bg-zinc-800">{b.batch_name}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm text-zinc-400 mb-1.5">Total Fee (₹)</label><input type="number" value={form.total_fee} onChange={e=>setForm({...form,total_fee:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-green-500" /></div>
                  <div><label className="block text-sm text-zinc-400 mb-1.5">Amount Paid Now (₹)</label><input type="number" value={form.amount_paid} onChange={e=>setForm({...form,amount_paid:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-green-500" /></div>
                  <div><label className="block text-sm text-zinc-400 mb-1.5">Payment Mode</label><select value={form.payment_mode} onChange={e=>setForm({...form,payment_mode:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-green-500"><option className="bg-zinc-800">Cash</option><option className="bg-zinc-800">UPI</option><option className="bg-zinc-800">Card</option><option className="bg-zinc-800">Bank Transfer</option><option className="bg-zinc-800">Cheque</option></select></div>
                  <div><label className="block text-sm text-zinc-400 mb-1.5">Discount (₹)</label><input type="number" value={form.discount} onChange={e=>setForm({...form,discount:e.target.value})} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-green-500" /></div>
                </div>
                <div><label className="block text-sm text-zinc-400 mb-1.5">Discount Reason</label><input value={form.discount_reason} onChange={e=>setForm({...form,discount_reason:e.target.value})} placeholder="e.g. Early bird, Referral" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-green-500" /></div>
                {form.total_fee&&form.amount_paid&&<div className="bg-white/5 rounded-xl p-4 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-zinc-400">Total Fee</span><span className="text-white">₹{parseFloat(form.total_fee).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Discount</span><span className="text-green-400">- ₹{parseFloat(form.discount||"0").toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Paid Now</span><span className="text-emerald-400">₹{parseFloat(form.amount_paid).toLocaleString()}</span></div>
                  <div className="flex justify-between font-semibold border-t border-white/10 pt-1.5"><span className="text-zinc-300">Balance Due</span><span className="text-red-400">₹{Math.max(0,parseFloat(form.total_fee||"0")-parseFloat(form.amount_paid||"0")-parseFloat(form.discount||"0")).toLocaleString()}</span></div>
                </div>}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={()=>setShowModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving&&<Loader2 className="w-4 h-4 animate-spin" />}Enroll Student
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
