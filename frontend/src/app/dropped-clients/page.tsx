"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Building2, CalendarClock, CheckCircle2, Loader2, Plus, RefreshCw, Search, Trash2, TrendingDown, UserX, X } from "lucide-react";
import { API_BASE_URL } from "@/config";

interface DroppedClient {
  id: number;
  client_id?: number | null;
  company_name: string;
  reason?: string | null;
  reason_category?: string | null;
  last_revenue?: number | null;
  relationship_months?: number | null;
  reactivation_potential?: string | null;
  notes?: string | null;
  previous_status?: string | null;
  dropped_at?: string | null;
  reactivated_at?: string | null;
}

interface ClientOption {
  id: number;
  companyName?: string;
  projectName?: string;
  email?: string;
  status?: string;
}

const CATEGORIES = ["Price", "Service Quality", "Competition", "No Budget", "Merger/Acquisition", "Scope Change", "Project Completed", "Unresponsive", "Other"];

const EMPTY_FORM = {
  client_id: "",
  company_name: "",
  reason: "",
  reason_category: "Other",
  last_revenue: "",
  relationship_months: "",
  reactivation_potential: "Low",
  notes: "",
};

export default function DroppedClientsPage() {
  const [records, setRecords] = useState<DroppedClient[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [pendingClientId, setPendingClientId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [droppedResponse, clientsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/dropped-clients`),
        fetch(`${API_BASE_URL}/clients?per_page=200&page=1`),
      ]);
      if (!droppedResponse.ok) throw new Error("Could not load dropped clients.");
      const droppedData = await droppedResponse.json();
      const clientsData = clientsResponse.ok ? await clientsResponse.json() : {};
      setRecords(droppedData.dropped_clients || []);
      setClients((clientsData.clients || []).filter((client: ClientOption) => client.status !== "Dropped"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load dropped clients.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const clientId = new URLSearchParams(window.location.search).get("client_id");
    if (!clientId) return;
    window.history.replaceState(null, "", window.location.pathname);
    setPendingClientId(clientId);
  }, []);

  useEffect(() => {
    if (!pendingClientId) return;
    const client = clients.find(item => String(item.id) === pendingClientId);
    if (!client) return;
    setForm(current => ({
      ...current,
      client_id: pendingClientId,
      company_name: client.companyName || client.projectName || client.email || "",
    }));
    setShowForm(true);
    setPendingClientId("");
  }, [clients, pendingClientId]);

  const activeRecords = records.filter(record => !record.reactivated_at);
  const filteredRecords = records.filter(record => {
    const matchesCategory = category === "All" || record.reason_category === category;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${record.company_name} ${record.reason || ""} ${record.notes || ""}`.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  const handleClientSelect = (clientId: string) => {
    const client = clients.find(item => String(item.id) === clientId);
    setForm(current => ({
      ...current,
      client_id: clientId,
      company_name: client ? (client.companyName || client.projectName || client.email || "") : current.company_name,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/dropped-clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: form.client_id ? Number(form.client_id) : null,
          company_name: form.company_name,
          reason: form.reason || null,
          reason_category: form.reason_category,
          last_revenue: Number(form.last_revenue) || 0,
          relationship_months: Number(form.relationship_months) || 0,
          reactivation_potential: form.reactivation_potential,
          notes: form.notes || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not save the record.");
      setForm(EMPTY_FORM);
      setShowForm(false);
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save the record.");
    } finally {
      setSaving(false);
    }
  };

  const handleReactivate = async (record: DroppedClient) => {
    if (!record.client_id || !window.confirm(`Reactivate ${record.company_name}?`)) return;
    const response = await fetch(`${API_BASE_URL}/dropped-clients/by-client/${record.client_id}/reactivate`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.detail || "Could not reactivate this client.");
      return;
    }
    await loadData();
  };

  const handleDelete = async (record: DroppedClient) => {
    if (!window.confirm(`Delete the retention record for ${record.company_name}?`)) return;
    const response = await fetch(`${API_BASE_URL}/dropped-clients/${record.id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Could not delete this record.");
      return;
    }
    setRecords(current => current.filter(item => item.id !== record.id));
  };

  const revenueLost = activeRecords.reduce((sum, record) => sum + (record.last_revenue || 0), 0);
  const highPotential = activeRecords.filter(record => record.reactivation_potential === "High").length;
  const categories = Array.from(new Set(records.map(record => record.reason_category || "Other")));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"><UserX size={21} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dropped Clients</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400">Retention history and reactivation opportunities</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void loadData()} title="Refresh" className="rounded-lg border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"><RefreshCw size={17} /></button>
          <button onClick={() => { setError(""); setShowForm(true); }} className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"><Plus size={17} /> Record dropped client</button>
        </div>
      </header>

      {error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertTriangle size={17} />{error}<button onClick={() => setError("")} className="ml-auto" aria-label="Dismiss"><X size={16} /></button></div>}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Dropped-client summary">
        <div className="flex items-center gap-3 border-l-2 border-rose-500 bg-white px-4 py-3 dark:bg-zinc-900"><UserX className="text-rose-600" size={20} /><div><p className="text-xl font-bold text-slate-900 dark:text-white">{loading ? "—" : activeRecords.length}</p><p className="text-xs text-slate-500 dark:text-zinc-400">Active dropped clients</p></div></div>
        <div className="flex items-center gap-3 border-l-2 border-amber-500 bg-white px-4 py-3 dark:bg-zinc-900"><TrendingDown className="text-amber-600" size={20} /><div><p className="text-xl font-bold text-slate-900 dark:text-white">{loading ? "—" : revenueLost.toLocaleString()}</p><p className="text-xs text-slate-500 dark:text-zinc-400">Last recorded revenue lost</p></div></div>
        <div className="flex items-center gap-3 border-l-2 border-emerald-500 bg-white px-4 py-3 dark:bg-zinc-900"><ArrowUpRight className="text-emerald-600" size={20} /><div><p className="text-xl font-bold text-slate-900 dark:text-white">{loading ? "—" : highPotential}</p><p className="text-xs text-slate-500 dark:text-zinc-400">High reactivation potential</p></div></div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-zinc-800">
          <div className="flex flex-wrap gap-2">
            {["All", ...categories].map(item => <button key={item} onClick={() => setCategory(item)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${category === item ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"}`}>{item}</button>)}
          </div>
          <label className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search retention history" className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" /></label>
        </div>

        {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-500" size={28} /></div> : filteredRecords.length === 0 ? <div className="flex flex-col items-center py-16 text-center text-slate-500 dark:text-zinc-400"><Building2 className="mb-3 opacity-40" size={32} /><p className="font-semibold">No dropped-client records</p><p className="mt-1 text-sm">New records will appear here with their retention details.</p></div> : (
          <div className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-zinc-800 dark:border-zinc-800">
            {filteredRecords.map(record => (
              <article key={record.id} className="flex flex-wrap items-start gap-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300"><Building2 size={19} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-900 dark:text-white">{record.company_name}</h2>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${record.reactivated_at ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"}`}>{record.reactivated_at ? "Reactivated" : "Dropped"}</span>
                    {record.reason_category && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">{record.reason_category}</span>}
                  </div>
                  {record.reason && <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">{record.reason}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-zinc-400">
                    <span>Revenue: {(record.last_revenue || 0).toLocaleString()}</span><span>Relationship: {record.relationship_months || 0} months</span><span>Reactivation: {record.reactivation_potential || "Low"}</span>
                    <span className="inline-flex items-center gap-1"><CalendarClock size={13} />{record.dropped_at ? new Date(record.dropped_at).toLocaleDateString() : "Date not recorded"}</span>
                  </div>
                  {record.notes && <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">{record.notes}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {record.client_id && <Link href={`/admin/clients/${record.client_id}`} title="Open client" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-zinc-800"><ArrowUpRight size={16} /></Link>}
                  {!record.reactivated_at && record.client_id && <button onClick={() => void handleReactivate(record)} title="Reactivate client" className="rounded-md p-2 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"><CheckCircle2 size={16} /></button>}
                  <button onClick={() => void handleDelete(record)} title="Delete retention record" className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showForm && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowForm(false); }}>
        <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl dark:bg-zinc-900">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white">Record client departure</h2><p className="text-sm text-slate-500 dark:text-zinc-400">Save the reason and retention context.</p></div><button type="button" onClick={() => setShowForm(false)} aria-label="Close" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"><X size={18} /></button></div>
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">Link existing client <select value={form.client_id} onChange={event => handleClientSelect(event.target.value)} className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="">No linked client</option>{clients.map(client => <option key={client.id} value={client.id}>{client.companyName || client.projectName || client.email || `Client #${client.id}`}</option>)}</select></label>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">Company name <input required maxLength={255} value={form.company_name} onChange={event => setForm(current => ({ ...current, company_name: event.target.value }))} className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">Reason <textarea value={form.reason} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))} rows={2} className="mt-1.5 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">Category <select value={form.reason_category} onChange={event => setForm(current => ({ ...current, reason_category: event.target.value }))} className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950">{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">Reactivation potential <select value={form.reactivation_potential} onChange={event => setForm(current => ({ ...current, reactivation_potential: event.target.value }))} className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option>Low</option><option>Medium</option><option>High</option></select></label>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">Last revenue <input type="number" min="0" step="0.01" value={form.last_revenue} onChange={event => setForm(current => ({ ...current, last_revenue: event.target.value }))} className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" /></label>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">Relationship duration (months) <input type="number" min="0" step="1" value={form.relationship_months} onChange={event => setForm(current => ({ ...current, relationship_months: event.target.value }))} className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" /></label>
            </div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">Additional notes <textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} rows={3} className="mt-1.5 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" /></label>
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-zinc-800"><button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-zinc-700 dark:text-zinc-300">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Save record</button></div>
        </form>
      </div>}
    </div>
  );
}