"use client";
import LocalizedText from "@/components/LocalizedText";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowRight, Building2, CheckCircle2, Inbox, Layers, Plus, RefreshCw, Search, Settings2, Users, UsersRound, LayoutList, LayoutGrid, Trash2 } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { ToastStack, useToasts } from "@/components/Toasts";
import BulkDrawer from "./BulkDrawer";
import ConfigureDrawer from "./ConfigureDrawer";
import NewClientDrawer from "./NewClientDrawer";
import DeleteClientDialog from "./DeleteClientDialog";
import styles from "./ClientList.module.css";
import {
  Badge, CatalogFeature, ClientAvatar, Preset, RegionOptions, TenantOverview, Totals, call, displayName, ghostBtn, inputCls, primaryBtn,
} from "./shared";

type Filter = "all" | "paid" | "trial" | "demo";
type Sort = "newest" | "name" | "users";

function StatCard({ label, value, hint, icon: Icon, tone, href }: { label: string; value: number | string; hint?: string; icon: React.ElementType; tone: string; href?: string }) {
  const body = (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 shadow-2xs flex items-center gap-2.5 hover:border-indigo-500/50 transition-colors">
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow-2xs ${tone}`}><Icon className="h-3.5 w-3.5" /></div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 leading-none truncate">{label}</p>
        <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">{value}</p>
        {hint && <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">{hint}</p>}
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
  const [deleting, setDeleting] = useState<TenantOverview | null>(null);
  const [logoBump, setLogoBump] = useState<Record<number, number>>({});
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");

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

  const presetLabels = useMemo(() => {
    const legacy: Record<string, string> = {
      agency: "Digital agency CRM",
      "agency-voice": "Digital agency CRM + AI voice caller",
      institute: "Training institute",
      "design-agency": "Design / marketing agency (Spanish-first)",
    };
    return { ...legacy, ...Object.fromEntries(presets.map((p) => [p.key, p.label])) };
  }, [presets]);
  const presetLabel = (key?: string | null) => (key ? presetLabels[key] || key : "No setup");
  const hasFilters = filter !== "all" || query.trim().length > 0;
  const clearFilters = () => { setQuery(""); setFilter("all"); };
  const deleteButton = (tenant: TenantOverview) => <button type="button" onClick={() => setDeleting(tenant)} disabled={tenant.can_delete === false} aria-label={"Delete " + displayName(tenant)} title={tenant.can_delete === false ? "A platform SuperAdmin workspace cannot be deleted" : "Delete client workspace"} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"><Trash2 className="h-3 w-3" />Delete</button>;

  const selected = configuring ? byId[configuring] || null : null;

  if (!allowed) {
    return <div className="mx-auto max-w-xl p-10"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Client management is for the platform operator.</div></div>;
  }

  const FILTERS: { key: Filter; label: string }[] = [{ key: "all", label: "All clients" }, { key: "paid", label: "Paid" }, { key: "trial", label: "Trial" }, { key: "demo", label: "Demo workspaces" }];

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-6 font-sans">
      <ToastStack toasts={toasts} dismiss={dismiss} />

      {/* Compact Executive Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Building2 className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate"><LocalizedText text={"Client Management"} /></h1>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700">
                {tenants.length} tenants
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 leading-none mt-0.5 truncate">
              Manage client workspaces, enabled modules and onboarding in one place.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 transition">
            <Plus className="h-3.5 w-3.5" /> New client
          </button>
          <button onClick={() => setShowBulk(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition">
            <UsersRound className="h-3.5 w-3.5" /> Add many
          </button>
        </div>
      </div>

      {/* Compact 4-KPI Numbers Strip */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clients" value={totals?.clients ?? "–"} hint={totals ? `${totals.paid} paid, ${totals.trial} on trial` : undefined} icon={Building2} tone="bg-indigo-600" />
        <StatCard label="Users" value={totals?.users ?? "–"} hint="Across all clients" icon={Users} tone="bg-emerald-600" />
        <StatCard label="Demo workspaces" value={totals?.demo ?? "–"} hint="Safe places to try things" icon={Layers} tone="bg-violet-600" />
        <StatCard label="Open requests" value={totals?.open_requests ?? "–"} hint={totals?.open_requests ? "Waiting for your reply" : "Nothing waiting"} icon={Inbox} tone="bg-amber-600" href="/superadmin/requests" />
      </div>

      {/* Single-row Toolbar with View Switcher */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2 px-3 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-[200px]">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input className="w-full pl-8 pr-3 py-1 rounded-lg border border-slate-200/90 dark:border-white/10 bg-slate-50 dark:bg-zinc-800/60 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-zinc-200" placeholder="Search by company name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search clients" />
          </div>

          <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Filter clients">
            {FILTERS.map((f) => (
              <button 
                key={f.key} 
                type="button" 
                aria-pressed={filter === f.key} 
                onClick={() => setFilter(f.key)}
                className={`rounded-md px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-colors ${filter === f.key ? "bg-indigo-600 text-white shadow-2xs" : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"}`}
              >
                {f.label} <span className="ml-1 opacity-70">({counts[f.key]})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <select className="px-2 py-1 rounded-lg border border-slate-200/90 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 text-xs font-medium text-slate-700 dark:text-zinc-200 outline-none" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort clients">
            <option value="newest">Newest first</option><option value="name">Name A to Z</option><option value="users">Most users</option>
          </select>

          {hasFilters && <button type="button" className="px-2 py-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400" onClick={clearFilters}><LocalizedText text={"Clear"} /></button>}

          {/* View Switcher: List vs Cards */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-slate-200/80 dark:border-white/5">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1 rounded-md transition-colors ${viewMode === "list" ? "bg-white dark:bg-zinc-700 text-indigo-600 shadow-2xs" : "text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"}`}
              title="List view"
            >
              <LayoutList className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`p-1 rounded-md transition-colors ${viewMode === "cards" ? "bg-white dark:bg-zinc-700 text-indigo-600 shadow-2xs" : "text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"}`}
              title="Cards view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>

          <button type="button" className="p-1 rounded-lg border border-slate-200/80 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-700 transition" onClick={() => loadOverview(true)} aria-label="Refresh the list" disabled={loading || refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 motion-reduce:animate-none ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Clients Section */}
      <section aria-label="Client directory" aria-busy={loading || refreshing} className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Client workspaces</h2>
          <p role="status" aria-live="polite" className="text-[11px] text-slate-400 dark:text-zinc-500">{loading ? "Loading clients…" : loadError ? "List unavailable" : `${visible.length} of ${counts[filter]} shown`}</p>
        </div>

        {loading ? (
          <Skeleton />
        ) : loadError ? (
          <div className="flex flex-col items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900/60 dark:bg-rose-950/20">
            <AlertCircle className="h-6 w-6 text-rose-500" />
            <p className="font-semibold text-rose-800 dark:text-rose-300 text-xs">The client list could not be loaded</p>
            <p className="text-xs text-rose-700 dark:text-rose-400">{loadError}</p>
            <button className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700" onClick={() => { setLoading(true); loadOverview(); }}>Try again</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <Building2 className="h-8 w-8 text-slate-300 dark:text-zinc-600 mb-1" />
            <p className="font-semibold text-slate-900 dark:text-white text-xs">{tenants.length === 0 ? "No clients yet" : "No client matches"}</p>
            <p className="max-w-xs text-xs text-slate-400 dark:text-zinc-500">
              {tenants.length === 0 ? "Create the first client workspace." : "Try another search or filter."}
            </p>
            {tenants.length === 0 && <button className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700" onClick={() => setShowNew(true)}><Plus className="h-3.5 w-3.5 inline mr-1" /> New client</button>}
          </div>
        ) : viewMode === "list" ? (
          <div className="space-y-1.5" role="list" aria-label="Client workspaces">
            {/* Desktop Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-3 px-3 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
              <div className="col-span-5">Workspace & Details</div>
              <div className="col-span-4">Metrics (Users · Leads · Clients · Modules)</div>
              <div className="col-span-3 text-right"><LocalizedText text={"Actions"} /></div>
            </div>

            {visible.map((t, i) => {
              const name = displayName(t);
              const parent = t.demo_of_tenant_id ? byId[t.demo_of_tenant_id] : null;
              return (
                <motion.div 
                  key={t.id} 
                  role="listitem"
                  aria-labelledby={`workspace-${t.id}`}
                  initial={reducedMotion ? false : { opacity: 0, y: 4 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ duration: reducedMotion ? 0 : 0.15, delay: reducedMotion ? 0 : Math.min(i, 6) * 0.02 }}
                  className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 shadow-2xs hover:shadow-xs hover:border-indigo-500/60 dark:hover:border-indigo-500/50 transition-all group"
                >
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 items-center">
                    {/* Left: Avatar + Name + Tags */}
                    <div className="col-span-5 flex min-w-0 items-center gap-2.5">
                      <ClientAvatar tenantId={t.id} name={name} hasLogo={t.has_logo} version={logoBump[t.id]} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <h3 id={`workspace-${t.id}`} title={name} className="truncate text-xs font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{name}</h3>
                          {t.demo_of_tenant_id ? <Badge tone="violet">Demo</Badge> : <Badge tone={t.is_trial ? "amber" : "green"}>{t.is_trial ? "Trial" : "Paid"}</Badge>}
                        </div>
                        <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-[11px] text-slate-400 dark:text-zinc-500 truncate">
                          <span>{presetLabel(t.preset)}</span>
                          {t.country && <span>· {t.country}{t.currency ? ` (${t.currency})` : ""}</span>}
                          {parent && <span className="text-violet-600 dark:text-violet-400">· Demo of {displayName(parent)}</span>}
                        </p>
                      </div>
                    </div>

                    {/* Middle: Metrics */}
                    <div className="col-span-4 flex items-center gap-3">
                      {[["Users", t.users], ["Leads", t.leads], ["Clients", t.clients], ["Modules", `${t.modules_on}/${totalModules || "–"}`]].map(([label, value]) => (
                        <div key={label as string} className="min-w-0">
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase">{label}: </span>
                          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Right: Actions */}
                    <div className="col-span-3 flex flex-wrap items-center justify-end gap-2">
                      {deleteButton(t)}
                      {t.open_requests > 0 ? (
                        <a href="/superadmin/requests" className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-100">
                          <Inbox className="h-3 w-3" /> {t.open_requests} req
                        </a>
                      ) : null}
                      <button 
                        type="button" 
                        aria-label={`Configure ${name}`} 
                        onClick={() => setConfiguring(t.id)} 
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/40 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors"
                      >
                        <Settings2 className="h-3 w-3" /> Configure <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="list" aria-label="Client workspaces">
            {visible.map((t, i) => {
              const name = displayName(t);
              const parent = t.demo_of_tenant_id ? byId[t.demo_of_tenant_id] : null;
              return (
                <div 
                  key={t.id} 
                  role="listitem"
                  aria-labelledby={`workspace-${t.id}`}
                  className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-3 shadow-2xs hover:shadow-xs hover:border-indigo-500/60 dark:hover:border-indigo-500/50 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ClientAvatar tenantId={t.id} name={name} hasLogo={t.has_logo} version={logoBump[t.id]} />
                        <div className="min-w-0">
                          <h3 id={`workspace-${t.id}`} title={name} className="truncate text-xs font-semibold text-slate-900 dark:text-white">{name}</h3>
                          <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">{presetLabel(t.preset)}</p>
                        </div>
                      </div>
                      {t.demo_of_tenant_id ? <Badge tone="violet">Demo</Badge> : <Badge tone={t.is_trial ? "amber" : "green"}>{t.is_trial ? "Trial" : "Paid"}</Badge>}
                    </div>

                    <div className="grid grid-cols-4 gap-1 p-2 bg-slate-50 dark:bg-zinc-800/60 rounded-lg border border-slate-100 dark:border-zinc-800 my-2 text-center">
                      <div>
                        <div className="text-[9px] uppercase font-semibold text-slate-400"><LocalizedText text={"Users"} /></div>
                        <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mt-0.5">{t.users}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase font-semibold text-slate-400"><LocalizedText text={"Leads"} /></div>
                        <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mt-0.5">{t.leads}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase font-semibold text-slate-400"><LocalizedText text={"Clients"} /></div>
                        <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mt-0.5">{t.clients}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase font-semibold text-slate-400">Mods</div>
                        <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mt-0.5">{t.modules_on}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800 mt-1">
                    {t.open_requests > 0 ? (
                      <a href="/superadmin/requests" className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-950/40 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        <Inbox className="h-3 w-3" /> {t.open_requests} req
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-400">No requests</span>
                    )}
                    {deleteButton(t)}
                    <button 
                      type="button" 
                      onClick={() => setConfiguring(t.id)} 
                      aria-label={`Configure ${name}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/40 px-2 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100"
                    >
                      <Settings2 className="h-3 w-3" /> Configure
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
      {deleting && <DeleteClientDialog key={deleting.id} tenant={deleting} onClose={() => setDeleting(null)} onDeleted={() => { success(`${displayName(deleting)} was deleted`); if (configuring === deleting.id) setConfiguring(null); setDeleting(null); void loadOverview(true); }} />}
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
