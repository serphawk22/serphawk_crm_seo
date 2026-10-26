"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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

  useEffect(() => {
    const load = async () => {
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
    };
    void load();
  }, [params.id]);

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
          <p className="text-xs text-[var(--text-secondary)]">Duration</p>
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
            {batches.length} batches
          </p>
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
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold">Course batches</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Each batch has its own instructor, schedule, roster, and tasks.
            </p>
          </div>
          <span className="text-sm text-[var(--text-secondary)]">
            {batches.reduce((sum, batch) => sum + batch.enrolled_count, 0)} total enrolled
          </span>
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
                    <th className="px-4 py-3 font-medium">Batch</th>
                    <th className="px-4 py-3 font-medium">Dates</th>
                    <th className="px-4 py-3 font-medium">Instructor</th>
                    <th className="px-4 py-3 font-medium">Students</th>
                    <th className="px-4 py-3 font-medium">Status</th>
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
                              Due: {summary.due_date}
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
                              <th className="pb-2 pr-4 font-medium">Student</th>
                              <th className="pb-2 pr-4 font-medium">Status</th>
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
                                        <CheckCircle2 className="h-3 w-3" /> Done
                                      </>
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
    </div>
  );
}