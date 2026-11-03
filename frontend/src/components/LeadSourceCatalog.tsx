"use client";
import LocalizedText from "@/components/LocalizedText";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { API_BASE_URL } from "@/config";

type Source = { id: number; name: string; channel: string; utm_key: string | null; color: string; monthly_cost: number; is_active: boolean };
const empty = { name: "", channel: "Direct", utm_key: "", color: "#6366f1", monthly_cost: 0, is_active: true };
const input = "rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
export default function LeadSourceCatalog() {
  const [sources, setSources] = useState<Source[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/lead-sources`);
    if (!response.ok) throw new Error("Could not load source catalog");
    const data = await response.json(); setSources(data.sources || []);
  }, []);
  useEffect(() => { load().catch(error => setMessage(error.message)); }, [load]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/lead-sources${editing ? `/${editing}` : ""}`, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, name: form.name.trim(), utm_key: form.utm_key.trim() || null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save source");
      setEditing(null); setForm(empty); await load(); setMessage("Source saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save source"); }
    finally { setBusy(false); }
  };
  return <details className="mx-6 my-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><summary className="cursor-pointer font-semibold">Manage source catalog</summary>
    <p className="my-3 text-sm text-slate-500">Configure the choices used when assigning lead sources.</p>
    {message && <p role="status" className="my-2 text-sm">{message}</p>}
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1 text-xs font-semibold">Source name<input required className={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label className="grid gap-1 text-xs font-semibold">Channel<select className={input} value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>{["Social", "Paid", "Organic", "Referral", "Event", "Direct", "Outbound", "Other"].map(channel => <option key={channel}>{channel}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold">UTM source<input className={input} value={form.utm_key} onChange={e => setForm({ ...form, utm_key: e.target.value })} /></label>
      <label className="grid gap-1 text-xs font-semibold">Monthly cost<input type="number" min="0" step="0.01" className={input} value={form.monthly_cost} onChange={e => setForm({ ...form, monthly_cost: Number(e.target.value) })} /></label>
      <label className="grid gap-1 text-xs font-semibold">Color<input type="color" className="h-10 w-full" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> <LocalizedText text={"Active"} /></label>
      <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : editing ? "Save source" : "Add source"}</button>
      {editing && <button type="button" className={input} onClick={() => { setEditing(null); setForm(empty); }}>Cancel edit</button>}
    </form>
    <div className="mt-4 divide-y divide-slate-100 dark:divide-zinc-800">{sources.map(source => <div key={source.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: source.color }} />{source.name} <span className="text-slate-500">· {source.channel}{!source.is_active ? " · inactive" : ""}</span></span><button type="button" disabled={busy} className="text-indigo-600 hover:underline" onClick={() => { setEditing(source.id); setForm({ name: source.name, channel: source.channel, utm_key: source.utm_key || "", color: source.color, monthly_cost: source.monthly_cost || 0, is_active: source.is_active }); }}><LocalizedText text={"Edit"} /></button></div>)}</div>
  </details>;
}
