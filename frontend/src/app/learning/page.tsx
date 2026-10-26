"use client";

import { useTenantConfig } from "@/context/TenantConfigContext";
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  FileUp,
  GraduationCap,
  IndianRupee,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Radio,
  Send,
  Shield,
  Star,
  ThumbsUp,
  Trophy,
  Upload,
  UserRound,
  Link2,
  TrendingUp,
  Zap,
  BarChart3,
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { jsPDF } from "jspdf";

interface ClassSession {
  id: number;
  title: string;
  topic?: string;
  scheduled_start: string;
  scheduled_end?: string | null;
  status: string;
  is_live: boolean;
  meeting_url?: string | null;
  attendance_status?: string | null;
  progress: { status: string; completion_percent: number; score?: number | null; notes?: string | null };
}

interface CourseProgress {
  enrollment_id: number;
  course_id: number;
  course_title: string;
  batch_id: number;
  batch_name: string;
  batch_status: string;
  enrollment_status: string;
  payment_status: string;
  total_fee?: number | null;
  amount_paid?: number | null;
  amount_due?: number | null;
  slip_number?: string | null;
  admission_slip_generated: boolean;
  advance_slip_generated: boolean;
  start_date?: string | null;
  end_date?: string | null;
  schedule?: string | null;
  room_or_link?: string | null;
  instructor_name?: string | null;
  instructor?: { id: number; name: string; email?: string | null; phone?: string | null; bio?: string | null; expertise?: string | null; qualification?: string | null; experience_years?: number | null; photo_url?: string | null } | null;
  resources: Array<{ id: number; title: string; description?: string | null; filename: string; size_bytes: number }>;
  review?: { rating: number; feedback_text?: string | null; teaching_quality?: number | null; punctuality?: number | null; communication?: number | null } | null;
  progress_percent: number;
  sessions: ClassSession[];
}

interface StudentProfile { id: number; name: string; email?: string | null; phone?: string | null; address?: string | null; gender?: string | null; qualification?: string | null; education_level?: string | null; gpa?: number | null; academic_background?: string | null; career_goal?: string | null; guardian_name?: string | null; guardian_phone?: string | null; source?: string | null; status?: string | null; }
interface StudentNote { id: number; content: string; created_at: string; }

interface StudentTask {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  due_date?: string | null;
  batch_id?: number | null;
  batch_name?: string | null;
  submission_url?: string | null;
  submission_file?: string | null;
  submission_notes?: string | null;
  submitted_at?: string | null;
  is_submitted?: boolean;
}

function formatDate(value?: string | null) {
  if (!value) return "Date to be confirmed";
  return new Date(value).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatCurrency(value?: number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

// Interactive star rating component
function StarRating({ value, onChange, size = "md" }: { value: number; onChange?: (v: number) => void; size?: "sm" | "md" }) {
  const [hovered, setHovered] = useState(0);
  const s = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          className={`transition-transform ${onChange ? "hover:scale-110 cursor-pointer" : "cursor-default"}`}
        >
          <Star className={`${s} transition-colors ${(hovered || value) >= n ? "fill-amber-400 text-amber-400" : "text-gray-300 dark:text-zinc-600"}`} />
        </button>
      ))}
    </div>
  );
}

// Circular progress ring
function ProgressRing({ percent, size = 60, stroke = 5, color = "#10b981" }: { percent: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-gray-100 dark:text-zinc-800" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }} />
    </svg>
  );
}

const TABS = [
  { key: "learning", label: "My Learning", icon: BookOpen },
  { key: "tasks", label: "Tasks", icon: FileText },
] as const;
type TabKey = typeof TABS[number]["key"];

export default function LearningPage() {
  const { brandName } = useTenantConfig();
  const [activeTab, setActiveTab] = useState<TabKey>("learning");
  const [studentName, setStudentName] = useState("");
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [comment, setComment] = useState("");
  const [reviewBatchId, setReviewBatchId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTeaching, setReviewTeaching] = useState(5);
  const [reviewPunctuality, setReviewPunctuality] = useState(5);
  const [reviewComm, setReviewComm] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [savingAction, setSavingAction] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedSessions, setExpandedSessions] = useState<Record<number, boolean>>({});

  // Tasks
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");
  const [submittingTaskId, setSubmittingTaskId] = useState<number | null>(null);
  const [submitUrl, setSubmitUrl] = useState("");
  const [submitNotes, setSubmitNotes] = useState("");
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [submitNotice, setSubmitNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/student-portal/learning`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Could not load your learning profile.");
        setStudentName(data.student?.name || "Student");
        setStudent(data.student || null);
        setNotes(data.notes || []);
        setCourses(data.courses || []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load your learning profile.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError("");
    try {
      const response = await fetch(`${API_BASE_URL}/student-portal/tasks`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load tasks.");
      setTasks(data.tasks || []);
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : "Could not load tasks.");
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "tasks") void loadTasks();
  }, [activeTab, loadTasks]);

  const openSubmitDialog = (task: StudentTask) => {
    setSubmittingTaskId(task.id);
    setSubmitUrl(task.submission_url || "");
    setSubmitNotes(task.submission_notes || "");
    setSubmitFile(null);
    setSubmitError("");
    setSubmitNotice("");
  };

  const handleTaskSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!submittingTaskId) return;
    if (!submitUrl && !submitFile && !submitNotes) {
      setSubmitError("Provide a project URL, upload a file, or write notes before submitting.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const formData = new FormData();
      if (submitUrl) formData.append("submission_url", submitUrl);
      if (submitNotes) formData.append("submission_notes", submitNotes);
      if (submitFile) formData.append("file", submitFile);
      const response = await fetch(`${API_BASE_URL}/student-portal/tasks/${submittingTaskId}/submit`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not submit task.");
      setSubmitNotice("Task submitted successfully! ✅");
      setSubmittingTaskId(null);
      await loadTasks();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit task.");
    } finally {
      setSubmitting(false);
    }
  };

  const sessions = courses.flatMap(course => course.sessions.map(item => ({ ...item, courseTitle: course.course_title, batchName: course.batch_name, batchId: course.batch_id })));
  const liveSession = sessions.find(item => item.is_live);
  const nextSession = sessions.filter(item => new Date(item.scheduled_start).getTime() >= Date.now() && !item.is_live).sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))[0];
  const completedSessions = sessions.filter(item => item.progress.status === "Completed").length;
  const averageProgress = courses.length ? Math.round(courses.reduce((sum, course) => sum + course.progress_percent, 0) / courses.length) : 0;

  const totalFee = courses.reduce((s, c) => s + (c.total_fee ?? 0), 0);
  const totalPaid = courses.reduce((s, c) => s + (c.amount_paid ?? 0), 0);
  const totalDue = courses.reduce((s, c) => s + (c.amount_due ?? 0), 0);
  const feePercent = totalFee > 0 ? Math.round((totalPaid / totalFee) * 100) : 0;

  const addComment = async () => {
    if (!student || !comment.trim()) return;
    setSavingAction("comment");
    setActionMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/students/${student.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save your comment.");
      setNotes(current => [data.note, ...current]);
      setComment("");
      setActionMessage("Comment saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your comment.");
    } finally {
      setSavingAction("");
    }
  };

  const submitReview = async (course: CourseProgress) => {
    if (!course.instructor || !reviewText.trim()) return;
    setSavingAction(`review-${course.batch_id}`);
    setActionMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/instructors/${course.instructor.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructor_id: course.instructor.id,
          batch_id: course.batch_id,
          rating: reviewRating,
          teaching_quality: reviewTeaching,
          punctuality: reviewPunctuality,
          communication: reviewComm,
          feedback_text: reviewText.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not submit your review.");
      setCourses(current => current.map(item => item.batch_id === course.batch_id ? { ...item, review: data.review } : item));
      setReviewBatchId(null);
      setReviewText("");
      setActionMessage("Review submitted. Thank you for your feedback! 🙏");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not submit your review.");
    } finally {
      setSavingAction("");
    }
  };

  const downloadResource = async (resource: CourseProgress["resources"][number]) => {
    setSavingAction(`resource-${resource.id}`);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/institute-resources/${resource.id}/download`);
      if (!response.ok) throw new Error("Could not download this resource.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = resource.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Could not download this resource.");
    } finally {
      setSavingAction("");
    }
  };

  const downloadSlip = async (course: CourseProgress, type: "admission" | "advance") => {
    setSavingAction(`slip-${course.enrollment_id}`);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/enrollments/${course.enrollment_id}/generate-${type}-slip`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not generate this slip.");
      const pdf = new jsPDF();
      const heading = type === "admission" ? "ADMISSION SLIP" : "ADVANCE PAYMENT SLIP";
      pdf.setFontSize(18);
      pdf.text(brandName, 18, 20);
      pdf.setFontSize(14);
      pdf.text(heading, 18, 31);
      pdf.setFontSize(10);
      pdf.text(`Slip number: ${data.slip_number || course.slip_number || "—"}`, 18, 41);
      pdf.text(`Student: ${student?.name || "Student"}`, 18, 53);
      pdf.text(`Course: ${course.course_title}`, 18, 62);
      pdf.text(`Batch: ${course.batch_name}`, 18, 71);
      pdf.text(`Payment status: ${data.payment_status || course.payment_status}`, 18, 80);
      pdf.text(`Paid: ₹${Number(data.amount_paid ?? course.amount_paid ?? 0).toLocaleString("en-IN")}`, 18, 89);
      if (type === "admission") pdf.text(`Balance due: ₹${Number(data.amount_due ?? course.amount_due ?? 0).toLocaleString("en-IN")}`, 18, 98);
      pdf.save(`${type}-slip-${course.enrollment_id}.pdf`);
      setActionMessage(`${heading.toLowerCase()} downloaded.`);
    } catch (slipError) {
      setError(slipError instanceof Error ? slipError.message : "Could not generate this slip.");
    } finally {
      setSavingAction("");
    }
  };

  if (loading) return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-4 border-emerald-100 dark:border-emerald-900" />
        <div className="absolute inset-0 h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-emerald-600" />
      </div>
      <p className="text-sm text-gray-500 dark:text-zinc-400">Loading your learning dashboard…</p>
    </div>
  );

  const completedTasksCount = tasks.filter(t => t.status === "Done").length;
  const pendingTasksCount = tasks.filter(t => t.status !== "Done").length;

  return (
    <div className="space-y-8 pb-16">
      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-6 text-white shadow-lg shadow-emerald-600/20 sm:p-8">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-200">
              <GraduationCap className="h-3.5 w-3.5" /> Learning Overview
            </p>
            <h1 className="text-3xl font-black tracking-tight">Welcome back, {studentName} 👋</h1>
            <p className="mt-2 text-sm text-emerald-100/80">Your courses, progress, fees & schedule — all in one place.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-2xl font-black">{averageProgress}%</p>
              <p className="text-xs text-emerald-200">Avg. Progress</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black">{completedSessions}</p>
              <p className="text-xs text-emerald-200">Classes Done</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black">{courses.length}</p>
              <p className="text-xs text-emerald-200">{courses.length === 1 ? "Course" : "Courses"}</p>
            </div>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {actionMessage && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{actionMessage}</p>}

      {/* Student Info Cards */}
      {student && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Email", value: student.email, icon: Mail, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30" },
            { label: "Phone", value: student.phone, icon: Phone, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30" },
            { label: "Program", value: student.qualification || student.education_level, icon: GraduationCap, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
            { label: "Student Status", value: student.status, icon: Shield, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-zinc-400">{label}</p>
                <p className="mt-0.5 truncate text-sm font-semibold">{value || "Not recorded"}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Fee Transparency Panel */}
      {totalFee > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/30">
                <IndianRupee className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-zinc-100">Fee Transparency</h2>
                <p className="text-xs text-gray-500 dark:text-zinc-400">Your complete fee breakdown</p>
              </div>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${feePercent >= 100 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
              {feePercent}% Paid
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 mb-4">
            {[
              { label: "Total Fee", value: formatCurrency(totalFee), icon: CreditCard, color: "text-gray-700 dark:text-zinc-300", bg: "bg-gray-50 dark:bg-zinc-800" },
              { label: "Amount Paid", value: formatCurrency(totalPaid), icon: CheckCircle2, color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
              { label: "Balance Due", value: formatCurrency(totalDue), icon: AlertCircle, color: totalDue > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400", bg: totalDue > 0 ? "bg-rose-50 dark:bg-rose-950/30" : "bg-emerald-50 dark:bg-emerald-950/30" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className={`flex items-center gap-3 rounded-xl p-4 ${bg}`}>
                <Icon className={`h-5 w-5 shrink-0 ${color}`} />
                <div>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">{label}</p>
                  <p className={`text-lg font-black ${color}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Payment progress</span>
              <span>{formatCurrency(totalPaid)} of {formatCurrency(totalFee)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-700" style={{ width: `${Math.min(feePercent, 100)}%` }} />
            </div>
          </div>
        </section>
      )}

      {/* Live / Next Class Banner */}
      {liveSession ? (
        <section className="flex flex-col justify-between gap-5 rounded-2xl border border-emerald-800 bg-gradient-to-r from-emerald-950 to-teal-950 p-5 text-white shadow-lg shadow-emerald-900/30 sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-start gap-4">
            <span className="mt-0.5 flex h-12 w-12 shrink-0 animate-pulse items-center justify-center rounded-xl bg-emerald-500/20">
              <Radio className="h-6 w-6 text-emerald-300" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">🔴 Live Now</p>
              <h2 className="mt-1 text-xl font-bold">{liveSession.title}</h2>
              <p className="mt-1 text-sm text-emerald-200/70">{liveSession.courseTitle} · {liveSession.batchName}</p>
            </div>
          </div>
          {liveSession.meeting_url && (
            <a href={liveSession.meeting_url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6 py-3 text-sm font-bold text-emerald-950 hover:bg-emerald-300 transition-colors">
              Join Class <ArrowUpRight className="h-4 w-4" />
            </a>
          )}
        </section>
      ) : nextSession ? (
        <section className="flex items-center gap-4 rounded-2xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-900 dark:bg-sky-950/20">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950/50">
            <CalendarDays className="h-6 w-6 text-sky-700 dark:text-sky-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">Next Class</p>
            <h2 className="mt-1 truncate font-bold text-sky-900 dark:text-sky-100">{nextSession.title} <span className="font-normal text-sky-600/70 dark:text-sky-400/70">· {nextSession.courseTitle}</span></h2>
            <p className="mt-1 text-sm text-sky-700 dark:text-sky-300">{formatDate(nextSession.scheduled_start)}</p>
          </div>
          {nextSession.meeting_url && (
            <a href={nextSession.meeting_url} target="_blank" rel="noreferrer" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 hover:bg-sky-200 dark:bg-sky-900/50 dark:hover:bg-sky-800/50 transition-colors">
              <ArrowUpRight className="h-4 w-4 text-sky-700 dark:text-sky-300" />
            </a>
          )}
        </section>
      ) : null}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-zinc-800">
        <nav className="flex gap-1" role="tablist">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                role="tab"
                type="button"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  activeTab === tab.key
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.key === "tasks" && tasks.length > 0 && (
                  <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black ${pendingTasksCount > 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"}`}>
                    {pendingTasksCount > 0 ? pendingTasksCount : "✓"}
                  </span>
                )}
                {activeTab === tab.key && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-full bg-emerald-600" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tasks Tab */}
      {activeTab === "tasks" && (
        <div className="space-y-6">
          {submitNotice && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{submitNotice}</p>}
          {tasksError && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{tasksError}</div>}

          {tasks.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Tasks", value: tasks.length, color: "text-gray-800 dark:text-zinc-100", bg: "bg-white dark:bg-zinc-900", border: "border-gray-200 dark:border-zinc-800", icon: BarChart3 },
                { label: "Completed", value: completedTasksCount, color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800", icon: Trophy },
                { label: "Pending", value: pendingTasksCount, color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", icon: Clock3 },
              ].map(({ label, value, color, bg, border, icon: Icon }) => (
                <div key={label} className={`flex flex-col items-center rounded-xl border p-5 ${bg} ${border}`}>
                  <Icon className={`h-5 w-5 mb-2 ${color}`} />
                  <p className={`text-3xl font-black ${color}`}>{value}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">{label}</p>
                </div>
              ))}
            </div>
          )}

          {tasksLoading ? (
            <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-700" /></div>
          ) : tasks.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-zinc-800 px-6 py-16 text-center">
              <FileText className="mx-auto h-10 w-10 text-gray-300 dark:text-zinc-700" />
              <h3 className="mt-3 font-bold text-gray-700 dark:text-zinc-300">No tasks assigned yet</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">Tasks assigned from your batch will appear here to submit.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {tasks.map(task => {
                const isDone = task.status === "Done";
                const isOverdue = task.due_date && !isDone && new Date(task.due_date) < new Date();
                return (
                  <article key={task.id} className={`flex flex-col rounded-2xl border bg-white p-5 dark:bg-zinc-900 shadow-sm ${isDone ? "border-emerald-300 dark:border-emerald-800" : isOverdue ? "border-rose-300 dark:border-rose-800" : "border-gray-200 dark:border-zinc-800"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${isDone ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : isOverdue ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
                        {isDone ? <><CheckCircle2 className="h-3 w-3" /> Submitted</> : isOverdue ? "⚠ Overdue" : <><Clock3 className="h-3 w-3" /> Pending</>}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${task.priority === "High" || task.priority === "Urgent" ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400" : "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>{task.priority}</span>
                    </div>
                    <h3 className="mt-3 font-bold leading-snug text-gray-900 dark:text-zinc-100">{task.title}</h3>
                    {task.description && <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400 line-clamp-2">{task.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400 dark:text-zinc-500">
                      {task.batch_name && <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{task.batch_name}</span>}
                      {task.due_date && <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />Due {task.due_date}</span>}
                    </div>
                    {isDone && (task.submission_url || task.submission_file || task.submission_notes) && (
                      <div className="mt-4 space-y-1.5 rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/50">
                        <p className="font-bold text-emerald-700 dark:text-emerald-400">Your submission:</p>
                        {task.submission_url && <a href={task.submission_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sky-600 hover:underline dark:text-sky-400 truncate"><Link2 className="h-3.5 w-3.5 shrink-0" />{task.submission_url}</a>}
                        {task.submission_file && <a href={`${API_BASE_URL}${task.submission_file}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-emerald-700 hover:underline dark:text-emerald-400"><FileUp className="h-3.5 w-3.5" />Download submitted file</a>}
                        {task.submission_notes && <p className="text-gray-500 italic dark:text-zinc-400">"{task.submission_notes}"</p>}
                        {task.submitted_at && <p className="text-[10px] text-gray-400 dark:text-zinc-500">Submitted {new Date(task.submitted_at).toLocaleString()}</p>}
                      </div>
                    )}
                    <div className="mt-auto pt-4">
                      <button
                        type="button"
                        onClick={() => openSubmitDialog(task)}
                        className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${isDone ? "border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800" : "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-500 hover:to-emerald-600 shadow-sm shadow-emerald-600/20"}`}
                      >
                        {isDone ? <><ExternalLink className="h-4 w-4" /> Update Submission</> : <><Upload className="h-4 w-4" /> Submit & Mark Complete</>}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Task Submission Modal */}
          {submittingTaskId !== null && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) setSubmittingTaskId(null); }}>
              <form onSubmit={handleTaskSubmit} className="w-full max-w-lg space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
                <div>
                  <h2 className="text-lg font-black">Submit Task</h2>
                  <p className="text-sm text-gray-500 dark:text-zinc-400">Provide a project URL, upload your file, or write notes for your instructor.</p>
                </div>
                {submitError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{submitError}</div>}
                <label className="block">
                  <span className="text-xs font-bold text-gray-600 dark:text-zinc-400 uppercase tracking-wide">Project / Assignment URL</span>
                  <div className="mt-1.5 flex items-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800">
                    <Link2 className="mr-2 h-4 w-4 text-gray-400" />
                    <input type="url" value={submitUrl} onChange={e => setSubmitUrl(e.target.value)} placeholder="https://github.com/... or Google Drive link" className="w-full bg-transparent text-sm focus:outline-none" />
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-gray-600 dark:text-zinc-400 uppercase tracking-wide">Upload File (optional)</span>
                  <div className="mt-1.5 flex items-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                    <Upload className="mr-2 h-4 w-4 text-gray-400" />
                    <input type="file" onChange={(e: ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) setSubmitFile(e.target.files[0]); }} className="text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-emerald-700 file:px-3 file:py-1.5 file:text-white file:text-xs file:font-bold" />
                  </div>
                  {submitFile && <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">✓ Selected: {submitFile.name}</p>}
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-gray-600 dark:text-zinc-400 uppercase tracking-wide">Notes for Instructor</span>
                  <textarea rows={3} value={submitNotes} onChange={e => setSubmitNotes(e.target.value)} placeholder="Approach, credentials, comments…" className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </label>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" disabled={submitting} onClick={() => setSubmittingTaskId(null)} className="rounded-xl border border-gray-200 dark:border-zinc-700 px-4 py-2.5 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
                  <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60 transition-colors">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Submit & Mark Complete
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* My Learning Tab */}
      {activeTab === "learning" && (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900 dark:text-zinc-100">My Courses</h2>
              <span className="rounded-full bg-gray-100 dark:bg-zinc-800 px-3 py-1 text-xs font-semibold text-gray-600 dark:text-zinc-400">{completedSessions} sessions done</span>
            </div>

            {courses.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-zinc-800 px-6 py-16 text-center">
                <BookOpen className="mx-auto h-10 w-10 text-gray-300 dark:text-zinc-700" />
                <h3 className="mt-3 font-bold text-gray-700 dark:text-zinc-300">No Active Enrollments</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">Your courses will appear here once the institute enrolls you.</p>
              </div>
            ) : courses.map(course => {
              const sessionsExpanded = expandedSessions[course.enrollment_id] ?? false;
              const attendedCount = course.sessions.filter(s => s.attendance_status?.toLowerCase() === "present").length;
              const missedCount = course.sessions.filter(s => s.attendance_status?.toLowerCase() === "absent").length;
              const attendancePercent = course.sessions.length > 0 ? Math.round((attendedCount / course.sessions.length) * 100) : 0;

              return (
                <article key={course.enrollment_id} className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden">
                  {/* Course Header */}
                  <div className="border-b border-gray-100 dark:border-zinc-800 bg-gradient-to-r from-gray-50 to-white dark:from-zinc-950 dark:to-zinc-900 p-5">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-md">{course.batch_name}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${course.batch_status === "Active" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>{course.batch_status}</span>
                        </div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-zinc-100">{course.course_title}</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
                          {course.instructor_name ? `Instructor: ${course.instructor_name}` : "Instructor to be assigned"}
                          {course.schedule ? ` · ${course.schedule}` : ""}
                        </p>
                        {(course.start_date || course.end_date) && (
                          <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500 flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {course.start_date ? new Date(course.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "TBD"}
                            {" → "}
                            {course.end_date ? new Date(course.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "TBD"}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="relative flex items-center justify-center">
                          <ProgressRing percent={course.progress_percent} size={64} stroke={6} />
                          <span className="absolute text-xs font-black text-gray-900 dark:text-zinc-100">{course.progress_percent}%</span>
                        </div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Course progress</span>
                        <span>{course.progress_percent}% complete</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-700" style={{ width: `${course.progress_percent}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Attendance Stats */}
                  {course.sessions.length > 0 && (
                    <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-zinc-800 border-b border-gray-100 dark:border-zinc-800">
                      {[
                        { label: "Attended", value: attendedCount, color: "text-emerald-700 dark:text-emerald-400" },
                        { label: "Missed", value: missedCount, color: missedCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-gray-600 dark:text-zinc-400" },
                        { label: "Attendance", value: `${attendancePercent}%`, color: attendancePercent >= 75 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="p-4 text-center">
                          <p className={`text-xl font-black ${color}`}>{value}</p>
                          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Fee Section */}
                  <div className="p-5 border-b border-gray-100 dark:border-zinc-800">
                    <div className="rounded-xl bg-gray-50 dark:bg-zinc-800/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div>
                          <p className="text-xs text-gray-500 dark:text-zinc-400">Enrollment · {course.enrollment_status || "Active"}</p>
                          <p className="mt-1 text-sm font-bold text-gray-900 dark:text-zinc-100">{course.payment_status || "Pending"} · Slip {course.slip_number || "pending"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-emerald-700 dark:text-emerald-400">Paid {formatCurrency(course.amount_paid)}</p>
                          <p className="text-xs text-gray-400 dark:text-zinc-500">Balance {formatCurrency(course.amount_due)}</p>
                          {course.total_fee && <p className="text-xs text-gray-400 dark:text-zinc-500">Total {formatCurrency(course.total_fee)}</p>}
                        </div>
                      </div>
                      {course.total_fee && course.total_fee > 0 && (
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
                          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600" style={{ width: `${Math.min(((course.amount_paid ?? 0) / course.total_fee) * 100, 100)}%` }} />
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void downloadSlip(course, "admission")} disabled={savingAction === `slip-${course.enrollment_id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-bold hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors">
                          <Download className="h-3.5 w-3.5" /> Admission Slip
                        </button>
                        <button type="button" onClick={() => void downloadSlip(course, "advance")} disabled={savingAction === `slip-${course.enrollment_id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-bold hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors">
                          <Download className="h-3.5 w-3.5" /> Advance Slip
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sessions */}
                  <div className="p-5 border-b border-gray-100 dark:border-zinc-800">
                    <button type="button" onClick={() => setExpandedSessions(prev => ({ ...prev, [course.enrollment_id]: !sessionsExpanded }))} className="flex w-full items-center justify-between text-left">
                      <h4 className="flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                        <CalendarDays className="h-4 w-4 text-sky-600" />
                        Class Sessions
                        <span className="text-xs font-normal text-gray-400 dark:text-zinc-500">({course.sessions.length})</span>
                      </h4>
                      {sessionsExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </button>
                    {sessionsExpanded && (
                      <div className="mt-4 space-y-2">
                        {course.sessions.length ? course.sessions.map(item => {
                          const isPast = new Date(item.scheduled_start) < new Date();
                          const isCompleted = item.progress.status === "Completed";
                          const isAttended = item.attendance_status?.toLowerCase() === "present";
                          const isAbsent = item.attendance_status?.toLowerCase() === "absent";
                          return (
                            <div key={item.id} className={`flex flex-col gap-2 rounded-xl p-3 sm:flex-row sm:items-center border ${isCompleted ? "bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900" : isPast ? "bg-gray-50 dark:bg-zinc-800/30 border-gray-100 dark:border-zinc-800" : "bg-sky-50/50 dark:bg-sky-950/10 border-sky-100 dark:border-sky-900"}`}>
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${isCompleted ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" : "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                                  {isCompleted ? "✓" : "○"}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-zinc-100">{item.title}</p>
                                  <p className="text-xs text-gray-400 dark:text-zinc-500">{formatDate(item.scheduled_start)}{item.topic ? ` · ${item.topic}` : ""}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs shrink-0">
                                {isAttended && <span className="flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 px-2 py-0.5 font-bold"><CheckCircle2 className="h-3 w-3" /> Present</span>}
                                {isAbsent && <span className="flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 px-2 py-0.5 font-bold">✗ Absent</span>}
                                {!item.attendance_status && isPast && <span className="text-gray-400 dark:text-zinc-500">Not marked</span>}
                                {item.meeting_url && <a href={item.meeting_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400"><ExternalLink className="h-3 w-3" /> Join</a>}
                              </div>
                            </div>
                          );
                        }) : <p className="text-sm text-gray-500 dark:text-zinc-400">No class sessions scheduled yet.</p>}
                      </div>
                    )}
                    {!sessionsExpanded && course.sessions.length > 0 && (
                      <p className="mt-2 text-xs text-gray-400 dark:text-zinc-500">{course.sessions.length} sessions · click to expand</p>
                    )}
                  </div>

                  {/* Instructor Card */}
                  {course.instructor && (
                    <div className="p-5 border-b border-gray-100 dark:border-zinc-800">
                      <h4 className="flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100 mb-3">
                        <UserRound className="h-4 w-4 text-violet-600" /> Your Instructor
                      </h4>
                      <div className="flex items-start gap-4 rounded-xl bg-violet-50 dark:bg-violet-950/20 p-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-400 text-xl font-black">
                          {course.instructor.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="font-black text-gray-900 dark:text-zinc-100">{course.instructor.name}</h5>
                          <p className="text-xs text-violet-700 dark:text-violet-400 mt-0.5">{[course.instructor.qualification, course.instructor.expertise, course.instructor.experience_years ? `${course.instructor.experience_years} yrs exp` : null].filter(Boolean).join(" · ") || "Course Instructor"}</p>
                          {course.instructor.bio && <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400 line-clamp-2">{course.instructor.bio}</p>}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {course.instructor.email && <a href={`mailto:${course.instructor.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 dark:border-violet-900 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-bold text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"><Mail className="h-3.5 w-3.5" /> Email</a>}
                            {course.instructor.phone && <a href={`tel:${course.instructor.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 dark:border-violet-900 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-bold text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"><Phone className="h-3.5 w-3.5" /> Call</a>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Resources */}
                  <div className="p-5 border-b border-gray-100 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                        <BookOpen className="h-4 w-4 text-blue-600" /> Course Materials
                      </h4>
                      <span className="text-xs text-gray-400 dark:text-zinc-500">{course.resources?.length || 0} files</span>
                    </div>
                    {course.resources?.length ? (
                      <div className="space-y-2">
                        {course.resources.map(resource => (
                          <div key={resource.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/30 p-3">
                            <div className="min-w-0 flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-gray-800 dark:text-zinc-200">{resource.title}</p>
                                <p className="text-xs text-gray-400 dark:text-zinc-500">{resource.filename} · {Math.max(1, Math.ceil(resource.size_bytes / 1024))} KB{resource.description ? ` · ${resource.description}` : ""}</p>
                              </div>
                            </div>
                            <button type="button" onClick={() => void downloadResource(resource)} disabled={savingAction === `resource-${resource.id}`} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-xs font-bold disabled:opacity-50 transition-colors">
                              <Download className="h-3.5 w-3.5" />{savingAction === `resource-${resource.id}` ? "Downloading…" : "Download"}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl bg-gray-50 dark:bg-zinc-800/30 px-4 py-4 text-sm text-gray-500 dark:text-zinc-400">No materials shared yet. Check back after your first class.</p>
                    )}
                  </div>

                  {/* Instructor Review */}
                  <div className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <h4 className="flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                        <ThumbsUp className="h-4 w-4 text-amber-600" /> Rate Your Instructor
                      </h4>
                      {course.review && (
                        <span className="flex items-center gap-1 text-sm font-bold text-amber-600 dark:text-amber-400">
                          <StarRating value={course.review.rating} size="sm" /> Review Submitted
                        </span>
                      )}
                    </div>

                    {course.review ? (
                      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <StarRating value={course.review.rating} size="sm" />
                          <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{course.review.rating}/5</span>
                        </div>
                        {course.review.feedback_text && <p className="text-sm text-gray-600 dark:text-zinc-400 italic">"{course.review.feedback_text}"</p>}
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {course.review.teaching_quality && <div className="text-center"><p className="font-bold text-gray-800 dark:text-zinc-200">{course.review.teaching_quality}/5</p><p className="text-gray-400 dark:text-zinc-500">Teaching</p></div>}
                          {course.review.punctuality && <div className="text-center"><p className="font-bold text-gray-800 dark:text-zinc-200">{course.review.punctuality}/5</p><p className="text-gray-400 dark:text-zinc-500">Punctuality</p></div>}
                          {course.review.communication && <div className="text-center"><p className="font-bold text-gray-800 dark:text-zinc-200">{course.review.communication}/5</p><p className="text-gray-400 dark:text-zinc-500">Communication</p></div>}
                        </div>
                      </div>
                    ) : course.instructor ? (
                      <div className="space-y-4">
                        {reviewBatchId === course.batch_id ? (
                          <>
                            <div className="space-y-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/30 p-4">
                              {/* Overall Rating */}
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-gray-700 dark:text-zinc-300">Overall Rating</span>
                                <StarRating value={reviewRating} onChange={setReviewRating} />
                              </div>
                              {/* Teaching Quality */}
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-600 dark:text-zinc-400">Teaching Quality</span>
                                <StarRating value={reviewTeaching} onChange={setReviewTeaching} size="sm" />
                              </div>
                              {/* Punctuality */}
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-600 dark:text-zinc-400">Punctuality</span>
                                <StarRating value={reviewPunctuality} onChange={setReviewPunctuality} size="sm" />
                              </div>
                              {/* Communication */}
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-600 dark:text-zinc-400">Communication</span>
                                <StarRating value={reviewComm} onChange={setReviewComm} size="sm" />
                              </div>
                            </div>
                            <textarea value={reviewText} onChange={event => setReviewText(event.target.value)} rows={3} placeholder="Share what went well, what could improve, specific examples…" className="w-full resize-y rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                            <div className="flex flex-wrap justify-end gap-2">
                              <button type="button" onClick={() => setReviewBatchId(null)} className="rounded-xl border border-gray-200 dark:border-zinc-700 px-4 py-2 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
                              <button type="button" onClick={() => void submitReview(course)} disabled={!reviewText.trim() || savingAction === `review-${course.batch_id}`} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 transition-colors">
                                {savingAction === `review-${course.batch_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                                Submit Review
                              </button>
                            </div>
                          </>
                        ) : (
                          <button type="button" onClick={() => { setReviewBatchId(course.batch_id); setReviewRating(5); setReviewTeaching(5); setReviewPunctuality(5); setReviewComm(5); }} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-200 dark:border-amber-900 px-4 py-4 text-sm font-bold text-amber-700 dark:text-amber-400 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors">
                            <Star className="h-4 w-4" /> Write a Review for {course.instructor.name}
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 dark:text-zinc-500">Instructor not yet assigned. Reviews open once your instructor is confirmed.</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            {/* Progress Summary */}
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-5">
              <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100 mb-4"><TrendingUp className="h-4 w-4 text-emerald-600" /> At a Glance</h3>
              <div className="flex items-center gap-4 mb-4">
                <ProgressRing percent={averageProgress} size={72} stroke={7} />
                <div>
                  <p className="text-3xl font-black text-gray-900 dark:text-zinc-100">{averageProgress}<span className="text-base font-medium text-gray-400">%</span></p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">Average Progress</p>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { label: "Sessions Completed", value: completedSessions, icon: CheckCircle2, color: "text-emerald-600" },
                  { label: "Active Courses", value: courses.length, icon: BookOpen, color: "text-blue-600" },
                  { label: "Total Fee Paid", value: formatCurrency(totalPaid), icon: IndianRupee, color: "text-indigo-600" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-zinc-800/50 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400"><Icon className={`h-3.5 w-3.5 ${color}`} />{label}</span>
                    <span className="text-sm font-black text-gray-900 dark:text-zinc-100">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming Classes */}
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-5">
              <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100 mb-4"><Clock3 className="h-4 w-4 text-sky-600" /> Upcoming Classes</h3>
              {sessions.filter(item => new Date(item.scheduled_start).getTime() >= Date.now()).sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start)).slice(0, 5).map((item, idx) => (
                <div key={item.id} className={`border-l-2 border-sky-400 pl-3 ${idx > 0 ? "mt-3" : ""}`}>
                  <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200 leading-snug">{item.title}</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{formatDate(item.scheduled_start)}</p>
                  <p className="text-[10px] text-sky-600 dark:text-sky-400 mt-0.5">{item.courseTitle}</p>
                </div>
              ))}
              {!sessions.some(item => new Date(item.scheduled_start).getTime() >= Date.now()) && (
                <p className="text-sm text-gray-400 dark:text-zinc-500">Nothing scheduled yet.</p>
              )}
            </div>

            {/* Comments */}
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100"><MessageSquare className="h-4 w-4 text-violet-600" /> My Notes</h3>
                <span className="text-xs text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">{notes.length}</span>
              </div>
              <form className="space-y-2" onSubmit={event => { event.preventDefault(); void addComment(); }}>
                <textarea value={comment} onChange={event => setComment(event.target.value)} rows={3} placeholder="Add a note or question for your institute…" className="w-full resize-y rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                <button type="submit" disabled={!comment.trim() || savingAction === "comment"} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 transition-colors">
                  <Send className="h-3.5 w-3.5" />{savingAction === "comment" ? "Saving…" : "Post Note"}
                </button>
              </form>
              <div className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1">
                {notes.map(note => (
                  <article key={note.id} className="border-l-2 border-violet-400 pl-3">
                    <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-zinc-300">{note.content}</p>
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-zinc-500">{new Date(note.created_at).toLocaleString()}</p>
                  </article>
                ))}
                {!notes.length && <p className="text-sm text-gray-400 dark:text-zinc-500">No notes yet.</p>}
              </div>
            </div>

            {/* My Profile */}
            {student && (
              <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-5">
                <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100 mb-4"><UserRound className="h-4 w-4 text-emerald-600" /> My Profile</h3>
                <dl className="space-y-3 text-sm">
                  {[
                    { label: "Address", value: student.address },
                    { label: "Education", value: student.education_level },
                    { label: "Qualification", value: student.qualification },
                    { label: "GPA", value: student.gpa },
                    { label: "Career Goal", value: student.career_goal },
                    { label: "Guardian", value: student.guardian_name },
                    { label: "Guardian Phone", value: student.guardian_phone },
                  ].filter(f => f.value).map(item => (
                    <div key={item.label} className="flex justify-between gap-3">
                      <dt className="text-xs text-gray-400 dark:text-zinc-500 shrink-0">{item.label}</dt>
                      <dd className="text-xs font-semibold text-gray-700 dark:text-zinc-300 text-right break-words">{String(item.value)}</dd>
                    </div>
                  ))}
                  {![student.address, student.education_level, student.qualification, student.gpa, student.career_goal, student.guardian_name, student.guardian_phone].some(Boolean) && (
                    <p className="text-xs text-gray-400 dark:text-zinc-500">No additional profile data recorded.</p>
                  )}
                </dl>
              </div>
            )}

            {/* Achievement Banner */}
            {averageProgress >= 50 && (
              <div className="rounded-2xl bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 p-5 text-white shadow-md">
                <div className="flex items-center gap-3">
                  <Award className="h-8 w-8 text-white" />
                  <div>
                    <p className="font-black text-sm">Great Progress! 🎉</p>
                    <p className="text-xs text-white/80 mt-0.5">{averageProgress}% through your course. Keep going!</p>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </section>
      )}
    </div>
  );
}