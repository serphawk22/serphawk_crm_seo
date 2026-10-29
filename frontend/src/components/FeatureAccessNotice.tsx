"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Building2, Check, ChevronDown, CircleHelp, FolderLock, LayoutDashboard, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import styles from "./FeatureAccessNotice.module.css";

interface FeatureAccessNoticeProps {
  feature: string;
  kind: "superadmin" | "module";
}

/** Shared access explanation. Navigation never changes roles or opens client records. */
export default function FeatureAccessNotice({ feature, kind }: FeatureAccessNoticeProps) {
  const [showHelp, setShowHelp] = useState(false);
  const reducedMotion = useReducedMotion();
  const platform = kind === "superadmin";
  const steps = platform ? [
    ["Keep this dashboard open", "Open a private browser window for your client testing session."],
    ["Sign in as the company Admin", "Use the Admin account for the company you want to test."],
    ["Open this feature", `Choose ${feature} in that workspace to work with its records.`],
  ] : [
    ["Contact your company Admin", `Ask whether ${feature} is included in your company’s plan.`],
    ["Confirm the module is enabled", "Your Admin can coordinate the change with the platform team."],
    ["Return when it’s ready", "Refresh this page after your company’s access has been updated."],
  ];
  const entrance = reducedMotion ? {} : { opacity: 0, y: 16 };
  const helpId = `feature-access-help-${kind}`;

  return (
    <section aria-labelledby="feature-access-title" className={`${styles.screen} relative isolate flex items-center justify-center overflow-hidden`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_35%,rgba(99,102,241,0.08),transparent_65%)]" />
      <motion.div initial={entrance} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.45 }}
        className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_80px_-32px_rgba(49,46,129,0.22)] dark:border-zinc-800 dark:bg-zinc-900">
        <div className={`${styles.grid} grid lg:grid-cols-2`}>
          <div aria-hidden="true" className={`${styles.illustration} relative flex min-h-44 items-center justify-center overflow-hidden border-b border-indigo-100/70 bg-gradient-to-br from-indigo-50 via-blue-50/70 to-violet-50 px-4 py-4 dark:border-zinc-800 dark:from-indigo-950/50 dark:via-zinc-900 dark:to-violet-950/30 lg:border-b-0 lg:border-r`}>
            <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(#a5b4fc_1px,transparent_1px)] [background-size:20px_20px] dark:opacity-15" />
            <div className="relative flex h-48 w-64 items-center justify-center sm:h-60 sm:w-72">
              <motion.div animate={reducedMotion ? {} : { rotate: [0, 4, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                className="absolute h-40 w-40 rounded-[42px] border border-indigo-200/70 bg-white/35 sm:h-48 sm:w-48 dark:border-indigo-800/50 dark:bg-indigo-950/20" />
              <div className="absolute h-32 w-32 -rotate-12 rounded-[34px] border border-white bg-white/40 shadow-sm dark:border-indigo-900 dark:bg-indigo-900/10 sm:h-40 sm:w-40" />
              <motion.div animate={reducedMotion ? {} : { y: [0, -7, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="relative flex h-24 w-24 items-center justify-center rounded-[28px] bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_16px_36px_-8px_rgba(99,102,241,0.5)] sm:h-28 sm:w-28">
                <Building2 className="h-11 w-11 stroke-[1.5] sm:h-14 sm:w-14" />
                <span className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-xl border-4 border-indigo-50 bg-emerald-500 dark:border-zinc-900"><Check className="h-4 w-4" /></span>
              </motion.div>
              <motion.div animate={reducedMotion ? {} : { y: [0, 6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="absolute left-0 top-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white bg-white/90 text-indigo-500 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-indigo-300 sm:top-8"><FolderLock className="h-5 w-5" /></motion.div>
              <motion.div animate={reducedMotion ? {} : { y: [0, -5, 0] }} transition={{ duration: 5, delay: 0.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute bottom-5 right-0 flex h-12 w-12 items-center justify-center rounded-2xl border border-white bg-white/90 text-violet-500 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-violet-300 sm:bottom-8"><Users className="h-5 w-5" /></motion.div>
            </div>
            <div className="absolute bottom-4 flex items-center gap-1.5 text-[11px] font-medium text-indigo-500 dark:text-indigo-300 lg:bottom-8"><ShieldCheck className="h-3.5 w-3.5" /> A separate workspace for every client</div>
          </div>

          <div className={styles.content}>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300"><LockKeyhole className="h-3.5 w-3.5" /> {platform ? "SuperAdmin access" : "Company plan"}</span>
              <span className="rounded-full border border-slate-200 px-3 py-1.5 text-slate-500 dark:border-zinc-700 dark:text-zinc-400">{feature}</span>
            </div>
            <h1 id="feature-access-title" className={`${styles.title} mt-4 max-w-lg text-2xl font-bold leading-tight tracking-tight text-slate-900 dark:text-zinc-50`}>
              {platform ? "Open your client workspace" : `${feature} is not enabled yet`}
            </h1>
            <p className={`${styles.description} mt-3 text-sm leading-6 text-slate-600 dark:text-zinc-400`}>
              {platform ? <>You’re signed in as SuperAdmin. Use the company Admin account to access <strong className="font-semibold text-slate-800 dark:text-zinc-200">{feature}</strong>.</>
                : <>This module isn’t currently included in your company’s enabled features. Your company Admin can help arrange access.</>}
            </p>
            <div className={`${styles.privacy} mt-4 flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500 dark:bg-zinc-800/60 dark:text-zinc-400`}>
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{platform ? "Client data stays within its own workspace." : "Your other enabled features remain available from the dashboard."}</span>
            </div>
            <div className={`${styles.actions} mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap`}>
              <Link href={platform ? "/superadmin/clients" : "/"}
                className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500 motion-safe:transition-transform motion-safe:hover:-translate-y-0.5">
                {platform ? <Building2 className="h-4 w-4" /> : <LayoutDashboard className="h-4 w-4" />}
                {platform ? "Client Management" : "Back to dashboard"}
                <ArrowRight className="h-4 w-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
              </Link>
              {platform && <Link href="/admin/telemetry" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"><Users className="h-4 w-4" /> Manage demo accounts</Link>}
            </div>
            <div className={`${styles.help} mt-4 border-t border-slate-100 pt-2 dark:border-zinc-800`}>
              <button type="button" aria-expanded={showHelp} aria-controls={helpId} onClick={() => setShowHelp(value => !value)}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg text-left text-sm font-medium text-slate-600 transition-colors hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500 dark:text-zinc-400 dark:hover:text-indigo-300">
                <CircleHelp className="h-4 w-4" /> {platform ? "How do I test this feature?" : "What can I do next?"}
                <ChevronDown className={`ml-auto h-4 w-4 motion-safe:transition-transform ${showHelp ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {showHelp && <motion.div id={helpId} initial={reducedMotion ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.22 }} className="overflow-hidden">
                  <ol className="space-y-4 pb-1 pt-4">
                    {steps.map(([title, description], index) => <li key={title} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">{index + 1}</span>
                      <div><p className="text-xs font-semibold text-slate-800 dark:text-zinc-200">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">{description}</p></div>
                    </li>)}
                  </ol>
                </motion.div>}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
