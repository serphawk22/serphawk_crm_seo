'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, SupportedLocale } from '@/i18n/config';
import { cn } from '@/lib/utils';
import { useLanguage, Language } from '@/context/LanguageContext';

export default function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const { setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language) || SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('crm-language', code); // Persist across sessions
    setLanguage(code as Language); // Sync the secondary context
    setIsOpen(false);

    // ── Google Translate full-page translation ──
    const triggerGoogleTranslate = (lang: string, attempts = 0) => {
      if (lang === 'en') {
        // Sync script in <head> reads this flag on reload and adds
        // 'notranslate' to <html> BEFORE GT loads — GT never retranslates.
        sessionStorage.setItem('crm_gt_restore_en', '1');
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
        document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname}`;
        window.location.reload();
        return;
      }
      // Remove notranslate so GT is allowed to translate the page
      document.documentElement.classList.remove('notranslate');
      document.documentElement.removeAttribute('translate');
      // Trigger GT via the hidden combo select
      const select = document.querySelector<HTMLSelectElement>('.goog-te-combo');
      if (select) {
        select.value = lang;
        select.dispatchEvent(new Event('change'));
      } else if (attempts < 25) {
        setTimeout(() => triggerGoogleTranslate(lang, attempts + 1), 100);
      }
    };
    triggerGoogleTranslate(code);
  };

  return (
    <div className="relative" ref={containerRef}>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all border border-transparent text-sm font-semibold",
          isOpen
            ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-300"
            : "hover:bg-slate-50 dark:bg-zinc-950 hover:border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 dark:hover:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-700"
        )}
      >
        <Globe className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-zinc-400" />
        <span className="hidden sm:block">{t('language.selectLanguage', 'Language')}</span>
        <div className="flex items-center gap-1.5 ml-1">
          <span className="text-base leading-none">{currentLang.flag}</span>
          <span className="uppercase text-[10px] font-black tracking-wider text-slate-400 dark:text-slate-500 dark:text-zinc-400">
            {currentLang.code}
          </span>
        </div>
        <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform duration-200", isOpen && "rotate-180")} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-zinc-900 dark:bg-slate-900 border border-slate-200 dark:border-zinc-700 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-800 dark:border-slate-800/50 bg-slate-50 dark:bg-zinc-950/50 dark:bg-slate-800/30">
              <p className="text-[10px] font-black text-slate-500 dark:text-zinc-400 dark:text-slate-400 uppercase tracking-widest">
                {t('language.selectLanguage', 'Select Language')}
              </p>
            </div>
            
            <div className="p-2 space-y-1">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isActive = lang.code === currentLang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all group text-left",
                      isActive
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                        : "hover:bg-slate-50 dark:bg-zinc-950 text-slate-700 dark:text-zinc-200 dark:text-slate-200 dark:hover:bg-slate-800"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg leading-none filter drop-shadow-sm">{lang.flag}</span>
                      <div className="flex flex-col">
                        <span className={cn("text-sm font-semibold leading-tight", isActive ? "text-indigo-700 dark:text-indigo-300" : "group-hover:text-indigo-600 dark:group-hover:text-indigo-400")}>
                          {lang.nativeName}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 dark:text-zinc-400 font-medium">
                          {t(`language.${lang.name.toLowerCase()}`, lang.name)}
                        </span>
                      </div>
                    </div>
                    {isActive && (
                      <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
