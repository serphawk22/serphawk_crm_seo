"use client";

import { useState } from "react";
import { AlertCircle, ArrowDownToLine, BookOpen, FilePlus2, Loader2, MessageSquare, Sparkles, UserRound } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import BackgroundDetailsEditor from "@/components/BackgroundDetailsEditor";

interface StudentCoursePlan { course_title: string; fit_reason?: string; pitch?: string; opportunities?: string[]; }
export interface StudentProfileData {
  student: { id: number; status: string; gpa?: number | null; education_level?: string | null; academic_background?: string | null; background_details?: Record<string, string> | null; career_goal?: string | null; course_plan?: StudentCoursePlan | null; drop_reason?: string | null; improvement_plan?: string | null };
  lead?: { id: number; source?: string | null; created_at: string } | null;
  salesperson?: { id: number; name?: string | null; email: string } | null;
  enrollments: Array<{ id: number; instructor_name?: string | null; progress_percent: number; attendance_rate: number }>;
  performance: { course_progress_percent: number; attendance_rate: number };
  notes: Array<{ id: number; content: string; author_id?: number | null; created_at: string }>;
  uploads: Array<{ id: number; filename: string; size_bytes: number; description?: string | null; created_at: string }>;
}

export default function StudentLifecyclePanel({ profile, onRefresh }: { profile: StudentProfileData; onRefresh: () => void }) {
  const { role } = useRole();
  const { student } = profile;
  const [comment, setComment] = useState("");
  const [dropReason, setDropReason] = useState("");
  const [improvementPlan, setImprovementPlan] = useState("");
  const [showDropForm, setShowDropForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const canManageStatus = ["Admin", "Employee", "SalesManager", "Demo"].includes(role);

  const addComment = async () => {
    if (!comment.trim()) return;
    setBusy("comment");
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/students/${student.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save comment.");
      setComment("");
      onRefresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save comment.");
    } finally {
      setBusy("");
    }
  };

  const uploadFile = async (file?: File) => {
    if (!file) return;
    setBusy("upload");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE_URL}/students/${student.id}/files`, { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not upload file.");
      onRefresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload file.");
    } finally {
      setBusy("");
    }
  };

  const downloadFile = async (fileId: number, filename: string) => {
    setBusy(`file-${fileId}`);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/student-files/${fileId}/download`);
      if (!response.ok) throw new Error("Could not download this file.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Could not download this file.");
    } finally {
      setBusy("");
    }
  };

  const updateDropStatus = async (status: "Dropped" | "Active") => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(status === "Dropped" ? { status, drop_reason: dropReason, improvement_plan: improvementPlan } : { status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not update student status.");
      setShowDropForm(false);
      onRefresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update student status.");
    } finally {
      setSaving(false);
    }
  };

  const plan = student.course_plan;

  return <div className="space-y-5">
    {error && <div role="alert" className="flex items-center gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

    <section className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--text-secondary)]">Course progress</p><p className="mt-2 text-2xl font-bold">{profile.performance?.course_progress_percent || 0}%</p></div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--text-secondary)]">Attendance</p><p className="mt-2 text-2xl font-bold">{profile.performance?.attendance_rate || 0}%</p></div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--text-secondary)]">Lead owner</p><p className="mt-2 truncate text-base font-semibold">{profile.salesperson?.name || "Unassigned"}</p><p className="truncate text-xs text-[var(--text-secondary)]">{profile.salesperson?.email || profile.lead?.source || "No lead attribution"}</p></div>
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4 text-emerald-800 dark:text-emerald-300" />Academic profile</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-[var(--text-secondary)]">Education</dt><dd className="mt-1 font-medium">{student.education_level || "Not recorded"}</dd></div><div><dt className="text-xs text-[var(--text-secondary)]">GPA</dt><dd className="mt-1 font-medium">{student.gpa ?? "Not recorded"}</dd></div><div className="col-span-2"><dt className="text-xs text-[var(--text-secondary)]">Background</dt><dd className="mt-1 whitespace-pre-wrap">{student.academic_background || "Not recorded"}</dd></div><div className="col-span-2"><dt className="text-xs text-[var(--text-secondary)]">Career goal</dt><dd className="mt-1 whitespace-pre-wrap">{student.career_goal || "Not recorded"}</dd></div></dl>
      </div>
      {plan ? <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900 dark:bg-emerald-950/20">
        <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-emerald-800 dark:text-emerald-300" />Course-fit plan · {plan.course_title}</h2>
        <p className="mt-3 text-sm leading-6">{plan.pitch}</p><p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">{plan.fit_reason}</p>
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs">{(plan.opportunities || []).map((item: string, index: number) => <li key={index}>{item}</li>)}</ul>
      </div> : <div className="rounded-lg border border-dashed border-[var(--border)] p-5"><h2 className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4" />Course guidance</h2><p className="mt-3 text-sm text-[var(--text-secondary)]">No course plan was saved from the source lead.</p></div>}
    </section>

    {student.status === "Dropped" && <section className="rounded-lg border border-rose-200 bg-rose-50 p-5 dark:border-rose-900 dark:bg-rose-950/20"><h2 className="flex items-center gap-2 font-semibold text-rose-900 dark:text-rose-200"><AlertCircle className="h-4 w-4" />Drop follow-up</h2><p className="mt-3 text-xs font-semibold uppercase text-rose-800 dark:text-rose-300">Reason</p><p className="mt-1 whitespace-pre-wrap text-sm">{student.drop_reason || "No reason recorded"}</p><p className="mt-3 text-xs font-semibold uppercase text-rose-800 dark:text-rose-300">Improvement action</p><p className="mt-1 whitespace-pre-wrap text-sm">{student.improvement_plan || "No action recorded"}</p>{canManageStatus && <button type="button" onClick={() => void updateDropStatus("Active")} disabled={saving} className="mt-4 rounded-md border border-rose-300 px-3 py-2 text-sm font-semibold hover:bg-white dark:hover:bg-zinc-900">Reactivate student</button>}</section>}

    {canManageStatus && student.status !== "Dropped" && <div><button type="button" onClick={() => setShowDropForm(value => !value)} className="text-sm font-medium text-rose-700 hover:underline dark:text-rose-300">Record student as dropped</button>{showDropForm && <div className="mt-3 grid gap-3 rounded-lg border border-rose-200 bg-[var(--surface)] p-4 sm:grid-cols-2"><label className="text-sm font-medium">Drop reason<textarea required value={dropReason} onChange={event => setDropReason(event.target.value)} rows={3} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-2.5 text-sm" placeholder="What caused the student to leave?" /></label><label className="text-sm font-medium">Improvement plan<textarea required value={improvementPlan} onChange={event => setImprovementPlan(event.target.value)} rows={3} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-2.5 text-sm" placeholder="What should the institute improve or do next?" /></label><div className="flex gap-2 sm:col-span-2"><button type="button" onClick={() => setShowDropForm(false)} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">Cancel</button><button type="button" onClick={() => void updateDropStatus("Dropped")} disabled={saving || !dropReason.trim() || !improvementPlan.trim()} className="rounded-md bg-rose-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save drop follow-up"}</button></div></div>}</div>}

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" />Comments and follow-up</h2><span className="text-xs text-[var(--text-secondary)]">{profile.notes?.length || 0}</span></div>
        <div className="mt-4 flex gap-2"><input value={comment} onChange={event => setComment(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void addComment(); } }} placeholder="Add a student note" className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /><button type="button" onClick={() => void addComment()} disabled={!comment.trim() || busy === "comment"} className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "comment" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}</button></div>
        <div className="mt-4 max-h-64 space-y-3 overflow-y-auto">{profile.notes?.map(note => <article key={note.id} className="border-l-2 border-emerald-700 pl-3"><p className="whitespace-pre-wrap text-sm">{note.content}</p><p className="mt-1 text-[11px] text-[var(--text-secondary)]">{new Date(note.created_at).toLocaleString()}</p></article>)}{!profile.notes?.length && <p className="text-sm text-[var(--text-secondary)]">No comments yet.</p>}</div>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><FilePlus2 className="h-4 w-4" />Student uploads</h2><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold"><FilePlus2 className="h-3.5 w-3.5" />{busy === "upload" ? "Uploading…" : "Upload file"}<input type="file" className="sr-only" disabled={busy === "upload"} onChange={event => { void uploadFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div>
        <div className="mt-4 divide-y divide-[var(--border)]">{profile.uploads?.map(file => <div key={file.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{file.filename}</p><p className="text-xs text-[var(--text-secondary)]">{Math.max(1, Math.round(file.size_bytes / 1024))} KB · {new Date(file.created_at).toLocaleDateString()}</p></div><button type="button" title={`Download ${file.filename}`} disabled={busy === `file-${file.id}`} onClick={() => void downloadFile(file.id, file.filename)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--background)]"><ArrowDownToLine className="h-4 w-4" /></button></div>)}{!profile.uploads?.length && <p className="py-3 text-sm text-[var(--text-secondary)]">No student documents uploaded.</p>}</div>
      </div>
    </section>
    <BackgroundDetailsEditor resource="students" profileId={student.id} details={student.background_details} />
  </div>;
}