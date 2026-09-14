"use client";

import { useState } from "react";
import { Zap, Plus, Settings2, Play, Save, ChevronRight, MessageSquare, Mail, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AutomationsPage() {
  const [automations, setAutomations] = useState([
    { id: 1, name: "Stale Lead Follow-up", active: true, trigger: "Lead in 'Contacted' for 3 days", action: "Send AI Email" },
    { id: 2, name: "New Client Onboarding", active: false, trigger: "Deal Closed Won", action: "Create Project & Notify Team" }
  ]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 min-h-[calc(100vh-64px)]">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Zap className="w-8 h-8 text-amber-500" />
            Workflow Automations
          </h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-zinc-400">Build rules that trigger actions automatically to save time.</p>
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-medium shadow-sm transition-all">
          <Plus className="w-4 h-4" />
          Create Automation
        </button>
      </div>

      {/* Coming Soon Banner */}
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 shadow-inner relative overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-50" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(156, 163, 175, 0.2) 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
        <div className="relative z-10 flex flex-col items-center text-center max-w-lg space-y-4">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mb-2">
            <Zap className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Coming Soon</h2>
          <p className="text-slate-500 dark:text-zinc-400 text-lg">
            Our powerful Workflow Automation Engine is currently under development. Soon, you'll be able to build custom rules that trigger actions automatically across your entire CRM.
          </p>
          <div className="mt-8 px-6 py-3 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm text-sm font-bold text-slate-700 dark:text-zinc-300">
            Expected Rollout: Q4 2026
          </div>
        </div>
      </div>
    </div>
  );
}
