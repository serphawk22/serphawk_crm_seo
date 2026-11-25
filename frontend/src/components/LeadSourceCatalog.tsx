"use client";
import LocalizedText from "@/components/LocalizedText";
import React, { useCallback, useEffect, useState, type FormEvent } from "react";
import { API_BASE_URL } from "@/config";
import { Copy, Check, Key, Globe, Shield, RefreshCw, Terminal, Sparkles, Layers } from "lucide-react";

type Source = { id: number; name: string; channel: string; utm_key: string | null; color: string; monthly_cost: number; is_active: boolean };
const empty = { name: "", channel: "Direct", utm_key: "", color: "#6366f1", monthly_cost: 0, is_active: true };
const input = "rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export default function LeadSourceCatalog() {
  const [sources, setSources] = useState<Source[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Webhook / API Key State for Google Ads & Meta Ads
  const [intakeKey, setIntakeKey] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<"google" | "meta" | "curl">("google");
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/lead-sources`);
    if (!response.ok) throw new Error("Could not load source catalog");
    const data = await response.json();
    setSources(data.sources || []);
  }, []);

  const loadIntakeKey = useCallback(async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_BASE_URL}/tenant/lead-intake-key`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.api_key) setIntakeKey(data.api_key);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
    loadIntakeKey();
  }, [load, loadIntakeKey]);

  const handleRegenerateKey = async () => {
    if (!confirm("Are you sure? Any existing Google Ads or Meta Ads webhook using the old key will stop working until updated.")) return;
    setRegenerating(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_BASE_URL}/tenant/lead-intake-key`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.api_key) setIntakeKey(data.api_key);
      }
    } finally {
      setRegenerating(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/lead-sources${editing ? `/${editing}` : ""}`, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: form.name.trim(), utm_key: form.utm_key.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save source");
      setEditing(null);
      setForm(empty);
      await load();
      setMessage("Source saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save source");
    } finally {
      setBusy(false);
    }
  };

  const domain = typeof window !== "undefined" ? window.location.origin : "https://crm.serphawk.in";
  const webhookUrl = `${domain}/leads/webhook`;

  const copyText = (text: string, setter: (val: boolean) => void) => {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    }
  };

  const sampleCurl = `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${intakeKey || "YOUR_INTAKE_KEY"}" \\
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+15551234567",
    "source": "Meta Ads",
    "form_name": "Autumn Campaign 2026",
    "message": "Interested in premium package"
  }'`;

  return (
    <div className="mx-6 my-4 space-y-4">
      {/* ── Google & Meta Ads Integration Panel ── */}
      <div className="rounded-2xl border border-blue-200/90 dark:border-blue-900/60 bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-purple-50/30 dark:from-zinc-900 dark:via-zinc-900/90 dark:to-zinc-900 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-blue-200/60 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  Connect Google Ads & Meta Ads Leads to Your Instance
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Instance Webhook Active
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Every lead captured from Google Lead Forms or Meta (Facebook/Instagram) Instant Forms lands directly in your instance.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRegenerateKey}
            disabled={regenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 transition cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />
            <span>Regenerate Intake Key</span>
          </button>
        </div>

        {/* Credentials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
              Your Webhook URL (Endpoint)
            </span>
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200/70 dark:border-zinc-800">
              <code className="text-xs font-mono text-blue-600 dark:text-blue-400 truncate select-all">
                {webhookUrl}
              </code>
              <button
                type="button"
                onClick={() => copyText(webhookUrl, setCopiedUrl)}
                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-500 transition cursor-pointer shrink-0"
                title="Copy Webhook URL"
              >
                {copiedUrl ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
              Your Intake Key (X-API-Key / Google Key)
            </span>
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200/70 dark:border-zinc-800">
              <code className="text-xs font-mono text-amber-600 dark:text-amber-400 truncate select-all">
                {intakeKey || "Loading key..."}
              </code>
              <button
                type="button"
                onClick={() => copyText(intakeKey, setCopiedKey)}
                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-500 transition cursor-pointer shrink-0"
                title="Copy Intake Key"
              >
                {copiedKey ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Tabbed Setup Instructions */}
        <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 mb-3">
            <button
              type="button"
              onClick={() => setActiveGuideTab("google")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeGuideTab === "google"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700"
              }`}
            >
              Google Ads Setup
            </button>
            <button
              type="button"
              onClick={() => setActiveGuideTab("meta")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeGuideTab === "meta"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700"
              }`}
            >
              Meta Ads (Facebook / Instagram) Setup
            </button>
            <button
              type="button"
              onClick={() => setActiveGuideTab("curl")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeGuideTab === "curl"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700"
              }`}
            >
              Quick Test (cURL)
            </button>
          </div>

          {activeGuideTab === "google" && (
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300 space-y-2">
              <p className="font-bold text-slate-900 dark:text-white">Connecting Google Ads Native Lead Form Asset:</p>
              <ol className="list-decimal pl-5 space-y-1.5 leading-relaxed">
                <li>Go to your <strong>Google Ads account</strong> → <strong>Campaigns</strong> → <strong>Assets</strong> → <strong>Lead Form</strong>.</li>
                <li>Scroll down to <strong>Lead delivery option</strong> and choose <strong>Manage your leads with a webhook</strong>.</li>
                <li>Paste your <strong>Webhook URL</strong>: <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400">{webhookUrl}</code></li>
                <li>Paste your <strong>Key</strong>: <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-amber-600 dark:text-amber-400">{intakeKey || "YOUR_KEY"}</code></li>
                <li>Click <strong>Send test data</strong> in Google Ads. The test lead will immediately appear in your CRM Leads list with source <em>&quot;Google Ads&quot;</em>!</li>
              </ol>
            </div>
          )}

          {activeGuideTab === "meta" && (
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300 space-y-2">
              <p className="font-bold text-slate-900 dark:text-white">Connecting Meta Ads (Facebook &amp; Instagram Lead Ads):</p>
              <ol className="list-decimal pl-5 space-y-1.5 leading-relaxed">
                <li>In <strong>Zapier</strong>, <strong>Make.com</strong>, or <strong>n8n</strong>, create a new workflow triggered by <strong>New Lead in Facebook Lead Ads</strong>.</li>
                <li>Add a <strong>Webhook POST</strong> action pointing to: <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400">{webhookUrl}</code></li>
                <li>Add Header: <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">X-API-Key: {intakeKey || "YOUR_KEY"}</code> (or include <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">&quot;api_key&quot;: &quot;{intakeKey}&quot;</code> in the JSON body).</li>
                <li>Map the fields: <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">&quot;name&quot;</code>, <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">&quot;email&quot;</code>, <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">&quot;phone&quot;</code>, and set <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">&quot;source&quot;: &quot;Meta Ads&quot;</code>.</li>
                <li>Publish the workflow. Any new Facebook or Instagram lead will instantly auto-assign to your sales team and notify you!</li>
              </ol>
            </div>
          )}

          {activeGuideTab === "curl" && (
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-bold text-slate-900 dark:text-white">Send a Test Lead from Terminal:</p>
                <button
                  type="button"
                  onClick={() => copyText(sampleCurl, setCopiedCurl)}
                  className="flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCurl ? "Copied!" : "Copy cURL"}</span>
                </button>
              </div>
              <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto select-all leading-relaxed">
                {sampleCurl}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* ── Source Catalog Accordion ── */}
      <details className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer font-semibold text-sm text-slate-900 dark:text-white">
          Manage Source Catalog &amp; Channels
        </summary>
        <p className="my-3 text-xs text-slate-500 dark:text-zinc-400">
          Configure default lead sources (e.g. Google Ads, Meta Ads, Referral, Direct) and their colors for analytics tracking.
        </p>
        {message && <p role="status" className="my-2 text-xs font-semibold text-indigo-600">{message}</p>}
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-xs font-semibold">Source name<input required className={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label className="grid gap-1 text-xs font-semibold">Channel<select className={input} value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>{["Social", "Paid", "Organic", "Referral", "Event", "Direct", "Outbound", "Other"].map(channel => <option key={channel}>{channel}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-semibold">UTM source<input className={input} value={form.utm_key} onChange={e => setForm({ ...form, utm_key: e.target.value })} /></label>
          <label className="grid gap-1 text-xs font-semibold">Monthly cost<input type="number" min="0" step="0.01" className={input} value={form.monthly_cost} onChange={e => setForm({ ...form, monthly_cost: Number(e.target.value) })} /></label>
          <label className="grid gap-1 text-xs font-semibold">Color<input type="color" className="h-10 w-full" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> <LocalizedText text={"Active"} /></label>
          <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer">{busy ? "Saving…" : editing ? "Save source" : "Add source"}</button>
          {editing && <button type="button" className={input} onClick={() => { setEditing(null); setForm(empty); }}>Cancel edit</button>}
        </form>
        <div className="mt-4 divide-y divide-slate-100 dark:divide-zinc-800">
          {sources.map(source => (
            <div key={source.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: source.color }} />
                {source.name} <span className="text-slate-500">· {source.channel}{!source.is_active ? " · inactive" : ""}</span>
              </span>
              <button
                type="button"
                disabled={busy}
                className="text-indigo-600 hover:underline cursor-pointer"
                onClick={() => {
                  setEditing(source.id);
                  setForm({ name: source.name, channel: source.channel, utm_key: source.utm_key || "", color: source.color, monthly_cost: source.monthly_cost || 0, is_active: source.is_active });
                }}
              >
                <LocalizedText text={"Edit"} />
              </button>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
