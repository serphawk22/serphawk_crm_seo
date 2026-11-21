"use client";
import { useLanguage } from "@/context/LanguageContext";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useGoogleLogin } from "@react-oauth/google";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { Loader2, ArrowRight, ShieldCheck, Mail, Lock, Eye, EyeOff, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import LanguageSelector from "@/components/LanguageSelector";
import AuthThemeToggle from "@/components/AuthThemeToggle";
import { useCompanyBrand } from "@/components/CompanyBoundary";
import { loginError, platformLogin, platformOrigin } from "@/lib/authRoutes";

export default function LoginPage() {
  const brand = useCompanyBrand();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { login } = useRole();
  const redirectToPlatform = (message: string) => {
    setError(t(message));
    setRedirecting(true);
  };
  useEffect(() => {
    if (!redirecting) return;
    const id = window.setTimeout(() => window.location.replace(platformLogin), 2500);
    return () => window.clearTimeout(id);
  }, [redirecting]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGoogleSubmitting(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE_URL}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: tokenResponse.access_token }),
        });
        const data = await res.json();
        if (!res.ok) {
          const failure = loginError(data.detail, "Google login failed");
          if (failure.wrongCompany) { redirectToPlatform(failure.message); return; }
          throw new Error(failure.message);
        }
        if (!data.user || !data.user.email) {
          throw new Error("No email found in Google account. Please verify your email.");
        }
        
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
    setIsSubmitting(true);
    setError("");

    try {
      const result = await login(email, password);
      
      if (result.wrongCompany && result.message) {
        redirectToPlatform(result.message);
      } else if (!result.success) {
        setError(result.message || "Login failed");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
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
        className="relative z-10 w-full max-w-[1040px] my-auto rounded-[28px] sm:rounded-[32px] bg-white dark:bg-[#1C1C24] border border-slate-200/90 dark:border-[#30303A] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.06),0_2px_10px_rgba(0,0,0,0.02)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] p-3.5 sm:p-4 lg:p-5 transition-all duration-300"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-stretch">
          
          {/* ── Left Column: SaaS Lead Detection Branding Panel ── */}
          <div className="lg:col-span-5 xl:col-span-6 relative overflow-hidden rounded-[22px] sm:rounded-[26px] p-7 sm:p-9 lg:p-10 flex flex-col justify-between min-h-[340px] sm:min-h-[400px] lg:min-h-[560px] bg-gradient-to-br from-[#fce7f3]/80 via-[#ede9fe]/90 to-[#e0f2fe]/80 dark:from-[#181820] dark:via-[#181820] dark:to-[#15151B] border border-purple-200/50 dark:border-[#30303A] shadow-inner">
            
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
                <span>{brand.company ? brand.brand_name : "SWERPHAWK CRM"}</span>
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

          {/* ── Right Column: Sign-in Form ── */}
          <div className="lg:col-span-7 xl:col-span-6 p-4 sm:p-6 lg:p-8 flex flex-col justify-center">
            
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 shrink-0 flex items-center justify-center">
                  <img
                    src="/Serp%20Hawk%20Logo.png"
                    alt="Serp Hawk"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-[#FFFFFF]">
                    {t("Welcome back")}
                  </h1>
                  <p className="text-slate-500 dark:text-[#A1A1AA] text-xs sm:text-sm font-normal">
                    {brand.company ? `${brand.locale === "es" ? "Inicia sesión en" : "Sign in to"} ${brand.brand_name}` : t("Sign in to your SERP Hawk workspace.")}
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="space-y-4">
                {/* Email Address */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-[#A1A1AA] tracking-wide uppercase">
                    {t("Email Address")}
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
                      className="w-full pl-10 pr-4 py-2.5 bg-[#f8fafc] dark:bg-[#22222C] border border-slate-200 dark:border-[#30303A] hover:border-slate-300 dark:hover:border-[#3e3e4a] rounded-xl text-sm text-slate-900 dark:text-[#FFFFFF] placeholder-slate-400 dark:placeholder-[#A1A1AA]/60 focus:outline-none focus:bg-white dark:focus:bg-[#22222C] focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/15 dark:focus:ring-indigo-500/25 transition-all shadow-sm"
                      placeholder={t("name@company.com")}
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-[#A1A1AA] tracking-wide uppercase">
                      {t("Password")}
                    </label>
                    <Link 
                      href="/forgot-password" 
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                    >
                      {t("Forgot password?")}
                    </Link>
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
                      className="w-full pl-10 pr-11 py-2.5 bg-[#f8fafc] dark:bg-[#22222C] border border-slate-200 dark:border-[#30303A] hover:border-slate-300 dark:hover:border-[#3e3e4a] rounded-xl text-sm text-slate-900 dark:text-[#FFFFFF] placeholder-slate-400 dark:placeholder-[#A1A1AA]/60 focus:outline-none focus:bg-white dark:focus:bg-[#22222C] focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/15 dark:focus:ring-indigo-500/25 transition-all shadow-sm"
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
                    <span>{t("Keep me logged in")}</span>
                  </label>
                </div>
              </div>

              {/* Error Message */}
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

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || redirecting}
                className="w-full mt-1.5 py-3 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-sm font-bold tracking-wide transition-all shadow-lg shadow-indigo-600/25 dark:shadow-indigo-600/30 hover:shadow-indigo-500/35 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60 disabled:scale-100 cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {t("Sign in")} <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-200 dark:border-[#30303A]"></div>
                <span className="flex-shrink-0 mx-4 text-slate-400 dark:text-[#A1A1AA] text-xs font-semibold uppercase tracking-widest">
                  {t("Or")}
                </span>
                <div className="flex-grow border-t border-slate-200 dark:border-[#30303A]"></div>
              </div>

              {/* Google Button */}
              <button
                type="button"
                onClick={() => googleLogin()}
                disabled={googleSubmitting || redirecting}
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
                {t("Continue with Google")}
              </button>
            </form>

            {/* Navigation Footer */}
            <p className="text-center text-xs text-slate-500 dark:text-[#A1A1AA] mt-5 pt-4 border-t border-slate-100 dark:border-[#30303A]">
              {brand.company ? brand.brand_name : t("New to SERP Hawk?")}{" "}
              <Link 
                href={brand.company ? `${platformOrigin}/signup` : "/signup"} 
                className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-semibold transition-colors"
              >
                {t("Create a demo workspace sign-up")}
              </Link>
            </p>

          </div>

        </div>
      </motion.div>
    </div>
  );
}
