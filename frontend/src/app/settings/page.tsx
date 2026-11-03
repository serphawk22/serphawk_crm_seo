"use client";
import { useLanguage } from "@/context/LanguageContext";
import LocalizedText from "@/components/LocalizedText";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Loader2, Settings, Shield, User, Check, KeyRound } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { CompanySettingsPanel } from "@/app/admin/branding/page";
import PhoneInput from "@/components/PhoneInput";
import { isPlausiblePhone } from "@/lib/phone";

const inputCls = "mt-1 w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 transition-colors";
const cardCls = "space-y-4 rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-zinc-900 p-4 shadow-2xs";

export default function SettingsPage() {
  const { t } = useLanguage();
  return <Suspense fallback={<p role="status" className="p-6 text-xs text-slate-400">{t("Loading settings…")}</p>}><SettingsContent /></Suspense>;
}

function SettingsContent() {
  const { t } = useLanguage();
  const { user, role, logout, updateProfile } = useRole();
  const { hasFeature } = useTenantConfig();
  const router = useRouter();
  const search = useSearchParams();
  const tab = search?.get("tab") || "profile";
  const [profile, setProfile] = useState({ name: "", email: "", phone: "", role: "" });
  const [password, setPassword] = useState({ current: "", next: "", confirm: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    fetch(`${API_BASE_URL}/users/me`).then(async response => {
      if (!response.ok) throw new Error("Could not load your profile");
      const data = await response.json();
      if (alive) setProfile({ name: data.user.name || "", email: data.user.email || "", phone: data.user.phone || "", role: data.user.role || "" });
    }).catch(error => { if (alive) setMessage(error.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.id]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); setMessage("");
    if (!isPlausiblePhone(profile.phone)) { setMessage("Please enter a valid phone number."); return; }
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/users/me`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: profile.name.trim(), phone: profile.phone }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save your profile");
      updateProfile({ name: data.user.name, phone: data.user.phone }); setMessage("Profile saved successfully.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save profile"); }
    finally { setBusy(false); }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault(); setMessage("");
    if (password.next !== password.confirm) { setMessage("The new passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/change-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: user?.id, current_password: password.current, new_password: password.next }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not change password");
      logout();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not change password"); }
    finally { setBusy(false); }
  };

  const tabs = [
    { key: "profile", label: "My Profile", Icon: User },
    { key: "security", label: "Security", Icon: Shield },
    ...(role === "Admin" ? [{ key: "company", label: "Company Settings", Icon: Building2 }] : [])
  ];
  const active = tabs.some(value => value.key === tab) ? tab : "profile";

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-16 max-w-4xl mx-auto">
      {/* Compact Executive Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Settings className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">{t("Profile & Settings")}</h1>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40">
                {t(role || "User")}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 leading-none mt-0.5 truncate">
              {t(role === "Admin" ? "Manage your personal account, branding and sales access." : "Manage your personal account and credentials.")}
            </p>
          </div>
        </div>
      </div>

      {/* Compact Tabs Navigation */}
      <nav aria-label={t("Settings sections")} className="flex items-center gap-1 overflow-x-auto bg-white dark:bg-zinc-900 p-1 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-2xs">
        {tabs.map(({ key, label, Icon }) => (
          <button 
            key={key} 
            type="button" 
            aria-current={active === key ? "page" : undefined} 
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              active === key 
                ? "bg-indigo-600 text-white shadow-2xs" 
                : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
            }`} 
            onClick={() => { setMessage(""); router.replace(`/settings${key === "profile" ? "" : `?tab=${key}`}`); }}
          >
            <Icon size={14} />
            <span>{t(label)}</span>
          </button>
        ))}
      </nav>

      {message && (
        <div role="status" className="rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/80 dark:bg-indigo-950/40 px-3 py-2 text-xs font-medium text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span>{t(message)}</span>
        </div>
      )}

      {active === "company" && role === "Admin" ? (
        <CompanySettingsPanel embedded />
      ) : loading ? (
        <div className="flex items-center justify-center h-48 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/90 dark:border-white/10">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : active === "security" ? (
        <form onSubmit={savePassword} className={cardCls}>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-indigo-600" /> <LocalizedText text={"Change Password"} /> </h2>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
              {t("After saving, sign in again with your new credentials.")}
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <LocalizedText text={"Current password"} /> <input
                required 
                autoComplete="current-password" 
                type="password" 
                className={inputCls} 
                value={password.current} 
                onChange={event => setPassword({ ...password, current: event.target.value })} 
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                <LocalizedText text={"New password"} /> <input
                  required 
                  minLength={8} 
                  autoComplete="new-password" 
                  type="password" 
                  className={inputCls} 
                  value={password.next} 
                  onChange={event => setPassword({ ...password, next: event.target.value })} 
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                {t("Confirm new password")}
                <input
                  required 
                  minLength={8} 
                  autoComplete="new-password" 
                  type="password" 
                  className={inputCls} 
                  value={password.confirm} 
                  onChange={event => setPassword({ ...password, confirm: event.target.value })} 
                />
              </label>
            </div>
          </div>

          <button 
            disabled={busy} 
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-2xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            <span>{t(busy ? "Saving…" : "Change password")}</span>
          </button>
        </form>
      ) : (
        <form onSubmit={saveProfile} className={cardCls}>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-600" /> {t("Personal Details")}
            </h2>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
              {t("Update your contact information and display profile.")}
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <LocalizedText text={"Full Name"} /> <input
                required 
                className={inputCls} 
                value={profile.name} 
                onChange={event => setProfile({ ...profile, name: event.target.value })} 
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                <LocalizedText text={"Email Address"} /> <input
                  readOnly 
                  className={`${inputCls} text-slate-500 dark:text-zinc-400 cursor-not-allowed`} 
                  value={profile.email} 
                />
              </label>
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                {t("Account Role")}
                <input
                  readOnly 
                  className={`${inputCls} text-slate-500 dark:text-zinc-400 cursor-not-allowed`} 
                  value={t(profile.role === "SalesManager" ? "Sales Manager" : profile.role)}
                />
              </label>
            </div>

            <label className="block space-y-1 text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <span><LocalizedText text={"Phone Number"} /></span>
              <PhoneInput value={profile.phone} onChange={phone => setProfile({ ...profile, phone })} />
            </label>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button 
              disabled={busy} 
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-2xs transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              <span>{t(busy ? "Saving…" : "Save profile")}</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 space-y-1">
            {role === "SuperAdmin" && (
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {t("Manage company modules and branding in")} <Link className="font-semibold text-indigo-600 dark:text-indigo-400 underline" href="/superadmin/clients"><LocalizedText text={"Client Management"} /></Link>.
              </p>
            )}
            {hasFeature("email_agent") && ["Admin", "Demo"].includes(role) && (
              <p className="text-[11px]">
                <Link className="text-indigo-600 dark:text-indigo-400 underline font-semibold" href="/email-agent">
                  {t("Email integration and signature settings")} →
                </Link>
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
