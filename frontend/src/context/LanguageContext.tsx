"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import i18n from "@/i18n/config";
import { translate, type TranslationValues } from "@/lib/translate";

export type Language = "en" | "es";

interface LanguageContextType {
  language: Language;
  activeLang?: Language;
  setLanguage: (lang: Language | string) => void;
  t: (key: string, values?: TranslationValues) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Import translations
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const sync = (value: string) => {
      const lang = value.startsWith("es") ? "es" : "en";
      setLanguageState(lang);
      localStorage.setItem("language", lang);
      localStorage.setItem("crm-language", lang);
      document.documentElement.lang = lang;
      document.documentElement.dir = "ltr";
    };
    const savedLanguage = localStorage.getItem("language") || localStorage.getItem("crm-language") || "en";
    sync(savedLanguage);
    void i18n.changeLanguage(savedLanguage === "es" ? "es" : "en");
    i18n.on("languageChanged", sync);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "language" || event.key === "crm-language") void i18n.changeLanguage(event.newValue === "es" ? "es" : "en");
    };
    window.addEventListener("storage", onStorage);
    return () => { i18n.off("languageChanged", sync); window.removeEventListener("storage", onStorage); };
  }, []);

  const setLanguage = useCallback((lang: Language | string) => {
    const validLang = ["en", "es"].includes(lang) ? (lang as Language) : "en";
    setLanguageState(validLang);
    localStorage.setItem("language", validLang);
    localStorage.setItem("crm-language", validLang); // Keep both in sync
    document.documentElement.lang = validLang;
    void i18n.changeLanguage(validLang);
  }, []);

  const t = useCallback((key: string, values?: TranslationValues) => translate(key, language, values), [language]);

  return (
    <LanguageContext.Provider value={{ language, activeLang: language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
