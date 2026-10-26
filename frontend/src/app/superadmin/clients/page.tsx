"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, Building2, CheckCircle2, Inbox, Layers, Mail, Plus, RefreshCw, Search, Settings2, Users, UserCircle2, UsersRound } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { ToastStack, useToasts } from "@/components/Toasts";
import BulkDrawer from "./BulkDrawer";
import ConfigureDrawer from "./ConfigureDrawer";
import NewClientDrawer from "./NewClientDrawer";
import {
  Badge, CatalogFeature, ClientAvatar, Preset, RegionOptions, TenantOverview, Totals, call, displayName, ghostBtn, inputCls, primaryBtn,
} from "./shared";

type Filter = "all" | "paid" | "trial" | "demo";
type Sort = "newest" | "name" | "users";

function StatCard({ label, value, hint, icon: Icon, tone, href }: { label: string; value: number | string; hint?: string; icon: React.ElementType; tone: string; href?: string }) {
  const body = (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${tone}`}><Icon className="h-6 w-6" /></div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none text-slate-900 dark:text-white">{value}</p>
        <p className="mt-1.5 text-sm font-medium text-slate-600 dark:text-zinc-300">{label}</p>
        {hint && <p className="text-xs text-slate-400 dark:text-zinc-500">{hint}</p>}
      </div>
    </div>
  );
  return href ? <a href={href} className="block">{body}</a> : body;
}

function Skeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-60 animate-pulse rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex gap-3"><div className="h-11 w-11 rounded-xl bg-slate-200 dark:bg-zinc-800" /><div className="flex-1 space-y-2"><div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-zinc-800" /><div className="h-3 w-1/3 rounded bg-slate-100 dark:bg-zinc-800" /></div></div>
          <div className="mt-6 grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((j) => <div key={j} className="h-12 rounded-lg bg-slate-100 dark:bg-zinc-800" />)}</div>
        </div>
      ))}
    </div>
  );
}

export default function ClientManagementPage() {
  const { user } = useRole();
  const allowed = !user || user.role === "SuperAdmin" || user.email === "admin@serphawk.com";
  const { toasts, dismiss, success, error } = useToasts();

  const [tenants, setTenants] = useState<TenantOverview[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [totalModules, setTotalModules] = useState(0);
  const [features, setFeatures] = useState<CatalogFeature[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [regions, setRegions] = useState<RegionOptions>({ industries: [], countries: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [configuring, setConfiguring] = useState<number | null>(null);
  const [logoBump, setLogoBump] = useState<Record<number, number>>({});

  const loadOverview = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    try {
      const o = await call("/superadmin/tenants/overview");
      setTenants(o.tenants);
      setTotals(o.totals);
      setTotalModules(o.total_modules);
      setLoadError("");
    } catch (e: any) {
      setLoadError(e.message);
      if (quiet) error("Could not refresh the list", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [error]);

  useEffect(() => {
    if (!allowed) return;
    loadOverview();
    call("/superadmin/features/catalog").then((c) => { setFeatures(c.features); setPresets(c.presets); }).catch((e) => error("Could not load the module list", e.message));
    call("/register/options").then(setRegions).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const byId = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t])), [tenants]);
  const counts = useMemo(() => ({
    all: tenants.filter((t) => !t.demo_of_tenant_id).length,
    paid: tenants.filter((t) => !t.demo_of_tenant_id && !t.is_trial).length,
    trial: tenants.filter((t) => !t.demo_of_tenant_id && t.is_trial).length,
    demo: tenants.filter((t) => t.demo_of_tenant_id).length,
  }), [tenants]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tenants.filter((t) => {
      if (filter === "demo" ? !t.demo_of_tenant_id : t.demo_of_tenant_id) return false;
      if (filter === "paid" && t.is_trial) return false;
      if (filter === "trial" && !t.is_trial) return false;
      return !q || `${t.name} ${t.business_name || ""} ${t.brand_name || ""} ${t.admin_email || ""}`.toLowerCase().includes(q);
    });
    return [...list].sort((a, b) => (sort === "name" ? displayName(a).localeCompare(displayName(b)) : sort === "users" ? b.users - a.users : b.id - a.id));
  }, [tenants, filter, query, sort]);

  const presetLabel = (key?: string | null) => (key ? presets.find((p) => p.key === key)?.label || key : "No setup");
  const selected = configuring ? byId[configuring] || null : null;

  if (!allowed) {
    return <div className="mx-auto max-w-xl p-10"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Client management is for the platform operator.</div></div>;
  }

  const FILTERS: { key: Filter; label: string }[] = [{ key: "all", label: "All clients" }, { key: "paid", label: "Paid" }, { key: "trial", label: "Trial" }, { key: "demo", label: "Demo workspaces" }];

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 font-sans lg:p-10">
      <ToastStack toasts={toasts} dismiss={dismiss} />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-blue-600 to-violet-600 p-8 text-white shadow-xl shadow-indigo-600/20">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur"><Building2 className="h-3.5 w-3.5" /> Platform operator</p>
            <h1 className="text-3xl font-bold tracking-tight">Client management</h1>
            <p className="mt-2 text-sm leading-relaxed text-indigo-100">
              Every client is a separate workspace on one product: its own admin, its own data, its own branding and only the modules you switch on. Create one in a minute, no code and no new deployment.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-indigo-700 shadow-lg transition hover:bg-indigo-50 active:scale-[0.98]">
              <Plus className="h-4 w-4" /> New client
            </button>
            <button onClick={() => setShowBulk(true)} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25 active:scale-[0.98]">
              <UsersRound className="h-4 w-4" /> Add many
            </button>
          </div>
        </div>
      </motion.div>

      {/* Numbers */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Clients" value={totals?.clients ?? "–"} hint={totals ? `${totals.paid} paid, ${totals.trial} on trial` : undefined} icon={Building2} tone="bg-gradient-to-br from-indigo-500 to-blue-600" />
        <StatCard label="Users" value={totals?.users ?? "–"} hint="Across all clients" icon={Users} tone="bg-gradient-to-br from-emerald-500 to-teal-600" />
        <StatCard label="Demo workspaces" value={totals?.demo ?? "–"} hint="Safe places to try things" icon={Layers} tone="bg-gradient-to-br from-violet-500 to-fuchsia-600" />
        <StatCard label="Open requests" value={totals?.open_requests ?? "–"} hint={totals?.open_requests ? "Waiting for your reply" : "Nothing waiting"} icon={Inbox} tone="bg-gradient-to-br from-amber-500 to-orange-600" href="/superadmin/requests" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter clients">
          {FILTERS.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filter === f.key ? "bg-slate-900 text-white shadow dark:bg-white dark:text-slate-900" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:bg-zinc-800"}`}>
              {f.label} <span className="ml-1 opacity-60">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputCls} pl-10`} placeholder="Search by name or admin email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search clients" />
          </div>
          <select className={`${inputCls} sm:w-44`} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort clients">
            <option value="newest">Newest first</option><option value="name">Name A to Z</option><option value="users">Most users</option>
          </select>
          <button className={ghostBtn} onClick={() => loadOverview(true)} aria-label="Refresh the list" disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Clients */}
      {loading ? (
        <Skeleton />
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-10 text-center dark:border-red-900/60 dark:bg-red-950/20">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="font-semibold text-red-800 dark:text-red-300">The client list could not be loaded</p>
          <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
          <button className={primaryBtn} onClick={() => { setLoading(true); loadOverview(); }}>Try again</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <Building2 className="h-10 w-10 text-slate-300 dark:text-zinc-600" />
          <p className="font-semibold text-slate-900 dark:text-white">{tenants.length === 0 ? "No clients yet" : "No client matches"}</p>
          <p className="max-w-sm text-sm text-slate-500 dark:text-zinc-400">
            {tenants.length === 0 ? "Create the first client. It gets its own admin login and starts from a ready-made setup." : "Try another search or filter."}
          </p>
          {tenants.length === 0 && <button className={primaryBtn} onClick={() => setShowNew(true)}><Plus className="h-4 w-4" /> New client</button>}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t, i) => {
            const name = displayName(t);
            const parent = t.demo_of_tenant_id ? byId[t.demo_of_tenant_id] : null;
            return (
              <motion.article key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-500/5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-start gap-3">
                  <ClientAvatar tenantId={t.id} name={name} hasLogo={t.has_logo} version={logoBump[t.id]} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-slate-900 dark:text-white">{name}</h3>
                    <p className="truncate text-xs text-slate-500 dark:text-zinc-500">{t.name}</p>
                  </div>
                  {t.demo_of_tenant_id ? <Badge tone="violet">Demo</Badge> : <Badge tone={t.is_trial ? "amber" : "green"}>{t.is_trial ? "Trial" : "Paid"}</Badge>}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge tone="indigo">{presetLabel(t.preset)}</Badge>
                  {t.country && <Badge tone="slate">{t.country}{t.currency ? ` · ${t.currency}` : ""}</Badge>}
                  {parent && <Badge tone="violet">of {displayName(parent)}</Badge>}
                </div>

                <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[["Users", t.users], ["Leads", t.leads], ["Clients", t.clients], ["Modules", `${t.modules_on}/${totalModules || features.length || "–"}`]].map(([label, value]) => (
                    <div key={label as string} className="rounded-xl bg-slate-50 px-1 py-2.5 dark:bg-zinc-800/60">
                      <dd className="text-base font-bold text-slate-900 dark:text-white">{value}</dd>
                      <dt className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">{label}</dt>
                    </div>
                  ))}
                </dl>

                <p className="mt-4 flex items-center gap-2 truncate text-xs text-slate-500 dark:text-zinc-400">
                  {t.admin_email ? <><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{t.admin_email}</span></> : <><UserCircle2 className="h-3.5 w-3.5" /> No admin login</>}
                </p>

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-zinc-800">
                  {t.open_requests > 0 ? (
                    <a href="/superadmin/requests" className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300">
                      <Inbox className="h-3.5 w-3.5" /> {t.open_requests} open request{t.open_requests === 1 ? "" : "s"}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-zinc-500"><CheckCircle2 className="h-3.5 w-3.5" /> No open requests</span>
                  )}
                  <button onClick={() => setConfiguring(t.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-950">
                    <Settings2 className="h-4 w-4" /> Configure <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                  </button>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      <NewClientDrawer
        open={showNew}
        onClose={() => setShowNew(false)}
        presets={presets}
        regions={regions}
        onError={error}
        onConfigure={(id) => setConfiguring(id)}
        onCreated={(r) => { success(`${r.business_name || r.tenant_name} was created`, "Its admin login is ready on the screen. Copy the password before closing it."); loadOverview(true); }}
      />
      <BulkDrawer
        open={showBulk}
        onClose={() => setShowBulk(false)}
        presets={presets}
        regions={regions}
        onError={error}
        onDone={(created, failed) => { (failed ? error : success)(`${created} client${created === 1 ? "" : "s"} created${failed ? `, ${failed} failed` : ""}`, failed ? "Check the list for the reason of each failure." : "Download the logins before closing the panel."); loadOverview(true); }}
      />
      <ConfigureDrawer
        tenant={selected}
        onClose={() => setConfiguring(null)}
        presets={presets}
        catalog={features}
        regions={regions}
        logoVersion={configuring ? logoBump[configuring] : undefined}
        onChanged={() => loadOverview(true)}
        onLogoChanged={(id) => setLogoBump((m) => ({ ...m, [id]: Date.now() }))}
        success={success}
        error={error}
      />
    </div>
  );
}
