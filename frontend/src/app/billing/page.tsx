"use client";

import Quotes from "./Quotes";
import { useLanguage } from "@/context/LanguageContext";

export default function BillingPage() {
  const { t } = useLanguage();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-zinc-50 tracking-tight">{t("billing.title")}</h1>
          <p className="text-gray-500 dark:text-zinc-400 font-medium">{t("billing.subtitle")}</p>
        </div>
      </div>

      <Quotes />
    </div>
  );
}