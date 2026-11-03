"use client";
import LocalizedText from "@/components/LocalizedText";
import { useLanguage } from "@/context/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

import { Briefcase, Phone, CheckCircle2, Sparkles, Loader2, ChevronUp, ChevronDown, Bot, X, Zap, Mail, Globe, Trophy, Lightbulb } from "lucide-react";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";

import OperationsDashboard, { OverviewStats } from "@/components/OperationsDashboard";

// ─── Agent Data Pretty Viewer ──────────────────────────────────────────────────
function AgentDataViewer({ data, overview }: { data?: string | null; overview?: string | null }) {
  const { t } = useLanguage();
  let parsed: any = null;
  if (data) {
    try { parsed = typeof data === "string" ? JSON.parse(data) : data; } catch {}
  }

  if (!parsed && !overview) {
    return <p className="text-sm text-[var(--text-secondary)] italic"><LocalizedText text={"No agent data available for this lead."} /></p>;
  }

  const Section = ({ title, icon, children }: any) => (
    <div className="mb-4">
      <h5 className="text-xs font-black uppercase tracking-widest text-indigo-500 flex items-center gap-1.5 mb-2">{icon}{title}</h5>
      {children}
    </div>
  );

  const Tag = ({ label }: { label: string }) => (
    <span className="inline-block bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold px-2 py-0.5 rounded-md mr-1.5 mb-1">{label}</span>
  );

  return (
    <div className="bg-white/60 dark:bg-black/20 rounded-xl p-4 space-y-3 text-sm">
      {/* Overview */}
      {(overview || parsed?.company_overview) && (
        <Section title={t("Company Overview")} icon={<Globe className="w-3 h-3" />}>
          <p className="text-[var(--text-secondary)] leading-relaxed">{overview || parsed.company_overview}</p>
        </Section>
      )}

      {/* Industry & Business Model */}
      {(parsed?.industry || parsed?.business_model) && (
        <Section title={t("Business")} icon={<Briefcase className="w-3 h-3" />}>
          {parsed.industry && <p className="text-[var(--text-secondary)]"><span className="font-semibold text-[var(--text-primary)]"><LocalizedText text={"Industry:"} /></span> {parsed.industry}</p>}
          {parsed.business_model && <p className="text-[var(--text-secondary)] mt-1"><span className="font-semibold text-[var(--text-primary)]"><LocalizedText text={"Model:"} /></span> {parsed.business_model}</p>}
          {parsed.company_size_estimate && <p className="text-[var(--text-secondary)] mt-1"><span className="font-semibold text-[var(--text-primary)]"><LocalizedText text={"Size:"} /></span> {parsed.company_size_estimate}</p>}
        </Section>
      )}

      {/* Key Weaknesses & Opportunities */}
      {(parsed?.key_weaknesses?.length || parsed?.biggest_opportunities?.length) && (
        <Section title={t("Insights")} icon={<Lightbulb className="w-3 h-3" />}>
          {parsed.key_weaknesses?.length > 0 && (
            <div className="mb-2">
              <p className="text-[11px] font-bold text-red-500 uppercase mb-1"><LocalizedText text={"Weaknesses"} /></p>
              {parsed.key_weaknesses.map((w: string, i: number) => <p key={i} className="text-[var(--text-secondary)] text-xs flex gap-1.5"><span className="text-red-400 shrink-0">•</span>{w}</p>)}
            </div>
          )}
          {parsed.biggest_opportunities?.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-emerald-500 uppercase mb-1"><LocalizedText text={"Opportunities"} /></p>
              {parsed.biggest_opportunities.map((o: string, i: number) => <p key={i} className="text-[var(--text-secondary)] text-xs flex gap-1.5"><span className="text-emerald-400 shrink-0">•</span>{o}</p>)}
            </div>
          )}
        </Section>
      )}

      {/* SerpHawk Opportunity */}
      {parsed?.serphawk_opportunity && (
        <Section title={t("SerpHawk Opportunity")} icon={<Trophy className="w-3 h-3" />}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg font-black text-indigo-600">{parsed.serphawk_opportunity.fit_score}/10</span>
            <span className="text-xs text-[var(--text-secondary)]"><LocalizedText text={"Fit Score"} /></span>
            {parsed.serphawk_opportunity.estimated_deal_value && (
              <span className="ml-auto text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md">{parsed.serphawk_opportunity.estimated_deal_value}</span>
            )}
          </div>
          <p className="text-[var(--text-secondary)] text-xs italic mb-2">{parsed.serphawk_opportunity.pitch_angle}</p>
          {parsed.serphawk_opportunity.recommended_services?.length > 0 && (
            <div className="flex flex-wrap">{parsed.serphawk_opportunity.recommended_services.map((s: string, i: number) => <Tag key={i} label={s} />)}</div>
          )}
        </Section>
      )}

      {/* Contacts */}
      {parsed?.contacts?.length > 0 && parsed.contacts[0]?.phone_number && (
        <Section title={t("Contacts")} icon={<Phone className="w-3 h-3" />}>
          {parsed.contacts.filter((c: any) => c.phone_number || c.email).map((c: any, i: number) => (
            <div key={i} className="text-[var(--text-secondary)] text-xs space-y-0.5">
              {c.phone_number && <p><span className="font-semibold text-[var(--text-primary)]"><LocalizedText text={"Phone:"} /></span> {c.phone_number}</p>}
              {c.email && <p><span className="font-semibold text-[var(--text-primary)]"><LocalizedText text={"Email:"} /></span> {c.email}</p>}
            </div>
          ))}
        </Section>
      )}

      {/* GTM Quick Wins */}
      {parsed?.gtm_recommendations?.quick_wins?.length > 0 && (
        <Section title={t("Quick Wins")} icon={<Zap className="w-3 h-3" />}>
          {parsed.gtm_recommendations.quick_wins.map((w: string, i: number) => (
            <p key={i} className="text-[var(--text-secondary)] text-xs flex gap-1.5"><span className="text-amber-400 shrink-0">⚡</span>{w}</p>
          ))}
        </Section>
      )}

      {/* Draft email */}
      {parsed?.draft?.english_body && (
        <Section title={t("Suggested Email Draft")} icon={<Mail className="w-3 h-3" />}>
          <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-lg p-3 text-xs text-[var(--text-secondary)] whitespace-pre-line">
            <p className="font-bold text-[var(--text-primary)] mb-1"><LocalizedText text={"Subject:"} /> {parsed.draft.subject}</p>
            {parsed.draft.english_body}
          </div>
        </Section>
      )}
    </div>
  );
}

// Data comes from adminStats from the backend

export function AdminDashboard({ adminStats, isDemo }: { adminStats: OverviewStats | null; NAV_CARDS?: unknown; language?: string; isDemo?: boolean }) {
  return <OperationsDashboard stats={adminStats} isDemo={isDemo} callPitch={<CallPitchWidget />} />;
}

export function CallPitchWidget() {
  const { user } = useRole();
  const [pitchData, setPitchData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [markingDone, setMarkingDone] = useState(false);
  const { t } = useLanguage();
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [isAgentDataExpanded, setIsAgentDataExpanded] = useState(false);

  const fetchPitch = async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (user?.id) headers["X-User-ID"] = String(user.id);
      const res = await fetch(`${API_BASE_URL}/dashboard-call-pitch`, { headers });
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
  }, [user?.id]);

  const handleDoneClick = () => {
    setIsFeedbackOpen(true);
  };

  const handleSubmitFeedback = async () => {
    if (!pitchData?.client?.id || !feedbackText.trim()) return;
    setMarkingDone(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user?.id) headers["X-User-ID"] = String(user.id);
      await fetch(`${API_BASE_URL}/dashboard-call-pitch/${pitchData.client.id}/done`, { 
        method: "POST",
        headers,
        body: JSON.stringify({ feedback: feedbackText })
      });
      setIsFeedbackOpen(false);
      setFeedbackText("");
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
    <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl shadow-sm p-6 relative overflow-hidden">
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
          <button 
            onClick={() => setIsAgentDataExpanded(!isAgentDataExpanded)}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-500 hover:text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            {isAgentDataExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {isAgentDataExpanded ? t("Hide Agent Data") : t("Expand Agent Data")}
          </button>
        </div>
        
        <button 
          onClick={handleDoneClick}
          disabled={markingDone}
          className="shrink-0 flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-3 rounded-lg font-bold shadow-md transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {markingDone ? <Loader2 className="w-5 h-5 animate-spin" /> : <Phone className="w-5 h-5" />}
          <LocalizedText text={"I made this call"} />{" "}</button>
      </div>

      <AnimatePresence>
        {isAgentDataExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }} 
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-6"
          >
            <div className="pt-4 border-t border-indigo-500/10">
              <h4 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-500" />
                <LocalizedText text={"Related Agent Data"} />{" "}</h4>
              <AgentDataViewer data={pitchData.agent_data} overview={pitchData.deep_research} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFeedbackOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="p-5 border-b border-[var(--border)] flex justify-between items-center">
                <h3 className="font-bold text-lg text-[var(--text-primary)]"><LocalizedText text={"Call Outcome Feedback"} /></h3>
                <button onClick={() => setIsFeedbackOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5">
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  <LocalizedText text={"Please provide a brief summary of how the call went before marking it as done. This helps us refine future pitches!"} />{" "}</p>
                <textarea
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  placeholder={t("e.g., Left voicemail, interested but needs time...")}
                  className="w-full h-32 p-3 bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                />
              </div>
              <div className="p-4 border-t border-[var(--border)] bg-slate-50 dark:bg-zinc-800/20 flex justify-end gap-3">
                <button 
                  onClick={() => setIsFeedbackOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                >
                  <LocalizedText text={"Cancel"} /> </button>
                <button 
                  onClick={handleSubmitFeedback}
                  disabled={markingDone || !feedbackText.trim()}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {markingDone ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <LocalizedText text={"Submit & Mark Done"} />{" "}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
