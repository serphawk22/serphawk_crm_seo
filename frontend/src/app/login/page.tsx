"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGoogleLogin } from "@react-oauth/google";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { Loader2, ArrowRight, ShieldCheck, Mail, Lock, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { login } = useRole();
  const router = useRouter();

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
        if (!res.ok) throw new Error(data.detail || "Google login failed");
        if (!data.user || !data.user.email) {
          throw new Error("No email found in Google account. Please verify your email.");
        }
        
        localStorage.setItem("crm_user", JSON.stringify(data.user));
        
        if (data.is_new_user) {
          window.location.href = "/onboarding";
        } else {
          window.location.href = "/";
        }
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
      
      if (result.success) {
        if (result.is_new_user) {
          window.location.href = "/onboarding";
        } else {
          window.location.href = "/";
        }
      } else {
        setError(result.error || "Login failed");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = () => {
    setEmail("admin@serphawk.com");
    setPassword("Admin123!");
    setError("Demo credentials applied.");
  };

  if (!mounted) return <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a]" />;

  return (
    <div className="min-h-screen w-full flex bg-slate-50 dark:bg-[#0a0a0a] text-slate-900 dark:text-zinc-100 font-sans selection:bg-indigo-500/30 overflow-hidden">
      
      {/* ── LEFT PANEL (Form) ── */}
      <div className="flex-1 flex flex-col justify-center relative z-20 px-6 sm:px-12 lg:px-24 xl:px-32">
        <div className="w-full max-w-[440px] mx-auto flex flex-col">
          
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-zinc-100 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3L3 8.5V15.5L12 21L21 15.5V8.5L12 3Z" className="fill-white dark:fill-[#0a0a0a]" />
              </svg>
            </div>
            <span className="text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">SERPHawk</span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100 mb-2">Log in to your account</h1>
            <p className="text-slate-500 dark:text-zinc-400 text-sm">Enter your details to access your workspace.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900/50 border border-slate-300 dark:border-zinc-800 rounded-lg text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    placeholder="name@company.com"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Password</label>
                  <button type="button" onClick={handleDemoLogin} className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
                    Use Demo Login
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900/50 border border-slate-300 dark:border-zinc-800 rounded-lg text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 bg-slate-900 dark:bg-zinc-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-zinc-900 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              
              <Link href="/signup" className="flex-1">
                <button
                  type="button"
                  className="w-full h-full py-2.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center"
                >
                  Create Demo
                </button>
              </Link>
            </div>

            <div className="relative flex items-center py-4">
              <div className="flex-grow border-t border-slate-200 dark:border-zinc-800"></div>
              <span className="flex-shrink-0 mx-4 text-slate-500 dark:text-zinc-500 text-xs">OR</span>
              <div className="flex-grow border-t border-slate-200 dark:border-zinc-800"></div>
            </div>

            <button
              type="button"
              onClick={() => googleLogin()}
              disabled={googleSubmitting}
              className="w-full py-2.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-lg text-sm text-slate-700 dark:text-zinc-300 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {googleSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400 dark:text-zinc-400" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              Continue with Google
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500 dark:text-zinc-500">
            Don't have an account?{" "}
            <Link href="/signup" className="text-slate-900 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-white underline underline-offset-4 transition-colors">
              Request access
            </Link>
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL (Visual/Abstract) ── */}
      <div className="relative hidden lg:flex flex-1 items-center justify-center overflow-hidden border-l border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-[#0f0f11]">
        
        {/* Subtle mesh background */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.05] dark:opacity-[0.15] mix-blend-overlay z-10 pointer-events-none" />
        
        {/* Elegant abstract glow */}
        <div className="absolute w-[800px] h-[800px] rounded-full bg-indigo-500/20 dark:bg-indigo-500/10 blur-[100px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute w-[600px] h-[600px] rounded-full bg-violet-500/20 dark:bg-violet-500/10 blur-[100px] top-1/2 left-1/2 -translate-x-1/2 translate-y-1/4" />

        {/* Clean central graphic or quote */}
        <div className="relative z-20 max-w-md w-full px-8 flex flex-col items-start gap-8">
          <div className="w-full rounded-2xl bg-white/60 dark:bg-zinc-900/40 border border-slate-200/60 dark:border-zinc-800/60 p-8 backdrop-blur-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Enterprise Ready</span>
            </div>
            <p className="text-xl font-medium text-slate-900 dark:text-zinc-200 leading-relaxed mb-8">
              "SERPHawk transformed our agency's workflow. We closed 40% more deals in our first quarter by having our entire pipeline intelligently managed in one place."
            </p>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-300 dark:bg-zinc-800" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-zinc-200">Sarah Jenkins</p>
                <p className="text-xs text-slate-500 dark:text-zinc-500">Director of Growth, Horizon SEO</p>
              </div>
            </div>
          </div>
          
          <div className="flex gap-6 opacity-40 ml-2">
            {/* Abstract geometric accents */}
            <div className="w-2 h-2 rounded-full bg-zinc-500" />
            <div className="w-2 h-2 rounded-full bg-zinc-700" />
            <div className="w-2 h-2 rounded-full bg-zinc-700" />
          </div>
        </div>
      </div>

    </div>
  );
}
