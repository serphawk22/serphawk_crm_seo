"use client";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/config";

type Access = { catalog: { key: string; label: string }[]; entitlements: Record<string, boolean>; access: Record<string, boolean>; overrides: Record<string, boolean> };

export default function SalesAccessSettings({ tenantId }: { tenantId?: number }) {
  const endpoint = tenantId ? `/superadmin/tenants/${tenantId}/sales-access` : "/tenant/sales-access";
  const [data, setData] = useState<Access | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setData(null);
    fetch(`${API_BASE_URL}${endpoint}`).then(async res => {
      if (!res.ok) throw new Error("Could not load sales access");
      const value: Access = await res.json();
      if (alive) { setData(value); setDraft(value.overrides); }
    }).catch(error => { if (alive) setMessage(error.message); });
    return () => { alive = false; };
  }, [endpoint]);
  const save = async () => {
    setBusy(true); setMessage("");
    try {
      const res = await fetch(`${API_BASE_URL}${endpoint}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const value = await res.json();
      if (!res.ok) throw new Error(value.detail || "Could not save sales access");
      setData(value); setMessage("Sales Manager access saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save access"); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-slate-200 p-5 dark:border-zinc-800 space-y-3">
    <h2 className="text-lg font-bold">Sales Manager access</h2>
    <p className="text-sm text-slate-500">Choose modules for the sales team within the company plan. Sales Managers see records they created or were assigned. Team Directory is reserved for Admins.</p>
    {!data && !message && <p role="status">Loading access…</p>}
    <div className="grid gap-2 sm:grid-cols-2">{data?.catalog.filter(f => f.key !== "teams").map(f => <label key={f.key} className="flex items-center gap-2 text-sm">
      <input type="checkbox" disabled={!data.entitlements[f.key] || busy} checked={data.entitlements[f.key] && (draft[f.key] ?? data.access[f.key])} onChange={e => setDraft(previous => ({ ...previous, [f.key]: e.target.checked }))} />
      {f.label}{!data.entitlements[f.key] && <span className="text-xs text-slate-400">Outside plan</span>}
    </label>)}</div>
    {message && <p role="status" className="text-sm">{message}</p>}
    <button type="button" disabled={!data || busy} onClick={save} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save sales access"}</button>
  </section>;
}
