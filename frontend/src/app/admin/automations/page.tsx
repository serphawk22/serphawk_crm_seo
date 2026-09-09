"use client";

import { useState } from "react";
import { Zap, Plus, Settings2, Play, Save, ChevronRight, MessageSquare, Mail, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";

export default function AutomationsPage() {
  const { t } = useLanguage();
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
            {t("automations.title")}
          </h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-zinc-400">{t("automations.subtitle")}</p>
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-medium shadow-sm transition-all">
          <Plus className="w-4 h-4" />
          {t("automations.create_automation")}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Automations List */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="font-semibold text-slate-800 dark:text-zinc-200">{t("automations.active_rules")}</h2>
          {automations.map(auto => (
            <div key={auto.id} className={cn("p-4 rounded-xl border cursor-pointer transition-all hover:border-indigo-300 dark:hover:border-indigo-500/50", auto.active ? "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800" : "bg-slate-50 dark:bg-zinc-900/50 border-slate-100 dark:border-zinc-800/50 opacity-75")}>
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-slate-800 dark:text-zinc-200">{auto.name}</span>
                <div className={cn("w-10 h-5 rounded-full relative transition-colors", auto.active ? "bg-emerald-500" : "bg-slate-300 dark:bg-zinc-700")}>
                  <div className={cn("w-3 h-3 bg-white rounded-full absolute top-1 transition-all", auto.active ? "left-6" : "left-1")} />
                </div>
              </div>
              <div className="text-xs text-slate-500 dark:text-zinc-400 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Play className="w-3.5 h-3.5 text-blue-500" /> {auto.trigger}
                </div>
                <div className="flex items-center gap-2">
                  <Settings2 className="w-3.5 h-3.5 text-amber-500" /> {auto.action}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Builder Canvas (Mockup) */}
        <div className="lg:col-span-2">
          <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 min-h-[500px] flex flex-col items-center shadow-inner relative overflow-hidden">
            
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 z-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(156, 163, 175, 0.2) 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
            
            <div className="relative z-10 w-full max-w-md space-y-6">
              
              {/* Trigger Node */}
              <div className="bg-white dark:bg-zinc-900 border-2 border-blue-200 dark:border-blue-900/50 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                    <Play className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="font-bold text-slate-800 dark:text-zinc-200 uppercase text-xs tracking-wider">{t("automations.trigger")}</span>
                </div>
                <select className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-zinc-300 outline-none">
                  <option>{t("automations.trigger_when_status")}</option>
                  <option>{t("automations.trigger_when_closed")}</option>
                  <option>{t("automations.trigger_when_email")}</option>
                </select>
              </div>

              <div className="flex justify-center">
                <ChevronRight className="w-6 h-6 text-slate-300 dark:text-zinc-700 rotate-90" />
              </div>

              {/* Action Node */}
              <div className="bg-white dark:bg-zinc-900 border-2 border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="font-bold text-slate-800 dark:text-zinc-200 uppercase text-xs tracking-wider">{t("automations.action")}</span>
                </div>
                <select className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-zinc-300 outline-none">
                  <option>{t("automations.send_ai_email")}</option>
                  <option>{t("automations.create_project")}</option>
                  <option>{t("automations.send_slack")}</option>
                </select>
              </div>

              {/* Add Node Button */}
              <div className="flex justify-center mt-4">
                <button className="w-10 h-10 rounded-full bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors text-slate-600 dark:text-zinc-400 border-2 border-white dark:border-zinc-900 shadow-sm">
                  <Plus className="w-5 h-5" />
                </button>
              </div>

            </div>

            <div className="absolute bottom-6 right-6 z-10 flex gap-3">
              <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-all flex items-center gap-2">
                <Save className="w-4 h-4" />
                {t("automations.save_workflow")}
              </button>
            </div>
            
          </div>
        </div>

      </div>
    </div>
  );
}
