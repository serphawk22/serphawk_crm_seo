"use client";
import { useLanguage } from "@/context/LanguageContext";
import { SUPPORTED_LANGUAGES } from "@/i18n/config";
import { cn } from "@/lib/utils";
export default function LanguageSelector({ className }: { className?: string } = {}) {
  const { language, setLanguage } = useLanguage();
  return (
    <div
      className={cn(
        "inline-flex items-center p-0.5 rounded-xl bg-white dark:bg-[#0c1427]/80 border border-slate-200 dark:border-slate-700/70 shadow-sm",
        className
      )}
      role="group"
      aria-label="Language / Idioma"
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          lang={lang.code}
          aria-pressed={lang.code === language}
          onClick={() => setLanguage(lang.code)}
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
            lang.code === language
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          )}
        >
          {lang.nativeName}
        </button>
      ))}
    </div>
  );
}
