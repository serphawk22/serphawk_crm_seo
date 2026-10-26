"use client";

import { useEffect, useState } from "react";
import { AlertCircle, BookOpen, CheckCircle2, CreditCard, Loader2, Plus } from "lucide-react";
import { API_BASE_URL } from "@/config";

interface StudentEnrollment {
  id: number;
  student_id?: number;
  batch_id?: number;
  course_id?: number;
  batch_name?: string | null;
  course_title?: string | null;
  total_fee: number;
  amount_paid: number;
  amount_due: number;
  payment_status: string;
  status: string;
  slip_number?: string | null;
}

interface CourseOption { id: number; title: string; price: number; advance_amount: number; }
interface BatchOption { id: number; batch_name: string; course_id: number; status: string; available_seats?: number; }

export default function StudentEnrollmentActions({ studentId, enrollments, canManage, onRefresh }: { studentId: number; enrollments: StudentEnrollment[]; canManage: boolean; onRefresh: () => void }) {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [totalFee, setTotalFee] = useState("");
  const [initialPayment, setInitialPayment] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [paymentEnrollmentId, setPaymentEnrollmentId] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAddEnrollment, setShowAddEnrollment] = useState(false);

  const getAuthHeaders = (extra: Record<string, string> = {}) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
    let userId: string | null = null;
    if (userStr) {
      try { userId = String(JSON.parse(userStr)?.id); } catch {}
    }
    return {
      ...extra,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { "X-User-ID": userId } : {}),
    };
  };

  useEffect(() => {
    if (!canManage) return;
    const loadOptions = async () => {
      setLoadingOptions(true);
      try {
        const [courseResponse, batchResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/courses`, { headers: getAuthHeaders() }),
          fetch(`${API_BASE_URL}/batches`, { headers: getAuthHeaders() }),
        ]);
        const [courseData, batchData] = await Promise.all([courseResponse.json(), batchResponse.json()]);
        if (!courseResponse.ok) throw new Error(courseData.detail || "Could not load courses.");
        if (!batchResponse.ok) throw new Error(batchData.detail || "Could not load batches.");
        setCourses(courseData.courses || []);
        setBatches((batchData.batches || []).filter((batch: BatchOption) => !["Completed", "Cancelled"].includes(batch.status)));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load enrollment options.");
      } finally {
        setLoadingOptions(false);
      }
    };
    void loadOptions();
  }, [canManage]);

  const selectedBatch = batches.find(batch => String(batch.id) === selectedBatchId);
  const selectedCourse = courses.find(course => course.id === selectedBatch?.course_id);

  const selectBatch = (value: string) => {
    setSelectedBatchId(value);
    const batch = batches.find(item => String(item.id) === value);
    const course = courses.find(item => item.id === batch?.course_id);
    setTotalFee(course ? String(course.price) : "");
    setInitialPayment(course ? String(course.advance_amount) : "");
  };

  const createEnrollment = async () => {
    if (!selectedBatch || !selectedCourse) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/enrollments`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          student_id: studentId,
          batch_id: selectedBatch.id,
          course_id: selectedCourse.id,
          total_fee: Number(totalFee) || 0,
          amount_paid: Number(initialPayment) || 0,
          payment_mode: paymentMode,
          discount: Number(discount) || 0,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not create enrollment.");
      setMessage(`Enrolled in ${selectedCourse.title} · ${selectedBatch.batch_name}.`);
      setSelectedBatchId("");
      setShowAddEnrollment(false);
      onRefresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not create enrollment.");
    } finally {
      setSaving(false);
    }
  };

  const addPayment = async (enrollment: StudentEnrollment) => {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/payments`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ enrollment_id: enrollment.id, student_id: studentId, amount, payment_mode: paymentMode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not record payment.");
      setMessage(`Payment recorded · receipt ${data.receipt_number}.`);
      setPaymentEnrollmentId(null);
      setPaymentAmount("");
      onRefresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not record payment.");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) return null;

  const isEnrolled = enrollments.length > 0;

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <BookOpen className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
            {isEnrolled ? "Course Enrollment & Payments" : "Enrollment"}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {isEnrolled
              ? "View course details and record payment installments."
              : "Assign a course batch and create the student's initial enrollment."}
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          {enrollments.length} {enrollments.length === 1 ? "Active Course" : "Courses"}
        </span>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4" />{error}
        </p>
      )}
      {message && (
        <p role="status" className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4" />{message}
        </p>
      )}

      {/* Enrolled Courses & Record Payment Section */}
      {isEnrolled && (
        <div className="space-y-4">
          {enrollments.map(enrollment => {
            const hasDue = Number(enrollment.amount_due || 0) > 0;
            const isRecording = paymentEnrollmentId === enrollment.id;

            return (
              <article
                key={enrollment.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 transition-all"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-base text-[var(--text-primary)]">
                        {enrollment.course_title || "Enrolled Course"}
                      </p>
                      <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                        {enrollment.batch_name || "Batch"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span className={`font-semibold ${enrollment.payment_status === "Paid" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                        ● {enrollment.payment_status}
                      </span>
                      <span>·</span>
                      <span>Fee: ₹{Number(enrollment.total_fee || 0).toLocaleString()}</span>
                      <span>·</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        Paid: ₹{Number(enrollment.amount_paid || 0).toLocaleString()}
                      </span>
                      <span>·</span>
                      <span className={`font-bold ${hasDue ? "text-rose-600 dark:text-rose-400" : "text-emerald-600"}`}>
                        Due: ₹{Number(enrollment.amount_due || 0).toLocaleString()}
                      </span>
                      {enrollment.slip_number && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-[11px]">{enrollment.slip_number}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {hasDue ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (isRecording) {
                          setPaymentEnrollmentId(null);
                        } else {
                          setPaymentEnrollmentId(enrollment.id);
                          setPaymentAmount(String(enrollment.amount_due || ""));
                        }
                      }}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      <CreditCard className="h-4 w-4" />
                      {isRecording ? "Cancel Payment" : "Record Payment"}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Fully Paid
                    </span>
                  )}
                </div>

                {/* Inline Record Payment Form */}
                {isRecording && (
                  <form
                    onSubmit={event => {
                      event.preventDefault();
                      void addPayment(enrollment);
                    }}
                    className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20"
                  >
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                      Record Payment Installment
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="text-xs font-medium">
                        Amount to Pay (₹)
                        <input
                          required
                          min="1"
                          max={enrollment.amount_due}
                          step="1"
                          type="number"
                          value={paymentAmount}
                          onChange={event => setPaymentAmount(event.target.value)}
                          className="mt-1 min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </label>
                      <label className="text-xs font-medium">
                        Payment Method
                        <select
                          value={paymentMode}
                          onChange={event => setPaymentMode(event.target.value)}
                          className="mt-1 min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          {["UPI", "Cash", "Card", "Bank Transfer"].map(mode => (
                            <option key={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <div className="flex items-end gap-2">
                        <button
                          type="submit"
                          disabled={saving || !paymentAmount || Number(paymentAmount) <= 0 || Number(paymentAmount) > enrollment.amount_due}
                          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                          Confirm & Save Payment
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Add Course Enrollment Section (Only shown if 0 enrollments, or if explicitly toggled) */}
      {!isEnrolled || showAddEnrollment ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">
              {isEnrolled ? "Enroll in an additional course" : "Create Course Enrollment"}
            </h3>
            {isEnrolled && (
              <button
                type="button"
                onClick={() => setShowAddEnrollment(false)}
                className="text-xs text-[var(--text-secondary)] hover:underline"
              >
                Close
              </button>
            )}
          </div>
          {loadingOptions ? (
            <div className="flex min-h-12 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">
                Course batch
                <select
                  value={selectedBatchId}
                  onChange={event => selectBatch(event.target.value)}
                  className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                >
                  <option value="">Choose an open batch</option>
                  {batches.map(batch => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batch_name} · {courses.find(course => course.id === batch.course_id)?.title || "Course"}
                      {batch.available_seats !== undefined ? ` · ${batch.available_seats} seats left` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Tuition
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalFee}
                  onChange={event => setTotalFee(event.target.value)}
                  className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                />
              </label>
              <label className="text-sm font-medium">
                Initial payment
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={initialPayment}
                  onChange={event => setInitialPayment(event.target.value)}
                  className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                />
              </label>
              <label className="text-sm font-medium">
                Discount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={event => setDiscount(event.target.value)}
                  className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                />
              </label>
              <label className="text-sm font-medium">
                Payment method
                <select
                  value={paymentMode}
                  onChange={event => setPaymentMode(event.target.value)}
                  className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                >
                  {["UPI", "Cash", "Card", "Bank Transfer"].map(mode => (
                    <option key={mode}>{mode}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-end justify-end sm:col-span-2">
                <button
                  type="button"
                  onClick={() => void createEnrollment()}
                  disabled={saving || !selectedBatchId || !totalFee || !initialPayment}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create enrollment
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAddEnrollment(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-emerald-700 dark:hover:text-emerald-400"
          >
            <Plus className="h-3.5 w-3.5" />
            + Enroll in another course
          </button>
        </div>
      )}
    </section>
  );
}
