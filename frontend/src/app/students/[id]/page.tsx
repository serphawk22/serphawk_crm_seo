"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  FileUp,
  LayoutDashboard,
  Link2,
  Loader2,
  Mail,
  Phone,
  Send,
  Upload,
  UserRound,
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import CreateInstituteLoginButton from "@/components/CreateInstituteLoginButton";
import StudentLifecyclePanel, { StudentProfileData } from "@/components/StudentLifecyclePanel";
import StudentEnrollmentActions from "@/components/StudentEnrollmentActions";
import StudentExecutiveOverview from "@/components/StudentExecutiveOverview";

// Email / Follow-ups tabs for students need student support in the email stack, which has not been ported yet.
const RECORD_TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
] as const;
type RecordTab = (typeof RECORD_TABS)[number]["key"];

interface Enrollment {
  id: number;
  batch_id?: number;
  course_id?: number;
  batch_name?: string | null;
  course_title?: string | null;
  total_fee: number;
  amount_paid: number;
  amount_due: number;
  payment_status: string;
  status: string;
  enrollment_date: string;
  slip_number?: string | null;
}

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

interface StudentRecord {
  id: number;
  user_id?: number | null;
  lead_id?: number | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  gender?: string | null;
  qualification?: string | null;
  course_interest?: string | null;
  education_level?: string | null;
  gpa?: number | null;
  academic_background?: string | null;
  career_goal?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  status: string;
  source?: string | null;
  created_at: string;
}

function parseErrorDetail(detail: unknown, fallback: string): string {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) return String((item as { msg: string }).msg);
        return JSON.stringify(item);
      })
      .join(", ");
  }
  if (typeof detail === "object") {
    return JSON.stringify(detail);
  }
  return fallback;
}

export default function StudentDetailsPage() {
  const params = useParams<{ id: string }>();
  const { role } = useRole();
  const canCreateLogin = role === "Admin" || role === "SuperAdmin";
  const canManageEnrollment = ["Admin", "Employee", "SalesManager", "Demo", "SuperAdmin"].includes(role);
  // Email and Follow-ups are staff tools: a student viewing their own profile or an instructor never sees them.
  const showRecordTabs = false;
  const [activeTab, setActiveTab] = useState<RecordTab>("overview");

  // Deep links such as /students/12?tab=followups (follow-up reminders, the Inbox).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && RECORD_TABS.some((t) => t.key === tab)) setActiveTab(tab as RecordTab);
  }, []);

  const [student, setStudent] = useState<StudentRecord | null>(null);
  const [profile, setProfile] = useState<StudentProfileData | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Submission Form State for Tasks
  const [submittingTaskId, setSubmittingTaskId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitUrl, setSubmitUrl] = useState("");
  const [submitNotes, setSubmitNotes] = useState("");
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitNotice, setSubmitNotice] = useState("");
  const [submitError, setSubmitError] = useState("");

  const getAuthHeaders = useCallback((extra: Record<string, string> = {}) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
    let userId: string | null = null;
    if (userStr) {
      try {
        userId = String(JSON.parse(userStr)?.id);
      } catch {}
    }
    return {
      ...extra,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { "X-User-ID": userId } : {}),
    };
  }, []);

  const load = useCallback(async () => {
    const rawId = params?.id;
    if (!rawId || rawId === "undefined" || isNaN(Number(rawId))) {
      setError("Invalid student ID. Please select a valid student from the directory.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/students/${rawId}`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(parseErrorDetail(data?.detail, "Could not load this student."));
      }
      setProfile(data);
      setStudent(data.student);
      setEnrollments(data.enrollments || []);
      setTasks(data.tasks || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this student.");
    } finally {
      setLoading(false);
    }
  }, [params?.id, getAuthHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const openSubmitDialog = (task: StudentTask) => {
    setSubmittingTaskId(task.id);
    setSubmitUrl(task.submission_url || "");
    setSubmitNotes(task.submission_notes || "");
    setSubmitFile(null);
    setSubmitNotice("");
    setSubmitError("");
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
    setSubmitNotice("");

    try {
      const formData = new FormData();
      if (submitUrl) formData.append("submission_url", submitUrl);
      if (submitNotes) formData.append("submission_notes", submitNotes);
      formData.append("status", "Done");
      if (submitFile) formData.append("file", submitFile);

      const response = await fetch(`${API_BASE_URL}/tasks/${submittingTaskId}/submit`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(parseErrorDetail(data?.detail, "Could not submit task."));

      setSubmitNotice("Task marked as completed successfully!");
      setSubmittingTaskId(null);
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit task.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="flex min-h-72 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-800" />
      </div>
    );
  if (!student)
    return (
      <div className="space-y-6">
        <Link
          href="/students"
          className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Students
        </Link>
        <div className="mx-auto max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-xl font-bold">Student Not Found</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {error || "The student profile you requested does not exist or has an invalid ID."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/students"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <UserRound className="h-4 w-4" />
              Go to Students List
            </Link>
          </div>
        </div>
      </div>
    );

  const completedTasksCount = tasks.filter((t) => t.status === "Done").length;

  return (
    <div className="space-y-7">
      <Link
        href="/students"
        className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Students
      </Link>

      <header className="flex flex-col justify-between gap-5 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            <UserRound className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-emerald-800 dark:text-emerald-400">
              Student profile · {student.status}
            </p>
            <h1 className="mt-1 truncate text-3xl font-bold">{student.name}</h1>
            <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">
              {student.email || "No email"} · {student.phone || "No phone"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreateLogin && (
            <CreateInstituteLoginButton
              profileId={student.id}
              profileKind="students"
              hasAccount={Boolean(student.user_id)}
              hasEmail={Boolean(student.email)}
              onCreated={() => void load()}
            />
          )}
          {student.lead_id && (
            <Link
              href={`/leads/${student.lead_id}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium"
            >
              Source lead <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </header>

      {showRecordTabs && (
        <nav className="flex flex-wrap gap-1 border-b border-[var(--border)]" aria-label="Student record">
          {RECORD_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${activeTab === key ? "border-emerald-700 text-emerald-800 dark:border-emerald-400 dark:text-emerald-300" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      )}


      {(!showRecordTabs || activeTab === "overview") && (<>
      {submitNotice && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {submitNotice}
        </div>
      )}

      {/* Sales & Admin First Slide: Executive Analytics, Donut Charts & Academic Performance */}
      <StudentExecutiveOverview
        student={student}
        enrollments={enrollments}
        tasks={tasks}
        performance={profile?.performance}
        salesperson={profile?.salesperson}
        lead={profile?.lead}
        onRecordPaymentClick={() => {
          const enrollSec = document.getElementById("enrollment-section");
          enrollSec?.scrollIntoView({ behavior: "smooth" });
        }}
      />

      <div id="enrollment-section">
        <StudentEnrollmentActions
          studentId={student.id}
          enrollments={enrollments}
          canManage={canManageEnrollment}
          onRefresh={() => void load()}
        />
      </div>

      {profile && <StudentLifecyclePanel profile={profile} onRefresh={() => void load()} />}

      {/* Student Assigned Tasks Section */}
      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-semibold">Assigned tasks & project submissions</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Tasks assigned from your course batches. Submit files, GitHub / project URLs, and mark tasks complete.
            </p>
          </div>
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            {completedTasksCount} of {tasks.length} tasks completed
          </span>
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-10 text-center">
            <FileText className="mx-auto h-7 w-7 text-[var(--text-secondary)]" />
            <p className="mt-3 font-medium">No tasks assigned to this student</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Tasks assigned via course batches will appear here for student submission.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {tasks.map((task) => {
              const isDone = task.status === "Done";
              return (
                <article
                  key={task.id}
                  className="flex flex-col justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
                          isDone
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}
                      >
                        {isDone ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> Completed
                          </>
                        ) : (
                          <>
                            <Clock className="h-3 w-3" /> Pending Submission
                          </>
                        )}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {task.priority} priority
                      </span>
                    </div>

                    <h3 className="mt-2 text-base font-semibold">{task.title}</h3>
                    {task.description && (
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{task.description}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
                      {task.batch_name && <span>Batch: {task.batch_name}</span>}
                      {task.due_date && <span>Due: {task.due_date}</span>}
                    </div>

                    {/* Submission Details if already submitted */}
                    {isDone && (task.submission_url || task.submission_file || task.submission_notes) && (
                      <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-xs space-y-1.5">
                        <p className="font-semibold text-[var(--text-primary)]">Student Submission:</p>
                        {task.submission_url && (
                          <div className="flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5 text-sky-600" />
                            <a
                              href={task.submission_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-700 hover:underline dark:text-sky-400 truncate"
                            >
                              {task.submission_url}
                            </a>
                          </div>
                        )}
                        {task.submission_file && (
                          <div className="flex items-center gap-1.5">
                            <FileUp className="h-3.5 w-3.5 text-emerald-600" />
                            <a
                              href={`${API_BASE_URL}${task.submission_file}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-700 hover:underline dark:text-emerald-400"
                            >
                              Download submitted file
                            </a>
                          </div>
                        )}
                        {task.submission_notes && (
                          <p className="text-[var(--text-secondary)] italic">
                            &ldquo;{task.submission_notes}&rdquo;
                          </p>
                        )}
                        {task.submitted_at && (
                          <p className="text-[10px] text-[var(--text-secondary)]">
                            Submitted on {new Date(task.submitted_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-[var(--border)] flex justify-end">
                    <button
                      type="button"
                      onClick={() => openSubmitDialog(task)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                        isDone
                          ? "border border-[var(--border)] hover:bg-[var(--background)]"
                          : "bg-emerald-800 text-white hover:bg-emerald-700"
                      }`}
                    >
                      {isDone ? "Update submission" : "Submit & mark complete"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Task Submission Modal */}
      {submittingTaskId !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) setSubmittingTaskId(null);
          }}
        >
          <form
            onSubmit={handleTaskSubmit}
            className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl space-y-4"
          >
            <div>
              <h2 className="text-lg font-semibold">Submit task assignment</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Provide your project repository or live demo link, and/or upload your assignment file.
              </p>
            </div>

            {submitError && (
              <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {submitError}
              </div>
            )}

            <label className="block">
              <span className="text-xs font-medium">Project / Assignment URL</span>
              <div className="mt-1 flex items-center rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2">
                <Link2 className="h-4 w-4 mr-2 text-[var(--text-secondary)]" />
                <input
                  type="url"
                  value={submitUrl}
                  onChange={(e) => setSubmitUrl(e.target.value)}
                  placeholder="https://github.com/... or https://drive.google.com/..."
                  className="w-full bg-transparent text-sm focus:outline-none"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-xs font-medium">Upload Assignment File (Optional)</span>
              <div className="mt-1 flex items-center rounded-md border border-dashed border-[var(--border)] bg-[var(--background)] p-3">
                <Upload className="h-4 w-4 mr-2 text-[var(--text-secondary)]" />
                <input
                  type="file"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    if (e.target.files && e.target.files[0]) {
                      setSubmitFile(e.target.files[0]);
                    }
                  }}
                  className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-sky-800 file:text-white file:text-xs"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-xs font-medium">Notes / Remarks</span>
              <textarea
                rows={2}
                value={submitNotes}
                onChange={(e) => setSubmitNotes(e.target.value)}
                placeholder="Any comments, credentials, or instructions..."
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setSubmittingTaskId(null)}
                className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Submit & mark complete
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Enrollment history & Student information */}
      <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Enrollment history</h2>
            <span className="text-sm text-[var(--text-secondary)]">
              {enrollments.length} enrollments
            </span>
          </div>
          {enrollments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-10 text-center">
              <BookOpen className="mx-auto h-7 w-7 text-[var(--text-secondary)]" />
              <p className="mt-3 font-medium">No enrollments yet</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Create an enrollment from the institute enrollment workspace.
              </p>
              <Link
                href="/enrollments"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:underline dark:text-emerald-300"
              >
                Open enrollments <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            enrollments.map((item) => (
              <article
                key={item.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row">
                  <div>
                    <p className="text-xs font-medium text-emerald-800 dark:text-emerald-400">
                      {item.status} · {item.payment_status}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">
                      <Link href={`/courses/${item.course_id}`} className="hover:underline">
                        {item.course_title || "Course"}
                      </Link>
                    </h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      <Link href={`/batches/${item.batch_id}`} className="hover:underline">
                        {item.batch_name || "Batch"}
                      </Link>{" "}
                      · Enrolled {new Date(item.enrollment_date).toLocaleDateString()}
                    </p>
                  </div>
                  <Link
                    href="/enrollments"
                    className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                  >
                    Enrollment details <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-4 text-sm">
                  <div>
                    <p className="text-xs text-[var(--text-secondary)]">Tuition</p>
                    <p className="mt-1 font-semibold">₹{item.total_fee.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-secondary)]">Paid</p>
                    <p className="mt-1 font-semibold text-emerald-800 dark:text-emerald-300">
                      ₹{item.amount_paid.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-secondary)]">Balance</p>
                    <p className="mt-1 font-semibold">₹{item.amount_due.toLocaleString()}</p>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        <aside className="space-y-4 h-fit">
          {/* Salesperson Assignment (Admin/SalesManager only) */}
          {(role === "Admin" || role === "SalesManager" || role === "SuperAdmin") && (
            <SalespersonPanel
              studentId={student.id}
              currentSalespersonId={(profile as { salesperson?: { id: number; name: string } | null })?.salesperson?.id ?? null}
              currentSalespersonName={(profile as { salesperson?: { id: number; name: string } | null })?.salesperson?.name ?? null}
              getAuthHeaders={getAuthHeaders}
              onRefresh={() => void load()}
            />
          )}

          {/* Payment Reminder (salesperson panel) */}
          {canManageEnrollment && enrollments.some(e => Number(e.amount_due) > 0) && (
            <PaymentReminderPanel
              studentId={student.id}
              studentName={student.name}
              studentPhone={student.phone ?? null}
              enrollments={enrollments}
              getAuthHeaders={getAuthHeaders}
              onRefresh={() => void load()}
            />
          )}

          {/* Student info sidebar */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="font-semibold">Student information</h2>
            <dl className="mt-4 space-y-4 text-sm">
              {[
                { label: "Email", value: student.email },
                { label: "Phone", value: student.phone },
                { label: "Address", value: student.address },
                { label: "Gender", value: student.gender },
                { label: "Course interest", value: student.course_interest },
                { label: "Education", value: student.education_level },
                { label: "GPA", value: student.gpa },
                { label: "Qualification", value: student.qualification },
                { label: "Academic background", value: student.academic_background },
                { label: "Career goal", value: student.career_goal },
                { label: "Lead source", value: student.source },
                { label: "Guardian", value: student.guardian_name },
                { label: "Guardian phone", value: student.guardian_phone },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-xs text-[var(--text-secondary)]">{item.label}</dt>
                  <dd className="mt-1 break-words">{item.value || "Not recorded"}</dd>
                </div>
              ))}
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">Added</dt>
                <dd className="mt-1 inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  {new Date(student.created_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </section>
      </>)}
    </div>
  );
}

// ---- Salesperson Assignment Panel ----
function SalespersonPanel({
  studentId, currentSalespersonId, currentSalespersonName, getAuthHeaders, onRefresh,
}: {
  studentId: number;
  currentSalespersonId: number | null;
  currentSalespersonName: string | null;
  getAuthHeaders: (extra?: Record<string, string>) => Record<string, string>;
  onRefresh: () => void;
}) {
  const [salespeople, setSalespeople] = useState<{ id: number; name: string; role: string }[]>([]);
  const [selectedId, setSelectedId] = useState(currentSalespersonId ? String(currentSalespersonId) : "");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`${API_BASE_URL}/users`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => {
        const sp = (d.users || []).filter((u: { role: string }) => ["Sales", "SalesManager", "Employee", "Admin"].includes(u.role));
        setSalespeople(sp);
      })
      .catch(() => {});
  }, [getAuthHeaders]);

  const save = async () => {
    setSaving(true);
    setErr("");
    setNotice("");
    try {
      const response = await fetch(`${API_BASE_URL}/students/${studentId}`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ assigned_salesperson_id: selectedId ? Number(selectedId) : null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(parseErrorDetail(data?.detail, "Could not assign salesperson."));
      setNotice("Salesperson assigned.");
      onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not assign salesperson.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
      <h2 className="font-semibold flex items-center gap-2">
        <UserRound className="h-4 w-4 text-sky-700" />
        Assigned salesperson
      </h2>
      {currentSalespersonName && (
        <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">Currently: {currentSalespersonName}</p>
      )}
      {err && <p className="text-xs text-rose-700">{err}</p>}
      {notice && <p className="text-xs text-emerald-700">{notice}</p>}
      <div className="flex gap-2">
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="flex-1 min-h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
        >
          <option value="">— Not assigned —</option>
          {salespeople.map(sp => (
            <option key={sp.id} value={sp.id}>{sp.name} ({sp.role})</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-800 px-3 text-xs font-semibold text-white disabled:opacity-50 hover:bg-sky-700"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Assign
        </button>
      </div>
      <p className="text-xs text-[var(--text-secondary)]">The assigned salesperson can view this student's full profile, follow up on payments, and manage enrollments.</p>
    </div>
  );
}

// ---- Payment Reminder Panel ----
function PaymentReminderPanel({
  studentId, studentName, studentPhone, enrollments, getAuthHeaders, onRefresh,
}: {
  studentId: number;
  studentName: string;
  studentPhone: string | null;
  enrollments: Enrollment[];
  getAuthHeaders: (extra?: Record<string, string>) => Record<string, string>;
  onRefresh: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");

  const totalDue = enrollments.reduce((s, e) => s + Number(e.amount_due || 0), 0);
  if (totalDue <= 0) return null;

  const logReminder = async () => {
    setSaving(true);
    setErr("");
    setNotice("");
    try {
      const response = await fetch(`${API_BASE_URL}/students/${studentId}/payment-reminder`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ amount_due: totalDue, notes: notes.trim() || undefined, scheduled_at: scheduledAt || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(parseErrorDetail(data?.detail, "Could not log reminder."));
      setNotice("📞 Reminder call logged in activity notes.");
      setNotes("");
      setScheduledAt("");
      onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not log reminder.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 space-y-3 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2 text-amber-900 dark:text-amber-200">
          <Phone className="h-4 w-4" />
          Payment reminder call
        </h2>
        <span className="text-sm font-bold text-amber-800 dark:text-amber-300">₹{totalDue.toLocaleString()} due</span>
      </div>
      <p className="text-xs text-amber-800 dark:text-amber-300">Log a reminder call to {studentName} for the outstanding balance. This will appear in the student's activity notes.</p>
      {studentPhone && (
        <a
          href={`tel:${studentPhone}`}
          className="inline-flex items-center gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 dark:bg-transparent dark:text-amber-200 dark:border-amber-700"
        >
          <Phone className="h-4 w-4" /> Call {studentPhone}
        </a>
      )}
      {err && <p className="text-xs text-rose-700">{err}</p>}
      {notice && <p className="text-xs text-emerald-700 font-medium">{notice}</p>}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-amber-900 dark:text-amber-200">
          Schedule call for (optional)
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
            className="mt-1 w-full rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm dark:bg-amber-950 dark:border-amber-700"
          />
        </label>
        <label className="block text-xs font-medium text-amber-900 dark:text-amber-200">
          Notes (optional)
          <textarea
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="What did the student say? Next follow-up date?"
            className="mt-1 w-full resize-none rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm dark:bg-amber-950 dark:border-amber-700"
          />
        </label>
        <button
          type="button"
          onClick={() => void logReminder()}
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Log reminder call
        </button>
      </div>
    </div>
  );
}