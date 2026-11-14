"use client";

import Link from "next/link";
import { useRole } from "@/context/RoleContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { useDashboardSections } from "@/components/DashboardSection";
import { formatCurrency } from "@/i18n/config";

export default function DashboardManagement({ variant, unassignedLeads, todayTasks, institute }: {
  variant: string; unassignedLeads?: number; todayTasks?: number;
  institute?: { due: number; activeStudents: number };
}) {
  const { role } = useRole();
  const { t, language } = useLanguage();
  const { hasFeature, settings } = useTenantConfig();
  const show = useDashboardSections(variant);
  const managesCompany = role === "Admin" || role === "Demo";
  if (!show(variant === "command_center" ? "work" : "operations")) return null;
  const links = [
    { module: "leads", href: "/leads", label: managesCompany ? "Assign Leads" : "Leads", allowed: managesCompany || role === "SalesManager" || role === "Sales" },
    { module: "task_sheet", href: "/task-sheet", label: "Staff Task Sheet", allowed: true },
    { module: "institute", href: "/students", label: "Students", allowed: true },
    { module: "institute", href: "/enrollments", label: "Enrollments & Fees", allowed: managesCompany || role === "SalesManager" || role === "Employee" },
    { module: "institute", href: "/schedule", label: "Important Dates", allowed: true },
    { module: "reports", href: "/reports", label: "Full Analytics", allowed: managesCompany || role === "SalesManager" || role === "Sales" },
    { module: "teams", href: "/teams", label: "Team Directory", allowed: managesCompany || role === "SalesManager" },
    { module: null, href: "/settings", label: "Profile & Settings", allowed: managesCompany },
  ].filter(link => link.allowed && (!link.module || hasFeature(link.module)));
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--text-primary)]">
    <h2 className="text-xl font-bold">{t("Direct Operations & Company Controls")}</h2>
    <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("Manage leads, staff work, enrollments and company settings.")}</p>
    <div className="mt-4 flex flex-wrap gap-2">{links.map(link => <Link key={link.href} href={link.href} className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-semibold hover:bg-[var(--sidebar-hover)]">{t(link.label)}</Link>)}</div>
    <dl className="mt-4 flex flex-wrap gap-6 text-sm">
      {managesCompany && hasFeature("leads") && unassignedLeads !== undefined && <div><dt className="text-[var(--text-secondary)]">{t("Unassigned Leads")}</dt><dd className="text-xl font-bold">{unassignedLeads.toLocaleString(language)}</dd></div>}
      {hasFeature("task_sheet") && todayTasks !== undefined && <div><dt className="text-[var(--text-secondary)]">{t("Tasks Logged Today")}</dt><dd className="text-xl font-bold">{todayTasks.toLocaleString(language)}</dd></div>}
      {hasFeature("institute") && institute && <>
        <div><dt className="text-[var(--text-secondary)]">{t("Outstanding fees")}</dt><dd className="text-xl font-bold">{formatCurrency(institute.due, language, settings.default_currency || "USD")}</dd></div>
        <div><dt className="text-[var(--text-secondary)]">{t("Active students")}</dt><dd className="text-xl font-bold">{institute.activeStudents.toLocaleString(language)}</dd></div>
      </>}
    </dl>
  </section>;
}
