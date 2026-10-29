"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowRight, Building2, CheckCircle2, Inbox, Layers, Plus, RefreshCw, Search, Settings2, Users, UsersRound } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { ToastStack, useToasts } from "@/components/Toasts";
import BulkDrawer from "./BulkDrawer";
import ConfigureDrawer from "./ConfigureDrawer";
import NewClientDrawer from "./NewClientDrawer";
import styles from "./ClientList.module.css";
import {
  Badge, CatalogFeature, ClientAvatar, Preset, RegionOptions, TenantOverview, Totals, call, displayName, ghostBtn, inputCls, primaryBtn,
} from "./shared";

type Filter = "all" | "paid" | "trial" | "demo";
type Sort = "newest" | "name" | "users";

function StatCard({ label, value, hint, icon: Icon, tone, href }: { label: string; value: number | string; hint?: string; icon: React.ElementType; tone: string; href?: string }) {
  const body = (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${tone}`}><Icon className="h-5 w-5" /></div>
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
    <div className={`${styles.directory} space-y-3`} role="status" aria-label="Loading clients">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} aria-hidden="true" className={`${styles.row} animate-pulse rounded-2xl border border-slate-200 bg-white motion-reduce:animate-none dark:border-zinc-800 dark:bg-zinc-900`}>
          <div className="flex gap-3"><div className="h-11 w-11 rounded-xl bg-slate-200 dark:bg-zinc-800" /><div className="flex-1 space-y-2"><div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-zinc-800" /><div className="h-3 w-1/3 rounded bg-slate-100 dark:bg-zinc-800" /></div></div>
          <div className={styles.metrics}>{[0, 1, 2, 3].map((j) => <div key={j} className="h-9 rounded-lg bg-slate-100 dark:bg-zinc-800" />)}</div>
          <div className={`${styles.actions} h-9 w-28 rounded-lg bg-slate-100 dark:bg-zinc-800`} />
        </div>
      ))}
    </div>
  );
}

export default function ClientManagementPage() {
  const { user } = useRole();
  const reducedMotion = useReducedMotion();
  const allowed = user?.role === "SuperAdmin";
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Please try again.";
      setLoadError(message);
      if (quiet) error("Could not refresh the list", message);
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
      return !q || `${t.name} ${t.business_name || ""} ${t.brand_name || ""}`.toLowerCase().includes(q);
    });
    return [...list].sort((a, b) => (sort === "name" ? displayName(a).localeCompare(displayName(b)) : sort === "users" ? b.users - a.users : b.id - a.id));
  }, [tenants, filter, query, sort]);

  const presetLabels = useMemo(() => Object.fromEntries(presets.map((p) => [p.key, p.label])), [presets]);
  const presetLabel = (key?: string | null) => (key ? presetLabels[key] || key : "No setup");
  const hasFilters = filter !== "all" || query.trim().length > 0;
  const clearFilters = () => { setQuery(""); setFilter("all"); };
  const selected = configuring ? byId[configuring] || null : null;

  if (!allowed) {
    return <div className="mx-auto max-w-xl p-10"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Client management is for the platform operator.</div></div>;
  }

  const FILTERS: { key: Filter; label: string }[] = [{ key: "all", label: "All clients" }, { key: "paid", label: "Paid" }, { key: "trial", label: "Trial" }, { key: "demo", label: "Demo workspaces" }];

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-6 font-sans">
      <ToastStack toasts={toasts} dismiss={dismiss} />

      {/* Header */}
      <motion.div initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-violet-600 p-5 text-white shadow-sm sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight">Client management</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-indigo-100">
              Manage client workspaces, enabled modules and onboarding in one place.
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clients" value={totals?.clients ?? "–"} hint={totals ? `${totals.paid} paid, ${totals.trial} on trial` : undefined} icon={Building2} tone="bg-gradient-to-br from-indigo-500 to-blue-600" />
        <StatCard label="Users" value={totals?.users ?? "–"} hint="Across all clients" icon={Users} tone="bg-gradient-to-br from-emerald-500 to-teal-600" />
        <StatCard label="Demo workspaces" value={totals?.demo ?? "–"} hint="Safe places to try things" icon={Layers} tone="bg-gradient-to-br from-violet-500 to-fuchsia-600" />
        <StatCard label="Open requests" value={totals?.open_requests ?? "–"} hint={totals?.open_requests ? "Waiting for your reply" : "Nothing waiting"} icon={Inbox} tone="bg-gradient-to-br from-amber-500 to-orange-600" href="/superadmin/requests" />
      </div>

      {/* Toolbar */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter clients">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filter === f.key ? "bg-slate-900 text-white shadow dark:bg-white dark:text-slate-900" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:bg-zinc-800"}`}>
              {f.label} <span className="ml-1 opacity-60">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 basis-full sm:flex-1 sm:basis-auto">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputCls} pl-10`} placeholder="Search by company name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search clients" />
          </div>
          <select className={`${inputCls} w-auto min-w-0 flex-1 sm:w-44 sm:flex-none`} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort clients">
            <option value="newest">Newest first</option><option value="name">Name A to Z</option><option value="users">Most users</option>
          </select>
          {hasFilters && <button type="button" className="px-2 py-2 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-300" onClick={clearFilters}>Clear filters</button>}
          <button type="button" className={ghostBtn} onClick={() => loadOverview(true)} aria-label="Refresh the list" disabled={loading || refreshing}>
            <RefreshCw className={`h-4 w-4 motion-reduce:animate-none ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Clients */}
      <section aria-label="Client directory" aria-busy={loading || refreshing} className={`${styles.directory} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">Client workspaces</h2>
        <p role="status" aria-live="polite" className="text-xs text-slate-500 dark:text-zinc-400">{loading ? "Loading clients…" : loadError ? "List unavailable" : `${visible.length} of ${counts[filter]} shown`}</p>
      </div>
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
          {tenants.length > 0 && hasFilters && <button type="button" className={ghostBtn} onClick={clearFilters}>Clear filters</button>}
        </div>
      ) : (
        <ul aria-label="Client workspaces" className="space-y-3">
          {visible.map((t, i) => {
            const name = displayName(t);
            const parent = t.demo_of_tenant_id ? byId[t.demo_of_tenant_id] : null;
            return (
              <motion.li key={t.id} aria-labelledby={`workspace-${t.id}`} initial={reducedMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2, delay: reducedMotion ? 0 : Math.min(i, 6) * 0.025 }}
                className={`${styles.row} group rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-indigo-200 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-800`}>
                <div className="flex min-w-0 items-center gap-3">
                  <ClientAvatar tenantId={t.id} name={name} hasLogo={t.has_logo} version={logoBump[t.id]} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 id={`workspace-${t.id}`} title={name} className="truncate text-sm font-semibold text-slate-900 dark:text-white">{name}</h3>
                      {t.demo_of_tenant_id ? <Badge tone="violet">Demo</Badge> : <Badge tone={t.is_trial ? "amber" : "green"}>{t.is_trial ? "Trial" : "Paid"}</Badge>}
                    </div>
                    <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-zinc-400">
                      <span>{t.name}</span><span aria-hidden="true">·</span><span>{presetLabel(t.preset)}</span>
                      {t.country && <span>{t.country}{t.currency ? ` · ${t.currency}` : ""}</span>}
                      {parent && <span className="text-violet-600 dark:text-violet-300">Demo of {displayName(parent)}</span>}
                    </p>
                  </div>
                </div>
                <dl className={styles.metrics}>
                  {[["Users", t.users], ["Leads", t.leads], ["Clients", t.clients], ["Modules", `${t.modules_on}/${totalModules || features.length || "–"}`]].map(([label, value]) => (
                    <div key={label as string} className="min-w-0">
                      <dt className="text-[10px] font-medium text-slate-500 dark:text-zinc-400">{label}</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{value}</dd>
                    </div>
                  ))}
                </dl>


                <div className={styles.actions}>
                  {t.open_requests > 0 ? (
                    <a href="/superadmin/requests" className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300">
                      <Inbox className="h-3.5 w-3.5" /> {t.open_requests} request{t.open_requests === 1 ? "" : "s"}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-400 dark:text-zinc-500"><CheckCircle2 className="h-3.5 w-3.5" /> No open requests</span>
                  )}
                  <button type="button" aria-label={`Configure ${name}`} onClick={() => setConfiguring(t.id)} className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-950">
                    <Settings2 className="h-3.5 w-3.5" /> Configure <ArrowRight className="h-3.5 w-3.5 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
      </section>

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
