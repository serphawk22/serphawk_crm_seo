"use client";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";

export default function PlatformSecuritySettings() {
  const { user } = useRole();
  const allowed = user?.role === "SuperAdmin";
  const [siteKey, setSiteKey] = useState("");
  const [secret, setSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!allowed) return;
    fetch(API_BASE_URL + "/superadmin/security/turnstile", { cache: "no-store" }).then(async r => {
      const data = await r.json(); if (!r.ok) throw new Error(data.detail || "Unable to load settings");
      setSiteKey(data.site_key); setSaved(data.has_secret); setConfigured(data.configured); setLoaded(true);
    }).catch(e => setError(e.message));
  }, [allowed]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const r = await fetch(API_BASE_URL + "/superadmin/security/turnstile", { method: "PUT",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site_key: siteKey, ...(secret ? { secret_key: secret } : {}) }) });
      const data = await r.json(); if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Check the supplied credentials");
      setSecret(""); setSaved(data.has_secret); setConfigured(data.configured); setMessage("Bot protection settings saved for all company forms.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save"); } finally { setBusy(false); }
  }
  if (!allowed) return <p>Platform SuperAdmin access required.</p>;
  return <main className="max-w-2xl space-y-5"><h1 className="text-2xl font-bold">Platform security settings</h1>
    <form onSubmit={save} className="rounded-xl border p-5 space-y-4"><h2 className="font-bold">Website form bot protection</h2>
      <p className="text-sm">Configure one production Turnstile widget covering your company subdomains. These settings apply to all company enquiry forms.</p>
      <p className="text-sm">Status: {configured ? "Configured" : saved ? "Secret needs to be re-entered" : "Not configured"}</p>
      <label className="grid gap-2 text-sm">Site key<input className="border rounded-lg p-3 bg-white text-slate-900" required maxLength={200} value={siteKey} onChange={e => setSiteKey(e.target.value)} /></label>
      <label className="grid gap-2 text-sm">Secret key<input className="border rounded-lg p-3 bg-white text-slate-900" type="password" autoComplete="new-password" maxLength={500} required={!saved || !configured} value={secret} onChange={e => setSecret(e.target.value)} placeholder={saved ? "Stored securely; leave blank to keep it" : "Enter the production secret key"} /></label>
      {error && <p role="alert" className="text-red-600">{error}</p>}{message && <p role="status" className="text-emerald-600">{message}</p>}
      <button disabled={busy || !loaded} className="bg-indigo-600 text-white rounded-lg px-4 py-2 disabled:opacity-50">{busy ? "Saving…" : "Save bot protection"}</button>
    </form></main>;
}
