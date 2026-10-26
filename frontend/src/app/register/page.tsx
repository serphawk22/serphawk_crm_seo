"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Globe, Loader2, Lock, Mail, ShieldCheck, User as UserIcon, ArrowRight, Eye, EyeOff } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import AuthThemeToggle from "@/components/AuthThemeToggle";
import EmailOTPVerification from "@/components/EmailOTPVerification";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import PhoneInput from "@/components/PhoneInput";
import { isPlausiblePhone } from "@/lib/phone";

interface Options {
  industries: { key: string; label: string }[];
  countries: { code: string; name: string; dial_code: string }[];
}

const inputCls =
  "w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all shadow-sm";
const selectCls =
  "w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all shadow-sm";
const labelCls = "text-xs font-semibold text-slate-600 dark:text-zinc-300 tracking-wide uppercase";

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className={labelCls}>{label}</label>
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-zinc-500 group-focus-within:text-indigo-500 transition-colors">
          {icon}
        </div>
        {children}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const { login } = useRole();
  const [mounted, setMounted] = useState(false);
  const [options, setOptions] = useState<Options>({ industries: [], countries: [] });
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState("general");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"details" | "verify">("details");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch(`${API_BASE_URL}/register/options`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOptions(d))
      .catch(() => {});
  }, []);

  const submitDetails = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    if (!isPlausiblePhone(phone)) return setError("Please enter a valid phone number.");
    setStep("verify");
  };

  const createWorkspace = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: company.trim(),
          admin_name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || null,
          industry,
          country: country || null,
          website: website.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not create your workspace");
      const result = await login(email.trim(), password);
      if (!result.success) throw new Error(result.message || "Your workspace was created. Please sign in.");
      window.location.href = "/admin/branding?welcome=1";
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setStep("details");
      setCreating(false);
    }
  };

  if (!mounted) return <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0b]" />;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#fafafa] dark:bg-[#0a0a0b] text-slate-900 dark:text-zinc-100 font-sans relative overflow-y-auto py-10">
      <div className="absolute top-6 right-6 z-50">
        <AuthThemeToggle />
      </div>

      <div className="w-full max-w-[460px] px-6 relative z-10">
        <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-white/20 dark:border-zinc-800 shadow-2xl rounded-3xl p-8 sm:p-10">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center mb-5 shadow-lg shadow-indigo-600/20">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">Register your company</h1>
            <p className="text-slate-500 dark:text-zinc-400 text-sm">
              Your own private CRM workspace, set up for you in a minute. Your data stays separate from every other company.
            </p>
          </div>

          {step === "details" ? (
            <form onSubmit={submitDetails} className="flex flex-col gap-4">
              <Field label="Company name" icon={<Building2 className="h-4 w-4" />}>
                <input required className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Trading Co." />
              </Field>
              <Field label="Your name" icon={<UserIcon className="h-4 w-4" />}>
                <input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
              </Field>
              <Field label="Work email" icon={<Mail className="h-4 w-4" />}>
                <input required type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@acme.com" />
              </Field>
              <div className="space-y-1.5">
                <label className={labelCls}>Phone</label>
                <PhoneInput value={phone} onChange={setPhone} defaultDialCode={options.countries.find((c) => c.code === country)?.dial_code} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="What you do" icon={<Building2 className="h-4 w-4" />}>
                  <select className={selectCls} value={industry} onChange={(e) => setIndustry(e.target.value)}>
                    {options.industries.length === 0 && <option value="general">Other / general business</option>}
                    {options.industries.map((i) => (
                      <option key={i.key} value={i.key}>{i.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Country" icon={<Globe className="h-4 w-4" />}>
                  <select className={selectCls} value={country} onChange={(e) => setCountry(e.target.value)}>
                    <option value="">Select...</option>
                    {options.countries.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Website (optional)" icon={<Globe className="h-4 w-4" />}>
                <input className={inputCls} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="acme.com" />
              </Field>
              <div className="space-y-1.5">
                <label className={labelCls}>Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-zinc-500">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    required
                    minLength={8}
                    type={showPassword ? "text" : "password"}
                    className={`${inputCls} pr-12`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {password && <PasswordStrengthMeter password={password} />}
              </div>

              {error && (
                <div className="text-sm text-rose-500 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-3 py-2.5 rounded-lg flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold tracking-wide transition-all shadow-md flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-center text-sm text-slate-500 dark:text-zinc-500">
                Already registered?{" "}
                <Link href="/login" className="text-slate-900 dark:text-zinc-200 font-semibold hover:text-indigo-600">Sign in</Link>
              </p>
            </form>
          ) : (
            <div>
              {creating ? (
                <div className="flex flex-col items-center gap-3 py-8 text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  <p className="text-sm">Setting up your workspace...</p>
                </div>
              ) : (
                <EmailOTPVerification email={email.trim()} purpose="signup" autoSend onVerified={createWorkspace} onCancel={() => setStep("details")} />
              )}
              {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
