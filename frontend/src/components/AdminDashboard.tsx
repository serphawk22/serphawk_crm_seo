"use client";

import { motion } from "framer-motion";
import { Users, Send, Briefcase, Target, Activity, Phone, GraduationCap, ArrowUpRight, CheckCircle2, TrendingUp, DollarSign, Timer, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { cn } from "@/lib/utils";

const revenueData = [
  { name: 'Jan', revenue: 4000, expenses: 2400 },
  { name: 'Feb', revenue: 3000, expenses: 1398 },
  { name: 'Mar', revenue: 2000, expenses: 9800 },
  { name: 'Apr', revenue: 2780, expenses: 3908 },
  { name: 'May', revenue: 1890, expenses: 4800 },
  { name: 'Jun', revenue: 2390, expenses: 3800 },
  { name: 'Jul', revenue: 3490, expenses: 4300 },
];

const pipelineData = [
  { stage: 'Prospecting', count: 12 },
  { stage: 'Qualification', count: 8 },
  { stage: 'Proposal', count: 5 },
  { stage: 'Negotiation', count: 3 },
  { stage: 'Closed Won', count: 15 },
];

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } }
};

export function AdminDashboard({ adminStats, NAV_CARDS, language }: any) {
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto w-full">
      {/* HEADER SECTION */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Operations Dashboard</h1>
          <p className="text-sm font-medium text-[var(--text-secondary)] mt-1">
            Overview of revenue, pipeline, and team performance.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] rounded-md shadow-sm text-sm font-semibold hover:bg-[var(--sidebar-hover)] transition-colors">
            Generate Report
          </button>
          <Link href="/clients" className="px-4 py-2 bg-[var(--primary)] text-white rounded-md shadow-sm text-sm font-semibold hover:bg-[var(--primary-hover)] transition-colors">
            Add New Client
          </Link>
        </div>
      </motion.div>

      {/* KPI METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total Revenue", value: "$45,231", trend: "+20.1% from last month", icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
          { title: "Active Clients", value: adminStats?.total || 0, trend: "+4 new this week", icon: Users, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-500/10" },
          { title: "Pipeline Value", value: "$124,500", trend: "12 active deals", icon: Target, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-500/10" },
          { title: "Pending Tasks", value: adminStats?.pending || 0, trend: "Requires attention", icon: Timer, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-500/10" },
        ].map((kpi, idx) => (
          <motion.div key={idx} variants={itemVariants} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex items-center gap-4">
            <div className={`p-3 rounded-xl ${kpi.bg}`}>
              <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">{kpi.title}</p>
              <h3 className="text-2xl font-bold text-[var(--text-primary)] leading-none">{kpi.value}</h3>
              <p className="text-[11px] font-medium text-[var(--text-secondary)] mt-2">{kpi.trend}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* MAIN CONTENT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* REVENUE CHART (Spans 2 columns) */}
        <motion.div variants={itemVariants} className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm flex flex-col">
          <div className="p-5 border-b border-[var(--border)] flex justify-between items-center">
            <h3 className="font-bold text-[var(--text-primary)]">Revenue Overview</h3>
            <select className="bg-[var(--background)] border border-[var(--border)] rounded-md text-xs px-2 py-1 text-[var(--text-primary)] outline-none focus:border-[var(--primary)]">
              <option>Last 6 Months</option>
              <option>This Year</option>
            </select>
          </div>
          <div className="p-5 flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* PIPELINE FUNNEL */}
        <motion.div variants={itemVariants} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm flex flex-col">
          <div className="p-5 border-b border-[var(--border)]">
            <h3 className="font-bold text-[var(--text-primary)]">Sales Pipeline</h3>
          </div>
          <div className="p-5 flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={pipelineData} margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" hide />
                <YAxis dataKey="stage" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                <Tooltip cursor={{ fill: 'var(--sidebar-hover)' }} contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px' }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* RECENT ACTIVITY */}
        <motion.div variants={itemVariants} className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm">
          <div className="p-5 border-b border-[var(--border)] flex justify-between items-center">
            <h3 className="font-bold text-[var(--text-primary)]">Recent Activity</h3>
            <Link href="/email-agent" className="text-xs font-semibold text-[var(--primary)] hover:underline">View All</Link>
          </div>
          <div className="p-0">
            {(adminStats?.recentActivities?.length ?? 0) === 0 ? (
              <div className="p-8 text-center text-[var(--text-secondary)]">No activities yet.</div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {adminStats.recentActivities.slice(0, 5).map((act: any) => (
                  <div key={act.id} className="p-4 flex gap-4 hover:bg-[var(--sidebar-hover)] transition-colors">
                    <div className="w-8 h-8 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center shrink-0">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{act.action}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">{act.content}</p>
                      <p className="text-[10px] text-[var(--text-secondary)]/70 mt-1 font-medium">{act.createdAt ? new Date(act.createdAt).toLocaleString() : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* QUICK LINKS GRID */}
        <motion.div variants={itemVariants} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm h-max">
           <div className="p-5 border-b border-[var(--border)]">
            <h3 className="font-bold text-[var(--text-primary)]">Quick Links</h3>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
             {NAV_CARDS.filter((c: any) => c.roles.includes("Admin")).slice(0, 6).map((card: any) => (
                <Link key={card.href} href={card.href} className="p-4 border border-[var(--border)] rounded-xl hover:border-[var(--primary)] hover:bg-[var(--sidebar-hover)] transition-all group flex flex-col items-center text-center gap-2">
                  <card.icon className="w-5 h-5 text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors" />
                  <span className="text-xs font-bold text-[var(--text-primary)]">{card.title}</span>
                </Link>
             ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
