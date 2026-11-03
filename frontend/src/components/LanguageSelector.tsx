"use client";
import { useLanguage } from "@/context/LanguageContext";
import { SUPPORTED_LANGUAGES } from "@/i18n/config";
import { cn } from "@/lib/utils";
export default function LanguageSelector({ className }: { className?: string } = {}) {
  const { language, setLanguage } = useLanguage();
  return <div className={cn("flex items-center gap-2", className)} role="group" aria-label="Language / Idioma">
    {SUPPORTED_LANGUAGES.map(lang => <button key={lang.code} type="button" lang={lang.code}
      aria-pressed={lang.code === language} onClick={() => setLanguage(lang.code)}
      className={cn("rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors",
        lang.code === language ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200" : "border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800")}
    >{lang.nativeName}</button>)}
  </div>;
}
