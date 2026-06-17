"use client";

import { motion } from "framer-motion";
import { Users, Send, Briefcase, Target, Activity, Phone, GraduationCap, ArrowUpRight, CheckCircle2, TrendingUp, DollarSign, Timer, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { cn } from "@/lib/utils";

// Data comes from adminStats from the backend
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

      {/* QUICK LINKS GRID */}
      <motion.div variants={itemVariants} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm h-max">
        <div className="p-5 border-b border-[var(--border)]">
          <h3 className="font-bold text-[var(--text-primary)]">Quick Links</h3>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {NAV_CARDS.filter((c: any) => c.roles.includes("Admin") && !c.title.includes("Pipeline")).map((card: any) => (
            <Link key={card.href} href={card.href} className="p-4 border border-[var(--border)] rounded-xl hover:border-[var(--primary)] hover:bg-[var(--sidebar-hover)] transition-all group flex flex-col items-center justify-center text-center gap-3">
              <card.icon className="w-7 h-7 text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors" />
              <span className="text-xs font-bold text-[var(--text-primary)]">{card.title}</span>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* RECENT ACTIVITY */}
      <motion.div variants={itemVariants} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm">
        <div className="p-5 border-b border-[var(--border)] flex justify-between items-center">
          <h3 className="font-bold text-[var(--text-primary)]">Recent Activity</h3>
          <Link href="/email-agent" className="text-xs font-semibold text-[var(--primary)] hover:underline">View All</Link>
        </div>
        <div className="p-0">
          {(adminStats?.recentActivities?.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-[var(--text-secondary)]">No activities yet.</div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {adminStats.recentActivities.slice(0, 10).map((act: any) => (
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
    </div>
  );
}
