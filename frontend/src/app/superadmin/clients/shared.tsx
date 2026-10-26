"use client";

import { ReactNode, useState } from "react";
import { Check, Copy } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { logoSrc } from "@/lib/brandLogo";
import { flagFromIso } from "@/lib/phone";

export interface TenantOverview {
  id: number;
  name: string;
  business_name?: string | null;
  brand_name?: string | null;
  is_trial: boolean;
  demo_of_tenant_id?: number | null;
  created_at?: string | null;
  admin_email?: string | null;
  users: number;
  leads: number;
  clients: number;
  open_requests: number;
  preset?: string | null;
  country?: string | null;
  currency?: string | null;
  locale?: string | null;
  has_logo: boolean;
  modules_on: number;
}

export interface Totals {
  clients: number;
  paid: number;
  trial: number;
  demo: number;
  users: number;
  open_requests: number;
}

export interface CatalogFeature { key: string; label: string; group: string; description: string; locked: boolean; gated_on_server: boolean }
export interface Preset { key: string; label: string; description: string; features: string[] }
export interface RegionOptions {
  industries: { key: string; label: string; preset?: string }[];
  countries: { code: string; name: string; dial_code: string }[];
}

/** Presets in the order a person should see them: the standard CRM first. */
export const PRESET_ORDER = ["standard", "agency", "agency-voice", "bpo", "institute", "design-agency", "serphawk", "full"];

export const inputCls =
  "w-full rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition";
export const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400";
export const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:from-indigo-500 hover:to-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
export const ghostBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-zinc-200 transition hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-50";

/** Calls the API and throws an Error whose message is the server's explanation (including validation errors). */
export async function call<T = any>(path: string, init?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data?.detail;
    const text = typeof d === "string" ? d : Array.isArray(d) ? d.map((x: any) => x.msg || String(x)).join("; ") : "Something went wrong. Please try again.";
    throw new Error(text);
  }
  return data as T;
}

export function displayName(t: { name: string; business_name?: string | null; brand_name?: string | null }) {
  return t.brand_name || t.business_name || t.name;
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

const AVATAR_COLORS = ["from-indigo-500 to-blue-500", "from-fuchsia-500 to-pink-500", "from-emerald-500 to-teal-500", "from-amber-500 to-orange-500", "from-sky-500 to-cyan-500", "from-violet-500 to-purple-500"];

/** A client's logo when it has one, otherwise a coloured tile with its initials. */
export function ClientAvatar({ tenantId, name, hasLogo, size = 44, version }: { tenantId: number; name: string; hasLogo: boolean; size?: number; version?: string | number }) {
  const [broken, setBroken] = useState(false);
  const src = hasLogo && !broken ? logoSrc(`/tenant/logo/${tenantId}${version ? `?v=${version}` : ""}`) : null;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" onError={() => setBroken(true)} style={{ width: size, height: size }} className="shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1 dark:border-zinc-700" />;
  }
  return (
    <div style={{ width: size, height: size }} className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${AVATAR_COLORS[tenantId % AVATAR_COLORS.length]} text-sm font-bold text-white shadow-sm`}>
      {initials(name)}
    </div>
  );
}

export function Flag({ code }: { code?: string | null }) {
  if (!code || code.length !== 2) return null;
  return <span aria-hidden="true">{flagFromIso(code)}</span>;
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "indigo" | "violet" | "red" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300",
    green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    red: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

/** A button that copies text and says so. */
export function CopyButton({ text, label = "Copy", onCopied }: { text: string; label?: string; onCopied?: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          onCopied?.();
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked: the value stays visible to select by hand */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
    >
      {done ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

/** Login details of a freshly created account, with copy buttons. The password is shown once. */
export function CredentialsCard({ title, email, password, loginUrl }: { title: string; email: string; password?: string | null; loginUrl: string }) {
  const invite = `Sign in at ${loginUrl}\nEmail: ${email}${password ? `\nTemporary password: ${password}` : ""}`;
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
      <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">{title}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500 dark:text-zinc-400">Email</dt>
          <dd className="flex items-center gap-2 font-mono text-slate-900 dark:text-zinc-100">{email}<CopyButton text={email} /></dd>
        </div>
        {password && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-zinc-400">Password</dt>
            <dd className="flex items-center gap-2 font-mono text-slate-900 dark:text-zinc-100">{password}<CopyButton text={password} /></dd>
          </div>
        )}
      </dl>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">{password ? "The password is shown only now. Copy it before you close this panel." : "Share these details securely."}</p>
        <CopyButton text={invite} label="Copy invite message" />
      </div>
    </div>
  );
}
