"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { 
  ArrowRight, 
  ArrowLeft, 
  Sparkles, 
  Rocket, 
  Lock, 
  Compass, 
  CheckCircle2, 
  MessageSquare, 
  Zap, 
  Users, 
  BarChart3, 
  Mail, 
  Layers, 
  Globe2, 
  ShieldCheck, 
  ChevronRight,
  ExternalLink
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import LanguageSelector from "@/components/LanguageSelector";
import AuthThemeToggle from "@/components/AuthThemeToggle";
import { WHATSAPP_LINK, WHATSAPP_DISPLAY } from "@/config";
import { useCompanyBrand } from "@/components/CompanyBoundary";
import { platformLogin, platformOrigin } from "@/lib/authRoutes";

export default function DemoAccountPage() {
  const brand = useCompanyBrand();
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-screen bg-[#f8f9fc] dark:bg-[#060913]" />;
  }

  const demoFeatures = [
    {
      icon: <Users className="w-5 h-5 text-indigo-400" />,
      title: t("Client 360° Management"),
      description: t("5 connected customer accounts with unified deal history, documents, communications, and task sheets."),
    },
    {
      icon: <Zap className="w-5 h-5 text-cyan-400" />,
      title: t("Lead Radar Intelligence"),
      description: t("5 live prospect discoveries with domain analysis, automated qualification scoring, and instant pipeline entry."),
    },
    {
      icon: <Mail className="w-5 h-5 text-violet-400" />,
      title: t("AI Email Outreach Agent"),
      description: t("5 automated personalized email drafts generated from prospect analysis and CRM activity."),
    },
    {
      icon: <Layers className="w-5 h-5 text-emerald-400" />,
      title: t("Sales Pipeline Kanban"),
      description: t("Visual drag-and-drop deal tracking with automated stage change triggers and follow-up reminders."),
    },
    {
      icon: <Globe2 className="w-5 h-5 text-amber-400" />,
      title: t("Dual Currency Engine"),
      description: t("Native dual-currency support for Indian Rupee (INR) and Mexican Peso (MXN) invoicing."),
    },
    {
      icon: <MessageSquare className="w-5 h-5 text-sky-400" />,
      title: t("Communication Hub"),
      description: t("Email threads, WhatsApp interactions, and internal team notes unified into a chronological client timeline."),
    },
  ];

  const steps = [
    {
      number: "01",
      title: t("Sign Up in 30 Seconds"),
      detail: t("Register with your work email or Google account on the demo creation portal. No credit card required."),
    },
    {
      number: "02",
      title: t("Select CRM Model"),
      detail: t("Choose between B2B (Corporate Sales CRM) or B2C (Institute & Admissions CRM) pre-populated workflows."),
    },
    {
      number: "03",
      title: t("Test Live Automations"),
      detail: t("Run AI outreach, progress pipeline deals, log client interactions, and experience the unified team dashboard."),
    },
    {
      number: "04",
      title: t("Seamless Production Upgrade"),
      detail: t("When satisfied, request an instant conversion to a production workspace with custom domain and unlimited records."),
    },
  ];

  return (
    <div className="min-h-screen w-full bg-[#f8f9fc] dark:bg-[#060913] text-slate-800 dark:text-slate-100 font-sans relative overflow-x-hidden selection:bg-indigo-500 selection:text-white transition-colors duration-300">
      
      {/* ── Background: Gradient Canvas & Ambient Lighting ── */}
      <div
        className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a08_1px,transparent_1px),linear-gradient(to_bottom,#0f172a08_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b12_1px,transparent_1px),linear-gradient(to_bottom,#1e293b12_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none"
        aria-hidden="true"
      />

      {/* Floating Animated Gradient Orb 1 (Top Left / Violet-Indigo) */}
      <motion.div
        animate={{
          x: [0, 25, -20, 0],
          y: [0, -25, 20, 0],
          scale: [1, 1.08, 0.95, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -top-28 -left-28 w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-indigo-300/30 via-violet-300/25 to-purple-300/20 dark:from-indigo-600/25 dark:via-violet-600/20 dark:to-purple-600/10 blur-[130px] pointer-events-none"
        aria-hidden="true"
      />

      {/* Floating Animated Gradient Orb 2 (Bottom Right / Cyan-Teal-Indigo) */}
      <motion.div
        animate={{
          x: [0, -30, 20, 0],
          y: [0, 30, -20, 0],
          scale: [1, 0.94, 1.06, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute bottom-10 -right-28 w-[540px] h-[540px] rounded-full bg-gradient-to-br from-cyan-300/25 via-sky-300/20 to-indigo-300/25 dark:from-cyan-500/15 dark:via-teal-500/10 dark:to-indigo-700/20 blur-[140px] pointer-events-none"
        aria-hidden="true"
      />

      {/* Center Subtle Ambient Glow */}
      <motion.div
        animate={{
          opacity: [0.25, 0.45, 0.25],
          scale: [0.96, 1.04, 0.96],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gradient-to-tr from-indigo-200/40 via-purple-200/30 to-sky-200/30 dark:from-indigo-500/10 dark:via-purple-500/10 dark:to-sky-500/10 rounded-full blur-[150px] pointer-events-none"
        aria-hidden="true"
      />

      {/* ── Top Navigation Bar ── */}
      <header className="relative z-30 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-[#060913]/70 backdrop-blur-xl transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500/30 blur-md rounded-xl" />
              <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 flex items-center justify-center shadow-md shadow-indigo-600/30 border border-white/20">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3L3 8.5V15.5L12 21L21 15.5V8.5L12 3Z" className="fill-white" />
                </svg>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-300 transition-colors">
                {brand.company ? brand.brand_name : "SERP HAWK CRM"}
              </span>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider">
                {t("Demo Center")}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm dark:text-slate-300 dark:hover:text-white dark:bg-slate-900/80 dark:hover:bg-slate-800 dark:border-slate-700/70 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>{t("Back to Sign In")}</span>
            </Link>
            <LanguageSelector />
            <AuthThemeToggle />
          </div>

        </div>
      </header>

      {/* ── Main Content Container ── */}
      <main className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-20 space-y-12 sm:space-y-16">

        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-3xl mx-auto space-y-4"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/25 dark:text-indigo-300 text-xs font-semibold tracking-wide uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
            <span>{t("Self-Service Demo Environment")}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
            {t("Experience the Full Power of Swerphawk CRM")}
          </h1>

          <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base leading-relaxed">
            {t("Explore 21 integrated CRM modules, automated sales pipelines, AI email outreach, and radar lead intelligence in a dedicated risk-free environment.")}
          </p>
        </motion.div>

        {/* ── Core Action Cards Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Card 1: Create Demo Workspace */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -4 }}
            className="relative rounded-[24px] bg-white/95 dark:bg-[#0b1325]/85 border border-slate-200/80 dark:border-slate-800/90 hover:border-indigo-500/50 shadow-[0_15px_40px_-10px_rgba(15,23,42,0.08)] dark:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)] backdrop-blur-xl p-7 flex flex-col justify-between overflow-hidden group transition-all duration-300"
          >
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent pointer-events-none" />
            
            <div className="space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform shadow-lg shadow-indigo-600/10">
                <Rocket className="w-6 h-6" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {t("Create Demo Workspace")}
                </h2>
                <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm leading-relaxed">
                  {t("Launch your personal sandboxed trial workspace pre-loaded with sample leads, clients, deals, and AI agents.")}
                </p>
              </div>

              <ul className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                  <span>{t("Instant 30-second setup")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                  <span>{t("B2B Corporate or B2C Institute model")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                  <span>{t("Full administrator permissions")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                  <span>{t("No credit card required")}</span>
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <Link
                href="/signup"
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-500 text-white rounded-xl text-sm font-bold tracking-wide transition-all shadow-lg shadow-indigo-600/25 hover:shadow-indigo-500/35 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <span>{t("Create Free Demo Account")}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>

          {/* Card 2: Sign In with Existing Demo Account */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -4 }}
            className="relative rounded-[24px] bg-white/95 dark:bg-[#0b1325]/85 border border-slate-200/80 dark:border-slate-800/90 hover:border-cyan-500/50 shadow-[0_15px_40px_-10px_rgba(15,23,42,0.08)] dark:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)] backdrop-blur-xl p-7 flex flex-col justify-between overflow-hidden group transition-all duration-300"
          >
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent pointer-events-none" />

            <div className="space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-cyan-50 dark:bg-cyan-600/20 border border-cyan-200 dark:border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400 group-hover:scale-105 transition-transform shadow-lg shadow-cyan-600/10">
                <Lock className="w-6 h-6" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {t("Sign In to Workspace")}
                </h2>
                <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm leading-relaxed">
                  {t("Already created a demo environment or received a workspace invitation? Sign in to resume where you left off.")}
                </p>
              </div>

              <ul className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-500 dark:text-cyan-400 shrink-0" />
                  <span>{t("Secure credential sign-in")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-500 dark:text-cyan-400 shrink-0" />
                  <span>{t("Google OAuth 1-click access")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-500 dark:text-cyan-400 shrink-0" />
                  <span>{t("Preserved pipeline & activity data")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-500 dark:text-cyan-400 shrink-0" />
                  <span>{t("Direct access to telemetry & upgrade")}</span>
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <Link
                href="/login"
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-900/80 dark:hover:bg-slate-800 dark:border dark:border-slate-700/80 dark:hover:border-slate-600 rounded-xl text-sm font-semibold tracking-wide transition-all shadow-sm flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <span>{t("Sign In to Existing Account")}</span>
                <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-400" />
              </Link>
            </div>
          </motion.div>

          {/* Card 3: Interactive Zero-Login Product Tour */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -4 }}
            className="relative rounded-[24px] bg-white/95 dark:bg-[#0b1325]/85 border border-slate-200/80 dark:border-slate-800/90 hover:border-violet-500/50 shadow-[0_15px_40px_-10px_rgba(15,23,42,0.08)] dark:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)] backdrop-blur-xl p-7 flex flex-col justify-between overflow-hidden group transition-all duration-300"
          >
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/60 to-transparent pointer-events-none" />

            <div className="space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-600/20 border border-violet-200 dark:border-violet-500/30 flex items-center justify-center text-violet-600 dark:text-violet-400 group-hover:scale-105 transition-transform shadow-lg shadow-violet-600/10">
                <Compass className="w-6 h-6" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {t("Interactive Product Showcase")}
                </h2>
                <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm leading-relaxed">
                  {t("Prefer an immediate visual walkthrough? Explore all 21 CRM modules and automated workflows right in your browser.")}
                </p>
              </div>

              <ul className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" />
                  <span>{t("Zero login or signup required")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" />
                  <span>{t("15-step automated customer journey")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" />
                  <span>{t("AI Email Agent interactive preview")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" />
                  <span>{t("Full business impact analytics")}</span>
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <Link
                href="/demo_showcase"
                className="w-full py-3 px-4 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:hover:bg-violet-900/40 dark:border-violet-800/50 dark:hover:border-violet-700 dark:text-violet-200 rounded-xl text-sm font-semibold tracking-wide transition-all shadow-sm flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <span>{t("Launch Showcase Tour")}</span>
                <ExternalLink className="w-4 h-4 text-violet-500 dark:text-violet-400" />
              </Link>
            </div>
          </motion.div>

        </div>

        {/* ── Demo Capabilities & Specifications Grid ── */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                {t("What is Included in Your Demo Account")}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
                {t("Every demo workspace is fully functional and includes real CRM features.")}
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 self-start sm:self-auto">
              {t("Real-time Database")}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {demoFeatures.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="p-5 rounded-2xl bg-white/80 dark:bg-[#0b1325]/60 border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-300 dark:hover:border-slate-700/90 transition-all hover:bg-white dark:hover:bg-[#0b1325]/80 shadow-sm dark:shadow-none space-y-3"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/70 flex items-center justify-center">
                  {item.icon}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── How It Works Steps ── */}
        <section className="rounded-3xl bg-white/80 dark:bg-[#0b1325]/60 border border-slate-200/80 dark:border-slate-800/80 p-6 sm:p-10 space-y-8 shadow-sm dark:shadow-none">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {t("How the Demo Environment Works")}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              {t("From initial trial to full enterprise deployment in four simple steps.")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, idx) => (
              <div key={idx} className="relative space-y-2.5">
                <div className="text-3xl font-black text-indigo-500/60 dark:text-indigo-400/40 font-mono">
                  {step.number}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {step.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {step.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Custom Demo / WhatsApp Support Card ── */}
        <div className="rounded-3xl bg-gradient-to-r from-indigo-50 via-white to-purple-50 dark:from-indigo-950/40 dark:via-[#0b1325]/90 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-500/20 p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md dark:shadow-xl">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold uppercase">
              {t("Live Assistance")}
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {t("Need a Tailored Demonstration for Your Team?")}
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm max-w-xl">
              {t("Schedule a 1-on-1 walkthrough with our solutions specialist to see how Swerphawk CRM fits your specific sales cycle or admissions process.")}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 w-full md:w-auto">
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-bold tracking-wide transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              <span>{t("Chat on WhatsApp")}</span>
            </a>
            <Link
              href="/login"
              className="w-full sm:w-auto px-5 py-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 dark:bg-slate-900/80 dark:hover:bg-slate-800 dark:border-slate-700/80 dark:text-white rounded-xl text-xs sm:text-sm font-semibold tracking-wide transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <span>{t("Go to Sign In")}</span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </Link>
          </div>
        </div>

      </main>

      {/* ── Footer ── */}
      <footer className="relative z-20 border-t border-slate-200/80 dark:border-slate-800/80 py-8 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 SERP HAWK CRM · {t("All rights reserved.")}</p>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-slate-800 dark:hover:text-slate-300 transition-colors">
              {t("Sign in")}
            </Link>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <Link href="/signup" className="hover:text-slate-800 dark:hover:text-slate-300 transition-colors">
              {t("Create Demo Workspace")}
            </Link>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <Link href="/demo_showcase" className="hover:text-slate-800 dark:hover:text-slate-300 transition-colors">
              {t("Product Showcase")}
            </Link>
          </div>
        </div>
      </footer>

    </div>
  );
}

