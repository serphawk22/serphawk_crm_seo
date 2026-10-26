"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowDownToLine, ArrowUpRight, CalendarDays, Clock3, FileUp, GraduationCap, Loader2, Radio, Users } from "lucide-react";
import { API_BASE_URL } from "@/config";

interface TeachingSession { id: number; title: string; topic?: string; scheduled_start: string; status: string; is_live: boolean; meeting_url?: string | null; }
interface TeachingResource { id: number; title: string; filename: string; size_bytes: number; created_at: string; }
interface TeachingBatch { batch_id: number; batch_name: string; batch_status: string; course_title?: string; start_date?: string | null; schedule?: string | null; room_or_link?: string | null; students: { id: number; name: string }[]; sessions: TeachingSession[]; resources: TeachingResource[]; }

function formatDate(value?: string | null) {
  if (!value) return "Date to be confirmed";
  return new Date(value).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function TeachingPage() {
  const [name, setName] = useState("");
  const [batches, setBatches] = useState<TeachingBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resourceBatchId, setResourceBatchId] = useState<number | null>(null);
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/instructor-portal/teaching`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Could not load your teaching schedule.");
        setName(data.instructor?.name || "Instructor");
        setBatches(data.batches || []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load your teaching schedule.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const sessions = batches.flatMap(batch => batch.sessions.map(item => ({ ...item, batchName: batch.batch_name, batchId: batch.batch_id, courseTitle: batch.course_title })));
  const liveSession = sessions.find(item => item.is_live);
  const nextSession = sessions.filter(item => new Date(item.scheduled_start).getTime() >= Date.now() && !item.is_live).sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))[0];
  const students = new Set(batches.flatMap(batch => batch.students.map(student => student.id))).size;

  const uploadResource = async (batchId: number) => {
    if (!resourceTitle.trim() || !resourceFile) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("title", resourceTitle.trim());
      form.append("description", resourceDescription.trim());
      form.append("file", resourceFile);
      const response = await fetch(`${API_BASE_URL}/institute-resources/batches/${batchId}`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not share this resource.");
      setBatches(current => current.map(batch => batch.batch_id === batchId ? { ...batch, resources: [data.resource, ...(batch.resources || [])] } : batch));
      setResourceTitle("");
      setResourceDescription("");
      setResourceFile(null);
      setResourceBatchId(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not share this resource.");
    } finally {
      setUploading(false);
    }
  };

  const downloadResource = async (resource: TeachingResource) => {
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
    }
  };

  if (loading) return <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-sky-800" /></div>;

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end">
        <div><p className="mb-2 text-xs font-semibold uppercase text-sky-800 dark:text-sky-400">Instructor workspace</p><h1 className="text-3xl font-bold tracking-tight">Good to see you, {name}</h1><p className="mt-2 text-sm text-[var(--text-secondary)]">Your assigned batches, class schedule, and students.</p></div>
        <div className="flex gap-5 text-sm"><span><strong>{batches.length}</strong> batches</span><span><strong>{students}</strong> students</span></div>
      </section>

      {error && <div role="alert" className="flex items-center gap-2 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      {(liveSession || nextSession) && (() => {
        const current = liveSession || nextSession!;
        return <section className={`flex flex-col justify-between gap-5 rounded-lg border p-5 sm:flex-row sm:items-center sm:p-6 ${liveSession ? "border-emerald-800 bg-emerald-950 text-white" : "border-[var(--border)] bg-[var(--surface)]"}`}>
          <div className="flex items-start gap-4"><span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-black/5"><Radio className={`h-5 w-5 ${liveSession ? "text-emerald-300" : "text-sky-800 dark:text-sky-300"}`} /></span><div><p className={`text-xs font-semibold uppercase ${liveSession ? "text-emerald-300" : "text-[var(--text-secondary)]"}`}>{liveSession ? "Class in session" : "Next class"}</p><h2 className="mt-1 text-xl font-semibold">{current.title}</h2><p className={`mt-1 text-sm ${liveSession ? "text-emerald-100/75" : "text-[var(--text-secondary)]"}`}>{current.courseTitle} · {current.batchName} · {formatDate(current.scheduled_start)}</p></div></div>
          <Link href={`/batches/${current.batchId}`} className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold ${liveSession ? "bg-white text-emerald-950" : "border border-[var(--border)] hover:bg-[var(--background)]"}`}>Open class roster <ArrowUpRight className="h-4 w-4" /></Link>
        </section>;
      })()}

      <section className="space-y-4">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Assigned batches</h2><span className="text-sm text-[var(--text-secondary)]">{sessions.length} scheduled sessions</span></div>
        {batches.length === 0 ? <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-12 text-center"><GraduationCap className="mx-auto h-8 w-8 text-[var(--text-secondary)]" /><h3 className="mt-3 font-semibold">No batches assigned</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">Your institute admin will assign batches to your instructor profile.</p></div> : batches.map(batch => {
          const upcoming = batch.sessions.filter(item => new Date(item.scheduled_start).getTime() >= Date.now()).sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))[0];
          return <article key={batch.batch_id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-medium text-sky-800 dark:text-sky-400">{batch.course_title || "Course"} · {batch.batch_status}</p><h3 className="mt-1 text-lg font-semibold">{batch.batch_name}</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">{batch.schedule || "Schedule not set"}{batch.start_date ? ` · Starts ${new Date(batch.start_date).toLocaleDateString()}` : ""}</p></div><Link href={`/batches/${batch.batch_id}`} className="inline-flex items-center gap-2 text-sm font-medium text-sky-800 hover:underline dark:text-sky-300">Manage class <ArrowUpRight className="h-4 w-4" /></Link></div>
            <div className="mt-5 grid gap-4 border-t border-[var(--border)] pt-4 sm:grid-cols-3">
              <div className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-[var(--text-secondary)]" />{batch.students.length} enrolled students</div>
              <div className="flex items-center gap-2 text-sm"><CalendarDays className="h-4 w-4 text-[var(--text-secondary)]" />{batch.sessions.length} sessions</div>
              <div className="flex items-center gap-2 text-sm"><Clock3 className="h-4 w-4 text-[var(--text-secondary)]" />{upcoming ? formatDate(upcoming.scheduled_start) : "No upcoming class"}</div>
            </div>
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold">Shared course resources</h4><p className="mt-1 text-xs text-[var(--text-secondary)]">Files are available to students enrolled in this batch.</p></div><button type="button" onClick={() => setResourceBatchId(resourceBatchId === batch.batch_id ? null : batch.batch_id)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-sm font-semibold hover:bg-[var(--background)]"><FileUp className="h-4 w-4" />Share resource</button></div>
              {batch.resources?.length ? <div className="mt-3 divide-y divide-[var(--border)]">{batch.resources.map(resource => <div key={resource.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{resource.title}</p><p className="text-xs text-[var(--text-secondary)]">{resource.filename} · {Math.max(1, Math.ceil(resource.size_bytes / 1024))} KB</p></div><button type="button" title={`Download ${resource.filename}`} onClick={() => void downloadResource(resource)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--background)]"><ArrowDownToLine className="h-4 w-4" /></button></div>)}</div> : <p className="mt-3 text-sm text-[var(--text-secondary)]">No files shared with this batch yet.</p>}
              {resourceBatchId === batch.batch_id && <form onSubmit={event => { event.preventDefault(); void uploadResource(batch.batch_id); }} className="mt-4 grid gap-3 rounded-md border border-[var(--border)] p-3 sm:grid-cols-2">
                <label className="text-sm font-medium">Resource title<input required value={resourceTitle} onChange={event => setResourceTitle(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm" /></label>
                <label className="text-sm font-medium">File (max 20 MB)<input required type="file" onChange={event => setResourceFile(event.target.files?.[0] || null)} className="mt-1.5 block min-h-10 w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--background)] file:px-3 file:py-2" /></label>
                <label className="text-sm font-medium sm:col-span-2">Description<input value={resourceDescription} onChange={event => setResourceDescription(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm" /></label>
                <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setResourceBatchId(null)} className="min-h-10 rounded-md border border-[var(--border)] px-3 text-sm">Cancel</button><button type="submit" disabled={uploading || !resourceFile || !resourceTitle.trim()} className="min-h-10 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white disabled:opacity-50">{uploading ? "Sharing…" : "Share with students"}</button></div>
              </form>}
            </div>
          </article>;
        })}
      </section>
    </div>
  );
}