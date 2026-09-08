"use client";

import { motion } from "framer-motion";
import { Users, Send, Briefcase, Target, Activity, Phone, GraduationCap, ArrowUpRight, CheckCircle2, TrendingUp, DollarSign, Timer, AlertTriangle, Sparkles, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { cn } from "@/lib/utils";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { useLanguage } from "@/context/LanguageContext";
import { ShieldAlert, LockKeyhole } from "lucide-react";

// Data comes from adminStats from the backend
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } }
};

export function AdminDashboard({ adminStats, NAV_CARDS, language, isDemo }: any) {
  const { role, user } = useRole();
  const { t } = useLanguage();
  const [users, setUsers] = useState<any[]>([]);
  const [myClients, setMyClients] = useState<any[]>([]);
  const [myLeads, setMyLeads] = useState<any[]>([]);
  const [upgradeRequested, setUpgradeRequested] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const email = user?.email || "";
      const res = await fetch(`${API_BASE_URL}/demo/request-upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (res.ok) setUpgradeRequested(true);
    } catch (e) {}
    setUpgrading(false);
  };

  useEffect(() => {
    fetch(`${API_BASE_URL}/users`).then(r => r.json()).then(d => setUsers(d.users || []));
    if (role === 'SalesManager' || role === 'Employee' || role === 'Admin' || role === 'Demo') {
      fetch(`${API_BASE_URL}/clients`).then(r => r.json()).then(d => {
        const list = d.clients || [];
        setMyClients(list);
      });
      fetch(`${API_BASE_URL}/leads`).then(r => r.json()).then(d => {
        setMyLeads(d.leads || []);
      });
    }
  }, [role]);

  const salesTeam = users.filter(u => ['Admin', 'SalesManager', 'Employee'].includes(u.role));
  const devTeam = users.filter(u => ['ProjectMember', 'Intern'].includes(u.role));
  const isSales = role === 'SalesManager' || role === 'Employee' || role === 'Admin' || role === 'Demo';

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto w-full">
      {/* DEMO BANNER */}
      {isDemo && (
        <motion.div variants={itemVariants} className="bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-rose-500/20 border border-amber-500/30 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <ShieldAlert className="w-6 h-6 text-amber-600 dark:text-amber-500" />
            </div>
            <div>
              <h3 className="font-bold text-amber-800 dark:text-amber-500 text-sm tracking-wide uppercase">{t("admin_dashboard.demo_banner_title")}</h3>
              <p className="text-sm font-medium text-amber-700/80 dark:text-amber-500/80">{t("admin_dashboard.demo_banner_desc")}</p>
            </div>
          </div>
          {!upgradeRequested ? (
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="shrink-0 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-lg transition-all text-sm flex items-center gap-2"
            >
              {upgrading ? t("admin_dashboard.sending") : t("admin_dashboard.request_full_access")}
              {!upgrading && <LockKeyhole className="w-4 h-4" />}
            </button>
          ) : (
            <div className="shrink-0 px-6 py-2.5 bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold rounded-xl text-sm">
              ✓ {t("admin_dashboard.upgrade_sent")}
            </div>
          )}
        </motion.div>
      )}

      {/* HEADER SECTION */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("admin_dashboard.title")}</h1>
          <p className="text-sm font-medium text-[var(--text-secondary)] mt-1">
            {t("admin_dashboard.subtitle")}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/clients" className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-sm text-sm font-bold hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center gap-2">
            <Plus className="w-4 h-4" /> {t("admin_dashboard.add_new_client")}
          </Link>
        </div>
      </motion.div>

      {/* KPI METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: t("admin_dashboard.kpi_total_revenue"), value: adminStats?.revenue != null ? `$${adminStats.revenue.toLocaleString()}` : "$0", trend: t("admin_dashboard.kpi_trend_revenue"), icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
          { title: t("admin_dashboard.kpi_active_clients"), value: adminStats?.total || 0, trend: t("admin_dashboard.kpi_trend_clients"), icon: Users, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-500/10" },
          { title: t("admin_dashboard.kpi_pipeline_value"), value: adminStats?.pipelineValue != null ? `$${adminStats.pipelineValue.toLocaleString()}` : "$0", trend: t("admin_dashboard.kpi_trend_pipeline"), icon: Target, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-500/10" },
          { title: t("admin_dashboard.kpi_pending_tasks"), value: adminStats?.pending || 0, trend: t("admin_dashboard.kpi_trend_pending"), icon: Timer, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-500/10" },
        ].map((kpi, idx) => (
          <motion.div key={idx} variants={itemVariants} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex items-center gap-4">
            <div className={`p-3 rounded-xl ${kpi.bg}`}>
              <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1">{kpi.title}</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{kpi.value}</h3>
              <p className="text-[11px] font-medium text-slate-400 dark:text-zinc-500 mt-2">{kpi.trend}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* CALL PITCH WIDGET */}
      <CallPitchWidget />

      {/* QUICK LINKS GRID */}
      <motion.div variants={itemVariants} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm h-max">
        <div className="p-5 border-b border-[var(--border)]">
          <h3 className="font-bold text-[var(--text-primary)]">{t("admin_dashboard.quick_links")}</h3>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {NAV_CARDS.filter((c: any) => c.roles.includes(role || "Admin") && !c.title.includes("Pipeline")).map((card: any) => (
            <Link key={card.href} href={card.href} className="p-4 border border-[var(--border)] rounded-xl hover:border-[var(--primary)] hover:bg-[var(--sidebar-hover)] transition-all group flex flex-col items-center justify-center text-center gap-3">
              <card.icon className="w-7 h-7 text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors" />
              <span className="text-xs font-bold text-[var(--text-primary)]">{card.title}</span>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* FINANCIAL & PIPELINE CHARTS */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* REVENUE CHART */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden flex flex-col h-[400px]">
          <div className="p-5 border-b border-[var(--border)] flex justify-between items-center bg-[var(--sidebar-hover)]/30">
            <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500"/> {t("admin_dashboard.financial_overview")}
            </h3>
            <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-500/10 text-emerald-600 rounded-md">{t("admin_dashboard.last_6_months")}</span>
          </div>
          <div className="p-5 flex-1 w-full h-full min-h-0">
            {adminStats?.revenueData?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={adminStats.revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} tickFormatter={(val) => `$${val/1000}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 'bold' }} 
                    itemStyle={{ color: 'var(--text-primary)' }}
                    formatter={(value: any) => [`$${value.toLocaleString()}`, '']}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                  <Area type="monotone" dataKey="revenue" name={t("admin_dashboard.revenue")} stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                  <Area type="monotone" dataKey="expenses" name={t("admin_dashboard.expenses")} stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-secondary)]">
                <AlertTriangle className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">{t("admin_dashboard.no_financial_data")}</p>
              </div>
            )}
          </div>
        </div>

        {/* PIPELINE CHART */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden flex flex-col h-[400px]">
          <div className="p-5 border-b border-[var(--border)] flex justify-between items-center bg-[var(--sidebar-hover)]/30">
            <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-500"/> {t("admin_dashboard.sales_pipeline")}
            </h3>
            <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-500/10 text-indigo-600 rounded-md">{t("admin_dashboard.active_deals")}</span>
          </div>
          <div className="p-5 flex-1 w-full h-full min-h-0">
            {adminStats?.pipelineData?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={adminStats.pipelineData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border)" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                  <YAxis dataKey="stage" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-primary)', fontWeight: 600 }} width={90} />
                  <Tooltip 
                    cursor={{ fill: 'var(--sidebar-hover)' }}
                    contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 'bold' }} 
                  />
                  <Bar dataKey="count" name={t("admin_dashboard.deals")} fill="#6366f1" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-secondary)]">
                <AlertTriangle className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">{t("admin_dashboard.no_pipeline_data")}</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* TEAM ENGAGEMENT & ACTIVITY */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ENGAGEMENT CHART (Takes 2 columns) */}
        <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden flex flex-col h-[350px]">
          <div className="p-5 border-b border-[var(--border)] flex justify-between items-center bg-[var(--sidebar-hover)]/30">
            <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500"/> {t("admin_dashboard.team_engagement")}
            </h3>
            <span className="text-xs font-semibold px-2.5 py-1 bg-blue-500/10 text-blue-600 rounded-md">{t("admin_dashboard.last_7_days")}</span>
          </div>
          <div className="p-5 flex-1 w-full h-full min-h-0">
            {adminStats?.chartLabels?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={adminStats.chartLabels.map((label: string, i: number) => ({
                  name: label,
                  activities: adminStats.activityChart?.[i] || 0,
                  emails: adminStats.emailChart?.[i] || 0,
                  calls: adminStats.callChart?.[i] || 0
                }))} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAct" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 'bold' }} 
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Area type="monotone" dataKey="activities" name={t("admin_dashboard.total_activities")} stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorAct)" />
                  <Area type="step" dataKey="emails" name={t("admin_dashboard.emails_sent")} stroke="#f59e0b" strokeWidth={2} fill="transparent" strokeDasharray="4 4" />
                  <Area type="step" dataKey="calls" name={t("admin_dashboard.calls_made")} stroke="#8b5cf6" strokeWidth={2} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-secondary)]">
                <AlertTriangle className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">{t("admin_dashboard.no_activity_data")}</p>
              </div>
            )}
          </div>
        </div>

        {/* RECENT ACTIVITY LIST (Takes 1 column) */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm flex flex-col h-[350px] overflow-hidden">
          <div className="p-5 border-b border-[var(--border)] flex justify-between items-center bg-[var(--sidebar-hover)]/30 shrink-0">
            <h3 className="font-bold text-[var(--text-primary)]">{t("admin_dashboard.recent_activity")}</h3>
            <Link href="/email-agent" className="text-xs font-semibold text-[var(--primary)] hover:underline">{t("admin_dashboard.view_all")}</Link>
          </div>
          <div className="overflow-y-auto flex-1">
            {(adminStats?.recentActivities?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] opacity-60 p-8 text-center">
                <Timer className="w-8 h-8 mb-2" />
                <p className="text-sm">{t("admin_dashboard.no_activities")}</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {adminStats.recentActivities.slice(0, 10).map((act: any) => (
                  <div key={act.id} className="p-4 flex gap-4 hover:bg-[var(--sidebar-hover)] transition-colors">
                    <div className="w-8 h-8 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center shrink-0 mt-0.5">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">{act.action}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed">{act.content}</p>
                      <p className="text-[10px] text-[var(--text-secondary)]/60 mt-1.5 font-semibold uppercase tracking-wider">{act.createdAt ? new Date(act.createdAt).toLocaleString() : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function CallPitchWidget() {
  const [pitchData, setPitchData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [markingDone, setMarkingDone] = useState(false);
  const { t } = useLanguage();

  const fetchPitch = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard-call-pitch`);
      if (res.ok) {
        const data = await res.json();
        setPitchData(data);
      }
    } catch (e) {
      console.error("Failed to fetch call pitch", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPitch();
  }, []);

  const handleDone = async () => {
    if (!pitchData?.client?.id) return;
    setMarkingDone(true);
    try {
      await fetch(`${API_BASE_URL}/dashboard-call-pitch/${pitchData.client.id}/done`, { method: "POST" });
      await fetchPitch();
    } catch (e) {
      console.error(e);
    } finally {
      setMarkingDone(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm p-6 mb-6 flex items-center justify-center h-40">
        <Loader2 className="animate-spin text-[var(--primary)] w-6 h-6" />
      </div>
    );
  }

  if (!pitchData?.client) {
    return null;
  }

  return (
    <motion.div variants={itemVariants} className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl shadow-sm p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start md:items-center">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 text-[10px] uppercase tracking-wider font-bold rounded-md flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> {t("admin_dashboard.ai_call_pitch")}
            </span>
            <h3 className="font-bold text-lg text-[var(--text-primary)]">
              {pitchData.client.companyName || pitchData.client.name || t("admin_dashboard.unknown_client")}
            </h3>
          </div>
          
          <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-4 italic font-medium">
            "{pitchData.pitch_text}"
          </p>
          
          <div className="flex gap-4 text-xs font-semibold text-[var(--text-secondary)]">
            <span className="bg-[var(--surface)] px-2 py-1 rounded-md border border-[var(--border)]">
              {t("admin_dashboard.industry")} {pitchData.client.industry || t("admin_dashboard.na")}
            </span>
            <span className="bg-[var(--surface)] px-2 py-1 rounded-md border border-[var(--border)]">
              {t("admin_dashboard.phone")} {pitchData.client.phone || t("admin_dashboard.na")}
            </span>
          </div>
        </div>
        
        <button 
          onClick={handleDone}
          disabled={markingDone}
          className="shrink-0 flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-3 rounded-lg font-bold shadow-md transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {markingDone ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
          {t("admin_dashboard.call_pitch_done")}
        </button>
      </div>
    </motion.div>
  );
}
