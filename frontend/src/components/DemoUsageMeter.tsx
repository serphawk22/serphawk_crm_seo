"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";

type Budgets = Record<"ai" | "calls", { used: number; limit: number }>;

export default function DemoUsageMeter() {
  const { t } = useLanguage();
  const [budgets, setBudgets] = useState<Budgets | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/me/demo-usage`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (alive) setBudgets(data.restricted ? data.budgets : null);
      } catch { /* A temporary failure does not reset the server's budget. */ }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("limit-reached", refresh);
    return () => { alive = false; window.removeEventListener("focus", refresh); window.removeEventListener("limit-reached", refresh); };
  }, []);
  if (!budgets) return null;
  return <section aria-label={t("Demo usage")} className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
    <h2 className="font-bold">{t("Demo usage")}</h2>
    <div className="mt-2 flex flex-wrap gap-5">{(["ai", "calls"] as const).map(key => <div key={key}>
      <span>{t(key === "ai" ? "AI API calls" : "Phone calls")}: <b>{budgets[key].used}/{budgets[key].limit}</b></span>
      <progress className="mt-1 block h-2" max={budgets[key].limit} value={Math.min(budgets[key].used, budgets[key].limit)} />
    </div>)}</div>
    <p className="mt-2">{t("Credits are shared across this workspace and do not reset on sign-in.")}</p>
  </section>;
}
