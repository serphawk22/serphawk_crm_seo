'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, CreditCard, GraduationCap, Loader2, Phone, X } from 'lucide-react';
import { API_BASE_URL } from '@/config';

interface BatchOption {
  id: number;
  batch_name: string;
  course_title?: string | null;
  course_id?: number | null;
  schedule?: string | null;
  status: string;
  available_seats: number;
  start_date?: string | null;
}

interface LeadBatchEnrollmentActionProps {
  leadId: number;
  leadName: string;
  leadPhone?: string | null;
  convertedStudentId?: number | null;
  isConverted?: boolean;
  compact?: boolean;
  onEnrolled?: () => void | Promise<void>;
  /** Open the modal programmatically (e.g. when a lead is dragged to Converted). */
  externalOpen?: boolean;
  /** Called whenever the modal closes. */
  onExternalClose?: () => void;
  /** Don't render the trigger button (use together with externalOpen). */
  hideTrigger?: boolean;
}

export default function LeadBatchEnrollmentAction({
  leadId,
  leadName,
  leadPhone,
  convertedStudentId,
  isConverted = false,
  compact = false,
  onEnrolled,
  externalOpen = false,
  onExternalClose,
  hideTrigger = false,
}: LeadBatchEnrollmentActionProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'batch' | 'payment'>('batch');
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [advance, setAdvance] = useState('');
  const [discount, setDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [courseFee, setCourseFee] = useState(0);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [enrolledStudentId, setEnrolledStudentId] = useState<number | null>(null);

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    let userId: string | null = null;
    if (userStr) { try { userId = String(JSON.parse(userStr)?.id); } catch {} }
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { 'X-User-ID': userId } : {}),
    };
  };

  const wasOpenRef = useRef(false);

  const openEnrollment = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    await startEnrollment();
  };

  useEffect(() => {
    if (externalOpen) void startEnrollment();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalOpen]);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      onExternalClose?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const startEnrollment = async () => {
    setIsOpen(true);
    setStep('batch');
    setSelectedBatchId('');
    setAdvance('');
    setDiscount('');
    setDiscountReason('');
    setError('');
    setEnrolledStudentId(null);
    setLoadingBatches(true);
    try {
      const response = await fetch(`${API_BASE_URL}/batches`, { headers: getAuthHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load batches.');
      setBatches((data.batches || []).filter((batch: BatchOption) =>
        ['Active', 'Upcoming'].includes(batch.status) && batch.available_seats > 0
      ));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load batches.');
    } finally {
      setLoadingBatches(false);
    }
  };

  // Update default advance amount when batch selection changes
  useEffect(() => {
    if (!selectedBatchId || !batches.length) return;
    const selected = batches.find(b => String(b.id) === selectedBatchId);
    if (!selected) return;
    // Try to fetch course advance amount
    if (selected.course_id) {
      fetch(`${API_BASE_URL}/courses/${selected.course_id}`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(d => {
          const price = d.course?.price || 0;
          const adv = d.course?.advance_amount || 0;
          setCourseFee(price);
          setAdvance(String(adv));
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId, batches]);

  const enroll = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedBatchId) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/leads/${leadId}/convert-to-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ 
          batch_id: Number(selectedBatchId),
          discount: Number(discount) || 0,
          discount_reason: discountReason.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not enroll this lead.');
      setEnrolledStudentId(data.student_id);
      // Record initial payment if advance amount given
      if (Number(advance) > 0 && data.enrollment_id) {
        await fetch(`${API_BASE_URL}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            enrollment_id: data.enrollment_id,
            student_id: data.student_id,
            amount: Number(advance),
            payment_mode: paymentMode,
          }),
        });
      }
      await onEnrolled?.();
      setStep('payment');
    } catch (enrollmentError) {
      setError(enrollmentError instanceof Error ? enrollmentError.message : 'Could not enroll this lead.');
    } finally {
      setSaving(false);
    }
  };

  const goToStudent = () => {
    setIsOpen(false);
    const targetId = enrolledStudentId || convertedStudentId;
    if (targetId) {
      router.push(`/students/${targetId}`);
    } else {
      router.push("/students");
    }
  };

  if (convertedStudentId || isConverted) {
    if (!convertedStudentId) return null;
    return (
      <Link
        href={`/students/${convertedStudentId}`}
        title="View enrolled student profile"
        className={compact
          ? 'p-1.5 rounded-lg text-emerald-600 transition-colors hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
          : 'inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'}
      >
        <GraduationCap className="h-4 w-4" />
        {!compact && <span>Enrolled student &rarr;</span>}
      </Link>
    );
  }

  return (
    <>
      {!hideTrigger && (
      <button
        type="button"
        onClick={openEnrollment}
        title="Enroll in a batch"
        aria-label={`Enroll ${leadName} in a batch`}
        className={compact
          ? 'p-1.5 rounded-lg text-slate-400 transition-colors hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-900/30'
          : 'inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'}
      >
        <GraduationCap className="h-4 w-4" />
        {!compact && (isConverted ? 'Re-enroll / New batch' : 'Enroll as student')}
      </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={event => {
              event.stopPropagation();
              if (event.target === event.currentTarget && !saving) setIsOpen(false);
            }}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby={`enroll-title-${leadId}`}
              className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={event => event.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-zinc-700">
                <div>
                  <h2 id={`enroll-title-${leadId}`} className="text-base font-bold text-slate-900 dark:text-white">
                    {step === 'payment' ? '🎉 Enrolled!' : 'Enroll as student'}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">{leadName}</p>
                </div>
                <button type="button" onClick={() => setIsOpen(false)} disabled={saving} aria-label="Close"
                  className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Step 1: Batch Selection + Initial Payment */}
              {step === 'batch' && (
                <form onSubmit={enroll}>
                  <div className="space-y-4 p-5">
                    <div>
                      <label htmlFor={`batch-${leadId}`} className="block text-xs font-semibold text-slate-600 dark:text-zinc-300">Course Batch</label>
                      {loadingBatches ? (
                        <div className="flex items-center gap-2 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading batches…</div>
                      ) : batches.length ? (
                        <select
                          id={`batch-${leadId}`}
                          autoFocus
                          required
                          value={selectedBatchId}
                          onChange={event => setSelectedBatchId(event.target.value)}
                          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-white"
                        >
                          <option value="">Select a batch</option>
                          {batches.map(batch => (
                            <option key={batch.id} value={batch.id}>
                              {batch.course_title ? `${batch.course_title} · ` : ''}{batch.batch_name} · {batch.available_seats} seats left
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:bg-zinc-800 dark:text-zinc-300">
                          No active or upcoming batches have seats available.
                        </p>
                      )}
                    </div>

                    {selectedBatchId && (
                      <>
                        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 space-y-1.5 dark:border-zinc-700 dark:bg-zinc-800/90">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-600 dark:text-zinc-400 font-medium">Standard course fee:</span>
                            <span className="font-bold text-slate-800 dark:text-zinc-200">₹{courseFee.toLocaleString("en-IN")}</span>
                          </div>
                          {(Number(discount) > 0) && (
                            <div className="flex justify-between items-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                              <span>Discount:</span>
                              <span className="font-bold">-₹{Number(discount).toLocaleString("en-IN")}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200/80 dark:border-zinc-700/80">
                            <span className="font-bold text-slate-800 dark:text-zinc-200">Final fee payable:</span>
                            <span className="font-black text-slate-900 dark:text-white">
                              ₹{Math.max(0, courseFee - (Number(discount) || 0)).toLocaleString("en-IN")}
                            </span>
                          </div>
                          {(Number(advance) > 0) && (
                            <div className="flex justify-between items-center text-xs text-blue-600 dark:text-blue-400 font-medium">
                              <span>Advance payment:</span>
                              <span className="font-bold">₹{Number(advance).toLocaleString("en-IN")}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 dark:border-zinc-700/60">
                            <span>Balance due after enrollment:</span>
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              ₹{Math.max(0, courseFee - (Number(discount) || 0) - (Number(advance) || 0)).toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>

                        {/* Discount Fields */}
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                            Discount (₹)
                            <input
                              type="number"
                              min="0"
                              max={courseFee}
                              step="0.01"
                              value={discount}
                              onChange={e => setDiscount(e.target.value)}
                              placeholder="0"
                              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-zinc-600 dark:bg-zinc-950 dark:text-white"
                            />
                          </label>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                            Discount reason
                            <input
                              type="text"
                              value={discountReason}
                              onChange={e => setDiscountReason(e.target.value)}
                              placeholder="e.g. Scholarship, Early bird"
                              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-zinc-600 dark:bg-zinc-950 dark:text-white"
                            />
                          </label>
                        </div>

                        {/* Advance Payment Fields */}
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                            Advance payment (₹)
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={advance}
                              onChange={e => setAdvance(e.target.value)}
                              placeholder="0"
                              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-zinc-600 dark:bg-zinc-950 dark:text-white"
                            />
                          </label>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                            Payment method
                            <select
                              value={paymentMode}
                              onChange={e => setPaymentMode(e.target.value)}
                              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-zinc-600 dark:bg-zinc-950 dark:text-white"
                            >
                              {['UPI', 'Cash', 'Card', 'Bank Transfer'].map(m => <option key={m}>{m}</option>)}
                            </select>
                          </label>
                        </div>
                      </>
                    )}

                    {leadPhone && (
                      <a href={`tel:${leadPhone}`} className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-emerald-700">
                        <Phone className="h-3.5 w-3.5" /> Call lead: {leadPhone}
                      </a>
                    )}

                    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                  </div>

                  <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-zinc-700">
                    <button type="button" onClick={() => setIsOpen(false)} disabled={saving}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800">
                      Cancel
                    </button>
                    <button type="submit" disabled={saving || loadingBatches || !selectedBatchId}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Enroll & create student
                    </button>
                  </div>
                </form>
              )}

              {/* Step 2: Success + Next Actions */}
              {step === 'payment' && (
                <div className="space-y-4 p-5">
                  <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                    <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-700" />
                    <div>
                      <p className="font-semibold text-emerald-900 dark:text-emerald-200">{leadName} is now a student!</p>
                      <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                        Student profile created and enrollment confirmed.
                        {Number(discount) > 0 && ` ₹${Number(discount).toLocaleString()} discount applied.`}
                        {Number(advance) > 0 && ` ₹${Number(advance).toLocaleString()} advance recorded.`}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">What would you like to do next?</p>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={goToStudent}
                      className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left text-sm hover:bg-slate-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      <ArrowRight className="h-4 w-4 text-emerald-700" />
                      <div>
                        <p className="font-semibold">Go to student profile</p>
                        <p className="text-xs text-slate-500">View enrollment, log payments, assign salesperson</p>
                      </div>
                    </button>
                    {leadPhone && (
                      <a
                        href={`tel:${leadPhone}`}
                        className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left text-sm hover:bg-slate-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        <Phone className="h-4 w-4 text-sky-700" />
                        <div>
                          <p className="font-semibold">Call {leadName}</p>
                          <p className="text-xs text-slate-500">Confirm enrollment and schedule next payment</p>
                        </div>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => { setIsOpen(false); }}
                      className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left text-sm hover:bg-slate-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      <CreditCard className="h-4 w-4 text-amber-700" />
                      <div>
                        <p className="font-semibold">Log follow-up from student profile</p>
                        <p className="text-xs text-slate-500">Record payment reminder and balance due calls</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}