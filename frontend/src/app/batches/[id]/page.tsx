"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Filter,
  GraduationCap,
  ListOrdered,
  Loader2,
  MapPin,
  Monitor,
  Plus,
  Radio,
  Search,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import RecurringSessionScheduler from "./RecurringSessionScheduler";
import BatchRosterActions from "./BatchRosterActions";

interface BatchStudent {
  id: number;
  student_id?: number;
  name: string;
  attendance_status?: string | null;
  progress_status: string;
  completion_percent: number;
}

interface ClassSession {
  id: number;
  session_number: number;
  title: string;
  topic?: string | null;
  scheduled_start: string;
  scheduled_end?: string | null;
  status: string;
  is_live: boolean;
  meeting_url?: string | null;
  notes?: string | null;
  students: BatchStudent[];
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

interface BatchTaskSummary {
  title: string;
  description?: string | null;
  due_date?: string | null;
  priority: string;
  batch_id: number;
  total_assigned: number;
  completed_count: number;
  completion_percent: number;
  students: TaskStudentSubmission[];
}

interface BatchDetails {
  id: number;
  batch_name: string;
  batch_code?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  schedule?: string | null;
  mode: string;
  status: string;
  room_or_link?: string | null;
  max_seats: number;
}

interface BatchPayload {
  batch: BatchDetails;
  course?: { id: number; title: string } | null;
  instructor?: { id: number; name: string } | null;
  students: BatchStudent[];
  task_summaries?: BatchTaskSummary[];
  total_tasks_assigned?: number;
  total_tasks_completed?: number;
}

const ATTENDANCE_OPTIONS = ["Present", "Absent", "Late"];
const SESSION_STATUSES = ["Scheduled", "Live", "Completed", "Cancelled"];

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export default function BatchDetailsPage() {
  const params = useParams<{ id: string }>();
  const batchId = params.id;
  const { role } = useRole();
  const canManage = ["Admin", "Employee", "Instructor"].includes(role);

  const [batchData, setBatchData] = useState<BatchPayload | null>(null);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [progressValues, setProgressValues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionKey, setActionKey] = useState("");
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Tabs state: 'classes' (Scheduled Classes), 'calendar' (Calendar view), 'tasks' (Tasks & assignments), 'roster' (Students)
  const [activeTab, setActiveTab] = useState<"classes" | "calendar" | "tasks" | "roster">("classes");
  const [calendarDate, setCalendarDate] = useState(() => dateKey(new Date()));
  const [classFilter, setClassFilter] = useState<"all" | "upcoming" | "completed">("all");
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);
  const [expandedTaskTitle, setExpandedTaskTitle] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    topic: "",
    scheduled_start: "",
    scheduled_end: "",
    meeting_url: "",
    notes: "",
  });

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
    setLoading(true);
    setError("");
    try {
      const headers = getAuthHeaders();
      const [batchResponse, sessionResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/batches/${batchId}`, { headers }),
        fetch(`${API_BASE_URL}/batches/${batchId}/sessions`, { headers }),
      ]);
      const [batchResult, sessionResult] = await Promise.all([
        batchResponse.json(),
        sessionResponse.json(),
      ]);
      if (!batchResponse.ok) throw new Error(batchResult.detail || "Could not load this batch.");
      if (!sessionResponse.ok) throw new Error(sessionResult.detail || "Could not load the class schedule.");
      setBatchData(batchResult);
      setSessions(sessionResult.sessions || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this batch.");
    } finally {
      setLoading(false);
    }
  }, [batchId, getAuthHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const createSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/batches/${batchId}/sessions`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...form,
          scheduled_start: new Date(form.scheduled_start).toISOString(),
          scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : null,
          status: "Scheduled",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not create the session.");
      setShowCreate(false);
      setForm({ title: "", topic: "", scheduled_start: "", scheduled_end: "", meeting_url: "", notes: "" });
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not create the session.");
    } finally {
      setSaving(false);
    }
  };

  const updateSessionStatus = async (sessionId: number, status: string) => {
    setActionKey(`session-${sessionId}`);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/institute-sessions/${sessionId}`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not update session status.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update session status.");
    } finally {
      setActionKey("");
    }
  };

  const saveAttendance = async (sessionId: number, studentId: number, status: string) => {
    const key = `attendance-${sessionId}-${studentId}`;
    setActionKey(key);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/institute-sessions/${sessionId}/attendance`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ student_id: studentId, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save attendance.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save attendance.");
    } finally {
      setActionKey("");
    }
  };

  const saveProgress = async (sessionId: number, studentId: number, currentPercent: number) => {
    const completion = progressValues[`${sessionId}-${studentId}`] ?? currentPercent;
    const key = `progress-${sessionId}-${studentId}`;
    setActionKey(key);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/institute-sessions/${sessionId}/progress`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          student_id: studentId,
          completion_percent: completion,
          status: completion >= 100 ? "Completed" : completion > 0 ? "In Progress" : "Not Started",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save student progress.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save student progress.");
    } finally {
      setActionKey("");
    }
  };

  if (loading)
    return (
      <div className="flex min-h-80 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-sky-800" />
      </div>
    );
  if (!batchData)
    return (
      <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-5 text-sm text-rose-800">
        {error || "Batch not found."}
      </div>
    );

  const { batch, course, instructor, students, task_summaries = [] } = batchData;
  const seatUsage = batch.max_seats ? Math.min(100, Math.round((students.length / batch.max_seats) * 100)) : 0;

  // Filtered sessions for "Scheduled Classes" tab
  const nowTime = new Date().getTime();
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
  );

  const filteredSessions = sortedSessions.filter((s) => {
    if (classFilter === "upcoming") {
      return s.status === "Scheduled" || s.status === "Live" || new Date(s.scheduled_start).getTime() >= nowTime;
    }
    if (classFilter === "completed") {
      return s.status === "Completed" || new Date(s.scheduled_start).getTime() < nowTime;
    }
    return true;
  });

  const calendarDaySessions = sessions.filter(
    (classSession) => dateKey(classSession.scheduled_start) === calendarDate
  );

  const completedSessionsCount = sessions.filter((s) => s.status === "Completed").length;
  const pendingSessionsCount = sessions.filter((s) => s.status === "Scheduled" || s.status === "Live").length;
  const liveSession = sessions.find((s) => s.is_live);

  // Task stats
  const totalTasks = task_summaries.reduce((sum, t) => sum + t.total_assigned, 0);
  const completedTasks = task_summaries.reduce((sum, t) => sum + t.completed_count, 0);
  const overallTaskRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-7">
      <Link
        href="/batches"
        className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        All batches
      </Link>

      {/* Header */}
      <section className="flex flex-col justify-between gap-5 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-sky-800 dark:text-sky-300">
            <span>{course?.title || "Course"}</span>
            <span aria-hidden="true">/</span>
            <span>{batch.status}</span>
            {liveSession && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Session Active
              </span>
            )}
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{batch.batch_name}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {batch.batch_code || "No batch code"} · {instructor?.name || "Instructor not assigned"}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <RecurringSessionScheduler
              batchId={batch.id}
              batchStart={batch.start_date}
              batchEnd={batch.end_date}
              meetingUrl={batch.room_or_link}
              existingSessions={sessions}
              onCreated={load}
            />
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800"
            >
              <Plus className="h-4 w-4" />
              Schedule one session
            </button>
          </div>
        )}
      </section>

      {error && (
        <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Course dates</p>
          <p className="mt-2 text-sm font-semibold">
            {batch.start_date ? new Date(batch.start_date).toLocaleDateString() : "Start not set"}{" "}
            {batch.end_date ? `– ${new Date(batch.end_date).toLocaleDateString()}` : ""}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Class schedule</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="h-4 w-4 text-sky-800 dark:text-sky-300" />
            {batch.schedule || "Not set"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Class format</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
            {batch.mode === "Online" ? (
              <Monitor className="h-4 w-4 text-sky-800 dark:text-sky-300" />
            ) : (
              <MapPin className="h-4 w-4 text-sky-800 dark:text-sky-300" />
            )}
            {batch.mode}
            {batch.room_or_link ? ` · ${batch.room_or_link}` : ""}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--text-secondary)]">Class roster</p>
            <span className="text-sm font-semibold">
              {students.length}/{batch.max_seats}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--background)]">
            <div className="h-full bg-sky-800" style={{ width: `${seatUsage}%` }} />
          </div>
        </div>
      </section>

      {/* Roster Actions (Add students / Task for all / Share resource) */}
      {canManage && (
        <BatchRosterActions
          batchId={batch.id}
          students={students}
          maxSeats={batch.max_seats}
          onChanged={load}
        />
      )}

      {/* Tabs Navigation */}
      <div className="flex border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => setActiveTab("classes")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === "classes"
              ? "border-sky-800 text-sky-800 dark:border-sky-400 dark:text-sky-400"
              : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <CalendarDays className="h-4 w-4" />
          Scheduled Classes ({sessions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === "calendar"
              ? "border-sky-800 text-sky-800 dark:border-sky-400 dark:text-sky-400"
              : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Calendar className="h-4 w-4" />
          Schedule Calendar
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tasks")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === "tasks"
              ? "border-sky-800 text-sky-800 dark:border-sky-400 dark:text-sky-400"
              : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <FileText className="h-4 w-4" />
          Tasks & Assignments ({task_summaries.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("roster")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === "roster"
              ? "border-sky-800 text-sky-800 dark:border-sky-400 dark:text-sky-400"
              : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Users className="h-4 w-4" />
          Student Roster ({students.length})
        </button>
      </div>

      {/* Tab 1: Scheduled Classes */}
      {activeTab === "classes" && (
        <section className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-semibold">Scheduled classes & timeline</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                All planned sessions for this batch. Expand any session to mark attendance and track student progress.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border border-[var(--border)] p-0.5">
                <button
                  type="button"
                  onClick={() => setClassFilter("all")}
                  className={`rounded px-3 py-1 text-xs font-medium ${
                    classFilter === "all" ? "bg-sky-900 text-white" : "text-[var(--text-secondary)]"
                  }`}
                >
                  All ({sessions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setClassFilter("upcoming")}
                  className={`rounded px-3 py-1 text-xs font-medium ${
                    classFilter === "upcoming" ? "bg-sky-900 text-white" : "text-[var(--text-secondary)]"
                  }`}
                >
                  Upcoming / Live ({pendingSessionsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setClassFilter("completed")}
                  className={`rounded px-3 py-1 text-xs font-medium ${
                    classFilter === "completed" ? "bg-sky-900 text-white" : "text-[var(--text-secondary)]"
                  }`}
                >
                  Completed ({completedSessionsCount})
                </button>
              </div>
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-12 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-[var(--text-secondary)]" />
              <h3 className="mt-3 font-semibold">No classes match this filter</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {classFilter === "upcoming"
                  ? "All planned classes are complete, or none have been scheduled yet."
                  : "No scheduled sessions found for this batch."}
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="mt-4 text-sm font-semibold text-sky-800 hover:underline dark:text-sky-300"
                >
                  Schedule a session
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSessions.map((classSession) => {
                const isExpanded = expandedSessionId === classSession.id;
                return (
                  <article
                    key={classSession.id}
                    className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-all"
                  >
                    <div className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold ${
                            classSession.is_live
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : classSession.status === "Completed"
                              ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              : "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300"
                          }`}
                        >
                          {classSession.is_live ? (
                            <Radio className="h-5 w-5 animate-pulse" />
                          ) : (
                            <span>#{classSession.session_number}</span>
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-[var(--text-secondary)]">
                              Class {classSession.session_number}
                            </span>
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                                classSession.is_live
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : classSession.status === "Completed"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                  : "bg-[var(--background)] text-[var(--text-secondary)]"
                              }`}
                            >
                              {classSession.is_live ? "Live now" : classSession.status}
                            </span>
                          </div>
                          <h3 className="mt-1 font-semibold text-base">{classSession.title}</h3>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            {formatDate(classSession.scheduled_start)}
                            {classSession.topic ? ` · Topic: ${classSession.topic}` : ""}
                          </p>
                          {classSession.notes && (
                            <p className="mt-1 text-xs text-[var(--text-secondary)] italic">
                              Note: {classSession.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {classSession.meeting_url && (
                          <a
                            href={classSession.meeting_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--background)]"
                          >
                            Open class <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {canManage && (
                          <select
                            aria-label={`Session ${classSession.session_number} status`}
                            disabled={actionKey === `session-${classSession.id}`}
                            value={classSession.status}
                            onChange={(event) =>
                              void updateSessionStatus(classSession.id, event.target.value)
                            }
                            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-sm"
                          >
                            {SESSION_STATUSES.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedSessionId(isExpanded ? null : classSession.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface)]"
                        >
                          <Users className="h-4 w-4" />
                          Attendance ({classSession.students.length})
                        </button>
                      </div>
                    </div>

                    {/* Attendance Expander */}
                    {isExpanded && (
                      <div className="border-t border-[var(--border)] bg-[var(--background)]/50 p-5">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <Users className="h-4 w-4 text-[var(--text-secondary)]" />
                            Attendance & Progress for Class {classSession.session_number}
                          </div>
                          <span className="text-xs text-[var(--text-secondary)]">
                            {classSession.students.filter((s) => s.attendance_status === "Present").length} Present ·{" "}
                            {classSession.students.filter((s) => s.attendance_status === "Absent").length} Absent
                          </span>
                        </div>
                        {classSession.students.length === 0 ? (
                          <p className="text-sm text-[var(--text-secondary)]">No students enrolled yet.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] text-left">
                              <thead>
                                <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                                  <th className="py-2 pr-4 font-medium">Student</th>
                                  <th className="py-2 pr-4 font-medium">Attendance</th>
                                  <th className="py-2 pr-4 font-medium">Progress</th>
                                  <th className="py-2 font-medium">Completion %</th>
                                </tr>
                              </thead>
                              <tbody>
                                {classSession.students.map((student, sIdx) => {
                                  const studentProfileId = student.id ?? student.student_id;
                                  return (
                                    <tr key={`session-${classSession.id}-student-${studentProfileId ?? sIdx}`} className="border-b border-[var(--border)] last:border-0">
                                      <td className="py-3 pr-4 text-sm font-medium">
                                        {studentProfileId ? (
                                          <Link href={`/students/${studentProfileId}`} className="hover:underline">
                                            {student.name}
                                          </Link>
                                        ) : (
                                          <span>{student.name}</span>
                                        )}
                                      </td>
                                      <td className="py-3 pr-4">
                                      <div className="flex gap-1">
                                        {ATTENDANCE_OPTIONS.map((status) => {
                                          const studentProfileId = student.id ?? student.student_id;
                                          const key = `attendance-${classSession.id}-${studentProfileId ?? sIdx}`;
                                          const active = student.attendance_status === status;
                                          return (
                                            <button
                                              key={status}
                                              type="button"
                                              disabled={!canManage || actionKey === key}
                                              onClick={() => void saveAttendance(classSession.id, student.id, status)}
                                              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                                                active
                                                  ? status === "Present"
                                                    ? "bg-emerald-700 text-white"
                                                    : status === "Absent"
                                                    ? "bg-rose-700 text-white"
                                                    : "bg-amber-700 text-white"
                                                  : "border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface)]"
                                              }`}
                                            >
                                              {status}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </td>
                                    <td className="py-3 pr-4 text-sm text-[var(--text-secondary)]">
                                      {student.progress_status}
                                    </td>
                                    <td className="py-3">
                                      <div className="flex items-center gap-3">
                                        <input
                                          aria-label={`${student.name} completion percentage`}
                                          disabled={!canManage}
                                          type="range"
                                          min="0"
                                          max="100"
                                          value={
                                            progressValues[`${classSession.id}-${studentProfileId}`] ??
                                            student.completion_percent
                                          }
                                          onChange={(event) =>
                                            setProgressValues((values) => ({
                                              ...values,
                                              [`${classSession.id}-${studentProfileId}`]: Number(event.target.value),
                                            }))
                                          }
                                          className="w-28 accent-sky-800"
                                        />
                                        <span className="w-9 text-right text-xs tabular-nums font-mono">
                                          {progressValues[`${classSession.id}-${studentProfileId}`] ??
                                            student.completion_percent}
                                          %
                                        </span>
                                        {canManage && (
                                          <button
                                            type="button"
                                            title="Save progress"
                                            disabled={actionKey === `progress-${classSession.id}-${studentProfileId}`}
                                            onClick={() =>
                                              studentProfileId &&
                                              void saveProgress(
                                                classSession.id,
                                                studentProfileId,
                                                student.completion_percent
                                              )
                                            }
                                            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--surface)]"
                                          >
                                            <Check className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Calendar View */}
      {activeTab === "calendar" && (
        <section className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-semibold">Class calendar inspector</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Select any date to see scheduled classes or manage session attendance.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="Calendar date"
                value={calendarDate}
                onChange={(event) => setCalendarDate(event.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setCalendarDate(dateKey(new Date()))}
                className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:bg-[var(--surface)]"
              >
                Today
              </button>
            </div>
          </div>

          {calendarDaySessions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-12 text-center">
              <Calendar className="mx-auto h-8 w-8 text-[var(--text-secondary)]" />
              <h3 className="mt-3 font-semibold">No classes scheduled on {new Date(calendarDate).toLocaleDateString()}</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Choose another date from the picker above, or schedule a class session for this date.
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="mt-4 text-sm font-semibold text-sky-800 hover:underline dark:text-sky-300"
                >
                  Schedule class on this date
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {calendarDaySessions.map((classSession) => (
                <article
                  key={classSession.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-300">
                        Class #{classSession.session_number} · {classSession.status}
                      </span>
                      <h3 className="mt-2 text-lg font-semibold">{classSession.title}</h3>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {formatDate(classSession.scheduled_start)}
                        {classSession.topic ? ` · ${classSession.topic}` : ""}
                      </p>
                    </div>
                    {classSession.meeting_url && (
                      <a
                        href={classSession.meeting_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--background)]"
                      >
                        Join class <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Tab 3: Tasks & Assignments */}
      {activeTab === "tasks" && (
        <section className="space-y-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xl font-semibold">Batch tasks & student submissions</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Review assigned coursework, submission links, uploaded files, and student completion progress.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--text-secondary)]">
                {completedTasks}/{totalTasks} submissions completed ({overallTaskRate}%)
              </span>
            </div>
          </div>

          {/* Task Metrics */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Tasks created</p>
              <p className="mt-1 text-2xl font-bold">{task_summaries.length}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Student assignments</p>
              <p className="mt-1 text-2xl font-bold">{totalTasks}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Completion rate</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {overallTaskRate}%
              </p>
            </div>
          </div>

          {task_summaries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-12 text-center">
              <FileText className="mx-auto h-8 w-8 text-[var(--text-secondary)]" />
              <h3 className="mt-3 font-semibold">No tasks assigned yet</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Assign a task for all students in this batch using the &ldquo;+ Task for all&rdquo; button above.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {task_summaries.map((task) => {
                const isExpanded = expandedTaskTitle === task.title;
                return (
                  <article
                    key={task.title}
                    className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
                  >
                    <div className="p-5">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-300">
                              {task.priority} priority
                            </span>
                            {task.due_date && (
                              <span className="text-xs text-[var(--text-secondary)]">
                                Due: {task.due_date}
                              </span>
                            )}
                          </div>
                          <h3 className="mt-2 text-lg font-semibold">{task.title}</h3>
                          {task.description && (
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                              {task.description}
                            </p>
                          )}
                        </div>
                        <div className="text-right sm:min-w-44">
                          <p className="text-sm font-semibold">
                            {task.completed_count} / {task.total_assigned} completed
                          </p>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--background)]">
                            <div
                              className="h-full bg-emerald-600 transition-all"
                              style={{ width: `${task.completion_percent}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">
                            {task.completion_percent}% done
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3">
                        <button
                          type="button"
                          onClick={() => setExpandedTaskTitle(isExpanded ? null : task.title)}
                          className="text-xs font-semibold text-sky-800 hover:underline dark:text-sky-400"
                        >
                          {isExpanded ? "Hide student submissions" : "View student submissions & links"} (
                          {task.students.length})
                        </button>
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
                                <th className="pb-2 font-medium">Submitted</th>
                              </tr>
                            </thead>
                            <tbody>
                              {task.students.map((submission, subIdx) => (
                                <tr
                                  key={`task-${task.batch_id}-${task.title}-sub-${submission.student_id ?? subIdx}`}
                                  className="border-b border-[var(--border)] last:border-0"
                                >
                                  <td className="py-2.5 pr-4 font-medium">
                                    {submission.student_id ? (
                                      <Link
                                        href={`/students/${submission.student_id}`}
                                        className="hover:underline"
                                      >
                                        {submission.student_name}
                                      </Link>
                                    ) : (
                                      <span>{submission.student_name}</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    <span
                                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
                                        submission.status === "Done"
                                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                      }`}
                                    >
                                      {submission.status === "Done" ? (
                                        <>
                                          <CheckCircle2 className="h-3 w-3" /> Done
                                        </>
                                      ) : (
                                        "Pending"
                                      )}
                                    </span>
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    {submission.submission_url ? (
                                      <a
                                        href={submission.submission_url}
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
                                    {submission.submission_file ? (
                                      <a
                                        href={`${API_BASE_URL}${submission.submission_file}`}
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
                                    {submission.submitted_at
                                      ? new Date(submission.submitted_at).toLocaleDateString()
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
      )}

      {/* Tab 4: Student Roster */}
      {activeTab === "roster" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Class roster & students</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Active students enrolled in this batch.
              </p>
            </div>
            <span className="text-sm text-[var(--text-secondary)]">
              {students.length} / {batch.max_seats} seats filled
            </span>
          </div>

          {students.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-12 text-center">
              <Users className="mx-auto h-8 w-8 text-[var(--text-secondary)]" />
              <h3 className="mt-3 font-semibold">No students in this batch</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Use the &ldquo;+ Add students&rdquo; button above to assign students to this batch.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                    <th className="px-4 py-3 font-medium">Student Name</th>
                    <th className="px-4 py-3 font-medium">Progress</th>
                    <th className="px-4 py-3 font-medium">Completion %</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {students.map((student, si) => {
                    const studentProfileId = student.id ?? student.student_id;
                    return (
                      <tr key={`roster-row-${studentProfileId ?? si}`} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-4 py-3 font-medium">
                          {studentProfileId ? (
                            <Link href={`/students/${studentProfileId}`} className="hover:underline">
                              {student.name}
                            </Link>
                          ) : (
                            <span>{student.name}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{student.progress_status}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--background)]">
                              <div
                                className="h-full bg-sky-800"
                                style={{ width: `${student.completion_percent}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono">{student.completion_percent}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {studentProfileId ? (
                            <Link
                              href={`/students/${studentProfileId}`}
                              className="text-xs font-semibold text-sky-800 hover:underline dark:text-sky-400"
                            >
                              View profile &rarr;
                            </Link>
                          ) : (
                            <span className="text-xs text-[var(--text-secondary)]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Schedule Session Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setShowCreate(false);
          }}
        >
          <form
            onSubmit={createSession}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Schedule a class session</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Session dates feed both student and instructor schedules.
                </p>
              </div>
              <button
                type="button"
                title="Close"
                onClick={() => setShowCreate(false)}
                className="rounded-md p-1.5 hover:bg-[var(--background)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-sm font-medium">Session title</span>
                <input
                  required
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
                  placeholder="e.g. React state and data flow"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="text-sm font-medium">Topic</span>
                <input
                  value={form.topic}
                  onChange={(event) => setForm((current) => ({ ...current, topic: event.target.value }))}
                  className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
                />
              </label>
              <label>
                <span className="text-sm font-medium">Starts</span>
                <input
                  required
                  type="datetime-local"
                  value={form.scheduled_start}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scheduled_start: event.target.value }))
                  }
                  className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
                />
              </label>
              <label>
                <span className="text-sm font-medium">Ends</span>
                <input
                  type="datetime-local"
                  value={form.scheduled_end}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scheduled_end: event.target.value }))
                  }
                  className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="text-sm font-medium">Class or meeting link</span>
                <input
                  type="url"
                  value={form.meeting_url}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, meeting_url: event.target.value }))
                  }
                  className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
                  placeholder="https://…"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="text-sm font-medium">Notes</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-sky-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Schedule session
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}