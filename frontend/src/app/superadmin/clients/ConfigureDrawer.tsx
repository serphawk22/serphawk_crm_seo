"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Crown, ExternalLink, Image as ImageIcon, Loader2, MonitorPlay, Palette, Plus, Puzzle, RotateCcw, Save, Search, Upload } from "lucide-react";
import Drawer from "@/components/Drawer";
import {
  Badge, CatalogFeature, ClientAvatar, CredentialsCard, PRESET_ORDER, Preset, RegionOptions, TenantOverview, call, displayName,
  ghostBtn, inputCls, labelCls, primaryBtn,
} from "./shared";

interface Props {
  tenant: TenantOverview | null;
  onClose: () => void;
  presets: Preset[];
  catalog: CatalogFeature[];
  regions: RegionOptions;
  logoVersion?: number;
  onChanged: () => void;
  onLogoChanged: (tenantId: number) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
}

interface Config {
  tenant: { id: number; name: string; business_name?: string | null; is_trial?: boolean };
  preset: string | null;
  features: Record<string, boolean>;
  settings: Record<string, any>;
}

type Tab = "modules" | "branding" | "plan";

const TEXT_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "brand_name", label: "Brand name", placeholder: "Shown in the menu, top bar and on documents" },
  { key: "brand_tagline", label: "Tagline", placeholder: "e.g. Freight forwarding since 2004" },
  { key: "website_url", label: "Website", placeholder: "https://" },
  { key: "support_email", label: "Support email", placeholder: "support@company.com" },
  { key: "default_currency", label: "Currency", placeholder: "USD, INR, MXN" },
  { key: "timezone", label: "Time zone", placeholder: "Asia/Kolkata" },
  { key: "default_dial_code", label: "Default phone code", placeholder: "+91" },
];
const SELECT_KEYS = ["locale", "country", "industry"];

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-indigo-600" : "bg-slate-300 dark:bg-zinc-700"} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export default function ConfigureDrawer({ tenant, onClose, presets, catalog, regions, logoVersion, onChanged, onLogoChanged, success, error }: Props) {
  const [tab, setTab] = useState<Tab>("modules");
  const [cfg, setCfg] = useState<Config | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [draftFeatures, setDraftFeatures] = useState<Record<string, boolean>>({});
  const [draftSettings, setDraftSettings] = useState<Record<string, string>>({});
  const [presetChoice, setPresetChoice] = useState("");
  const [query, setQuery] = useState("");
  const [demos, setDemos] = useState<any[]>([]);
  const [demoCreated, setDemoCreated] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const id = tenant?.id ?? null;
  const name = tenant ? displayName(tenant) : "";

  const load = useCallback(async (tenantId: number) => {
    setLoading(true);
    try {
      const c: Config = await call(`/superadmin/tenants/${tenantId}/config`);
      setCfg(c);
      setDraftFeatures(c.features);
      setDraftSettings(Object.fromEntries([...TEXT_FIELDS.map((f) => f.key), ...SELECT_KEYS, "primary_color"].map((k) => [k, c.settings[k] ?? ""])));
      call(`/superadmin/tenants/${tenantId}/demos`).then((d) => setDemos(d.demos || [])).catch(() => setDemos([]));
    } catch (e: any) {
      error("Could not load this client", e.message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    if (id) {
      setTab("modules");
      setCfg(null);
      setDemoCreated(null);
      setPresetChoice("");
      setQuery("");
      load(id);
    }
  }, [id, load]);

  const featuresDirty = !!cfg && JSON.stringify(draftFeatures) !== JSON.stringify(cfg.features);
  const settingsDirty = !!cfg && Object.entries(draftSettings).some(([k, v]) => (v || "") !== (cfg.settings[k] ?? ""));
  const on = Object.values(draftFeatures).filter(Boolean).length;
  const total = catalog.length;

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Record<string, CatalogFeature[]> = {};
    for (const f of catalog) {
      if (q && !`${f.label} ${f.description} ${f.group}`.toLowerCase().includes(q)) continue;
      (out[f.group] ||= []).push(f);
    }
    return out;
  }, [catalog, query]);

  const sortedPresets = useMemo(() => [...presets].sort((a, b) => PRESET_ORDER.indexOf(a.key) - PRESET_ORDER.indexOf(b.key)), [presets]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      error("That did not work", e.message);
    } finally {
      setBusy(null);
    }
  };

  const saveModules = () => run("modules", async () => {
    const c: Config = await call(`/superadmin/tenants/${id}/features`, { method: "PUT", body: JSON.stringify({ features: draftFeatures }) });
    setCfg(c); setDraftFeatures(c.features);
    success("Modules saved", `${name} now has ${Object.values(c.features).filter(Boolean).length} of ${total} modules. Users see the change on their next page load.`);
    onChanged();
  });

  const applyPreset = () => run("preset", async () => {
    if (!presetChoice) return;
    const label = presets.find((p) => p.key === presetChoice)?.label || presetChoice;
    const c: Config = await call(`/superadmin/tenants/${id}/features`, { method: "PUT", body: JSON.stringify({ preset: presetChoice }) });
    setCfg(c); setDraftFeatures(c.features); setPresetChoice("");
    success(`${label} applied`, `The module choices for ${name} now follow that setup.`);
    onChanged();
  });

  const saveSettings = () => run("settings", async () => {
    const settings = Object.fromEntries(Object.entries(draftSettings).map(([k, v]) => [k, (v || "").trim() || null]));
    const c: Config = await call(`/superadmin/tenants/${id}/settings`, { method: "PUT", body: JSON.stringify({ settings }) });
    setCfg(c);
    success("Branding saved", `${name}'s documents, emails and menu use the new details.`);
    onChanged();
  });

  const uploadLogo = (file: File) => run("logo", async () => {
    const form = new FormData();
    form.append("file", file);
    await call(`/superadmin/tenants/${id}/logo`, { method: "PUT", body: form });
    onLogoChanged(id!);
    success("Logo updated", `It now appears in ${name}'s menu, invoices and emails.`);
    onChanged();
  }).finally(() => { if (fileRef.current) fileRef.current.value = ""; });

  const setTrial = (trial: boolean) => run("plan", async () => {
    await call(`/superadmin/tenants/${id}/limits`, { method: "PATCH", body: JSON.stringify({ is_trial: trial }) });
    setCfg((c) => (c ? { ...c, tenant: { ...c.tenant, is_trial: trial } } : c));
    success(trial ? "Moved back to the trial plan" : "Converted to a paid account", trial ? "Trial limits apply again." : "Trial limits no longer apply to this client.");
    onChanged();
  });

  const createDemo = () => run("demo", async () => {
    const out = await call(`/superadmin/tenants/${id}/demo`, { method: "POST", body: JSON.stringify({}) });
    setDemoCreated(out);
    const d = await call(`/superadmin/tenants/${id}/demos`);
    setDemos(d.demos || []);
    success("Demo workspace created", "It has sample data and its own login. Copy the password now; it is shown once.");
    onChanged();
  });

  const isTrial = cfg?.tenant.is_trial ?? tenant?.is_trial ?? false;
  const set = (k: string, v: string) => setDraftSettings((s) => ({ ...s, [k]: v }));

  const tabs = (
    <div className="-mb-px flex gap-1">
      {([["modules", "Modules", Puzzle], ["branding", "Branding & defaults", Palette], ["plan", "Plan & demo", Crown]] as const).map(([key, label, Icon]) => (
        <button key={key} onClick={() => setTab(key)}
          className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${tab === key ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"}`}>
          <Icon className="w-4 h-4" /> {label}
          {key === "modules" && featuresDirty && <span className="h-2 w-2 rounded-full bg-amber-500" title="Unsaved changes" />}
          {key === "branding" && settingsDirty && <span className="h-2 w-2 rounded-full bg-amber-500" title="Unsaved changes" />}
        </button>
      ))}
    </div>
  );

  const footer =
    tab === "modules" ? (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-zinc-400"><b className="text-slate-900 dark:text-white">{on}</b> of {total} modules on{featuresDirty && <span className="ml-2 font-medium text-amber-600">Unsaved changes</span>}</p>
        <div className="flex gap-2">
          {featuresDirty && <button className={ghostBtn} onClick={() => cfg && setDraftFeatures(cfg.features)}><RotateCcw className="w-4 h-4" /> Discard</button>}
          <button className={primaryBtn} onClick={saveModules} disabled={!featuresDirty || busy === "modules"}>
            {busy === "modules" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save modules
          </button>
        </div>
      </div>
    ) : tab === "branding" ? (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-zinc-400">{settingsDirty ? <span className="font-medium text-amber-600">Unsaved changes</span> : "The client's own admin can also edit most of this."}</p>
        <div className="flex gap-2">
          {settingsDirty && cfg && <button className={ghostBtn} onClick={() => setDraftSettings(Object.fromEntries(Object.keys(draftSettings).map((k) => [k, cfg.settings[k] ?? ""])))}><RotateCcw className="w-4 h-4" /> Discard</button>}
          <button className={primaryBtn} onClick={saveSettings} disabled={!settingsDirty || busy === "settings"}>
            {busy === "settings" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save branding
          </button>
        </div>
      </div>
    ) : (
      <div className="flex justify-end"><button className={ghostBtn} onClick={onClose}>Close</button></div>
    );

  return (
    <Drawer
      open={!!tenant}
      onClose={onClose}
      width="max-w-3xl"
      title={name || "Client"}
      leading={tenant && <ClientAvatar tenantId={tenant.id} name={name} hasLogo={tenant.has_logo} version={logoVersion} size={48} />}
      subtitle={tenant && (
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={isTrial ? "amber" : "green"}>{isTrial ? "Trial" : "Paid"}</Badge>
          {tenant.demo_of_tenant_id && <Badge tone="violet">Demo workspace</Badge>}
          {cfg?.preset && <Badge tone="indigo">{presets.find((p) => p.key === cfg.preset)?.label || cfg.preset}</Badge>}
          {tenant.country && <Badge tone="slate">{tenant.country}{tenant.currency ? ` · ${tenant.currency}` : ""}</Badge>}
          <span className="text-xs">{tenant.admin_email}</span>
        </span>
      )}
      tabs={tabs}
      footer={cfg ? footer : undefined}
    >
      {loading || !cfg ? (
        <div className="flex items-center justify-center gap-2 py-24 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> Loading...</div>
      ) : tab === "modules" ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Start from a ready-made setup</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">Replaces the choices below with the modules of a product setup. You can still adjust them afterwards.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select className={inputCls} value={presetChoice} onChange={(e) => setPresetChoice(e.target.value)}>
                <option value="">Choose a setup...</option>
                {sortedPresets.map((p) => <option key={p.key} value={p.key}>{p.label} ({p.features.length} modules)</option>)}
              </select>
              <button className={ghostBtn} onClick={applyPreset} disabled={!presetChoice || busy === "preset"}>
                {busy === "preset" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Apply
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputCls} pl-10`} placeholder="Search modules..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {Object.keys(grouped).length === 0 && <p className="py-8 text-center text-sm text-slate-500">No module matches &ldquo;{query}&rdquo;.</p>}
          {Object.entries(grouped).map(([group, list]) => {
            const groupOn = list.filter((f) => draftFeatures[f.key]).length;
            return (
              <section key={group}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">{group}</h3>
                  <span className="text-xs text-slate-400">{groupOn}/{list.length} on</span>
                </div>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {list.map((f) => (
                    <li key={f.key} className="flex items-center justify-between gap-4 bg-white px-4 py-3 dark:bg-zinc-900/40">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-zinc-100">
                          {f.label}
                          {f.locked && <Badge tone="slate">Always on</Badge>}
                          {!f.gated_on_server && !f.locked && <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500" title="Switching this off hides it from the menu. The API is not blocked for this module.">menu only</span>}
                        </p>
                        {f.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-zinc-400">{f.description}</p>}
                      </div>
                      <Switch label={f.label} checked={!!draftFeatures[f.key]} disabled={f.locked} onChange={(v) => setDraftFeatures((d) => ({ ...d, [f.key]: v }))} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : tab === "branding" ? (
        <div className="space-y-6">
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 dark:border-zinc-800">
            <ClientAvatar tenantId={tenant!.id} name={name} hasLogo={!!cfg.settings.brand_logo_url || tenant!.has_logo} version={logoVersion} size={72} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 dark:text-white">Logo</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400">PNG, JPEG or WebP up to 2 MB. Used in the menu, invoices, quotes, PDFs and emails.</p>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            <button className={ghostBtn} onClick={() => fileRef.current?.click()} disabled={busy === "logo"}>
              {busy === "logo" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {tenant!.has_logo ? "Replace" : "Upload"}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {TEXT_FIELDS.map((f) => (
              <div key={f.key} className={f.key === "brand_name" || f.key === "brand_tagline" ? "sm:col-span-2" : ""}>
                <label className={labelCls}>{f.label}</label>
                <input className={inputCls} placeholder={f.placeholder} value={draftSettings[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
              </div>
            ))}
            <div>
              <label className={labelCls}>Brand colour</label>
              <div className="flex gap-2">
                <input type="color" aria-label="Brand colour" className="h-[42px] w-14 rounded-xl border border-slate-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
                  value={/^#[0-9a-fA-F]{6}$/.test(draftSettings.primary_color) ? draftSettings.primary_color : "#4f46e5"} onChange={(e) => set("primary_color", e.target.value)} />
                <input className={inputCls} placeholder="#4f46e5" value={draftSettings.primary_color ?? ""} onChange={(e) => set("primary_color", e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Language</label>
              <select className={inputCls} value={draftSettings.locale ?? ""} onChange={(e) => set("locale", e.target.value)}>
                <option value="">Default (English)</option><option value="en">English</option><option value="es">Spanish</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Country</label>
              <select className={inputCls} value={draftSettings.country ?? ""} onChange={(e) => set("country", e.target.value)}>
                <option value="">Not set</option>
                {regions.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Business type</label>
              <select className={inputCls} value={draftSettings.industry ?? ""} onChange={(e) => set("industry", e.target.value)}>
                <option value="">Not set</option>
                {regions.industries.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
              </select>
            </div>
          </div>
          <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-zinc-400"><ImageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Lead statuses, invoice wording and the company mailbox are managed by the client&apos;s own admin on their Branding &amp; Settings page.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-5 dark:border-zinc-800">
            <div>
              <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">Plan <Badge tone={isTrial ? "amber" : "green"}>{isTrial ? "Trial" : "Paid"}</Badge></p>
              <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">{isTrial ? "Limited clients, AI emails, searches and projects." : "No trial limits apply."}</p>
            </div>
            <button className={isTrial ? primaryBtn : ghostBtn} onClick={() => setTrial(!isTrial)} disabled={busy === "plan"}>
              {busy === "plan" && <Loader2 className="w-4 h-4 animate-spin" />}{isTrial ? "Convert to paid" : "Move back to trial"}
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 p-5 dark:border-zinc-800">
            <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><MonitorPlay className="w-4 h-4 text-indigo-500" /> Demo workspace</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
              A separate workspace with the same modules and branding, filled with sample leads and clients, and its own login. Safe to show prospects or try things in: it never touches {name}&apos;s real records.
            </p>
            <button className={`${primaryBtn} mt-4`} onClick={createDemo} disabled={busy === "demo" || !!tenant?.demo_of_tenant_id}>
              {busy === "demo" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create demo workspace
            </button>
            {demoCreated && (
              <div className="mt-4">
                <CredentialsCard title="Demo login" email={demoCreated.admin_email} password={demoCreated.demo_password} loginUrl={typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"} />
              </div>
            )}
            {demos.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Existing demos</p>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
                  {demos.map((d) => (
                    <li key={d.tenant_id} className="flex items-center justify-between px-3 py-2">
                      <span className="font-medium text-slate-800 dark:text-zinc-200">{d.name}</span>
                      <span className="font-mono text-xs text-slate-500">{d.demo_email}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {tenant && tenant.open_requests > 0 && (
            <a href="/superadmin/requests" className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <span>{tenant.open_requests} open customization request{tenant.open_requests === 1 ? "" : "s"} from this client</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      )}
    </Drawer>
  );
}
