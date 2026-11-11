"use client";
import { useState } from "react";
import { API_BASE_URL } from "@/config";

type Lead = { id: number; company_name: string; owner_id?: number | null };
export default function LeadTransferDialog({ leads, people, admin, onTransferred }: {
  leads: Lead[]; people: { id: number; name: string }[]; admin: boolean; onTransferred: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const source = leads.find(lead => lead.id === selected[0])?.owner_id;
  async function transfer() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/leads/transfer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_ids: selected, employee_id: Number(destination), ...(admin ? { source_employee_id: source } : {}), reason }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not transfer leads");
      setOpen(false); setSelected([]); setReason(""); onTransferred();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not transfer leads"); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-xl border px-3 py-2 text-sm font-semibold">Transfer leads</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="transfer-title" className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-950">
      <h2 id="transfer-title" className="text-xl font-bold">Transfer leads</h2>
      <p className="text-sm text-slate-500">Choose leads from one salesperson. The current stage and transfer reason are recorded in history.</p>
      <fieldset disabled={busy} className="max-h-52 space-y-2 overflow-y-auto rounded-xl border p-3"><legend className="text-sm">Leads</legend>
        {leads.filter(lead => lead.owner_id).map(lead => <label key={lead.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(lead.id)} disabled={selected.length > 0 && lead.owner_id !== source} onChange={e => setSelected(ids => e.target.checked ? [...ids, lead.id] : ids.filter(id => id !== lead.id))} />{lead.company_name}</label>)}
      </fieldset>
      <label className="block text-sm">Destination salesperson<select value={destination} onChange={e => setDestination(e.target.value)} className="mt-1 w-full rounded-xl border bg-transparent p-2"><option value="">Select salesperson</option>{people.filter(person => person.id !== source).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label className="block text-sm">Reason<textarea maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} className="mt-1 w-full rounded-xl border bg-transparent p-2" /></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-3"><button disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button disabled={busy || !selected.length || !destination || !reason.trim()} onClick={transfer} className="rounded-xl bg-indigo-600 px-4 py-2 text-white disabled:opacity-50">{busy ? "Transferring…" : "Transfer"}</button></div>
    </section></div>}
  </>;
}
