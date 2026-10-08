"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mic, PhoneCall, MessageCircleQuestion, BookOpen, Loader2, Activity, Target, AlertTriangle, AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";
import { voiceAgentApi, errorText, VoiceAgentOptions, VoiceAgentStats, VoicePitch } from "@/lib/voiceAgentApi";
import { ToastContainer, useToasts, cardCls } from "@/components/voice-agent/shared";
import PitchStudio from "@/components/voice-agent/PitchStudio";
import CallConsole from "@/components/voice-agent/CallConsole";
import FollowUps from "@/components/voice-agent/FollowUps";
import KnowledgeBase from "@/components/voice-agent/KnowledgeBase";

type Tab = "studio" | "calls" | "followups" | "knowledge";

export default function VoiceAgentPage() {
  const { toasts, notify, remove } = useToasts();
  const [tab, setTab] = useState<Tab>("studio");
  const [options, setOptions] = useState<VoiceAgentOptions | null>(null);
  const [stats, setStats] = useState<VoiceAgentStats | null>(null);
  const [error, setError] = useState("");
  const [callPitch, setCallPitch] = useState<VoicePitch | null>(null);

  const loadStats = useCallback(() => { voiceAgentApi.stats().then(setStats).catch(() => {}); }, []);

  useEffect(() => {
    voiceAgentApi.options().then(setOptions).catch((e) => setError(errorText(e, "Failed to load the voice agent")));
    loadStats();
    const t = setInterval(loadStats, 15000);
    return () => clearInterval(t);
  }, [loadStats]);

  const startCallWith = useCallback((p: VoicePitch) => { setCallPitch(p); setTab("calls"); }, []);
  const clearCallPitch = useCallback(() => setCallPitch(null), []);

  const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "studio", label: "Pitch Studio", icon: Mic },
    { id: "calls", label: "Live Calls", icon: PhoneCall, badge: stats?.active_calls || 0 },
    { id: "followups", label: "Follow-ups", icon: MessageCircleQuestion, badge: (stats?.open_follow_ups || 0) + (stats?.escalated || 0) },
    { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
  ];

  const statCards = [
    { label: "Total AI calls", value: stats?.total_calls ?? "—", icon: PhoneCall, cls: "text-violet-600 bg-violet-50" },
    { label: "Live now", value: stats?.active_calls ?? "—", icon: Activity, cls: "text-emerald-600 bg-emerald-50" },
    { label: "Avg. interest", value: stats?.avg_interest != null ? `${stats.avg_interest}%` : "—", icon: Target, cls: "text-sky-600 bg-sky-50" },
    { label: "Need follow-up", value: stats ? stats.open_follow_ups + stats.escalated : "—", icon: AlertTriangle, cls: "text-amber-600 bg-amber-50" },
  ];

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-[1700px] mx-auto">
      <ToastContainer toasts={toasts} onRemove={remove} />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white"><AudioLines className="w-6 h-6" /></span>
            AI Voice Caller
          </h1>
          <p className="text-sm text-slate-500 mt-2 font-medium">Turn pitches into natural speech, let the AI call prospects, handle their questions and objections — and jump in whenever you want.</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className={cn(cardCls, "p-4 flex items-center gap-3")}>
            <div className={cn("p-2.5 rounded-xl", s.cls)}><s.icon className="w-5 h-5" /></div>
            <div><p className="text-2xl font-black text-slate-800 dark:text-white">{s.value}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p></div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 dark:bg-zinc-900 rounded-2xl w-fit">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
              tab === t.id ? "bg-white dark:bg-zinc-800 text-violet-700 dark:text-violet-300 shadow-sm" : "text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200")}>
            <t.icon className="w-4 h-4" /> {t.label}
            {!!t.badge && <span className="text-[10px] font-black bg-violet-600 text-white rounded-full px-1.5 py-0.5">{t.badge}</span>}
          </button>
        ))}
      </div>

      {error ? (
        <div className="p-6 rounded-2xl bg-red-50 text-red-700 font-bold">{error}</div>
      ) : !options ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-violet-500" /></div>
      ) : (
        <>
          {/* Keep the studio and console mounted so in-progress work and polling survive tab switches. */}
          <div className={tab === "studio" ? "" : "hidden"}><PitchStudio options={options} notify={notify} onStartCall={startCallWith} onPitchesChanged={loadStats} /></div>
          <div className={tab === "calls" ? "" : "hidden"}><CallConsole options={options} notify={notify} requestedPitch={callPitch} onRequestHandled={clearCallPitch} /></div>
          {tab === "followups" && <FollowUps notify={notify} onChanged={loadStats} />}
          {tab === "knowledge" && <KnowledgeBase notify={notify} />}
        </>
      )}
    </div>
  );
}
