"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, CheckCircle2, KeyRound, Loader2, Plus, Sparkles } from "lucide-react";
import Drawer from "@/components/Drawer";
import { Badge, CredentialsCard, PRESET_ORDER, Preset, RegionOptions, call, ghostBtn, inputCls, labelCls, primaryBtn } from "./shared";

interface Props {
  open: boolean;
  onClose: () => void;
  presets: Preset[];
  regions: RegionOptions;
  onCreated: (result: any) => void;
  onConfigure: (tenantId: number) => void;
  onError: (title: string, message: string) => void;
}

const EMPTY = { business_name: "", name: "", admin_name: "", admin_email: "", admin_password: "", country: "", industry: "", is_trial: false };
const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function NewClientDrawer({ open, onClose, presets, regions, onCreated, onConfigure, onError }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [preset, setPreset] = useState("standard");
  const [presetTouched, setPresetTouched] = useState(false);
  const [accountTouched, setAccountTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<any>(null);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setPreset("standard");
      setPresetTouched(false);
      setAccountTouched(false);
      setError("");
      setCreated(null);
      setShowErrors(false);
    }
  }, [open]);

  const sortedPresets = useMemo(
    () => [...presets].sort((a, b) => PRESET_ORDER.indexOf(a.key) - PRESET_ORDER.indexOf(b.key)),
    [presets],
  );
  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));
  const suggested = regions.industries.find((i) => i.key === form.industry)?.preset;

  const problems = {
    business_name: !form.business_name.trim() ? "Enter the company name" : "",
    name: !form.name.trim() ? "Enter an account name" : "",
    admin_name: !form.admin_name.trim() ? "Enter the admin's name" : "",
    admin_email: !EMAIL.test(form.admin_email.trim()) ? "Enter a valid email address" : "",
    admin_password: form.admin_password && form.admin_password.length < 8 ? "Use at least 8 characters, or leave it blank to generate one" : "",
  };
  const valid = Object.values(problems).every((p) => !p);

  const submit = async () => {
    setShowErrors(true);
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      const body: Record<string, any> = {
        name: form.name.trim(), business_name: form.business_name.trim(), preset, admin_name: form.admin_name.trim(),
        admin_email: form.admin_email.trim(), country: form.country || null, industry: form.industry || null, is_trial: form.is_trial,
      };
      if (form.admin_password) body.admin_password = form.admin_password;
      const out = await call("/superadmin/tenants", { method: "POST", body: JSON.stringify(body) });
      setCreated({ ...out, business_name: form.business_name.trim(), password: out.generated_admin_password || form.admin_password || null });
      onCreated({ ...out, business_name: form.business_name.trim() });
    } catch (e: any) {
      setError(e.message);
      onError("The client was not created", e.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof problems) => (showErrors && problems[key] ? <p className="mt-1 text-xs font-medium text-red-600">{problems[key]}</p> : null);
  const bad = (key: keyof typeof problems) => (showErrors && problems[key] ? "!border-red-400 focus:!ring-red-400/40" : "");

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title={created ? "Client created" : "Onboard a new client"}
      subtitle={created ? undefined : "A separate workspace with its own admin login, modules and branding. No code, no new deployment."}
      leading={<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md"><Building2 className="w-5 h-5" /></div>}
      footer={
        created ? (
          <div className="flex justify-end gap-3">
            <button className={ghostBtn} onClick={() => { setCreated(null); setForm(EMPTY); setShowErrors(false); setPresetTouched(false); setAccountTouched(false); }}>Create another</button>
            <button className={primaryBtn} onClick={() => { onClose(); onConfigure(created.tenant_id); }}>Configure this client <ArrowRight className="w-4 h-4" /></button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-zinc-400">{showErrors && !valid ? "Fix the highlighted fields to continue." : "You can change modules and branding any time."}</p>
            <div className="flex gap-3">
              <button className={ghostBtn} onClick={onClose}>Cancel</button>
              <button className={primaryBtn} onClick={submit} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create client
              </button>
            </div>
          </div>
        )
      }
    >
      {created ? (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 dark:border-zinc-800">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-500" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{created.business_name} is ready</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                Workspace #{created.tenant_id} was created with the <b>{presets.find((p) => p.key === created.preset)?.label || created.preset}</b> setup
                {created.settings?.default_currency ? <> and {created.settings.default_currency} as its currency</> : null}. Its data is completely separate from every other client.
              </p>
            </div>
          </div>
          <CredentialsCard title="Admin login" email={created.admin_email} password={created.password} loginUrl={typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"} />
          <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-zinc-800 dark:text-zinc-400">
            <p className="font-semibold text-slate-900 dark:text-white">What happens next</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>The admin signs in and sees a setup checklist (logo, contacts, mailbox, team).</li>
              <li>Open <b>Configure</b> to switch modules on or off, set branding and upload a logo.</li>
              <li>Use <b>Create demo workspace</b> there to give them a safe place to try things.</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="space-y-7">
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">1. The company</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Company name</label>
                <input className={`${inputCls} ${bad("business_name")}`} placeholder="Acme Logistics" value={form.business_name}
                  onChange={(e) => set({ business_name: e.target.value, ...(accountTouched ? {} : { name: slug(e.target.value) }) })} />
                {field("business_name")}
              </div>
              <div>
                <label className={labelCls}>Account name</label>
                <input className={`${inputCls} ${bad("name")}`} placeholder="acme-logistics" value={form.name}
                  onChange={(e) => { setAccountTouched(true); set({ name: e.target.value }); }} />
                {showErrors && problems.name ? field("name") : <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">A short unique id; filled in for you.</p>}
              </div>
              <div>
                <label className={labelCls}>Business type</label>
                <select className={inputCls} value={form.industry} onChange={(e) => {
                  const industry = e.target.value;
                  const rec = regions.industries.find((i) => i.key === industry)?.preset;
                  set({ industry });
                  if (rec && !presetTouched) setPreset(rec);
                }}>
                  <option value="">Not sure / other</option>
                  {regions.industries.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Country</label>
                <select className={inputCls} value={form.country} onChange={(e) => set({ country: e.target.value })}>
                  <option value="">Select a country</option>
                  {regions.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">Sets currency, time zone, phone code and language.</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">2. The admin&apos;s login</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Admin name</label>
                <input className={`${inputCls} ${bad("admin_name")}`} placeholder="Jane Doe" value={form.admin_name} onChange={(e) => set({ admin_name: e.target.value })} />
                {field("admin_name")}
              </div>
              <div>
                <label className={labelCls}>Admin email</label>
                <input type="email" className={`${inputCls} ${bad("admin_email")}`} placeholder="jane@acme.com" value={form.admin_email} onChange={(e) => set({ admin_email: e.target.value })} />
                {field("admin_email")}
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Password</label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input className={`${inputCls} pl-10 ${bad("admin_password")}`} placeholder="Leave blank to generate a strong one" value={form.admin_password} onChange={(e) => set({ admin_password: e.target.value })} />
                </div>
                {field("admin_password")}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">3. The setup</h3>
              {suggested && <span className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-300"><Sparkles className="h-3.5 w-3.5" /> Suggested for this business type</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {sortedPresets.map((p) => {
                const active = preset === p.key;
                return (
                  <button key={p.key} type="button" onClick={() => { setPreset(p.key); setPresetTouched(true); }} aria-pressed={active}
                    className={`rounded-2xl border p-4 text-left transition ${active ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/30 dark:bg-indigo-950/30" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-900"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">{p.label}</span>
                      <div className="flex gap-1.5">
                        {suggested === p.key && <Badge tone="indigo">Suggested</Badge>}
                        <Badge tone="slate">{p.features.length} modules</Badge>
                      </div>
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">{p.description}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">4. The plan</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {[{ trial: false, title: "Paid", text: "No trial limits." }, { trial: true, title: "Trial", text: "Limited clients, AI emails, searches and projects. Convert later in one click." }].map((o) => (
                <button key={o.title} type="button" onClick={() => set({ is_trial: o.trial })} aria-pressed={form.is_trial === o.trial}
                  className={`rounded-2xl border p-4 text-left transition ${form.is_trial === o.trial ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/30 dark:bg-indigo-950/30" : "border-slate-200 hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-900"}`}>
                  <span className="font-semibold text-slate-900 dark:text-white">{o.title}</span>
                  <p className="mt-1 text-xs text-slate-600 dark:text-zinc-400">{o.text}</p>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </Drawer>
  );
}
