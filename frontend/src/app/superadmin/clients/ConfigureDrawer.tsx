"use client";
import { useLanguage } from "@/context/LanguageContext";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Crown, DollarSign, ExternalLink, GraduationCap, Image as ImageIcon, Layers, Loader2, MonitorPlay, Palette, Plus, Puzzle, RotateCcw, Save, Search, Sparkles, Target, Upload } from "lucide-react";
import Drawer from "@/components/Drawer";
import { dashboardParent } from "@/lib/dashboardEntitlements";
import SalesAccessSettings from "@/components/SalesAccessSettings";
import CompanyDomainSettings from "@/components/CompanyDomainSettings";
import TenantApiUsageTab from "./TenantApiUsageTab";
import {
  Badge, CatalogFeature, ClientAvatar, CredentialsCard, PRESET_ORDER, Preset, RegionOptions, TenantOverview, call, displayName,
  countModules, ghostBtn, inputCls, labelCls, primaryBtn,
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

type Tab = "modules" | "branding" | "plan" | "api_usage";

const TEXT_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "brand_name", label: "Brand name", placeholder: "Shown in the menu, top bar and on documents" },
  { key: "brand_tagline", label: "Tagline", placeholder: "e.g. Freight forwarding since 2004" },
  { key: "website_url", label: "Website", placeholder: "https://" },
  { key: "support_email", label: "Support email", placeholder: "support@company.com" },
  { key: "support_portal_url", label: "Support portal URL", placeholder: "https://projecthub.serphawk.in/client/login" },
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
  const { t } = useLanguage();
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
  const [autofillUrl, setAutofillUrl] = useState("");
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
  const on = countModules(catalog, draftFeatures);
  const total = countModules(catalog);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Record<string, CatalogFeature[]> = {};
    for (const f of catalog) {
      if (q && !`${t(f.label)} ${f.description} ${f.group}`.toLowerCase().includes(q)) continue;
      (out[f.group] ||= []).push(f);
    }
    return out;
  }, [catalog, query, t]);

  const sortedPresets = useMemo(
    () =>
      [...presets]
        .filter((p) => PRESET_ORDER.includes(p.key))
        .sort((a, b) => PRESET_ORDER.indexOf(a.key) - PRESET_ORDER.indexOf(b.key)),
    [presets],
  );

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
    success("Modules saved", `${name} now has ${countModules(catalog, c.features)} of ${total} modules. Users see the change on their next page load.`);
    onChanged();
  });

  const applyPresetDirect = (presetKey: string) => run("preset", async () => {
    if (!presetKey) return;
    const label = presets.find((p) => p.key === presetKey)?.label || presetKey;
    const c: Config = await call(`/superadmin/tenants/${id}/features`, { method: "PUT", body: JSON.stringify({ preset: presetKey }) });
    setCfg(c); setDraftFeatures(c.features); setPresetChoice("");
    success(`${label} applied`, `The workspace setup for ${name} now follows ${label}.`);
    onChanged();
  });

  const applyPreset = () => applyPresetDirect(presetChoice);

  const saveSettings = () => run("settings", async () => {
    const settings = Object.fromEntries(Object.entries(draftSettings).map(([k, v]) => [k, (v || "").trim() || null]));
    const c: Config = await call(`/superadmin/tenants/${id}/settings`, { method: "PUT", body: JSON.stringify({ settings }) });
    setCfg(c);
    success("Branding saved", `${name}'s documents, emails and menu use the new details.`);
    onChanged();
  });

  const setCurrencyInstant = (cur: "INR" | "USD") => run("currency", async () => {
    const c: Config = await call(`/superadmin/tenants/${id}/settings`, {
      method: "PUT",
      body: JSON.stringify({ settings: { default_currency: cur } }),
    });
    setCfg(c);
    setDraftSettings((s) => ({ ...s, default_currency: cur }));
    success("Workspace currency updated", `${name} now uses ${cur === "INR" ? "Rupees (₹ / INR)" : "Dollar ($ / USD)"} across its workspace.`);
    onChanged();
  });

  const setLanguageInstant = (lang: "en" | "es") => run("language", async () => {
    const c: Config = await call(`/superadmin/tenants/${id}/settings`, {
      method: "PUT",
      body: JSON.stringify({ settings: { locale: lang } }),
    });
    setCfg(c);
    setDraftSettings((s) => ({ ...s, locale: lang }));
    success("Workspace default language updated", `${name} now defaults to ${lang === "es" ? "Spanish (Español - es)" : "English (en)"}.`);
    onChanged();
  });

  const autofillWebsite = (urlToScrape?: string) => run("autofill", async () => {
    const target = urlToScrape || autofillUrl || draftSettings.website_url;
    if (!target) {
      error("Website required", "Please enter a website URL to extract from.");
      return;
    }
    const res = await call(`/superadmin/tenants/${id}/autofill-from-website`, {
      method: "POST",
      body: JSON.stringify({ website_url: target, save: true }),
    });
    const ext = res.extracted || {};
    setDraftSettings((s) => ({
      ...s,
      ...Object.fromEntries(Object.entries(ext).map(([k, v]) => [k, String(v ?? "")])),
    }));
    if (res.logo_saved) {
      onLogoChanged(id!);
    }
    await load(id!);
    success("Autofill complete", `Extracted brand details${res.logo_saved ? " and logo" : ""} from ${target}.`);
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
      {([["modules", "Modules", Puzzle], ["branding", "Branding & defaults", Palette], ["plan", "Plan & demo", Crown], ["api_usage", "API Costs & Calls", DollarSign]] as const).map(([key, label, Icon]) => (
        <button key={key} onClick={() => setTab(key)}
          className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${tab === key ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"}`}>
          <Icon className="w-4 h-4" /> {label}
          {key === "modules" && featuresDirty && <span className="h-2 w-2 rounded-full bg-amber-500" title={t("Unsaved changes")} />}
          {key === "branding" && settingsDirty && <span className="h-2 w-2 rounded-full bg-amber-500" title={t("Unsaved changes")} />}
        </button>
      ))}
    </div>
  );

  const footer =
    tab === "modules" ? (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-zinc-400"><b className="text-slate-900 dark:text-white">{on}</b> {t("of")}{" "}{total} {t("modules on")}{featuresDirty && <span className="ml-2 font-medium text-amber-600">{t("Unsaved changes")}</span>}</p>
        <div className="flex gap-2">
          {featuresDirty && <button className={ghostBtn} onClick={() => cfg && setDraftFeatures(cfg.features)}><RotateCcw className="w-4 h-4" /> {t("Discard")}</button>}
          <button className={primaryBtn} onClick={saveModules} disabled={!featuresDirty || busy === "modules"}>
            {busy === "modules" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {t("Save modules")}{" "}</button>
        </div>
      </div>
    ) : tab === "branding" ? (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-zinc-400">{settingsDirty ? <span className="font-medium text-amber-600">{t("Unsaved changes")}</span> : "The client's own admin can also edit most of this."}</p>
        <div className="flex gap-2">
          {settingsDirty && cfg && <button className={ghostBtn} onClick={() => setDraftSettings(Object.fromEntries(Object.keys(draftSettings).map((k) => [k, cfg.settings[k] ?? ""])))}><RotateCcw className="w-4 h-4" /> {t("Discard")}</button>}
          <button className={primaryBtn} onClick={saveSettings} disabled={!settingsDirty || busy === "settings"}>
            {busy === "settings" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {t("Save branding")}{" "}</button>
        </div>
      </div>
    ) : (
      <div className="flex justify-end"><button className={ghostBtn} onClick={onClose}>{t("Close")}</button></div>
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
          {tenant.demo_of_tenant_id && <Badge tone="violet">{t("Demo workspace")}</Badge>}
          {cfg?.preset && (
            <Badge tone="indigo">
              {presets.find((p) => p.key === cfg.preset)?.label ||
                ({
                  agency: "Digital agency CRM",
                  "agency-voice": "Digital agency CRM + AI voice caller",
                  institute: "Training institute",
                  "design-agency": "Design / marketing agency (Spanish-first)",
                }[cfg.preset] || cfg.preset)}
            </Badge>
          )}
          {draftFeatures.institute ? (
            <Badge tone="violet">🎓 Administrator Instance</Badge>
          ) : (
            <Badge tone="slate">💼 Sales Instance</Badge>
          )}
          {tenant.country && <Badge tone="slate">{tenant.country}{tenant.currency ? ` · ${tenant.currency}` : ""}</Badge>}
          <span className="text-xs">{tenant.admin_email}</span>
        </span>
      )}
      tabs={tabs}
      footer={cfg ? footer : undefined}
    >
      {loading || !cfg ? (
        <div className="flex items-center justify-center gap-2 py-24 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> {t("Loading...")}</div>
      ) : tab === "modules" ? (
        <div className="space-y-5">
          {/* Workspace Instance: Administrator Instance Configuration */}
          <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/50 p-5 dark:border-indigo-900/60 dark:from-indigo-950/30 dark:via-zinc-900 dark:to-blue-950/20 shadow-sm space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Administrator Instance (Admissions Department)</h3>
                  {draftFeatures.institute ? (
                    <Badge tone="green">ACTIVE</Badge>
                  ) : (
                    <Badge tone="slate">DISABLED</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-zinc-300 max-w-xl leading-relaxed">
                  Enable the Administrator Instance for admissions and student fee management. When enabled, sales converts leads into students with an advance payment, and the Admissions Administrator follows up on remaining fees with Admission (<code className="font-mono text-[11px] bg-slate-100 dark:bg-zinc-800 px-1 rounded">ADM-</code>) and Advance (<code className="font-mono text-[11px] bg-slate-100 dark:bg-zinc-800 px-1 rounded">ADV-</code>) slips.
                </p>
              </div>

              {/* Toggle Switch */}
              <div className="flex items-center gap-3 self-center sm:self-auto bg-white dark:bg-zinc-800 px-3.5 py-2.5 rounded-xl border border-indigo-100 dark:border-zinc-700 shadow-2xs">
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                  {draftFeatures.institute ? "Include Administrator Instance: YES" : "Include Administrator Instance: NO"}
                </span>
                <Switch
                  label="Administrator Instance (Admissions Department)"
                  checked={!!draftFeatures.institute}
                  disabled={busy === "modules" || busy === "preset"}
                  onChange={(enabled) => {
                    setDraftFeatures((prev) => ({
                      ...prev,
                      institute: enabled,
                      dashboard_b2c: enabled,
                      ...(enabled ? { reports: true } : {})
                    }));
                  }}
                />
              </div>
            </div>

            {/* Quick Presets for Instance Selection */}
            <div className="pt-3 border-t border-indigo-100/80 dark:border-zinc-800/80">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2">
                Quick Instance Setup
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (presets.some(p => p.key === "sales_instance")) {
                      applyPresetDirect("sales_instance");
                    } else {
                      setDraftFeatures(prev => ({
                        ...prev,
                        institute: false,
                        dashboard_b2c: false,
                        leads: true,
                        contacts: true,
                        followups: true,
                        meetings: true,
                        calls: true,
                        lead_sources: true,
                        invoices: true,
                        proposals: true
                      }));
                    }
                  }}
                  className={`p-3 rounded-xl border text-left transition ${
                    !draftFeatures.institute && draftFeatures.leads
                      ? "border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-500/40"
                      : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-white/60 dark:bg-zinc-900/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-900 dark:text-white">
                    <Target className="w-3.5 h-3.5 text-blue-600" />
                    Sales Instance Only
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 line-clamp-2">
                    Pure sales CRM: leads, pipelines, salesperson activity, follow-ups & meetings. No admissions department.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (presets.some(p => p.key === "administrator_instance")) {
                      applyPresetDirect("administrator_instance");
                    } else {
                      setDraftFeatures(prev => ({
                        ...prev,
                        institute: true,
                        dashboard_b2c: true,
                        leads: false,
                        reports: true,
                        billing: true,
                        invoices: true
                      }));
                    }
                  }}
                  className={`p-3 rounded-xl border text-left transition ${
                    draftFeatures.institute && !draftFeatures.leads
                      ? "border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-500/40"
                      : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-white/60 dark:bg-zinc-900/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-900 dark:text-white">
                    <GraduationCap className="w-3.5 h-3.5 text-violet-600" />
                    Administrator Instance
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 line-clamp-2">
                    Admissions department: students, batches, fee collection follow-up, admission slips and payments.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (presets.some(p => p.key === "combined_instance")) {
                      applyPresetDirect("combined_instance");
                    } else {
                      setDraftFeatures(prev => ({
                        ...prev,
                        institute: true,
                        dashboard_b2c: true,
                        leads: true,
                        contacts: true,
                        clients: true,
                        followups: true,
                        meetings: true,
                        calls: true,
                        lead_sources: true,
                        reports: true,
                        billing: true,
                        invoices: true,
                        proposals: true
                      }));
                    }
                  }}
                  className={`p-3 rounded-xl border text-left transition ${
                    draftFeatures.institute && draftFeatures.leads
                      ? "border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-500/40"
                      : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-white/60 dark:bg-zinc-900/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-900 dark:text-white">
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                    Combined (Sales + Admin)
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 line-clamp-2">
                    Full lifecycle: sales rep converts lead to student with advance, and administrator follows up on remaining fees.
                  </p>
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Workspace Currency</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">Switch the entire workspace between Rupees (₹) and Dollar ($).</p>
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
              {(
                [
                  { code: "INR", label: "₹ Rupees (INR)" },
                  { code: "USD", label: "$ Dollar (USD)" },
                ] as const
              ).map((opt) => {
                const active = (cfg.settings?.default_currency || "INR").toUpperCase() === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    disabled={busy === "currency"}
                    onClick={() => setCurrencyInstant(opt.code)}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                      active
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white"
                    } disabled:opacity-50`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Workspace Default Language</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">Decide whether this client defaults to English or Spanish.</p>
              </div>
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
                {(
                  [
                    { code: "en", label: "🇺🇸 English (en)" },
                    { code: "es", label: "🇪🇸 Español (es)" },
                  ] as const
                ).map((opt) => {
                  const active = (cfg.settings?.locale || "en") === opt.code;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      disabled={busy === "language"}
                      onClick={() => setLanguageInstant(opt.code)}
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                        active
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white"
                      } disabled:opacity-50`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{t("Start from a ready-made setup")}</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">{t("Replaces the choices below with the modules of a product setup. You can still adjust them afterwards.")}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select className={inputCls} value={presetChoice} onChange={(e) => setPresetChoice(e.target.value)}>
                <option value="">{t("Choose a setup...")}</option>
                {sortedPresets.map((p) => <option key={p.key} value={p.key}>{p.label} ({p.module_count} {t("modules)")}</option>)}
              </select>
              <button className={ghostBtn} onClick={applyPreset} disabled={!presetChoice || busy === "preset"}>
                {busy === "preset" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("Apply")}{" "}</button>
            </div>
          </div>

          {id && <CompanyDomainSettings tenantId={id} />}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputCls} pl-10`} placeholder={t("Search modules...")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {Object.keys(grouped).length === 0 && <p className="py-8 text-center text-sm text-slate-500">{t("No module matches &ldquo;")}{query}{t("&rdquo;.")}</p>}
          {Object.entries(grouped).map(([group, list]) => {
            const groupOn = list.filter((f) => draftFeatures[f.key]).length;
            return (
              <section key={group}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">{t(group)}</h3>
                  <span className="text-xs text-slate-400">{groupOn}/{list.length} {t("on")}</span>
                </div>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {list.map((f) => (
                    <li key={f.key} className="flex items-center justify-between gap-4 bg-white px-4 py-3 dark:bg-zinc-900/40">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-zinc-100">
                          {f.label}
                          {f.locked && <Badge tone="slate">{t("Always on")}</Badge>}
                          {!f.gated_on_server && !f.locked && !dashboardParent(f.key) && <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500" title={t("Switching this off hides it from the menu. The API is not blocked for this module.")}>{t("menu only")}</span>}
                        </p>
                        {f.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-zinc-400">{f.description}</p>}
                      </div>
                      <Switch label={t(f.label)} checked={!!draftFeatures[f.key]} disabled={f.locked || (!!dashboardParent(f.key) && !draftFeatures[dashboardParent(f.key)!])} onChange={(v) => setDraftFeatures((d) => ({ ...d, [f.key]: v }))} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {id && (
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-zinc-800">
              <SalesAccessSettings tenantId={id} />
              {(draftFeatures.institute || cfg?.features.institute) && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
                  <div className="mb-2 flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-violet-900 dark:text-violet-200">Admissions Administrator Access</h4>
                  </div>
                  <SalesAccessSettings tenantId={id} admissions />
                </div>
              )}
            </div>
          )}
        </div>
      ) : tab === "branding" ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/60 to-blue-50/60 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <p className="font-semibold text-slate-900 dark:text-white">{t("Auto-fill from Client Website")}</p>
            </div>
            <p className="text-xs text-slate-600 dark:text-zinc-400">
              {t("Scrapes the client's website to automatically retrieve their logo, brand tagline, support email, phone numbers, and AI description.")}
            </p>
            <div className="flex gap-2">
              <input
                className={`${inputCls} flex-1`}
                placeholder="https://client-company.com"
                value={autofillUrl || draftSettings.website_url || ""}
                onChange={(e) => {
                  setAutofillUrl(e.target.value);
                  set("website_url", e.target.value);
                }}
              />
              <button
                type="button"
                className={primaryBtn}
                disabled={busy === "autofill"}
                onClick={() => autofillWebsite()}
              >
                {busy === "autofill" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {t("Pull from Website")}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 dark:border-zinc-800">
            <ClientAvatar tenantId={tenant!.id} name={name} hasLogo={!!cfg.settings.brand_logo_url || tenant!.has_logo} version={logoVersion} size={72} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 dark:text-white">{t("Logo")}</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400">{t("PNG, JPEG or WebP up to 2 MB. Used in the menu, invoices, quotes, PDFs and emails.")}</p>
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
                {f.key === "default_currency" ? (
                  <div className="flex gap-2">
                    {(
                      [
                        { code: "INR", label: "₹ Rupees (INR)" },
                        { code: "USD", label: "$ Dollar (USD)" },
                      ] as const
                    ).map((opt) => {
                      const active = (draftSettings.default_currency || "INR").toUpperCase() === opt.code;
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() => set("default_currency", opt.code)}
                          className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                            active
                              ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input className={inputCls} placeholder={f.placeholder} value={draftSettings[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                )}
              </div>
            ))}
            <div>
              <label className={labelCls}>{t("Brand colour")}</label>
              <div className="flex gap-2">
                <input type="color" aria-label={t("Brand colour")} className="h-[42px] w-14 rounded-xl border border-slate-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
                  value={/^#[0-9a-fA-F]{6}$/.test(draftSettings.primary_color) ? draftSettings.primary_color : "#4f46e5"} onChange={(e) => set("primary_color", e.target.value)} />
                <input className={inputCls} placeholder={t("#4f46e5")} value={draftSettings.primary_color ?? ""} onChange={(e) => set("primary_color", e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>{t("Default Language")}</label>
              <div className="flex gap-2">
                {[
                  { code: "en", label: "🇺🇸 English (en)" },
                  { code: "es", label: "🇪🇸 Español (es)" },
                ].map((opt) => {
                  const active = (draftSettings.locale || "en") === opt.code;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => set("locale", opt.code)}
                      className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                        active
                          ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <select className="hidden" value={draftSettings.locale ?? ""} onChange={(e) => set("locale", e.target.value)}>
                <option value="">{t("Default (English)")}</option><option value="en">{t("English")}</option><option value="es">{t("Spanish")}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("Country")}</label>
              <select className={inputCls} value={draftSettings.country ?? ""} onChange={(e) => set("country", e.target.value)}>
                <option value="">{t("Not set")}</option>
                {regions.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("Business type")}</label>
              <select className={inputCls} value={draftSettings.industry ?? ""} onChange={(e) => set("industry", e.target.value)}>
                <option value="">{t("Not set")}</option>
                {regions.industries.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
              </select>
            </div>
          </div>
          <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-zinc-400"><ImageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t("Lead statuses, invoice wording and the company mailbox are managed by the client&apos;s own admin on their Branding &amp; Settings page.")}</p>
        </div>
      ) : tab === "plan" ? (
        <div className="space-y-6">
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-5 dark:border-zinc-800">
            <div>
              <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">{t("Plan")}{" "}<Badge tone={isTrial ? "amber" : "green"}>{isTrial ? "Trial" : "Paid"}</Badge></p>
              <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">{isTrial ? "Limited clients, AI emails, searches and projects." : "No trial limits apply."}</p>
            </div>
            <button className={isTrial ? primaryBtn : ghostBtn} onClick={() => setTrial(!isTrial)} disabled={busy === "plan"}>
              {busy === "plan" && <Loader2 className="w-4 h-4 animate-spin" />}{isTrial ? "Convert to paid" : "Move back to trial"}
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 p-5 dark:border-zinc-800">
            <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><MonitorPlay className="w-4 h-4 text-indigo-500" /> {t("Demo workspace")}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
              {t("A separate workspace with the same modules and branding, filled with sample leads and clients, and its own login. Safe to show prospects or try things in: it never touches")}{" "}{name}{t("&apos;s real records.")}{" "}</p>
            <button className={`${primaryBtn} mt-4`} onClick={createDemo} disabled={busy === "demo" || !!tenant?.demo_of_tenant_id}>
              {busy === "demo" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t("Create demo workspace")}{" "}</button>
            {demoCreated && (
              <div className="mt-4">
                <CredentialsCard title={t("Demo login")} email={demoCreated.admin_email} password={demoCreated.demo_password} loginUrl={typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"} />
              </div>
            )}
            {demos.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">{t("Existing demos")}</p>
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
              <span>{tenant.open_requests} {t("open customization request")}{tenant.open_requests === 1 ? "" : "s"} {t("from this client")}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      ) : tab === "api_usage" && id ? (
        <TenantApiUsageTab tenantId={id} />
      ) : null}
    </Drawer>
  );
}
