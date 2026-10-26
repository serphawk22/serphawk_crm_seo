"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { AlertCircle, FileUp, Loader2, Plus, Upload, X } from "lucide-react";
import { API_BASE_URL } from "@/config";

type BatchRosterActionsProps = {
  batchId: number;
  students: Array<{ id: number; name: string }>;
  maxSeats: number;
  onChanged: () => void;
};

type StudentOption = { id: number; name: string; status: string };

export default function BatchRosterActions({ batchId, students, maxSeats, onChanged }: BatchRosterActionsProps) {
  const [activeAction, setActiveAction] = useState<"add" | "task" | "resource" | "">("");
  const [availableStudents, setAvailableStudents] = useState<StudentOption[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", due_date: "", priority: "Medium" });
  const [resourceDescription, setResourceDescription] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

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

  const openAddStudents = async () => {
    setActiveAction("add");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_BASE_URL}/students`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load students.");
      setAvailableStudents(Array.isArray(data.students) ? data.students : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load students.");
    }
  };

  const submitAddStudents = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/batches/${batchId}/students`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ student_ids: selectedStudentIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not add students.");
      setNotice(`Added ${data.added_count} students to this batch.`);
      setSelectedStudentIds([]);
      setActiveAction("");
      onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not add students.");
    } finally {
      setSaving(false);
    }
  };

  const submitTasks = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/batches/${batchId}/tasks`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...taskForm, due_date: taskForm.due_date || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not create batch tasks.");
      setNotice(`Created ${data.created_count} tasks, one for each active student.`);
      setTaskForm({ title: "", description: "", due_date: "", priority: "Medium" });
      setActiveAction("");
      onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not create batch tasks.");
    } finally {
      setSaving(false);
    }
  };

  const submitResource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem("batch-resource") as HTMLInputElement)?.files?.[0];
    if (!file) {
      setError("Choose a file to share.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("description", resourceDescription);
      const response = await fetch(`${API_BASE_URL}/batches/${batchId}/resources`, {
        method: "POST",
        headers: getAuthHeaders(),
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not share this resource.");
      setNotice(`Shared ${data.filename} with ${data.shared_with} students.`);
      setResourceDescription("");
      setActiveAction("");
      form.reset();
      onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not share this resource.");
    } finally {
      setSaving(false);
    }
  };

  const enrolledIds = new Set(students.map(student => student.id));
  const candidates = availableStudents.filter(student => student.status === "Active" && !enrolledIds.has(student.id));
  const availableSeats = Math.max(0, maxSeats - students.length);
  const handleStudentSelection = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedStudentIds(Array.from(event.currentTarget.selectedOptions, option => Number(option.value)));
  };

  return <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Class roster actions</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">{students.length} active students · {availableSeats} seats available</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={availableSeats === 0} onClick={() => void openAddStudents()} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--background)] disabled:opacity-50"><Plus className="h-4 w-4" />Add students</button>
        <button type="button" disabled={students.length === 0} onClick={() => { setError(""); setActiveAction(activeAction === "task" ? "" : "task"); }} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--background)] disabled:opacity-50"><Plus className="h-4 w-4" />Task for all</button>
        <button type="button" disabled={students.length === 0} onClick={() => { setError(""); setActiveAction(activeAction === "resource" ? "" : "resource"); }} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--background)] disabled:opacity-50"><Upload className="h-4 w-4" />Share resource</button>
      </div>
    </div>

    {notice && <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</p>}
    {error && <p role="alert" className="flex items-center gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}

    {activeAction === "add" && <form onSubmit={submitAddStudents} className="grid gap-3 rounded-md border border-[var(--border)] p-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="text-sm font-medium">Select active students
        <select multiple size={Math.min(6, Math.max(3, candidates.length))} value={selectedStudentIds.map(String)} onChange={handleStudentSelection} className="mt-1.5 block w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-sm">
          {candidates.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}
        </select>
        {!candidates.length && <span className="mt-1 block text-xs text-[var(--text-secondary)]">No unassigned active students are available.</span>}
      </label>
      <div className="flex gap-2"><button type="button" onClick={() => setActiveAction("")} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">Cancel</button><button type="submit" disabled={saving || !selectedStudentIds.length || selectedStudentIds.length > availableSeats} className="inline-flex items-center gap-2 rounded-md bg-sky-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Add selected</button></div>
    </form>}

    {activeAction === "task" && <form onSubmit={submitTasks} className="grid gap-3 rounded-md border border-[var(--border)] p-3 sm:grid-cols-2">
      <label className="text-sm font-medium sm:col-span-2">Task title<input required value={taskForm.title} onChange={event => setTaskForm(current => ({ ...current, title: event.target.value }))} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" placeholder="e.g. Complete the responsive layout exercise" /></label>
      <label className="text-sm font-medium">Due date<input type="date" value={taskForm.due_date} onChange={event => setTaskForm(current => ({ ...current, due_date: event.target.value }))} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
      <label className="text-sm font-medium">Priority<select value={taskForm.priority} onChange={event => setTaskForm(current => ({ ...current, priority: event.target.value }))} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"><option>Low</option><option>Medium</option><option>High</option><option>Urgent</option></select></label>
      <label className="text-sm font-medium sm:col-span-2">Instructions<textarea rows={2} value={taskForm.description} onChange={event => setTaskForm(current => ({ ...current, description: event.target.value }))} className="mt-1.5 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
      <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setActiveAction("")} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-sky-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create for all {students.length}</button></div>
    </form>}

    {activeAction === "resource" && <form onSubmit={event => void submitResource(event)} className="grid gap-3 rounded-md border border-[var(--border)] p-3 sm:grid-cols-2">
      <label className="text-sm font-medium">File for all students<input required name="batch-resource" type="file" className="mt-1.5 block w-full text-sm" /></label>
      <label className="text-sm font-medium">Description<input value={resourceDescription} onChange={event => setResourceDescription(event.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" placeholder="Optional instructions" /></label>
      <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setActiveAction("")} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-sky-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}Share with all {students.length}</button></div>
    </form>}
  </section>;
}
