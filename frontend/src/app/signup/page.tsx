"use client";
import LocalizedText from "@/components/LocalizedText";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useGoogleLogin } from "@react-oauth/google";
import { loginError } from "@/lib/authRoutes";
import { API_BASE_URL } from "@/config";
import { Lock, Mail, Loader2, Eye, EyeOff, ArrowRight, Sparkles, ShieldCheck, User as UserIcon, Building2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import LanguageSelector from "@/components/LanguageSelector";
import AuthThemeToggle from "@/components/AuthThemeToggle";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import EmailOTPVerification from "@/components/EmailOTPVerification";
import { useLanguage } from "@/context/LanguageContext";
import "@/i18n/config";

const MIN_PASSWORD = 8;

export default function SignupPage() {
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [model, setModel] = useState<"b2b" | "b2c">("b2b");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    setMounted(true);
  }, []);

  function suggestPassword() {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnpqrstuvwxyz";
    const digits = "23456789";
    const symbols = "!@#$%^&*";
    const rand = (set: string) => set[Math.floor(Math.random() * set.length)];
    const parts = [
      rand(upper), rand(lower), rand(digits), rand(symbols),
      Array.from({ length: 8 }, () => rand(upper + lower + digits + symbols)).join(""),
    ];
    const shuffled = parts
      .map((part) => part.split(""))
      .flat()
      .sort(() => Math.random() - 0.5)
      .join("");
    return shuffled.slice(0, 16);
  }

  const useSuggestedPassword = () => {
    const pw = suggestPassword();
    setPassword(pw);
    setShowPassword(true);
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGoogleSubmitting(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE_URL}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: tokenResponse.access_token,
            model,
            company_name: companyName.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(loginError(data.detail, "Google login failed").message);
        
        localStorage.setItem("crm_user", JSON.stringify(data.user));
        if (data.token) localStorage.setItem("crm_token", data.token);
        
        window.location.replace(data.is_new_user ? "/onboarding" : "/");
      } catch (err: any) {
        setError(err.message || "An error occurred with Google Login.");
      } finally {
        setGoogleSubmitting(false);
      }
    },
    onError: () => {
      setError("Google Login failed. Please try again.");
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !companyName.trim() || !email.trim() || !password) {
      if (!companyName.trim()) {
        setError("Please provide a company name.");
      }
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`The password must have at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setError("");
    setVerifyingOtp(true);
  };

  const createAccount = async () => {
    setIsSubmitting(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/demo/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          company_name: companyName.trim(),
          email: email.trim(),
          password,
          model,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create account");

      localStorage.setItem("crm_user", JSON.stringify(data.user));
      localStorage.setItem("crm_token", data.token);
      window.location.replace("/onboarding");
    } catch (err: any) {
      setError(err.message || "An error occurred.");
      setVerifyingOtp(false);
      setIsSubmitting(false);
    }
  };

  if (!mounted) return <div className="min-h-screen bg-[#f4f6fb] dark:bg-[#101014]" />;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f4f6fb] dark:bg-[#101014] text-slate-800 dark:text-[#FFFFFF] font-sans relative overflow-hidden py-8 sm:py-12 px-4 sm:px-6 transition-colors duration-300">
      
      {/* ── Background: Ambient SaaS Glows ── */}
      <div
        className="absolute top-1/4 -left-20 w-[520px] h-[520px] rounded-full bg-indigo-500/10 dark:bg-indigo-600/5 blur-[140px] pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-10 right-0 w-[450px] h-[450px] rounded-full bg-pink-500/10 dark:bg-purple-900/5 blur-[140px] pointer-events-none"
        aria-hidden="true"
      />

      {/* Top Right Controls (Language, Theme Toggle) */}
      <div className="absolute top-5 right-5 sm:top-6 sm:right-6 z-50 flex items-center gap-2">
        <LanguageSelector />
        <AuthThemeToggle />
      </div>

      {/* ── Main Split-Screen Card Container ── */}
      <motion.div 
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[1060px] my-auto rounded-[28px] sm:rounded-[32px] bg-white dark:bg-[#1C1C24] border border-slate-200/90 dark:border-[#30303A] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.06),0_2px_10px_rgba(0,0,0,0.02)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] p-3.5 sm:p-4 lg:p-5 transition-all duration-300"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-stretch">
          
          {/* ── Left Column: SaaS Lead Detection Branding Panel ── */}
          <div className="lg:col-span-5 xl:col-span-5 relative overflow-hidden rounded-[22px] sm:rounded-[26px] p-7 sm:p-9 lg:p-10 flex flex-col justify-between min-h-[340px] sm:min-h-[400px] lg:min-h-[620px] bg-gradient-to-br from-[#fce7f3]/80 via-[#ede9fe]/90 to-[#e0f2fe]/80 dark:from-[#181820] dark:via-[#181820] dark:to-[#15151B] border border-purple-200/50 dark:border-[#30303A] shadow-inner">
            
            {/* Subtle Geometric Grid Texture */}
            <div 
              className="absolute inset-0 opacity-[0.45] dark:opacity-[0.08] pointer-events-none"
              style={{
                backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
                backgroundSize: "44px 44px",
                color: "rgba(99, 102, 241, 0.28)",
              }}
              aria-hidden="true"
            />

            {/* Ambient Background Circles & Curves */}
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-pink-400/20 dark:bg-purple-600/10 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-indigo-400/20 dark:bg-indigo-600/10 blur-2xl pointer-events-none" />
            
            {/* Decorative Geometric Rings (as in reference screenshots) */}
            <div 
              className="absolute bottom-16 right-8 w-44 h-44 rounded-full border border-indigo-400/25 dark:border-[#30303A]/60 pointer-events-none"
              aria-hidden="true"
            />
            <div 
              className="absolute bottom-8 right-24 w-32 h-32 rounded-full border border-pink-400/25 dark:border-[#30303A]/40 pointer-events-none"
              aria-hidden="true"
            />

            {/* Top Branding Header */}
            <div className="relative z-10 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-[#22222C] backdrop-blur-md border border-slate-200/70 dark:border-[#30303A] text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold tracking-wider uppercase shadow-sm">
                <img
                  src="/Serp%20Hawk%20Logo.png"
                  alt="Serp Hawk"
                  className="w-4 h-4 object-contain shrink-0"
                />
                <span><LocalizedText text={"SWERPHAWK CRM"} /></span>
              </div>

              {/* Main Headline */}
              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-bold tracking-[0.22em] text-slate-500 dark:text-[#A1A1AA] uppercase">
                  CRM THAT
                </p>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.06] text-slate-900 dark:text-[#FFFFFF]">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
                    DETECTS
                  </span>
                  <br />
                  YOUR LEADS
                </h2>
              </div>
            </div>

            {/* Middle / Bottom Supporting Content */}
            <div className="relative z-10 mt-auto pt-8 space-y-4">
              <div className="max-w-sm space-y-2">
                <p className="text-xs sm:text-sm text-slate-700 dark:text-[#A1A1AA] leading-relaxed font-normal">
                  Discover potential customers, identify opportunities, and turn every lead into meaningful business growth.
                </p>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  <span>Smart lead detection. Better insights. Faster conversions.</span>
                </div>
              </div>

              {/* Bottom Infrastructure Tag (matching reference screenshots) */}
              <div className="pt-4 border-t border-slate-300/60 dark:border-[#30303A] flex items-center justify-between text-[11px] sm:text-xs text-slate-500 dark:text-[#A1A1AA]">
                <span>Stand-alone hybrid infrastructure</span>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-indigo-100/80 dark:bg-[#22222C] text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-[#30303A]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              </div>
            </div>

          </div>

          {/* ── Right Column: Sign-up Form ── */}
          <div className="lg:col-span-7 xl:col-span-7 p-4 sm:p-6 lg:p-8 flex flex-col justify-center">
            
            {/* Header */}
            <div className="mb-5">
              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-10 h-10 shrink-0 flex items-center justify-center">
                  <img
                    src="/Serp%20Hawk%20Logo.png"
                    alt="Serp Hawk"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-[#FFFFFF]">
                    <LocalizedText text={"Create new account"} />
                  </h1>
                  <p className="text-slate-500 dark:text-[#A1A1AA] text-xs sm:text-sm font-normal">
                    <LocalizedText text={"Come join the community! Let's set up your account."} />
                  </p>
                </div>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {!verifyingOtp ? (
                <motion.form 
                  key="signup-form"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  onSubmit={handleSubmit} 
                  className="flex flex-col gap-3.5"
                >
                  <div className="space-y-3">
                    {/* Row: Name and Company Name */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Name */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-[#A1A1AA] tracking-wide uppercase">
                          <LocalizedText text={"Full Name"} />
                        </label>
                        <div className="relative group">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <UserIcon className="h-4 w-4 text-slate-400 dark:text-[#A1A1AA] group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-400 transition-colors" />
                          </div>
                          <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full pl-10 pr-3.5 py-2 bg-[#f8fafc] dark:bg-[#22222C] border border-slate-200 dark:border-[#30303A] hover:border-slate-300 dark:hover:border-[#3e3e4a] rounded-xl text-sm text-slate-900 dark:text-[#FFFFFF] placeholder-slate-400 dark:placeholder-[#A1A1AA]/60 focus:outline-none focus:bg-white dark:focus:bg-[#22222C] focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/15 dark:focus:ring-indigo-500/25 transition-all shadow-sm"
                            placeholder="John Doe"
                          />
                        </div>
                      </div>

                      {/* Company Name */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-[#A1A1AA] tracking-wide uppercase">
                          <LocalizedText text={"Company Name"} />
                        </label>
                        <div className="relative group">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <Building2 className="h-4 w-4 text-slate-400 dark:text-[#A1A1AA] group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-400 transition-colors" />
                          </div>
                          <input
                            type="text"
                            required
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            className="w-full pl-10 pr-3.5 py-2 bg-[#f8fafc] dark:bg-[#22222C] border border-slate-200 dark:border-[#30303A] hover:border-slate-300 dark:hover:border-[#3e3e4a] rounded-xl text-sm text-slate-900 dark:text-[#FFFFFF] placeholder-slate-400 dark:placeholder-[#A1A1AA]/60 focus:outline-none focus:bg-white dark:focus:bg-[#22222C] focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/15 dark:focus:ring-indigo-500/25 transition-all shadow-sm"
                            placeholder="Acme Corp"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Demo Model */}
                    <div className="space-y-1">
                      <label htmlFor="demo-model" className="text-xs font-bold text-slate-700 dark:text-[#A1A1AA] tracking-wide uppercase">
                        <LocalizedText text={"Demo model"} />
                      </label>
                      <select
                        id="demo-model"
                        value={model}
                        onChange={(event) => setModel(event.target.value === "b2c" ? "b2c" : "b2b")}
                        className="w-full rounded-xl border border-slate-200 dark:border-[#30303A] hover:border-slate-300 dark:hover:border-[#3e3e4a] bg-[#f8fafc] dark:bg-[#22222C] px-3.5 py-2 text-sm text-slate-900 dark:text-[#FFFFFF] shadow-sm focus:outline-none focus:bg-white dark:focus:bg-[#22222C] focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/15 dark:focus:ring-indigo-500/25 transition-all"
                      >
                        <option value="b2b">{t("B2B — Business CRM")}</option>
                        <option value="b2c">{t("B2C — Admissions and institute CRM")}</option>
                      </select>
                    </div>

                    {/* Work Email */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-[#A1A1AA] tracking-wide uppercase">
                        <LocalizedText text={"Work Email"} />
                      </label>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                          <Mail className="h-4 w-4 text-slate-400 dark:text-[#A1A1AA] group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-400 transition-colors" />
                        </div>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full pl-10 pr-3.5 py-2 bg-[#f8fafc] dark:bg-[#22222C] border border-slate-200 dark:border-[#30303A] hover:border-slate-300 dark:hover:border-[#3e3e4a] rounded-xl text-sm text-slate-900 dark:text-[#FFFFFF] placeholder-slate-400 dark:placeholder-[#A1A1AA]/60 focus:outline-none focus:bg-white dark:focus:bg-[#22222C] focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/15 dark:focus:ring-indigo-500/25 transition-all shadow-sm"
                          placeholder="name@company.com"
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 dark:text-[#A1A1AA] tracking-wide uppercase">
                          <LocalizedText text={"Password"} />
                        </label>
                        <button
                          type="button"
                          onClick={useSuggestedPassword}
                          className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors cursor-pointer"
                          title="Suggest Password"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <LocalizedText text={"Suggest Password"} />
                        </button>
                      </div>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                          <Lock className="h-4 w-4 text-slate-400 dark:text-[#A1A1AA] group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-400 transition-colors" />
                        </div>
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-10 pr-11 py-2 bg-[#f8fafc] dark:bg-[#22222C] border border-slate-200 dark:border-[#30303A] hover:border-slate-300 dark:hover:border-[#3e3e4a] rounded-xl text-sm text-slate-900 dark:text-[#FFFFFF] placeholder-slate-400 dark:placeholder-[#A1A1AA]/60 focus:outline-none focus:bg-white dark:focus:bg-[#22222C] focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/15 dark:focus:ring-indigo-500/25 transition-all shadow-sm"
                          placeholder="••••••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? t("Hide password") : t("Show password")}
                          title={showPassword ? t("Hide password") : t("Show password")}
                          aria-pressed={showPassword}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center min-w-[44px] min-h-[44px] justify-center text-slate-400 hover:text-indigo-600 dark:text-[#A1A1AA] dark:hover:text-[#FFFFFF] transition-colors focus:outline-none focus-visible:text-indigo-500 cursor-pointer"
                        >
                          {showPassword ? (
                            <Eye className="w-4 h-4" aria-hidden="true" />
                          ) : (
                            <EyeOff className="w-4 h-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                      {password && <PasswordStrengthMeter password={password} />}
                    </div>

                    {/* Keep Me Logged In */}
                    <div className="flex items-center justify-between text-xs pt-0.5">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 dark:text-[#A1A1AA]">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 dark:border-[#30303A] text-indigo-600 focus:ring-indigo-500/30 dark:bg-[#22222C]"
                        />
                        <span><LocalizedText text={"Keep me logged in"} /></span>
                      </label>
                    </div>
                  </div>

                  {/* Error Alert */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-1 text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 px-3 py-2.5 rounded-lg flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
                          <span className="font-medium">{error}</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Create Account Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting || !name.trim() || !companyName.trim() || !email.trim() || !password}
                    className="w-full mt-1.5 py-3 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-sm font-bold tracking-wide transition-all shadow-lg shadow-indigo-600/25 dark:shadow-indigo-600/30 hover:shadow-indigo-500/35 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60 disabled:scale-100 cursor-pointer"
                  >
                    <LocalizedText text={"Create Account"} /> <ArrowRight className="w-4 h-4" />
                  </button>

                  {/* Divider */}
                  <div className="relative flex items-center py-0.5">
                    <div className="flex-grow border-t border-slate-200 dark:border-[#30303A]"></div>
                    <span className="flex-shrink-0 mx-4 text-slate-400 dark:text-[#A1A1AA] text-xs font-semibold uppercase tracking-widest">
                      <LocalizedText text={"Or"} />
                    </span>
                    <div className="flex-grow border-t border-slate-200 dark:border-[#30303A]"></div>
                  </div>

                  {/* Google Sign-up */}
                  <button
                    type="button"
                    onClick={() => googleLogin()}
                    disabled={googleSubmitting}
                    className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm text-slate-700 hover:text-slate-900 dark:bg-[#22222C] dark:hover:bg-[#282836] dark:border-[#30303A] dark:text-[#FFFFFF] rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2.5 disabled:opacity-60 active:scale-[0.98] cursor-pointer"
                  >
                    {googleSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    )}
                    <LocalizedText text={"Sign up with Google"} />
                  </button>
                  
                  {/* Sign In Link */}
                  <p className="text-center text-xs text-slate-500 dark:text-[#A1A1AA] mt-4 pt-3.5 border-t border-slate-100 dark:border-[#30303A]">
                    <LocalizedText text={"Already have an account?"} />{" "}
                    <Link href="/login" className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-semibold transition-colors">
                      <LocalizedText text={"Sign in"} />
                    </Link>
                  </p>
                </motion.form>
              ) : (
                <motion.div
                  key="otp-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="py-4"
                >
                  <EmailOTPVerification
                    email={email.trim()}
                    purpose="signup"
                    autoSend
                    onVerified={createAccount}
                    onCancel={() => setVerifyingOtp(false)}
                  />
                  
                  {isSubmitting && (
                    <div className="mt-4 flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-[#15151B] rounded-xl border border-slate-200 dark:border-[#30303A]">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
                      <p className="text-sm font-medium text-slate-600 dark:text-[#A1A1AA]"><LocalizedText text={"Finalizing your workspace..."} /></p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

          </div>

        </div>
      </motion.div>
    </div>
  );
}
