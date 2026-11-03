"use client";

import { useState } from "react";
import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dashboardDateLabel } from "@/lib/dashboardLocale";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { useDashboardSections } from "@/components/DashboardSection";
import { formatCurrency } from "@/i18n/config";
import FollowUpsWidget from "@/components/followups/FollowUpsWidget";
import DemoUsageMeter from "@/components/DemoUsageMeter";

type Point = { name: string; value: number };
interface Operations {
  leadStages?: Point[]; leadSources?: Point[]; courseAdmissions?: Point[];
  feeHealth?: Point[]; salesWorkload?: Point[]; taskHealth?: Point[]; pendingTasks?: number;
  instituteSummary?: { students: number; activeStudents: number; booked: number; collected: number; due: number };
  sourceConversion?: { name: string; total: number; converted: number; rate: number }[];
  projectProgress?: { id: number; name: string; status: string; progress: number }[];
  feeRevenue?: { name: string; revenue: number; expenses: number }[];
}
export interface OverviewStats {
  revenue?: number; total?: number; pipelineValue?: number; operations?: Operations;
  revenueData?: { name: string; revenue: number; expenses: number }[];
  chartLabels?: string[]; activityChart?: number[]; emailChart?: number[]; callChart?: number[];
  recentActivities?: { id: number; action: string; content?: string; createdAt?: string | null }[];
}
const panel = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 min-w-0";
const colors = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6"];

function OverviewChart({ title, data, href, money = false, localizeNames = false }: { title: string; data: Point[]; href: string; money?: boolean; localizeNames?: boolean }) {
  const { t, language } = useLanguage();
  const { settings } = useTenantConfig();
  const total = data.reduce((sum, point) => sum + point.value, 0);
  const display = (n: number) => money ? formatCurrency(n, language, settings.default_currency || "USD") : n.toLocaleString(language);
  return <section className={panel}>
    <Link href={href} className="font-bold hover:underline">{t(title)} ↗</Link>
    {total > 0 ? <><div className="h-56 mt-3"><ResponsiveContainer width="100%" height="100%"><PieChart>
      <Pie data={data.map(point => ({ ...point, name: localizeNames ? t(point.name) : point.name }))} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="80%">
        {data.map((point, index) => <Cell key={point.name} fill={colors[index % colors.length]} />)}
      </Pie><Tooltip formatter={value => display(Number(value))} /></PieChart></ResponsiveContainer></div>
      <ul className="space-y-1 text-sm">{data.map(point => <li key={point.name} className="flex justify-between gap-2"><span>{localizeNames ? t(point.name) : point.name}</span><b>{display(point.value)}</b></li>)}</ul>
    </> : <p className="py-16 text-center text-sm text-[var(--text-secondary)]">{t("No data recorded yet")}</p>}
  </section>;
}

export default function OperationsDashboard({ stats, isDemo, callPitch }: { stats: OverviewStats | null; isDemo?: boolean; callPitch: React.ReactNode }) {
  const { user } = useRole();
  const { t, language } = useLanguage();
  const { settings, hasFeature } = useTenantConfig();
  const show = useDashboardSections();
  const [upgradeRequested, setUpgradeRequested] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");
  const [upgrading, setUpgrading] = useState(false);
  const data = stats || {};
  const operations = data.operations || {};
  const institute = operations.instituteSummary;
  const money = (n: number) => formatCurrency(n, language, settings.default_currency || "USD");
  const upgrade = async () => {
    setUpgrading(true); setUpgradeError("");
    try {
      const response = await fetch(`${API_BASE_URL}/demo/request-upgrade`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user?.email }) });
      if (!response.ok) throw new Error(t("Could not request full access"));
      setUpgradeRequested(true);
    } catch (error) { setUpgradeError(error instanceof Error ? error.message : t("Could not request full access")); }
    finally { setUpgrading(false); }
  };
  const metrics = [
    { key: "revenue", module: institute ? "institute" : "invoices", label: institute ? "Fees collected" : "admin_dashboard.kpi_total_revenue", value: money(institute?.collected ?? data.revenue ?? 0) },
    { key: "clients", module: institute ? "institute" : "clients", label: institute ? "Total students" : "admin_dashboard.kpi_active_clients", value: institute?.students ?? data.total ?? 0 },
    { key: "proposals", module: institute ? "institute" : "proposals", label: institute ? "Course fees booked" : "Proposal value", value: money(institute?.booked ?? data.pipelineValue ?? 0) },
    { key: "tasks", module: "task_sheet", label: "Pending tasks", value: operations.pendingTasks ?? 0 },
  ].filter(metric => show(metric.key, metric.module));
  const charts = [
    { key: "lead_stages", module: "leads", title: "Lead pipeline stages", data: operations.leadStages, href: "/leads" },
    { key: "lead_sources", module: "leads", title: "Lead acquisition sources", data: operations.leadSources, href: hasFeature("lead_sources") ? "/lead-sources" : "/leads" },
    { key: "admissions", module: "institute", title: "Course admissions share", data: operations.courseAdmissions, href: "/courses" },
    { key: "fee_health", module: "institute", title: "Fee collection health", data: operations.feeHealth, href: "/enrollments", money: true },
    { key: "sales_workload", module: "teams", title: "Sales team workload", data: operations.salesWorkload, href: "/teams" },
    { key: "task_health", module: "task_sheet", title: "Task sheet execution", data: operations.taskHealth, href: "/task-sheet" },
  ].filter(chart => show(chart.key, chart.module));
  return <div className="space-y-6 max-w-[1600px] mx-auto w-full">
    <DemoUsageMeter />
    {isDemo && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <h2 className="font-bold">{t("admin_dashboard.demo_banner_title")}</h2><p className="text-sm">{t("Demo includes 5 AI API calls and 2 phone calls per workspace.")}</p>
      <button disabled={upgrading || upgradeRequested} onClick={upgrade} className="mt-3 rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{t(upgradeRequested ? "admin_dashboard.upgrade_sent" : "admin_dashboard.request_full_access")}</button>
      {upgradeError && <p role="alert">{upgradeError}</p>}
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{t("admin_dashboard.title")}</h1><p className="text-sm text-[var(--text-secondary)]">{t("admin_dashboard.subtitle")}</p></div>
      {show("operations", "clients") && <Link href="/clients" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white">{t("admin_dashboard.add_new_client")}</Link>}
    </div>
    {metrics.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(metric => <div key={metric.key} className={panel}><p className="text-sm text-[var(--text-secondary)]">{t(metric.label)}</p><p className="mt-2 text-2xl font-bold">{metric.value}</p></div>)}</div>}
    {show("operations") && <section className={panel}><h2 className="font-bold">{t("Company operations")}</h2><div className="mt-3 flex flex-wrap gap-2">
      {[["leads", "/leads", "Leads"], ["teams", "/teams", "Team Directory"], ["task_sheet", "/task-sheet", "Task Sheet"], ["institute", "/students", "Students"], ["institute", "/enrollments", "Enrollments & Fees"], ["reports", "/reports", "Reports"]].filter(([module]) => hasFeature(module)).map(([, href, label]) => <Link key={href} href={href} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--sidebar-hover)]">{t(label)}</Link>)}
    </div>{institute && <p className="mt-4 text-sm">{t("Outstanding fees")}: <b>{money(institute.due)}</b> · {t("Active students")}: <b>{institute.activeStudents}</b></p>}</section>}
    {show("followups", "followups") && <FollowUpsWidget />}
    {show("call_pitch", "calls") && hasFeature("clients") && !isDemo && callPitch}
    {show("financial_chart", institute ? "institute" : "invoices") && <section className={panel}><h2 className="font-bold">{t("admin_dashboard.financial_overview")}</h2><div className="h-64 mt-4"><ResponsiveContainer width="100%" height="100%"><AreaChart data={operations.feeRevenue || data.revenueData || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tickFormatter={label => dashboardDateLabel(String(label), language)} /><YAxis /><Tooltip labelFormatter={label => dashboardDateLabel(String(label), language)} formatter={value => money(Number(value))} /><Legend /><Area dataKey="revenue" name={t("admin_dashboard.revenue")} stroke="#10b981" fill="#10b981" fillOpacity={0.15} /><Area dataKey="expenses" name={t("admin_dashboard.expenses")} stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} /></AreaChart></ResponsiveContainer></div></section>}
    {charts.length > 0 && <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{charts.map(chart => <OverviewChart key={chart.key} title={chart.title} data={chart.data || []} href={chart.href} money={chart.money} localizeNames={["lead_stages", "fee_health", "task_health"].includes(chart.key)} />)}</div>}
    {show("source_conversion", "leads") && <section className={panel}><h2 className="font-bold">{t("Source conversion")}</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Source", "Inquiries", "Converted", "Conversion rate"].map(label => <th key={label} className="p-2">{t(label)}</th>)}</tr></thead><tbody>{operations.sourceConversion?.map(row => <tr key={row.name}><td className="p-2">{row.name}</td><td>{row.total}</td><td>{row.converted}</td><td>{row.rate}%</td></tr>)}</tbody></table>{!operations.sourceConversion?.length && <p className="p-4 text-sm text-[var(--text-secondary)]">{t("No data recorded yet")}</p>}</div></section>}
    {show("projects", "projects") && <section className={panel}><h2 className="font-bold">{t("Project progress")}</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{operations.projectProgress?.map(project => <Link key={project.id} href={`/projects/${project.id}`} className="rounded-lg border border-[var(--border)] p-3"><b>{project.name}</b><p className="text-sm text-[var(--text-secondary)]">{t(project.status)} · {project.progress}%</p><progress value={project.progress} max={100} className="mt-2 w-full" /></Link>)}</div>{!operations.projectProgress?.length && <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("No data recorded yet")}</p>}</section>}
    {show("engagement") && <section className={panel}><h2 className="font-bold">{t("admin_dashboard.team_engagement")}</h2><div className="h-64 mt-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={(data.chartLabels || []).map((name, index) => ({ name, activities: data.activityChart?.[index] || 0, emails: data.emailChart?.[index] || 0, calls: data.callChart?.[index] || 0 }))}><XAxis dataKey="name" tickFormatter={label => dashboardDateLabel(String(label), language)} /><YAxis /><Tooltip labelFormatter={label => dashboardDateLabel(String(label), language)} /><Legend /><Bar dataKey="activities" name={t("admin_dashboard.total_activities")} fill="#6366f1" />{hasFeature("email_agent") && <Bar dataKey="emails" name={t("admin_dashboard.emails_sent")} fill="#10b981" />}{hasFeature("calls") && <Bar dataKey="calls" name={t("admin_dashboard.calls_made")} fill="#f59e0b" />}</BarChart></ResponsiveContainer></div></section>}
    {show("recent_activity") && <section className={panel}><h2 className="font-bold">{t("admin_dashboard.recent_activity")}</h2><ul className="mt-3 divide-y divide-[var(--border)]">{data.recentActivities?.map(activity => <li key={activity.id} className="py-3"><b className="text-sm">{activity.action}</b><p className="text-sm text-[var(--text-secondary)]">{activity.content}</p><time className="text-xs text-[var(--text-secondary)]">{activity.createdAt ? new Date(activity.createdAt).toLocaleString(language) : ""}</time></li>)}</ul>{!data.recentActivities?.length && <p className="mt-3 text-sm">{t("admin_dashboard.no_activities")}</p>}</section>}
  </div>;
}
