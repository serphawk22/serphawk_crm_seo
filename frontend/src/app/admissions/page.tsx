"use client";

import AdmissionsTeamForm from "@/components/AdmissionsTeamForm";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileText, GraduationCap, Loader2, RefreshCw, Wallet } from "lucide-react";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";

interface AdmissionUser {
  id: number;
  name?: string | null;
  email: string;
}

interface AdmissionEnrollment {
  id: number;
  course_id: number;
  batch_id: number;
  total_fee: number;
  amount_paid: number;
  amount_due: number;
  payment_status: string;
  payments: { id: number; amount: number; payment_mode: string; payment_date: string; receipt_number?: string | null }[];
  invoice?: { id: number; invoice_number: string; status: string } | null;
}

interface AdmissionStudent {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  course_interest?: string | null;
  status: string;
  created_at: string;
  admissions_assignee_id?: number | null;
  admissions_assignee_name?: string | null;
  enrollments: AdmissionEnrollment[];
}

interface AdmissionData {
  students: AdmissionStudent[];
  admissions_users: AdmissionUser[];
}

function authHeaders(userId?: number): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(userId ? { "X-User-ID": String(userId) } : {}),
  };
}

function errorText(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "detail" in data && typeof data.detail === "string") {
    return data.detail;
  }
  return fallback;
}

export default function AdmissionsPage() {
  const { settings } = useTenantConfig();
  const currency = settings.default_currency || "USD";
  const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value || 0);
  const { role, user } = useRole();
  const router = useRouter();
  const canManageTeam = role === "Admin" || role === "SuperAdmin" || role === "Demo";
  const [data, setData] = useState<AdmissionData>({ students: [], admissions_users: [] });
  const [loading, setLoading] = useState(true);
  const [savingStudentId, setSavingStudentId] = useState<number | null>(null);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<{ student: AdmissionStudent; enrollment: AdmissionEnrollment } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [busyEnrollmentId, setBusyEnrollmentId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (role && !["Admin", "SuperAdmin", "Demo", "Admissions"].includes(role)) {
      router.replace("/");
    }
  }, [role, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/admissions/students`, {
        headers: authHeaders(user?.id),
      });
      const responseData: unknown = await response.json();
      if (!response.ok) throw new Error(errorText(responseData, "Could not load admissions."));
      const result = responseData as AdmissionData;
      setData({
        students: Array.isArray(result.students) ? result.students : [],
        admissions_users: Array.isArray(result.admissions_users) ? result.admissions_users : [],
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load admissions.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const unassignedCount = useMemo(
    () => data.students.filter(student => !student.admissions_assignee_id).length,
    [data.students],
  );
  const openBalance = useMemo(
    () => data.students.reduce(
      (sum, student) => sum + student.enrollments.reduce((studentSum, enrollment) => studentSum + enrollment.amount_due, 0),
      0,
    ),
    [data.students],
  );

  const autoAssign = async () => {
    setAutoAssigning(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_BASE_URL}/admissions/students/auto-assign`, {
        method: "POST",
        headers: authHeaders(user?.id),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(errorText(result, "Could not assign students."));
      const assigned = result && typeof result === "object" && "assigned" in result
        ? Number(result.assigned)
        : 0;
      setNotice(`${assigned} unassigned student${assigned === 1 ? "" : "s"} assigned.`);
      await load();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Could not assign students.");
    } finally {
      setAutoAssigning(false);
    }
  };

  const assignStudent = async (studentId: number, assigneeValue: string) => {
    setSavingStudentId(studentId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_BASE_URL}/admissions/students/${studentId}/assign`, {
        method: "PATCH",
        headers: authHeaders(user?.id),
        body: JSON.stringify({ admissions_assignee_id: assigneeValue ? Number(assigneeValue) : null }),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(errorText(result, "Could not change the admissions assignment."));
      await load();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Could not change the admissions assignment.");
    } finally {
      setSavingStudentId(null);
    }
  };

  const createInvoice = async (student: AdmissionStudent, enrollment: AdmissionEnrollment) => {
    setBusyEnrollmentId(enrollment.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_BASE_URL}/admissions/students/${student.id}/invoices`, {
        method: "POST",
        headers: authHeaders(user?.id),
        body: JSON.stringify({ enrollment_id: enrollment.id, due_date: invoiceDueDate || null }),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(errorText(result, "Could not create the invoice."));
      setNotice("Invoice created and linked to this enrollment.");
      await load();
    } catch (invoiceError) {
      setError(invoiceError instanceof Error ? invoiceError.message : "Could not create the invoice.");
    } finally {
      setBusyEnrollmentId(null);
    }
  };

  const downloadInvoice = async (invoiceId: number) => {
    setError("");
    try {
      const response = await fetch(API_BASE_URL + "/admissions/invoices/" + invoiceId + "/pdf", { headers: authHeaders(user?.id) });
      if (!response.ok) throw new Error("Could not download invoice");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = "admissions-invoice-" + invoiceId + ".pdf"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not download invoice"); }
  };

  const recordPayment = async () => {
    if (!paymentTarget || !Number.isFinite(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    setPaymentSaving(true);
    setError("");
    setNotice("");
    try {
      const { student, enrollment } = paymentTarget;
      const response = await fetch(`${API_BASE_URL}/payments`, {
        method: "POST",
        headers: authHeaders(user?.id),
        body: JSON.stringify({
          student_id: student.id,
          enrollment_id: enrollment.id,
          amount: Number(paymentAmount),
          payment_mode: paymentMode,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(errorText(result, "Could not record payment."));
      setPaymentTarget(null);
      setPaymentAmount("");
      setNotice("Payment recorded.");
      await load();
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Could not record payment.");
    } finally {
      setPaymentSaving(false);
    }
  };

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900 dark:text-white">
            <span className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600"><GraduationCap className="h-6 w-6" /></span>
            Admissions
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Assign converted students, issue invoices, and record course payments.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageTeam && (
            <button
              type="button"
              onClick={() => void autoAssign()}
              disabled={autoAssigning || unassignedCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {autoAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Auto-assign {unassignedCount ? `(${unassignedCount})` : "unassigned students"}
            </button>
          )}
          {canManageTeam && <Link href="/teams" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Manage admissions team</Link>}
        </div>
      </header>

      {(role === "Admin" || role === "SuperAdmin") && <AdmissionsTeamForm onCreated={() => void load()} />}
      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-zinc-950">
          <p className="text-sm text-slate-500">Students in view</p><p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{data.students.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-zinc-950">
          <p className="text-sm text-slate-500">Unassigned</p><p className="mt-1 text-2xl font-bold text-amber-600">{unassignedCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-zinc-950">
          <p className="flex items-center gap-2 text-sm text-slate-500"><Wallet className="h-4 w-4" />Outstanding balance</p><p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{money(openBalance)}</p>
        </div>
      </section>

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
      ) : (
        <section className="space-y-3">
          {data.students.map(student => (
            <article key={student.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-zinc-950 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/students/${student.id}`} className="font-bold text-slate-900 hover:underline dark:text-white">{student.name}</Link>
                  <p className="mt-1 text-sm text-slate-500">{[student.email, student.phone, student.course_interest].filter(Boolean).join(" · ") || "No contact or course details"}</p>
                </div>
                {canManageTeam ? (
                  <label className="flex items-center gap-2 text-sm text-slate-500">
                    <span>Admissions owner</span>
                    <select
                      aria-label={`Admissions owner for ${student.name}`}
                      value={student.admissions_assignee_id ? String(student.admissions_assignee_id) : ""}
                      disabled={savingStudentId === student.id}
                      onChange={event => void assignStudent(student.id, event.target.value)}
                      className="max-w-56 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700 dark:border-slate-700 dark:bg-zinc-900 dark:text-slate-200"
                    >
                      <option value="">Unassigned</option>
                      {data.admissions_users.map(member => <option key={member.id} value={member.id}>{member.name || member.email}</option>)}
                    </select>
                  </label>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{student.admissions_assignee_name || "Unassigned"}</span>
                )}
              </div>

              {student.enrollments.length ? (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                  {student.enrollments.map(enrollment => (
                    <div key={enrollment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-zinc-900">
                      <div className="min-w-[220px]">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Enrollment #{enrollment.id}</p>
                        <p className="mt-1 text-xs text-slate-500">Fee {money(enrollment.total_fee)} · Paid {money(enrollment.amount_paid)} · Due {money(enrollment.amount_due)} · {enrollment.payment_status}</p>
                        {enrollment.invoice && <p className="mt-1 text-xs text-slate-500">Invoice {enrollment.invoice.invoice_number} · {enrollment.invoice.status}</p>}
                        {enrollment.payments.length > 0 && <p className="mt-1 text-xs text-slate-500">Payments: {enrollment.payments.map(payment => `${payment.receipt_number || `#${payment.id}`} ${money(payment.amount)} (${payment.payment_mode})`).join(" · ")}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {!enrollment.invoice ? (
                          <>
                            <input type="date" aria-label="Invoice due date" value={invoiceDueDate} onChange={event => setInvoiceDueDate(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-zinc-950" />
                            <button type="button" disabled={busyEnrollmentId === enrollment.id} onClick={() => void createInvoice(student, enrollment)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                              {busyEnrollmentId === enrollment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Create invoice
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => void downloadInvoice(enrollment.invoice!.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"><FileText className="h-3.5 w-3.5" />View invoice</button>
                        )}
                        {enrollment.amount_due > 0 && (
                          <button type="button" onClick={() => { setError(""); setPaymentTarget({ student, enrollment }); setPaymentAmount(""); }} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:text-emerald-300">Record payment</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <p className="text-sm text-slate-500">No enrollment or invoice yet.</p>
                  <Link href={`/enrollments?student_id=${student.id}`} className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">Create enrollment</Link>
                </div>
              )}
            </article>
          ))}
          {data.students.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">No students are assigned to your admissions queue.</div>}
        </section>
      )}

      {paymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="record-payment-title" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-950">
            <h2 id="record-payment-title" className="text-lg font-bold text-slate-900 dark:text-white">Record payment — {paymentTarget.student.name}</h2>
            <p className="text-sm text-slate-500">Outstanding: {money(paymentTarget.enrollment.amount_due)}</p>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Amount
              <input type="number" min="0.01" max={paymentTarget.enrollment.amount_due} step="0.01" value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-zinc-900" />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Payment method
              <select value={paymentMode} onChange={event => setPaymentMode(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-zinc-900">
                {["Cash", "UPI", "Card", "Bank Transfer"].map(mode => <option key={mode}>{mode}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={paymentSaving} onClick={() => setPaymentTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-700">Cancel</button>
              <button type="button" disabled={paymentSaving} onClick={() => void recordPayment()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{paymentSaving ? "Saving…" : "Save payment"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
