"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Plus, Save, Trash2, X } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";

type BackgroundDetailsEditorProps = {
  resource: "leads" | "students";
  profileId: number | string;
  details?: Record<string, string> | null;
};

type DetailField = { label: string; value: string };

const DEFAULT_BACKGROUND_FIELDS = [
  "SSC School / Board",
  "SSC Year",
  "SSC GPA / Percentage",
  "Intermediate College Name",
  "Intermediate Board / Stream",
  "Intermediate Year",
  "Intermediate GPA / Percentage",
  "Diploma College Name",
  "Diploma Branch / Year",
  "Diploma GPA / Percentage",
  "Degree College / University",
  "Degree / Major",
  "Degree Year",
  "Degree GPA / CGPA",
  "Postgraduate College / University",
  "Postgraduate Degree / Major",
  "Postgraduate Year",
  "Postgraduate GPA / CGPA",
  "Resume / Portfolio Link",
  "Other Education / Certifications",
];

function fieldsFromDetails(details: Record<string, string>): DetailField[] {
  const labels = [...DEFAULT_BACKGROUND_FIELDS, ...Object.keys(details).filter(label => !DEFAULT_BACKGROUND_FIELDS.includes(label))];
  return labels.map(label => ({ label, value: details[label] || "" }));
}

export default function BackgroundDetailsEditor({ resource, profileId, details }: BackgroundDetailsEditorProps) {
  const { role } = useRole();
  const canEdit = resource === "students"
    ? ["Admin", "Employee", "SalesManager", "Instructor", "Demo", "SuperAdmin"].includes(role)
    : ["Admin", "Employee", "SalesManager", "Demo", "SuperAdmin"].includes(role);
  const [savedDetails, setSavedDetails] = useState<Record<string, string>>(details || {});
  const [fields, setFields] = useState<DetailField[]>(fieldsFromDetails(details || {}));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const nextDetails = details || {};
    setSavedDetails(nextDetails);
    if (!editing) setFields(fieldsFromDetails(nextDetails));
  }, [details, editing]);

  const beginEdit = () => {
    setError("");
    setFields(fieldsFromDetails(savedDetails));
    setEditing(true);
  };

  const cancelEdit = () => {
    setError("");
    setFields(fieldsFromDetails(savedDetails));
    setEditing(false);
  };

  const save = async () => {
    const nextDetails: Record<string, string> = {};
    for (const field of fields) {
      const label = field.label.trim();
      if (!label) continue;
      if (Object.prototype.hasOwnProperty.call(nextDetails, label)) {
        setError(`Field name "${label}" is duplicated.`);
        return;
      }
      nextDetails[label] = field.value.trim();
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/${resource}/${profileId}/background-details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details: nextDetails }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save background details.");
      setSavedDetails(data.background_details || nextDetails);
      setFields(fieldsFromDetails(data.background_details || nextDetails));
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save background details.");
    } finally {
      setSaving(false);
    }
  };

  return <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-semibold">Background details</h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">Add relevant history, support needs, skills, or other context.</p>
      </div>
      {canEdit && !editing && <button type="button" onClick={beginEdit} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--background)]">Edit details</button>}
    </div>

    {error && <div role="alert" className="mt-3 flex items-center gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

    {editing ? <div className="mt-4 space-y-3">
      {fields.map((field, index) => <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_36px]">
        <input aria-label={`Background field ${index + 1} name`} maxLength={100} value={field.label} onChange={event => setFields(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} placeholder="Field name" className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
        <textarea aria-label={`Background field ${index + 1} value`} maxLength={4000} rows={2} value={field.value} onChange={event => setFields(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} placeholder="Enter details" className="min-w-0 resize-y rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
        <button type="button" title="Remove field" aria-label={`Remove background field ${index + 1}`} onClick={() => setFields(current => current.filter((_, itemIndex) => itemIndex !== index))} className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30"><Trash2 className="h-4 w-4" /></button>
      </div>)}
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" onClick={() => setFields(current => [...current, { label: "", value: "" }])} disabled={fields.length >= 50} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--background)] disabled:opacity-50"><Plus className="h-4 w-4" />Add field</button>
        <div className="flex gap-2"><button type="button" onClick={cancelEdit} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-sm"><X className="h-4 w-4" />Cancel</button><button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save details"}</button></div>
      </div>
    </div> : <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {Object.entries(savedDetails).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-medium text-[var(--text-secondary)]">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value || "Not recorded"}</dd></div>)}
    </dl>}
  </section>;
}