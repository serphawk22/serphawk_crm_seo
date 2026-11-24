"use client";

import { useLanguage } from "@/context/LanguageContext";
import { useEffect, useRef } from "react";
import { useTenantConfig } from "@/context/TenantConfigContext";

export default function GlobalFooter() {
  const { t } = useLanguage();
  const { settings } = useTenantConfig();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const footer = ref.current;
    if (!footer) return;
    const update = () => document.documentElement.style.setProperty("--app-footer-height", `${footer.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(footer);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--app-footer-height"); };
  }, []);
  return (
    <footer ref={ref} className="fixed bottom-0 left-0 right-0 z-[80] border-t border-slate-200/80 bg-white/95 px-4 py-2 text-[10px] font-semibold text-slate-500 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-400">
      <div className="flex items-center justify-between max-w-[1600px] mx-auto text-center">
        <span className="shrink-0">
          {settings.brand_name ? <>{settings.brand_name} &copy; {new Date().getFullYear()}</> : <>{t("A SERPHawk product")} &copy; {new Date().getFullYear()}</>}
        </span>
        <div className="flex items-center gap-3">
          <a
            href="/shop"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-indigo-600 dark:hover:text-indigo-400 transition underline underline-offset-2"
          >
            Storefront
          </a>
          <span className="text-slate-300 dark:text-zinc-700">•</span>
          <a
            href="/blogs"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-indigo-600 dark:hover:text-indigo-400 transition underline underline-offset-2"
          >
            Knowledge Hub &amp; Blogs
          </a>
        </div>
      </div>
    </footer>
  );
}
