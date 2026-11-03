"use client";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { useDashboardSections } from "@/components/DashboardSection";
import FollowUpsWidget from "@/components/followups/FollowUpsWidget";

interface SalesManagerStats {
  metrics: { assigned_leads: number; assigned_contacts: number; assigned_clients: number; converted_leads?: number; conversion_percentage?: number };
  recent_activity: { type: string; title: string; date: string | null; status: string }[];
}
export function SalesManagerDashboard({ stats, name }: { stats: SalesManagerStats; name: string }) {
  const { t, language } = useLanguage();
  const show = useDashboardSections();
  const cards = [
    { key: "leads", module: "leads", label: "Assigned Leads", value: stats.metrics.assigned_leads, href: "/leads" },
    { key: "contacts", module: "contacts", label: "Assigned Contacts", value: stats.metrics.assigned_contacts, href: "/contacts" },
    { key: "clients", module: "clients", label: "Assigned Clients", value: stats.metrics.assigned_clients, href: "/clients" },
  ].filter(card => show(card.key, card.module));
  return <div className="space-y-6">
    <header className="rounded-2xl bg-indigo-900 p-6 text-white"><p className="text-xs font-bold uppercase">{t("Your sales workspace")}</p><h1 className="mt-2 text-3xl font-bold">{name}</h1><p className="mt-2 text-indigo-100">{t("Review your assigned leads, contacts, clients and follow-ups.")}</p></header>
    <div className="grid gap-4 sm:grid-cols-3">{cards.map(card => <Link key={card.key} href={card.href} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"><p className="text-sm text-[var(--text-secondary)]">{t(card.label)}</p><p className="mt-2 text-3xl font-bold">{card.value || 0}</p></Link>)}</div>
    {show("sales_metrics", "leads") && <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"><p>{t("Converted leads")}</p><b className="text-2xl">{stats.metrics.converted_leads || 0}</b></div><div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"><p>{t("Lead Conversion")}</p><b className="text-2xl">{stats.metrics.conversion_percentage || 0}%</b></div></div>}
    {show("followups", "followups") && <FollowUpsWidget />}
    {show("recent_activity") && <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"><h2 className="font-bold">{t("Recent activity")}</h2><ul className="mt-3 divide-y divide-[var(--border)]">{stats.recent_activity.map((activity, index) => <li key={index} className="py-3"><b>{activity.title}</b><p className="text-sm text-[var(--text-secondary)]">{t(activity.type)} · {t(activity.status)} · {activity.date ? new Date(activity.date).toLocaleString(language) : ""}</p></li>)}</ul>{!stats.recent_activity.length && <p className="mt-3 text-sm">{t("No data recorded yet")}</p>}</section>}
  </div>;
}
