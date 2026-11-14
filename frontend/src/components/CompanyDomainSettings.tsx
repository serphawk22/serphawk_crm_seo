"use client";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/config";
export default function CompanyDomainSettings({ tenantId }: { tenantId: number }) {
  const [slug, setSlug] = useState("");
  const [domain, setDomain] = useState<{ company_url?: string; lead_form_url?: string; domain_status?: string }>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState("");
  useEffect(() => { fetch(`${API_BASE_URL}/superadmin/tenants/${tenantId}/domain`).then(r => r.json()).then(setDomain).catch(() => setError("Could not load domain")); }, [tenantId]);
  async function assign() {
    setBusy(true); setError("");
    try {
      const r = await fetch(`${API_BASE_URL}/superadmin/tenants/${tenantId}/domain`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.detail); setDomain(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to assign domain"); } finally { setBusy(false); }
  }
  return <section className="border rounded-xl p-4 space-y-3"><h3 className="font-bold">Company subdomain</h3>
    {domain.company_url ? <><p>{domain.company_url}</p><p className="text-sm">Status: {domain.domain_status}</p><p className="text-sm break-all">Form: {domain.lead_form_url}</p></> : <div className="flex gap-2"><input aria-label="Subdomain" className="border rounded p-2 flex-1" value={slug} onChange={e => setSlug(e.target.value)} placeholder="dapros" /><button disabled={busy} className="rounded bg-indigo-600 text-white px-4" onClick={assign}>Assign</button></div>}
    <a className="block text-sm underline" href="/superadmin/security">Configure platform bot protection</a>
    <button className="text-sm underline disabled:opacity-50" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { const r = await fetch(`${API_BASE_URL}/superadmin/domains/check`, { method: "POST" }); const data = await r.json(); if (!r.ok) throw new Error(data.detail); setChecks(`Apex HTTPS: ${data.checks.apex.https_reachable ? "reachable" : "unavailable"}. Wildcard HTTPS: ${data.checks.wildcard.https_reachable ? "reachable" : "unavailable"}. ${data.note}`); }
      catch (e) { setError(e instanceof Error ? e.message : "Check failed"); } finally { setBusy(false); }
    }}>Check platform DNS and HTTPS</button>
    {checks && <p role="status" className="text-xs">{checks}</p>}
    {error && <p role="alert" className="text-red-600">{error}</p>}</section>;
}
