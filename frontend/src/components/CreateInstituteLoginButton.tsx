"use client";

import { FormEvent, useState } from "react";
import { Check, KeyRound, Loader2, X } from "lucide-react";
import { API_BASE_URL } from "@/config";

type ProfileKind = "students" | "instructors";

export default function CreateInstituteLoginButton({ profileId, profileKind, hasAccount, hasEmail, onCreated }: {
  profileId: number;
  profileKind: ProfileKind;
  hasAccount: boolean;
  hasEmail: boolean;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/${profileKind}/${profileId}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not create this login.");
      setCreated(true);
      setPassword("");
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create this login.");
    } finally {
      setSaving(false);
    }
  };

  if (hasAccount || created) {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"><Check className="h-3.5 w-3.5" />Login ready</span>;
  }
  if (!hasEmail) {
    return <span title="Add an email address to this profile first" className="text-xs text-[var(--text-secondary)]">Email required</span>;
  }

  return <>
    <button type="button" onClick={() => { setError(""); setOpen(true); }} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--background)]">
      <KeyRound className="h-3.5 w-3.5" />Create login
    </button>
    {open && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Create {profileKind === "students" ? "student" : "instructor"} login</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">The account will use the email on this profile.</p></div><button type="button" title="Close" disabled={saving} onClick={() => setOpen(false)} className="rounded-md p-1.5 hover:bg-[var(--background)]"><X className="h-4 w-4" /></button></div>
        <label className="mt-5 block text-sm font-medium" htmlFor={`portal-password-${profileKind}-${profileId}`}>Temporary password</label>
        <input id={`portal-password-${profileKind}-${profileId}`} required minLength={8} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:border-emerald-700" />
        {error && <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setOpen(false)} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">Cancel</button><button type="submit" disabled={saving || password.length < 8} className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Create account</button></div>
      </form>
    </div>}
  </>;
}