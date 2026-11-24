"use client";
import LocalizedText from "@/components/LocalizedText";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  Users,
  Plus,
  X,
  UserPlus,
  Check,
  GraduationCap
} from "lucide-react";
import { API_BASE_URL } from "@/config";

interface CourseBatch {
  id: number;
  batch_name: string;
  batch_code?: string | null;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  schedule?: string | null;
  mode: string;
  enrolled_count: number;
  max_seats: number;
  instructor_name?: string | null;
}

interface TaskStudentSubmission {
  task_id: number;
  student_id: number;
  student_name: string;
  status: string;
  submission_url?: string | null;
  submission_file?: string | null;
  submission_notes?: string | null;
  submitted_at?: string | null;
}

interface TaskSummary {
  title: string;
  description?: string | null;
  due_date?: string | null;
  priority: string;
  batch_id: number;
  batch_name: string;
  total_assigned: number;
  completed_count: number;
  completion_percent: number;
  students: TaskStudentSubmission[];
}

interface CourseDetails {
  id: number;
  title: string;
  category?: string | null;
  description?: string | null;
  duration_weeks?: number | null;
  duration_hours?: number | null;
  price: number;
  advance_amount: number;
  prerequisites?: string | null;
  is_active: boolean;
}

export default function CourseDetailsPage() {
  const params = useParams<{ id: string }>();
  const [course, setCourse] = useState<CourseDetails | null>(null);
  const [batches, setBatches] = useState<CourseBatch[]>([]);
  const [taskSummaries, setTaskSummaries] = useState<TaskSummary[]>([]);
  const [totalTasksAssigned, setTotalTasksAssigned] = useState(0);
  const [totalTasksCompleted, setTotalTasksCompleted] = useState(0);
  const [expandedTaskKey, setExpandedTaskKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create Batch Modal State
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [instructors, setInstructors] = useState<any[]>([]);
  const [batchForm, setBatchForm] = useState({
    batch_name: "",
    batch_code: "",
    start_date: "",
    end_date: "",
    schedule: "",
    session_duration_hours: 1,
    mode: "Offline",
    max_seats: 30,
    room_or_link: "",
    instructor_id: "",
    is_new_instructor: false,
    new_instructor_name: "",
    new_instructor_email: "",
    new_instructor_phone: "",
    new_instructor_expertise: "",
    new_instructor_experience: "",
  });
  const [savingBatch, setSavingBatch] = useState(false);
  const [batchError, setBatchError] = useState("");

  const load = useCallback(async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const response = await fetch(`${API_BASE_URL}/courses/${params.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load this course.");
      setCourse(data.course);
      setBatches(data.batches || []);
      setTaskSummaries(data.task_summaries || []);
      setTotalTasksAssigned(data.total_tasks_assigned || 0);
      setTotalTasksCompleted(data.total_tasks_completed || 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this course.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Load active instructors for batch assignment
  useEffect(() => {
    if (!showBatchModal) return;
    const fetchInst = async () => {
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const res = await fetch(`${API_BASE_URL}/instructors`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.instructors)) {
          setInstructors(data.instructors);
        }
      } catch {}
    };
    void fetchInst();
  }, [showBatchModal]);

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchForm.batch_name.trim()) return;
    setSavingBatch(true);
    setBatchError("");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      let instructorId: number | null = batchForm.instructor_id ? Number(batchForm.instructor_id) : null;

      // 1. If creating a new instructor inline
      if (batchForm.is_new_instructor) {
        if (!batchForm.new_instructor_name.trim()) {
          throw new Error("Instructor name is required.");
        }
        const instRes = await fetch(`${API_BASE_URL}/instructors`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            name: batchForm.new_instructor_name.trim(),
            email: batchForm.new_instructor_email.trim() || undefined,
            phone: batchForm.new_instructor_phone.trim() || undefined,
            expertise: batchForm.new_instructor_expertise.trim() || course?.title || undefined,
            experience_years: batchForm.new_instructor_experience ? parseInt(batchForm.new_instructor_experience) : undefined,
          }),
        });
        const instData = await instRes.json();
        if (!instRes.ok) throw new Error(instData.detail || "Could not create instructor profile.");
        instructorId = instData.instructor?.id || instData.id;
      }

      // 2. Create the batch
      const batchPayload = {
        course_id: Number(params.id),
        instructor_id: instructorId,
        batch_name: batchForm.batch_name.trim(),
        batch_code: batchForm.batch_code.trim() || undefined,
        start_date: batchForm.start_date || undefined,
        end_date: batchForm.end_date || undefined,
        schedule: batchForm.schedule.trim() || undefined,
        session_duration_hours: Number(batchForm.session_duration_hours) || 1,
        mode: batchForm.mode,
        max_seats: Number(batchForm.max_seats) || 30,
        room_or_link: batchForm.room_or_link.trim() || undefined,
        assignment_strategy: "manual",
        status: "Upcoming",
      };

      const res = await fetch(`${API_BASE_URL}/batches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(batchPayload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not create batch.");

      setShowBatchModal(false);
      setBatchForm({
        batch_name: "",
        batch_code: "",
        start_date: "",
        end_date: "",
        schedule: "",
        session_duration_hours: 1,
        mode: "Offline",
        max_seats: 30,
        room_or_link: "",
        instructor_id: "",
        is_new_instructor: false,
        new_instructor_name: "",
        new_instructor_email: "",
        new_instructor_phone: "",
        new_instructor_expertise: "",
        new_instructor_experience: "",
      });
      await load();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Failed to create batch.");
    } finally {
      setSavingBatch(false);
    }
  };

  if (loading)
    return (
      <div className="flex min-h-72 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-sky-800" />
      </div>
    );
  if (!course)
    return (
      <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
        {error || "Course not found."}
      </div>
    );

  const overallCompletionRate =
    totalTasksAssigned > 0 ? Math.round((totalTasksCompleted / totalTasksAssigned) * 100) : 0;

  return (
    <div className="space-y-7">
      <Link
        href="/courses"
        className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Course catalog
      </Link>

      <header className="border-b border-[var(--border)] pb-6">
        <p className="text-xs font-semibold uppercase text-sky-800 dark:text-sky-300">
          {course.category || "Course"} · {course.is_active ? "Active" : "Inactive"}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{course.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
          {course.description || "No course description has been added."}
        </p>
      </header>

      {/* KPI Cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Tuition</p>
          <p className="mt-2 text-lg font-semibold">₹{course.price.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]"><LocalizedText text={"Duration"} /></p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="h-4 w-4" />
            {course.duration_weeks ? `${course.duration_weeks} weeks` : "Not set"}
            {course.duration_hours ? ` · ${course.duration_hours} hours` : ""}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Active batches</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4" />
            {batches.length} <LocalizedText text={"batches"} /></p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Tasks completion</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            {totalTasksCompleted}/{totalTasksAssigned} ({overallCompletionRate}%)
          </p>
        </div>
      </section>

      {course.prerequisites && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-semibold">Prerequisites</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{course.prerequisites}</p>
        </section>
      )}

      {/* Course Batches Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Course batches</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Each batch has its own instructor, schedule, roster, and tasks.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--text-secondary)]">
              {batches.reduce((sum, batch) => sum + batch.enrolled_count, 0)} total enrolled
            </span>
            <button
              type="button"
              onClick={() => {
                setBatchError("");
                setShowBatchModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Batch</span>
            </button>
          </div>
        </div>
        {batches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-10 text-center">
            <CalendarDays className="mx-auto h-7 w-7 text-[var(--text-secondary)]" />
            <p className="mt-3 font-medium">No batches have been scheduled</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                    <th className="px-4 py-3 font-medium"><LocalizedText text={"Batch"} /></th>
                    <th className="px-4 py-3 font-medium">Dates</th>
                    <th className="px-4 py-3 font-medium"><LocalizedText text={"Instructor"} /></th>
                    <th className="px-4 py-3 font-medium"><LocalizedText text={"Students"} /></th>
                    <th className="px-4 py-3 font-medium"><LocalizedText text={"Status"} /></th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-3">
                        <Link className="font-semibold hover:underline" href={`/batches/${batch.id}`}>
                          {batch.batch_name}
                        </Link>
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                          {batch.batch_code || "No code"} · {batch.schedule || "Schedule pending"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {batch.start_date ? new Date(batch.start_date).toLocaleDateString() : "Not set"}
                        {batch.end_date ? ` – ${new Date(batch.end_date).toLocaleDateString()}` : ""}
                      </td>
                      <td className="px-4 py-3 text-sm">{batch.instructor_name || "Unassigned"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <Users className="h-4 w-4 text-[var(--text-secondary)]" />
                          {batch.enrolled_count}/{batch.max_seats}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-[var(--background)] px-2 py-1 text-xs font-medium">
                          {batch.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/batches/${batch.id}`} aria-label={`Open ${batch.batch_name}`}>
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Course Tasks Section */}
      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-semibold">Course tasks & assignments</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              All tasks assigned across batches in this course, and how many students have completed them.
            </p>
          </div>
          <span className="text-sm text-[var(--text-secondary)]">
            {taskSummaries.length} task assignments ({totalTasksCompleted} completed)
          </span>
        </div>

        {taskSummaries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-10 text-center">
            <FileText className="mx-auto h-7 w-7 text-[var(--text-secondary)]" />
            <p className="mt-3 font-medium">No tasks assigned for this course yet</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Open any course batch and use &ldquo;+ Task for all&rdquo; to assign coursework.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {taskSummaries.map((summary) => {
              const taskKey = `${summary.title}-${summary.batch_id}`;
              const isExpanded = expandedTaskKey === taskKey;
              return (
                <article
                  key={taskKey}
                  className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-all"
                >
                  <div className="p-5">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/batches/${summary.batch_id}`}
                            className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 hover:underline dark:bg-sky-950 dark:text-sky-300"
                          >
                            Batch: {summary.batch_name}
                          </Link>
                          <span className="rounded bg-[var(--background)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                            {summary.priority} priority
                          </span>
                          {summary.due_date && (
                            <span className="text-xs text-[var(--text-secondary)]">
                              <LocalizedText text={"Due:"} /> {summary.due_date}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2 font-semibold text-lg">{summary.title}</h3>
                        {summary.description && (
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">{summary.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right sm:min-w-36">
                          <p className="text-sm font-semibold">
                            {summary.completed_count} / {summary.total_assigned} done
                          </p>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--background)]">
                            <div
                              className="h-full bg-emerald-600"
                              style={{ width: `${summary.completion_percent}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">
                            {summary.completion_percent}% completed
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedTaskKey(isExpanded ? null : taskKey)}
                          className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:bg-[var(--background)]"
                        >
                          {isExpanded ? "Hide" : "Review"} ({summary.students.length})
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Student Submissions List */}
                  {isExpanded && (
                    <div className="border-t border-[var(--border)] bg-[var(--background)]/50 p-5">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[620px] text-left text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                              <th className="pb-2 pr-4 font-medium"><LocalizedText text={"Student"} /></th>
                              <th className="pb-2 pr-4 font-medium"><LocalizedText text={"Status"} /></th>
                              <th className="pb-2 pr-4 font-medium">Project URL</th>
                              <th className="pb-2 pr-4 font-medium">Uploaded File</th>
                              <th className="pb-2 font-medium">Submitted Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.students.map((studentSub, subIdx) => (
                              <tr
                                key={`course-task-${summary.title}-${studentSub.student_id ?? subIdx}`}
                                className="border-b border-[var(--border)] last:border-0"
                              >
                                <td className="py-2.5 pr-4 font-medium">
                                  {studentSub.student_id ? (
                                    <Link
                                      href={`/students/${studentSub.student_id}`}
                                      className="hover:underline"
                                    >
                                      {studentSub.student_name}
                                    </Link>
                                  ) : (
                                    <span>{studentSub.student_name}</span>
                                  )}
                                </td>
                                <td className="py-2.5 pr-4">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
                                      studentSub.status === "Done"
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                    }`}
                                  >
                                    {studentSub.status === "Done" ? (
                                      <>
                                        <CheckCircle2 className="h-3 w-3" /> <LocalizedText text={"Done"} /> </>
                                    ) : (
                                      "Pending"
                                    )}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-4">
                                  {studentSub.submission_url ? (
                                    <a
                                      href={studentSub.submission_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-800 hover:underline dark:text-sky-400"
                                    >
                                      Open Link <ExternalLink className="h-3 w-3" />
                                    </a>
                                  ) : (
                                    <span className="text-xs text-[var(--text-secondary)]">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 pr-4">
                                  {studentSub.submission_file ? (
                                    <a
                                      href={`${API_BASE_URL}${studentSub.submission_file}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-800 hover:underline dark:text-sky-400"
                                    >
                                      Download File <ExternalLink className="h-3 w-3" />
                                    </a>
                                  ) : (
                                    <span className="text-xs text-[var(--text-secondary)]">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 text-xs text-[var(--text-secondary)]">
                                  {studentSub.submitted_at
                                    ? new Date(studentSub.submitted_at).toLocaleDateString()
                                    : "Not submitted"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Create Batch Modal */}
      <AnimatePresence>
        {showBatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-2xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden my-8"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">Create Course Batch</h2>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      Schedule a new batch for <span className="font-semibold text-slate-700 dark:text-zinc-300">{course.title}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleCreateBatch} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                {batchError && (
                  <div role="alert" className="p-3 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                    {batchError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                      Batch Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Nov 2026 Morning Batch"
                      value={batchForm.batch_name}
                      onChange={e => setBatchForm(f => ({ ...f, batch_name: e.target.value }))}
                      className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                      Batch Code (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. FS-B1-NOV26"
                      value={batchForm.batch_code}
                      onChange={e => setBatchForm(f => ({ ...f, batch_code: e.target.value }))}
                      className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={batchForm.start_date}
                      onChange={e => setBatchForm(f => ({ ...f, start_date: e.target.value }))}
                      className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={batchForm.end_date}
                      onChange={e => setBatchForm(f => ({ ...f, end_date: e.target.value }))}
                      className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                      Class Slot Duration
                    </label>
                    <select
                      value={batchForm.session_duration_hours}
                      onChange={e => setBatchForm(f => ({ ...f, session_duration_hours: Number(e.target.value) }))}
                      className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                    >
                      <option value={1}>1 hour / session</option>
                      <option value={2}>2 hours / session</option>
                      <option value={3}>3 hours / session</option>
                      <option value={4}>4 hours / session</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                      Delivery Mode
                    </label>
                    <select
                      value={batchForm.mode}
                      onChange={e => setBatchForm(f => ({ ...f, mode: e.target.value }))}
                      className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                    >
                      <option value="Offline">Offline / Classroom</option>
                      <option value="Online">Online / Virtual</option>
                      <option value="Hybrid">Hybrid</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                      Max Seats
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={batchForm.max_seats}
                      onChange={e => setBatchForm(f => ({ ...f, max_seats: Number(e.target.value) || 30 }))}
                      className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                    Schedule (Days & Times)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mon, Wed, Fri 10:00 AM – 12:00 PM"
                    value={batchForm.schedule}
                    onChange={e => setBatchForm(f => ({ ...f, schedule: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                    Location, Room, or Meeting Link (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Lab 3 / https://meet.google.com/xyz"
                    value={batchForm.room_or_link}
                    onChange={e => setBatchForm(f => ({ ...f, room_or_link: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                  />
                </div>

                {/* INSTRUCTOR SELECTION / INLINE CREATION */}
                <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <GraduationCap className="w-4 h-4 text-indigo-600" />
                      <span>Batch Instructor Assignment</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setBatchForm(f => ({ ...f, is_new_instructor: !f.is_new_instructor }))}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 underline"
                    >
                      {batchForm.is_new_instructor ? "Select Existing Instructor" : "+ Create New Instructor Inline"}
                    </button>
                  </div>

                  {!batchForm.is_new_instructor ? (
                    <div>
                      <select
                        value={batchForm.instructor_id}
                        onChange={e => setBatchForm(f => ({ ...f, instructor_id: e.target.value }))}
                        className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                      >
                        <option value="">(Unassigned / Assign Later)</option>
                        {instructors.map((inst) => (
                          <option key={inst.id} value={inst.id}>
                            {inst.name} {inst.expertise ? `— ${inst.expertise}` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Select an existing instructor from your faculty list, or click &quot;+ Create New Instructor Inline&quot; above.
                      </p>
                    </div>
                  ) : (
                    /* Inline New Instructor Form */
                    <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 rounded-xl space-y-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>New Instructor Profile</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 block mb-0.5">
                            Instructor Name <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            required={batchForm.is_new_instructor}
                            placeholder="Full name"
                            value={batchForm.new_instructor_name}
                            onChange={e => setBatchForm(f => ({ ...f, new_instructor_name: e.target.value }))}
                            className="w-full text-xs px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 block mb-0.5">
                            Email (Optional)
                          </label>
                          <input
                            type="email"
                            placeholder="instructor@institution.com"
                            value={batchForm.new_instructor_email}
                            onChange={e => setBatchForm(f => ({ ...f, new_instructor_email: e.target.value }))}
                            className="w-full text-xs px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 block mb-0.5">
                            Phone (Optional)
                          </label>
                          <input
                            type="tel"
                            placeholder="Phone number"
                            value={batchForm.new_instructor_phone}
                            onChange={e => setBatchForm(f => ({ ...f, new_instructor_phone: e.target.value }))}
                            className="w-full text-xs px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 block mb-0.5">
                            Subject / Expertise
                          </label>
                          <input
                            type="text"
                            placeholder={course.title}
                            value={batchForm.new_instructor_expertise}
                            onChange={e => setBatchForm(f => ({ ...f, new_instructor_expertise: e.target.value }))}
                            className="w-full text-xs px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setShowBatchModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingBatch}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition disabled:opacity-50"
                  >
                    {savingBatch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>{savingBatch ? "Creating Batch..." : "Create Batch"}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}