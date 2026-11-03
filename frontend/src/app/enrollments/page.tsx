"use client";
import LocalizedText from "@/components/LocalizedText";
import React, { useState, useEffect, useMemo } from "react";
import { API_BASE_URL } from "@/config";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, Search, DollarSign, X, Loader2, Download,
  CheckCircle, AlertCircle, Clock, GraduationCap, Calendar,
  ArrowUpRight, Printer
} from "lucide-react";
import Link from "next/link";
import { jsPDF } from "jspdf";

interface Enrollment {
  id: number;
  student_id: number;
  student_name?: string;
  batch_id: number;
  batch_name?: string;
  course_id: number;
  course_title?: string;
  total_fee: number;
  amount_paid: number;
  amount_due: number;
  payment_status: string;
  status: string;
  enrollment_date: string;
  slip_number?: string;
  admission_slip_generated: boolean;
  advance_slip_generated: boolean;
  payment_mode?: string;
  discount: number;
}
interface Student { id: number; name: string; }
interface Batch { id: number; batch_name: string; course_id: number; }
interface Course { id: number; title: string; price: number; advance_amount: number; }

const PAY_STATUS_CONFIG: Record<string, { badge: string; text: string }> = {
  Paid: {
    badge: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400"
  },
  Partial: {
    badge: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30",
    text: "text-amber-600 dark:text-amber-400"
  },
  Pending: {
    badge: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-500/30",
    text: "text-rose-600 dark:text-rose-400"
  }
};

export default function EnrollmentsPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    student_id: "",
    batch_id: "",
    course_id: "",
    total_fee: "",
    amount_paid: "",
    payment_mode: "Cash",
    discount: "0",
    discount_reason: "",
    notes: ""
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [slipData, setSlipData] = useState<any>(null);
  const [slipType, setSlipType] = useState<"admission"|"advance">("admission");

  const fetch_ = async () => {
    setLoading(true);
    try {
      const [er, sr, br, cr] = await Promise.all([
        fetch(`${API_BASE_URL}/enrollments`),
        fetch(`${API_BASE_URL}/students`),
        fetch(`${API_BASE_URL}/batches`),
        fetch(`${API_BASE_URL}/courses`)
      ]);
      const [ed, sd, bd, cd] = await Promise.all([er.json(), sr.json(), br.json(), cr.json()]);
      setEnrollments(ed.enrollments || []);
      setStudents(sd.students || []);
      setBatches(bd.batches || []);
      setCourses(cd.courses || []);
    } catch(e) {
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetch_(); }, []);

  const onBatchChange = (bid: string) => {
    const batch = batches.find(b => b.id.toString() === bid);
    if (batch) {
      const course = courses.find(c => c.id === batch.course_id);
      if (course) {
        setForm(f => ({
          ...f,
          batch_id: bid,
          course_id: course.id.toString(),
          total_fee: course.price.toString(),
          amount_paid: course.advance_amount.toString()
        }));
        return;
      }
    }
    setForm(f => ({ ...f, batch_id: bid }));
  };

  const handleSave = async () => {
    if (!form.student_id || !form.batch_id || !form.course_id) {
      setFormError("Select a student and a valid course batch.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        student_id: parseInt(form.student_id),
        batch_id: parseInt(form.batch_id),
        course_id: parseInt(form.course_id),
        total_fee: parseFloat(form.total_fee) || 0,
        amount_paid: parseFloat(form.amount_paid) || 0,
        payment_mode: form.payment_mode,
        discount: parseFloat(form.discount) || 0,
        discount_reason: form.discount_reason,
        notes: form.notes
      };
      const response = await fetch(`${API_BASE_URL}/enrollments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not create enrollment.");
      setShowModal(false);
      fetch_();
    } catch(e) {
      setFormError(e instanceof Error ? e.message : "Could not create enrollment.");
    } finally {
      setSaving(false);
    }
  };

  const generateSlip = async (eid: number, type: "admission" | "advance") => {
    try {
      const res = await fetch(`${API_BASE_URL}/enrollments/${eid}/generate-${type}-slip`, { method: "POST" });
      const data = await res.json();
      setSlipData(data);
      setSlipType(type);
      fetch_();
    } catch (e) {
      console.error(e);
    }
  };

  const printSlip = () => {
    if (!slipData) return;
    const win = window.open("", "_blank", "width=700,height=900");
    if (!win) return;
    win.document.write(`
      <html><head><title>${slipType === "admission" ? "Admission" : "Advance"} Slip - ${slipData.slip_number}</title>
      <style>body{font-family:'Segoe UI',sans-serif;padding:30px;color:#1a1a2e}h1{color:#059669;margin-bottom:5px}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #059669;padding-bottom:15px;margin-bottom:20px}.slip-no{background:#059669;color:#fff;padding:5px 15px;border-radius:20px;font-size:14px}.table{width:100%;border-collapse:collapse;margin:15px 0}.table td{padding:8px 12px;border-bottom:1px solid #e5e7eb}.table td:first-child{font-weight:600;color:#4b5563;width:40%}.amount-box{background:#f3f4f6;border-radius:8px;padding:15px;margin-top:15px}.amount-row{display:flex;justify-content:space-between;padding:5px 0}.total-row{font-weight:700;font-size:16px;border-top:1px solid #d1d5db;margin-top:5px;padding-top:8px}.footer{margin-top:30px;display:flex;justify-content:space-between;font-size:12px;color:#9ca3af}.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;background:${slipData.payment_status==="Paid"?"#d1fae5":slipData.payment_status==="Partial"?"#fef3c7":"#fee2e2"};color:${slipData.payment_status==="Paid"?"#065f46":slipData.payment_status==="Partial"?"#92400e":"#991b1b"}}</style></head>
      <body>
        <div class="header"><div><h1>🎓 ${slipType === "admission" ? "ADMISSION" : "ADVANCE PAYMENT"} SLIP</h1><p style="color:#6b7280;margin:0">Institute of Excellence</p></div><span class="slip-no">${slipData.slip_number}</span></div>
        <table class="table">
          <tr><td>Student Name</td><td>${slipData.student_name}</td></tr>
          ${slipData.student_email ? `<tr><td>Email</td><td>${slipData.student_email}</td></tr>` : ""}
          ${slipData.student_phone ? `<tr><td>Phone</td><td>${slipData.student_phone}</td></tr>` : ""}
          <tr><td>Course</td><td><strong>${slipData.course_title}</strong></td></tr>
          <tr><td>Batch</td><td>${slipData.batch_name} ${slipData.batch_code ? `(${slipData.batch_code})` : ""}</td></tr>
          ${slipData.start_date ? `<tr><td>Start Date</td><td>${new Date(slipData.start_date).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</td></tr>` : ""}
          ${slipData.schedule ? `<tr><td>Schedule</td><td>${slipData.schedule}</td></tr>` : ""}
          ${slipData.mode ? `<tr><td>Mode</td><td>${slipData.mode}</td></tr>` : ""}
          ${slipData.instructor_name ? `<tr><td>Instructor</td><td>${slipData.instructor_name}</td></tr>` : ""}
          <tr><td>Enrollment Date</td><td>${new Date(slipData.enrollment_date||slipData.generated_at).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</td></tr>
        </table>
        <div class="amount-box">
          <div class="amount-row"><span>Total Course Fee</span><span>₹${(slipData.total_fee||0).toLocaleString()}</span></div>
          ${slipData.discount ? `<div class="amount-row"><span>Discount</span><span style="color:#065f46">- ₹${slipData.discount.toLocaleString()}</span></div>` : ""}
          <div class="amount-row"><span>Amount Paid</span><span style="color:#065f46">₹${(slipData.amount_paid||0).toLocaleString()}</span></div>
          ${slipData.amount_due !== undefined ? `<div class="amount-row total-row"><span>Balance Due</span><span style="color:#991b1b">₹${slipData.amount_due.toLocaleString()}</span></div>` : ""}
          <div class="amount-row"><span>Payment Status</span><span class="badge">${slipData.payment_status||"—"}</span></div>
        </div>
        <div class="footer"><span>Generated: ${new Date().toLocaleString("en-IN")}</span><div style="text-align:right;margin-top:30px"><div style="border-top:1px solid #000;width:150px;display:inline-block;margin-left:auto"></div><p style="margin:4px 0 0">Authorized Signature</p></div></div>
      </body></html>
    `);
    win.document.close();
    win.print();
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

  const filtered = useMemo(() => {
    return enrollments.filter(e => {
      const matchesSearch = !search ||
        (e.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.course_title || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.batch_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.slip_number || "").toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === "All" || e.payment_status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [enrollments, search, statusFilter]);

  const totalRevenue = useMemo(() => enrollments.reduce((a, e) => a + (e.amount_paid || 0), 0), [enrollments]);
  const totalDue = useMemo(() => enrollments.reduce((a, e) => a + (e.amount_due || 0), 0), [enrollments]);
  const activeCount = useMemo(() => enrollments.filter(e => e.status === "Active").length, [enrollments]);

  const exportEnrollments = () => {
    const columns = ["Student", "Course", "Batch", "Total Fee", "Amount Paid", "Amount Due", "Payment Status", "Enrollment Status", "Slip Number", "Enrollment Date"];
    const rows = filtered.map(item => [
      item.student_name, item.course_title, item.batch_name,
      item.total_fee, item.amount_paid, item.amount_due,
      item.payment_status, item.status, item.slip_number, item.enrollment_date
    ]);
    const csv = [columns, ...rows].map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `enrollments-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Compact Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none"><LocalizedText text={"Enrollments"} /></h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {enrollments.length} <LocalizedText text={"total"} /> </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5"><LocalizedText text={"Manage student enrollments, fee balances and billing slips"} /></p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={exportEnrollments}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5 transition"
          >
            <Download className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
            <span><LocalizedText text={"Export CSV"} /></span>
          </button>
          <button
            onClick={() => { setFormError(""); setShowModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span><LocalizedText text={"New Enrollment"} /></span>
          </button>
        </div>
      </div>

      {/* 4-KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider"><LocalizedText text={"Total Enrolled"} /></p>
            <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight mt-0.5">{enrollments.length}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <GraduationCap className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider"><LocalizedText text={"Active"} /></p>
            <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5">{activeCount}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider"><LocalizedText text={"Revenue Collected"} /></p>
            <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight mt-0.5">₹{totalRevenue.toLocaleString()}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <DollarSign className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider"><LocalizedText text={"Pending Balance"} /></p>
            <p className="text-base sm:text-lg font-bold text-rose-600 dark:text-rose-400 leading-tight mt-0.5">₹{totalDue.toLocaleString()}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Single-Row Search + Status Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white dark:bg-[#111111]/90 p-2 sm:px-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student, course, batch, slip..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {(["All", "Paid", "Partial", "Pending"] as const).map(tab => {
            const count = tab === "All"
              ? enrollments.length
              : enrollments.filter(e => e.payment_status === tab).length;
            const active = statusFilter === tab;
            return (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                  active
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5"
                }`}
              >
                <span>{tab}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  active ? "bg-white/20 text-white" : "bg-slate-200/70 dark:bg-white/10 text-slate-500 dark:text-zinc-400"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop Column Header */}
      <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
        <div className="col-span-4"><LocalizedText text={"Student & Slip"} /></div>
        <div className="col-span-3"><LocalizedText text={"Course / Batch"} /></div>
        <div className="col-span-2 text-right"><LocalizedText text={"Fee Breakdown"} /></div>
        <div className="col-span-1 text-center"><LocalizedText text={"Status"} /></div>
        <div className="col-span-2 text-right"><LocalizedText text={"Slips & Actions"} /></div>
      </div>

      {/* Premium List Cards */}
      {loading ? (
        <div className="flex items-center justify-center h-48 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10">
          <FileText className="w-8 h-8 mx-auto mb-2 text-slate-400 dark:text-zinc-600" />
          <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300"><LocalizedText text={"No enrollments found"} /></p>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5"><LocalizedText text={"Try adjusting your search or create a new student enrollment"} /></p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(e => {
            const payCfg = PAY_STATUS_CONFIG[e.payment_status] || PAY_STATUS_CONFIG.Pending;
            return (
              <div
                key={e.id}
                className="group relative flex flex-col lg:grid lg:grid-cols-12 gap-2 lg:gap-3 items-start lg:items-center p-2.5 sm:px-4 sm:py-2 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 hover:border-emerald-500/60 dark:hover:border-emerald-500/50 hover:shadow-xs transition-all duration-150"
              >
                {/* Student Info & Slip */}
                <div className="col-span-4 flex items-center gap-2.5 min-w-0 w-full">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-zinc-200 shrink-0">
                    {(e.student_name || "S").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {e.student_id ? (
                        <Link
                          href={`/students/${e.student_id}`}
                          className="font-bold text-xs text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 truncate hover:underline"
                        >
                          {e.student_name || `Student #${e.student_id}`}
                        </Link>
                      ) : (
                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {e.student_name || "—"}
                        </span>
                      )}
                      {e.slip_number && (
                        <span className="shrink-0 font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-zinc-400 border border-slate-200/60 dark:border-white/5">
                          {e.slip_number}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-zinc-500 flex items-center gap-1.5 mt-0.5">
                      <Calendar className="w-3 h-3 text-slate-400 dark:text-zinc-500 shrink-0" />
                      <span>{e.enrollment_date ? new Date(e.enrollment_date).toLocaleDateString() : "—"}</span>
                      {e.payment_mode && (
                        <>
                          <span>•</span>
                          <span className="capitalize">{e.payment_mode}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Course & Batch */}
                <div className="col-span-3 min-w-0 w-full">
                  <Link
                    href={`/courses/${e.course_id}`}
                    className="font-semibold text-xs text-slate-800 dark:text-zinc-200 hover:text-emerald-600 dark:hover:text-emerald-400 truncate block hover:underline"
                  >
                    {e.course_title || "—"}
                  </Link>
                  <Link
                    href={`/batches/${e.batch_id}`}
                    className="text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 truncate block mt-0.5"
                  >
                    {e.batch_name || "—"}
                  </Link>
                </div>

                {/* Fee Breakdown */}
                <div className="col-span-2 text-left lg:text-right w-full">
                  <div className="flex lg:justify-end items-center gap-2 text-xs">
                    <span className="text-slate-400 dark:text-zinc-500 text-[11px]"><LocalizedText text={"Fee:"} /></span>
                    <span className="font-semibold text-slate-800 dark:text-zinc-200">₹{(e.total_fee || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex lg:justify-end items-center gap-2 text-[11px] mt-0.5">
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">₹{(e.amount_paid || 0).toLocaleString()} <LocalizedText text={"paid"} /></span>
                    {e.amount_due > 0 ? (
                      <span className="text-rose-600 dark:text-rose-400 font-medium">• ₹{e.amount_due.toLocaleString()} <LocalizedText text={"due"} /></span>
                    ) : (
                      <span className="text-slate-400 dark:text-zinc-500"><LocalizedText text={"• Cleared"} /></span>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className="col-span-1 flex items-center lg:justify-center w-full lg:w-auto">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${payCfg.badge}`}>
                    {e.payment_status}
                  </span>
                </div>

                {/* Slips & Actions */}
                <div className="col-span-2 flex items-center justify-end gap-1.5 w-full">
                  <button
                    onClick={() => generateSlip(e.id, "admission")}
                    title="Generate Admission Slip"
                    className={`px-2 py-1 rounded-lg text-[11px] font-medium transition flex items-center gap-1 border ${
                      e.admission_slip_generated
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30"
                        : "bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10"
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    <span>{e.admission_slip_generated ? "ADM✓" : "ADM"}</span>
                  </button>

                  <button
                    onClick={() => generateSlip(e.id, "advance")}
                    title="Generate Advance Slip"
                    className={`px-2 py-1 rounded-lg text-[11px] font-medium transition flex items-center gap-1 border ${
                      e.advance_slip_generated
                        ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30"
                        : "bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10"
                    }`}
                  >
                    <DollarSign className="w-3 h-3" />
                    <span>{e.advance_slip_generated ? "ADV✓" : "ADV"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slip Preview Modal */}
      <AnimatePresence>
        {slipData && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-5 w-full max-w-lg shadow-xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    {slipType === "admission" ? "Admission" : "Advance"} <LocalizedText text={"Slip Generated"} /></h2>
                </div>
                <button onClick={() => setSlipData(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3.5 space-y-2 mb-4 border border-slate-100 dark:border-white/5 text-xs">
                <div className="flex justify-between items-center"><span className="text-slate-500 dark:text-zinc-400"><LocalizedText text={"Slip No."} /></span><span className="text-slate-900 dark:text-white font-mono font-bold">{slipData.slip_number}</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-500 dark:text-zinc-400"><LocalizedText text={"Student"} /></span><span className="text-slate-900 dark:text-white font-medium">{slipData.student_name}</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-500 dark:text-zinc-400"><LocalizedText text={"Course"} /></span><span className="text-slate-900 dark:text-white font-medium">{slipData.course_title}</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-500 dark:text-zinc-400"><LocalizedText text={"Batch"} /></span><span className="text-slate-900 dark:text-white">{slipData.batch_name}</span></div>
                {slipData.total_fee && <div className="flex justify-between items-center"><span className="text-slate-500 dark:text-zinc-400"><LocalizedText text={"Total Fee"} /></span><span className="text-slate-900 dark:text-white">₹{slipData.total_fee?.toLocaleString()}</span></div>}
                <div className="flex justify-between items-center"><span className="text-slate-500 dark:text-zinc-400"><LocalizedText text={"Amount Paid"} /></span><span className="text-emerald-600 dark:text-emerald-400 font-bold">₹{slipData.amount_paid?.toLocaleString()}</span></div>
                {slipData.amount_due !== undefined && <div className="flex justify-between items-center"><span className="text-slate-500 dark:text-zinc-400"><LocalizedText text={"Balance Due"} /></span><span className="text-rose-600 dark:text-rose-400 font-bold">₹{slipData.amount_due?.toLocaleString()}</span></div>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={downloadSlip} className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2 font-semibold text-xs text-white shadow-xs transition">
                  <Download className="h-3.5 w-3.5" /> <LocalizedText text={"Download PDF"} /> </button>
                <button onClick={printSlip} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 py-2 font-semibold text-xs text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-white/5 transition">
                  <Printer className="h-3.5 w-3.5 text-slate-500 dark:text-zinc-400" /> <LocalizedText text={"Print Slip"} /></button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Enrollment Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-5 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white"><LocalizedText text={"New Enrollment"} /></h2>
                </div>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {formError && <div role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">{formError}</div>}

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-600 dark:text-zinc-400 mb-1 font-medium"><LocalizedText text={"Student *"} /></label>
                  <select
                    value={form.student_id}
                    onChange={e => setForm({ ...form, student_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="" className="bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">Select student</option>
                    {students.map(s => <option key={s.id} value={s.id} className="bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">{s.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-zinc-400 mb-1 font-medium"><LocalizedText text={"Batch *"} /></label>
                  <select
                    value={form.batch_id}
                    onChange={e => onBatchChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="" className="bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">Select batch</option>
                    {batches.map(b => <option key={b.id} value={b.id} className="bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">{b.batch_name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-zinc-400 mb-1 font-medium"><LocalizedText text={"Total Fee (₹)"} /></label>
                    <input
                      type="number"
                      value={form.total_fee}
                      onChange={e => setForm({ ...form, total_fee: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-zinc-400 mb-1 font-medium"><LocalizedText text={"Amount Paid Now (₹)"} /></label>
                    <input
                      type="number"
                      value={form.amount_paid}
                      onChange={e => setForm({ ...form, amount_paid: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-zinc-400 mb-1 font-medium"><LocalizedText text={"Payment Mode"} /></label>
                    <select
                      value={form.payment_mode}
                      onChange={e => setForm({ ...form, payment_mode: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option className="bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">Cash</option>
                      <option className="bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">UPI</option>
                      <option className="bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">Card</option>
                      <option className="bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">Bank Transfer</option>
                      <option className="bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">Cheque</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-zinc-400 mb-1 font-medium"><LocalizedText text={"Discount (₹)"} /></label>
                    <input
                      type="number"
                      value={form.discount}
                      onChange={e => setForm({ ...form, discount: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-zinc-400 mb-1 font-medium"><LocalizedText text={"Discount Reason"} /></label>
                  <input
                    value={form.discount_reason}
                    onChange={e => setForm({ ...form, discount_reason: e.target.value })}
                    placeholder="e.g. Early bird, Referral"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {form.total_fee && form.amount_paid && (
                  <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 space-y-1 border border-slate-100 dark:border-white/5 text-xs">
                    <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400"><LocalizedText text={"Total Fee"} /></span><span className="text-slate-900 dark:text-white font-medium">₹{parseFloat(form.total_fee).toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400"><LocalizedText text={"Discount"} /></span><span className="text-emerald-600 dark:text-emerald-400 font-medium">- ₹{parseFloat(form.discount || "0").toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400"><LocalizedText text={"Paid Now"} /></span><span className="text-emerald-600 dark:text-emerald-400 font-semibold">₹{parseFloat(form.amount_paid).toLocaleString()}</span></div>
                    <div className="flex justify-between font-semibold border-t border-slate-200 dark:border-white/10 pt-1 mt-1">
                      <span className="text-slate-700 dark:text-zinc-300"><LocalizedText text={"Balance Due"} /></span>
                      <span className="text-rose-600 dark:text-rose-400">
                        ₹{Math.max(0, parseFloat(form.total_fee || "0") - parseFloat(form.amount_paid || "0") - parseFloat(form.discount || "0")).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-white/10 transition"
                >
                  <LocalizedText text={"Cancel"} /> </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs transition"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span><LocalizedText text={"Enroll Student"} /></span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
