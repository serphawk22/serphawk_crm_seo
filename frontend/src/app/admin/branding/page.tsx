"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { useTenantConfig } from "@/context/TenantConfigContext";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import LeadWebhookCard from "@/components/LeadWebhookCard";
import SMTPSettingsTab from "@/app/admin/settings/components/SMTPSettingsTab";
import { logoSrc } from "@/lib/brandLogo";
import { Palette, Loader2, Check, Upload, Trash2, ArrowUp, ArrowDown, Plus, Sparkles, Mail, ListChecks, Receipt, PartyPopper } from "lucide-react";

type Field = { key: string; label: string; hint?: string; multiline?: boolean; type?: "color" | "select"; options?: { value: string; label: string }[] };

const DEFAULT_STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"];
const LOCKED_STATUSES = ["New", "Contacted"];

const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: "Company",
    fields: [
      { key: "brand_name", label: "Company / brand name", hint: "Shown in the app, on PDFs and in emails" },
      { key: "brand_tagline", label: "Tagline", hint: "e.g. Digital Marketing Agency" },
      { key: "website_url", label: "Website", hint: "https://..." },
    ],
  },
  {
    title: "Contact details on documents",
    fields: [
      { key: "contact_email", label: "Email" },
      { key: "contact_phone", label: "Phone" },
      { key: "contact_address", label: "Address" },
      { key: "support_email", label: "Support email" },
    ],
  },
  {
    title: "Defaults",
    fields: [
      { key: "default_currency", label: "Currency", hint: "USD, INR, MXN ..." },
      { key: "locale", label: "Language", hint: "en or es" },
      { key: "timezone", label: "Time zone", hint: "Asia/Kolkata" },
      { key: "default_dial_code", label: "Default dial code", hint: "+91" },
    ],
  },
  {
    title: "AI and proposals",
    fields: [
      { key: "ai_company_description", label: "What your company does", hint: "Used by the AI when it writes outreach emails for you", multiline: true },
      { key: "proposal_terms", label: "Terms shown on proposal links", multiline: true },
    ],
  },
];

const INVOICE_FIELDS: Field[] = [
  { key: "invoice_accent_color", label: "Accent colour", hint: "#2563eb", type: "color" },
  {
    key: "invoice_logo_position", label: "Logo position", type: "select",
    options: [{ value: "", label: "Left (default)" }, { value: "left", label: "Left" }, { value: "right", label: "Right" }],
  },
  { key: "invoice_payment_details", label: "Payment details", hint: "Bank account, UPI id or how to pay. Printed under the totals.", multiline: true },
  { key: "invoice_terms", label: "Terms", hint: "e.g. Payment due within 15 days", multiline: true },
  { key: "invoice_footer_note", label: "Closing line", hint: "e.g. Thank you for your business" },
];

const ALL_KEYS = [...GROUPS.flatMap((g) => g.fields), ...INVOICE_FIELDS].map((f) => f.key);

const inputCls = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm";
const cardCls = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3";

type StatusRow = { orig: string | null; label: string };
type Options = { industries: { key: string; label: string }[]; countries: { code: string; name: string }[] };

function FieldInput({ f, value, onChange }: { f: Field; value: string; onChange: (v: string) => void }) {
  if (f.type === "color") {
    return (
      <div className="flex items-center gap-2">
        <input type="color" className="h-9 w-12 rounded border border-gray-300 dark:border-gray-700 bg-transparent p-0.5" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#2563eb"} onChange={(e) => onChange(e.target.value)} />
        <input className={inputCls} placeholder={f.hint} value={value} onChange={(e) => onChange(e.target.value)} />
        {value && <button type="button" className="text-xs text-gray-500 hover:text-gray-800 whitespace-nowrap" onClick={() => onChange("")}>Clear</button>}
      </div>
    );
  }
  if (f.type === "select") {
    return (
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return f.multiline
    ? <textarea rows={3} className={inputCls} placeholder={f.hint} value={value} onChange={(e) => onChange(e.target.value)} />
    : <input className={inputCls} placeholder={f.hint} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export default function BrandingPage() {
  const { user } = useRole();
  const { refresh, settings: liveSettings, isOn } = useTenantConfig();
  const [intakeKey, setIntakeKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [options, setOptions] = useState<Options>({ industries: [], countries: [] });
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [statusesBefore, setStatusesBefore] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMsg, setLogoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [logoKey, setLogoKey] = useState(0);
  const [checkKey, setCheckKey] = useState(0);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const welcome = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome") === "1";
  const isOperator = user?.role === "SuperAdmin";           // the platform operator is not inside any client workspace
  const allowed = !user || user.role === "Admin";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/tenant/settings`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not load settings");
      const s = data.settings || {};
      const v: Record<string, string> = {};
      ALL_KEYS.forEach((k) => (v[k] = s[k] ?? ""));
      setValues(v);
      setFlags({ append_signature_on_replies: !!s.append_signature_on_replies });
      setIntakeKey(s.lead_intake_api_key ?? null);
      setIndustry(s.industry ?? "");
      setCountry(s.country ?? "");
      const list: string[] = s.lead_statuses && s.lead_statuses.length ? s.lead_statuses : DEFAULT_STATUSES;
      setStatuses(list.map((l) => ({ orig: l, label: l })));
      setStatusesBefore(JSON.stringify(list));
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const onChecklist = useCallback((d: any) => d?.options && setOptions(d.options), []);

  const setValue = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  // ── logo ──
  const uploadLogo = async (file: File) => {
    setLogoBusy(true);
    setLogoMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE_URL}/tenant/logo`, { method: "PUT", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not upload the logo");
      setLogoMsg({ ok: true, text: "Logo updated." });
      setLogoKey((k) => k + 1);
      setCheckKey((k) => k + 1);
      refresh();
    } catch (e: any) {
      setLogoMsg({ ok: false, text: e.message });
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    setLogoMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/tenant/logo`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove the logo");
      setLogoMsg({ ok: true, text: "Logo removed." });
      setCheckKey((k) => k + 1);
      refresh();
    } catch (e: any) {
      setLogoMsg({ ok: false, text: e.message });
    } finally {
      setLogoBusy(false);
    }
  };

  // ── auto configuration ──
  const autoConfigure = async (overwrite: boolean) => {
    setAutoMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/tenant/auto-configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry: industry || null, country: country || null, overwrite }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not apply the defaults");
      const n = Object.keys(data.applied || {}).length;
      setAutoMsg(n ? `Applied ${n} setting${n === 1 ? "" : "s"} from your company profile.` : "Nothing to change: your settings already match.");
      await load();
      refresh();
    } catch (e: any) {
      setAutoMsg(e.message);
    }
  };

  // ── lead statuses ──
  const moveStatus = (i: number, d: number) =>
    setStatuses((rows) => {
      const j = i + d;
      if (j < 0 || j >= rows.length) return rows;
      const next = [...rows];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // ── save ──
  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const settings: Record<string, any> = {};
      ALL_KEYS.forEach((k) => (settings[k] = (values[k] ?? "").trim() || null));
      settings.append_signature_on_replies = flags.append_signature_on_replies || null;
      settings.industry = industry || null;
      settings.country = country || null;
      const res = await fetch(`${API_BASE_URL}/tenant/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save");

      const labels = statuses.map((r) => r.label.trim()).filter(Boolean);
      if (JSON.stringify(labels) !== statusesBefore) {
        const renames: Record<string, string> = {};
        statuses.forEach((r) => {
          const l = r.label.trim();
          if (r.orig && l && r.orig !== l) renames[r.orig] = l;
        });
        const sres = await fetch(`${API_BASE_URL}/tenant/lead-statuses`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statuses: labels, renames }),
        });
        const sdata = await sres.json().catch(() => ({}));
        if (!sres.ok) throw new Error(typeof sdata.detail === "string" ? `Lead statuses: ${sdata.detail}` : "Could not save the lead statuses");
        setStatuses(sdata.lead_statuses.map((l: string) => ({ orig: l, label: l })));
        setStatusesBefore(JSON.stringify(sdata.lead_statuses));
      }
      setMsg({ ok: true, text: "Saved. Your menu, documents and emails use the new details." });
      setCheckKey((k) => k + 1);
      refresh();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (isOperator) {
    return (
      <div className="p-8 max-w-2xl mx-auto font-sans space-y-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Palette className="w-8 h-8 text-blue-600" /> Company profile and settings</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-5 text-sm text-amber-900 dark:text-amber-200 space-y-2">
          <p className="font-semibold">You are signed in as the platform operator, which is not part of any client&apos;s workspace.</p>
          <p>This page is each client&apos;s own company profile. To set up a client from here, open <a className="underline font-semibold" href="/superadmin/clients">Client Management</a>, choose <b>Configure</b> on the client and change its modules, branding and logo.</p>
          <p>To see exactly what a client&apos;s Admin sees, sign in as that client&apos;s Admin in a private window.</p>
        </div>
      </div>
    );
  }
  if (!allowed) return <p className="p-8 text-gray-500">Only an Admin can change these settings.</p>;
  if (loading) return <div className="p-8 flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  const currentLogo = logoSrc(liveSettings.brand_logo_url);

  return (
    <div className="p-8 max-w-3xl mx-auto font-sans space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Palette className="w-8 h-8 text-blue-600" /> Company profile and settings</h1>
        <p className="text-gray-500 mt-2">How your company appears in the app, on PDFs and in emails, and how your CRM is set up.</p>
      </div>

      {welcome && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-900 p-4 flex gap-3 text-sm text-indigo-900 dark:text-indigo-200">
          <PartyPopper className="w-5 h-5 shrink-0" />
          <p>Your workspace is ready and already set up for your country and type of business. Add your logo and connect your email below, then invite your team.</p>
        </div>
      )}

      <OnboardingChecklist onLoaded={onChecklist} refreshKey={checkKey} />

      <section className={cardCls}>
        <h2 className="text-lg font-bold">Logo</h2>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-950 overflow-hidden">
            {currentLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={logoKey} src={currentLogo} alt="Your logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-gray-400 text-center px-1">No logo yet</span>
            )}
          </div>
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            <div className="flex gap-2">
              <button type="button" disabled={logoBusy} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                {logoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload logo
              </button>
              {currentLogo && (
                <button type="button" disabled={logoBusy} onClick={removeLogo} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50">
                  <Trash2 className="w-4 h-4" /> Remove
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500">PNG, JPEG or WebP, up to 2 MB. It appears in the menu, on invoices, quotes and PDFs, and in emails you send.</p>
            {logoMsg && <p className={`text-xs ${logoMsg.ok ? "text-green-700" : "text-red-700"}`}>{logoMsg.text}</p>}
          </div>
        </div>
      </section>

      {GROUPS.slice(0, 1).map((g) => (
        <section key={g.title} className={cardCls}>
          <h2 className="text-lg font-bold">{g.title}</h2>
          {g.fields.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="text-gray-600 dark:text-gray-400">{f.label}</span>
              <FieldInput f={f} value={values[f.key] ?? ""} onChange={(v) => setValue(f.key, v)} />
            </label>
          ))}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-400">What your company does</span>
              <select className={inputCls} value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option value="">Not set</option>
                {options.industries.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-400">Country</span>
              <select className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">Not set</option>
                {options.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="button" onClick={() => autoConfigure(false)} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 text-indigo-700 dark:text-indigo-300 dark:border-indigo-900 px-3 py-2 text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-950/30">
              <Sparkles className="w-4 h-4" /> Fill in the blanks from this profile
            </button>
            <button type="button" onClick={() => window.confirm("Replace your currency, time zone, language and dial code with the defaults for this country?") && autoConfigure(true)} className="text-xs text-gray-500 hover:text-gray-800 underline">
              Reset regional defaults
            </button>
            {autoMsg && <span className="text-xs text-gray-600 dark:text-gray-400">{autoMsg}</span>}
          </div>
          <p className="text-xs text-gray-500">Choosing your country and business type sets the currency, time zone, language and phone code for you. Anything you have already set is kept.</p>
        </section>
      ))}

      {GROUPS.slice(1).map((g) => (
        <section key={g.title} className={cardCls}>
          <h2 className="text-lg font-bold">{g.title}</h2>
          {g.fields.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="text-gray-600 dark:text-gray-400">{f.label}</span>
              <FieldInput f={f} value={values[f.key] ?? ""} onChange={(v) => setValue(f.key, v)} />
            </label>
          ))}
        </section>
      ))}

      <section id="statuses" className={cardCls}>
        <h2 className="text-lg font-bold flex items-center gap-2"><ListChecks className="w-5 h-5 text-blue-600" /> Lead statuses</h2>
        <p className="text-xs text-gray-500">
          Name the stages your leads move through. Renaming a status also renames it on the leads that already use it.
          &ldquo;New&rdquo; and &ldquo;Contacted&rdquo; are set by the CRM itself (a new lead; the first email sent), so they stay.
        </p>
        <ul className="space-y-2">
          {statuses.map((row, i) => {
            const locked = LOCKED_STATUSES.includes(row.orig || row.label);
            return (
              <li key={i} className="flex items-center gap-2">
                <input className={inputCls} value={row.label} disabled={locked} maxLength={60}
                  onChange={(e) => setStatuses((rows) => rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))} />
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveStatus(i, -1)} className="p-2 text-gray-500 hover:text-gray-900 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" aria-label="Move down" disabled={i === statuses.length - 1} onClick={() => moveStatus(i, 1)} className="p-2 text-gray-500 hover:text-gray-900 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                <button type="button" aria-label="Remove status" disabled={locked} onClick={() => setStatuses((rows) => rows.filter((_, j) => j !== i))} className="p-2 text-red-500 hover:text-red-700 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setStatuses((rows) => [...rows, { orig: null, label: "" }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900"><Plus className="w-4 h-4" /> Add status</button>
          <button type="button" onClick={() => setStatuses(DEFAULT_STATUSES.map((l) => ({ orig: statuses.find((r) => r.orig === l)?.orig ?? null, label: l })))} className="text-xs text-gray-500 hover:text-gray-800 underline">Use the standard list</button>
        </div>
        <p className="text-xs text-gray-500">Removing a status does not change leads that already have it. Rename it instead to move them.</p>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-bold flex items-center gap-2"><Receipt className="w-5 h-5 text-blue-600" /> Invoice look</h2>
        <p className="text-xs text-gray-500">Your logo, colour and wording on invoices. Numbering, tax and the totals are calculated by the CRM and are the same for everyone.</p>
        {INVOICE_FIELDS.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="text-gray-600 dark:text-gray-400">{f.label}</span>
            <FieldInput f={f} value={values[f.key] ?? ""} onChange={(v) => setValue(f.key, v)} />
          </label>
        ))}
      </section>

      {isOn("lead_webhook") && <LeadWebhookCard key={intakeKey || "none"} currentKey={intakeKey} onChanged={load} />}

      <section className={cardCls}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!flags.append_signature_on_replies} onChange={(e) => setFlags({ ...flags, append_signature_on_replies: e.target.checked })} />
          Add each person&apos;s Email Agent signature to Inbox replies and lead / client emails
        </label>
      </section>

      <div className="flex items-center gap-4 sticky bottom-4">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 shadow disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
        </button>
        {msg && <span className={`text-sm rounded px-2 py-1 bg-white/90 dark:bg-gray-900/90 ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>

      <section id="mailbox" className="space-y-3 pt-4">
        <h2 className="text-lg font-bold flex items-center gap-2"><Mail className="w-5 h-5 text-blue-600" /> Company mailbox</h2>
        <p className="text-xs text-gray-500">
          Connect the email account your company sends from (quotes, invoices, proposals and the Inbox). Each person can also connect their own mailbox under Email Agent &rarr; Settings.
          The password is stored encrypted and is never shown again.
        </p>
        <SMTPSettingsTab />
      </section>
    </div>
  );
}
