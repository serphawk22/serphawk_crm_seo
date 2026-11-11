"use client";
import { useState } from "react";
import { API_BASE_URL } from "@/config";

export default function AdmissionsTeamForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <details open={open} onToggle={e => setOpen(e.currentTarget.open)} className="rounded-xl border p-4">
    <summary className="cursor-pointer text-sm font-semibold">Add Admissions team member</summary>
    <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={async e => {
      e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); setBusy(true); setError("");
      try {
        const response = await fetch(`${API_BASE_URL}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), email: data.get("email"), password: data.get("password"), role: "Admissions" }) });
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Could not create account");
        form.reset(); setOpen(false); onCreated();
      } catch (e) { setError(e instanceof Error ? e.message : "Could not create account"); }
      finally { setBusy(false); }
    }}>
      <label className="text-sm">Name<input required name="name" autoComplete="name" className="mt-1 w-full rounded-lg border bg-transparent p-2" /></label>
      <label className="text-sm">Email<input required type="email" name="email" autoComplete="email" className="mt-1 w-full rounded-lg border bg-transparent p-2" /></label>
      <label className="text-sm">Initial password<input required minLength={8} type="password" name="password" autoComplete="new-password" className="mt-1 w-full rounded-lg border bg-transparent p-2" /></label>
      {error && <p role="alert" className="text-sm text-red-600 sm:col-span-3">{error}</p>}
      <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Create Admissions account"}</button>
    </form>
  </details>;
}
