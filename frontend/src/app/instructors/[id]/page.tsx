"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Award,
  BarChart3,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
  ListTodo,
  Loader2,
  PieChart as PieIcon,
  Star,
  UserCheck,
  UserRound,
  UserX,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { API_BASE_URL } from "@/config";
import CreateInstituteLoginButton from "@/components/CreateInstituteLoginButton";

interface InstructorBatch {
  id: number;
  batch_name: string;
  status: string;
  course_title?: string | null;
  enrolled_count: number;
  max_seats: number;
  start_date?: string | null;
  classes_scheduled: number;
  classes_completed: number;
  classes_pending: number;
  attendance_present: number;
  attendance_missed: number;
  attendance_rate: number;
  tasks_given: number;
  tasks_completed: number;
  task_completion_rate: number;
}

interface InstructorRecord {
  id: number;
  user_id?: number | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  expertise?: string | null;
  qualification?: string | null;
  experience_years?: number | null;
  bio?: string | null;
  is_active: boolean;
}

interface InstructorStats {
  classes_scheduled: number;
  classes_completed: number;
  classes_pending: number;
  classes_cancelled: number;
  attended_count: number;
  missed_count: number;
  attendance_rate: number;
  total_tasks_given: number;
  tasks_completed_count: number;
  tasks_pending_count: number;
  task_completion_rate: number;
}

interface PieDataItem {
  name: string;
  value: number;
  color: string;
}

const ATTENDANCE_COLORS = ["#10b981", "#f43f5e", "#f59e0b"];
const TASK_COLORS = ["#10b981", "#3b82f6"];

export default function InstructorDetailsPage() {
  const params = useParams<{ id: string }>();
  const [instructor, setInstructor] = useState<InstructorRecord | null>(null);
  const [batches, setBatches] = useState<InstructorBatch[]>([]);
  const [stats, setStats] = useState<InstructorStats | null>(null);
  const [rating, setRating] = useState(0);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const response = await fetch(`${API_BASE_URL}/instructors/${params.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load this instructor.");
      setInstructor(data.instructor);
      setBatches(data.batches || []);
      setStats(data.stats || null);
      setRating(data.avg_rating || 0);
      setFeedbackCount(data.feedback_count || 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this instructor.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading)
    return (
      <div className="flex min-h-72 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
      </div>
    );
  if (!instructor)
    return (
      <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
        {error || "Instructor not found."}
      </div>
    );

  // Fallbacks if stats not provided
  const scheduledCount = stats?.classes_scheduled ?? 0;
  const attendedCount = stats?.attended_count ?? 0;
  const missedCount = stats?.missed_count ?? 0;
  const pendingCount = stats?.classes_pending ?? 0;
  const tasksGiven = stats?.total_tasks_given ?? 0;
  const taskRate = stats?.task_completion_rate ?? 0;
  const tasksDone = stats?.tasks_completed_count ?? 0;

  // Chart data
  const attendanceChartData: PieDataItem[] = [
    { name: "Attended", value: attendedCount, color: "#10b981" },
    { name: "Missed", value: missedCount, color: "#f43f5e" },
    { name: "Pending", value: Math.max(0, scheduledCount - attendedCount - missedCount), color: "#f59e0b" },
  ].filter((item) => item.value > 0);

  const taskChartData: PieDataItem[] = [
    { name: "Completed Tasks", value: tasksDone, color: "#10b981" },
    { name: "Pending Tasks", value: Math.max(0, tasksGiven - tasksDone), color: "#3b82f6" },
  ].filter((item) => item.value > 0);

  const batchBarData = batches.map((b) => ({
    name: b.batch_name.length > 12 ? b.batch_name.slice(0, 12) + "..." : b.batch_name,
    "Attendance %": b.attendance_rate,
    "Task Done %": b.task_completion_rate,
    enrolled: b.enrolled_count,
  }));

  return (
    <div className="space-y-7">
      <Link
        href="/instructors"
        className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Instructors
      </Link>

      <header className="flex flex-col justify-between gap-5 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <UserRound className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase text-amber-800 dark:text-amber-400">
              Instructor · {instructor.is_active ? "Active" : "Inactive"}
            </p>
            <h1 className="mt-1 text-3xl font-bold">{instructor.name}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {instructor.expertise || "Expertise not added"} · {instructor.email || "No email"}
            </p>
          </div>
        </div>
        <CreateInstituteLoginButton
          profileId={instructor.id}
          profileKind="instructors"
          hasAccount={Boolean(instructor.user_id)}
          hasEmail={Boolean(instructor.email)}
          onCreated={() => void load()}
        />
      </header>

      {error && (
        <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Basic Metrics Cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Teaching batches</p>
          <p className="mt-2 text-2xl font-bold">{batches.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Rating</p>
          <p className="mt-2 inline-flex items-center gap-2 text-2xl font-bold">
            <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
            {rating || "—"}
            <span className="text-xs font-normal text-[var(--text-secondary)]">
              {feedbackCount} reviews
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Experience</p>
          <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold">
            <Briefcase className="h-4 w-4" />
            {instructor.experience_years ? `${instructor.experience_years} years` : "Not listed"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Qualification</p>
          <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold">
            <Award className="h-4 w-4" />
            {instructor.qualification || "Not listed"}
          </p>
        </div>
      </section>

      {/* Classes & Tasks Specific KPI Section */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-sky-700 dark:text-sky-400" />
          Class Schedule & Task Completion Metrics
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Classes scheduled</span>
              <CalendarDays className="h-4 w-4 text-sky-600" />
            </div>
            <p className="mt-2 text-2xl font-bold">{scheduledCount}</p>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Across all batches</p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Attended</span>
              <UserCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {attendedCount}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
              {stats?.attendance_rate ?? 0}% overall rate
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Missed</span>
              <UserX className="h-4 w-4 text-rose-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">{missedCount}</p>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Student absences</p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Pending classes</span>
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">{pendingCount}</p>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Upcoming sessions</p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Total tasks given</span>
              <ListTodo className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="mt-2 text-2xl font-bold">{tasksGiven}</p>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Assigned to students</p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Task completion %</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {taskRate}%
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
              {tasksDone}/{tasksGiven} completed
            </p>
          </div>
        </div>
      </section>

      {/* Visual Graphs & Pie Charts */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <PieIcon className="h-5 w-5 text-amber-600" />
          Performance & Attendance Analytics
        </h2>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Pie Chart 1: Attendance Breakdown */}
          <div className="flex flex-col justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <div>
              <h3 className="font-semibold text-sm">Class Attendance Breakdown</h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Student attendance records across all scheduled sessions.
              </p>
            </div>
            <div className="my-4 h-56 w-full">
              {attendanceChartData.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-xs text-[var(--text-secondary)]">
                  <UserCheck className="h-8 w-8 mb-2 opacity-40" />
                  No attendance records logged yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={attendanceChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      innerRadius={45}
                      paddingAngle={3}
                      label={({ name, percent }) =>
                        `${name}: ${percent ? (percent * 100).toFixed(0) : 0}%`
                      }
                      labelLine={false}
                    >
                      {attendanceChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: number | string | readonly (number | string)[] | undefined) => [
                        `${val ?? 0} students`,
                        "Total",
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex justify-around border-t border-[var(--border)] pt-3 text-xs text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Attended ({attendedCount})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Missed ({missedCount})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Pending ({pendingCount})
              </span>
            </div>
          </div>

          {/* Pie Chart 2: Task Completion Breakdown */}
          <div className="flex flex-col justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <div>
              <h3 className="font-semibold text-sm">Student Task Completion</h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Proportion of assigned coursework submitted by students.
              </p>
            </div>
            <div className="my-4 h-56 w-full">
              {taskChartData.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-xs text-[var(--text-secondary)]">
                  <ListTodo className="h-8 w-8 mb-2 opacity-40" />
                  No tasks assigned yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={taskChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      innerRadius={45}
                      paddingAngle={3}
                      label={({ name, percent }) =>
                        `${(name ?? "").split(" ")[0]}: ${percent ? (percent * 100).toFixed(0) : 0}%`
                      }
                      labelLine={false}
                    >
                      {taskChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: number | string | readonly (number | string)[] | undefined) => [
                        `${val ?? 0} tasks`,
                        "Count",
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex justify-around border-t border-[var(--border)] pt-3 text-xs text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Completed ({tasksDone})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Pending (
                {Math.max(0, tasksGiven - tasksDone)})
              </span>
              <span className="font-semibold text-emerald-600">{taskRate}% done</span>
            </div>
          </div>

          {/* Bar Chart 3: Batch Comparison */}
          <div className="flex flex-col justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <div>
              <h3 className="font-semibold text-sm">Batch Comparison (Attendance vs Tasks)</h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Side-by-side performance across this instructor&apos;s assigned batches.
              </p>
            </div>
            <div className="my-4 h-56 w-full">
              {batchBarData.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-xs text-[var(--text-secondary)]">
                  <BarChart3 className="h-8 w-8 mb-2 opacity-40" />
                  No batches to compare
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={batchBarData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis domain={[0, 100]} fontSize={11} unit="%" />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="Attendance %" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Task Done %" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="border-t border-[var(--border)] pt-3 text-right text-xs text-[var(--text-secondary)]">
              {batches.length} total active & completed batches
            </div>
          </div>
        </div>
      </section>

      {instructor.bio && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-semibold">Instructor profile bio</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{instructor.bio}</p>
        </section>
      )}

      {/* Assigned Batches List */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold">Assigned batches</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Open a batch to manage classes, scheduled calendar, attendance, and student tasks.
            </p>
          </div>
          <span className="text-sm text-[var(--text-secondary)]">
            {batches.reduce((total, batch) => total + batch.enrolled_count, 0)} students enrolled
          </span>
        </div>

        {batches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-10 text-center">
            <CalendarDays className="mx-auto h-7 w-7 text-[var(--text-secondary)]" />
            <p className="mt-3 font-medium">No batches assigned</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[760px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                    <th className="px-4 py-3 font-medium">Batch</th>
                    <th className="px-4 py-3 font-medium">Course</th>
                    <th className="px-4 py-3 font-medium">Starts</th>
                    <th className="px-4 py-3 font-medium">Enrolled</th>
                    <th className="px-4 py-3 font-medium">Classes (Done / Sched)</th>
                    <th className="px-4 py-3 font-medium">Attendance %</th>
                    <th className="px-4 py-3 font-medium">Task Done %</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          href={`/batches/${batch.id}`}
                          className="font-semibold text-sky-800 hover:underline dark:text-sky-300"
                        >
                          {batch.batch_name}
                        </Link>
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{batch.status}</p>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{batch.course_title || "—"}</td>
                      <td className="px-4 py-3">
                        {batch.start_date ? new Date(batch.start_date).toLocaleDateString() : "Not set"}
                      </td>
                      <td className="px-4 py-3">
                        {batch.enrolled_count}/{batch.max_seats}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          {batch.classes_completed}
                        </span>{" "}
                        / {batch.classes_scheduled}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--background)]">
                            <div
                              className="h-full bg-emerald-600"
                              style={{ width: `${batch.attendance_rate}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono">{batch.attendance_rate}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--background)]">
                            <div
                              className="h-full bg-sky-600"
                              style={{ width: `${batch.task_completion_rate}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono">{batch.task_completion_rate}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/batches/${batch.id}`}
                          aria-label={`Open ${batch.batch_name}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800 hover:underline dark:text-sky-400"
                        >
                          Open batch <ArrowUpRight className="h-3.5 w-3.5" />
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
    </div>
  );
}