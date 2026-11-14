"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLanguage } from "@/context/LanguageContext";

export interface SourceConversion { name: string; total: number; converted: number; rate: number }

export default function SourceWinRates({ data }: { data: SourceConversion[] }) {
  const { t } = useLanguage();
  return <section className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
    <h2 className="font-bold">{t("Lead Source Win Rates")}</h2>
    <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("Converted leads as a percentage of inquiries from each source.")}</p>
    {data.length ? <div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ bottom: 25 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="name" interval={0} angle={-15} textAnchor="end" />
      <YAxis domain={[0, 100]} unit="%" />
      <Tooltip formatter={value => [`${Number(value)}%`, t("Win Rate")]} />
      <Bar dataKey="rate" name={t("Win Rate")} fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={48} />
    </BarChart></ResponsiveContainer></div> : <p className="py-10 text-center text-sm text-[var(--text-secondary)]">{t("No data recorded yet")}</p>}
  </section>;
}
