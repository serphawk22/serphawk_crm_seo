'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, ArrowRight, CheckCircle2, Clock, XCircle, Target, Brain, Mail, Calendar, Wand2, Loader2, Store, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { API_BASE_URL } from '@/config';

interface OpportunitiesTabProps {
  client: any;
  timeline: any[];
  serviceRequests: any[];
  research?: any;
  emails?: any[];
}

const STAGES = ['Lead', 'Qualified', 'Discovery', 'Proposal', 'Negotiation', 'Won', 'Lost'];

const STAGE_CFG: Record<string, { bg: string; text: string; border: string }> = {
  Lead:        { bg: 'bg-slate-100 dark:bg-slate-800',      text: 'text-slate-600 dark:text-slate-400',   border: 'border-slate-300 dark:border-slate-600'   },
  Qualified:   { bg: 'bg-blue-100 dark:bg-blue-900/30',     text: 'text-blue-700 dark:text-blue-400',     border: 'border-blue-300 dark:border-blue-700'     },
  Discovery:   { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-400', border: 'border-violet-300 dark:border-violet-700' },
  Proposal:    { bg: 'bg-amber-100 dark:bg-amber-900/30',   text: 'text-amber-700 dark:text-amber-400',   border: 'border-amber-300 dark:border-amber-700'   },
  Negotiation: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-300 dark:border-orange-700' },
  Won:         { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-700' },
  Lost:        { bg: 'bg-red-100 dark:bg-red-900/30',       text: 'text-red-700 dark:text-red-400',       border: 'border-red-300 dark:border-red-700'       },
};

function getTranslatedStage(stage: string, language: string) {
  if (language === 'es') {
    const map: Record<string, string> = {
      Lead: 'Prospecto', Qualified: 'Calificado', Discovery: 'Descubrimiento',
      Proposal: 'Propuesta', Negotiation: 'Negociación', Won: 'Ganado', Lost: 'Perdido'
    };
    return map[stage] || stage;
  }
  return stage;
}

function StagePipeline({ current, language }: { current: string, language: string }) {
  const currentIdx = STAGES.indexOf(current);
  const isTerminal = current === 'Won' || current === 'Lost';

  return (
    <div className="relative">
      <div className="flex items-center gap-0 overflow-x-auto pb-2">
        {STAGES.filter(s => s !== 'Lost').map((stage, idx) => {
          const active = stage === current;
          const passed = currentIdx > idx && !isTerminal;
          const cfg = STAGE_CFG[stage];
          return (
            <React.Fragment key={stage}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.06 }}
                className={`relative flex items-center justify-center px-3 py-2 rounded-xl text-xs font-bold
                            whitespace-nowrap transition-all flex-shrink-0
                            ${active ? `${cfg.bg} ${cfg.text} ring-2 ring-offset-1 ${cfg.border} shadow-sm` :
                              passed ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-500' :
                              'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-600'}`}
              >
                {passed && <CheckCircle2 size={12} className="mr-1 text-emerald-500" />}
                {getTranslatedStage(stage, language)}
                {active && (
                  <span className="ml-1.5 w-2 h-2 rounded-full bg-current animate-pulse" />
                )}
              </motion.div>
              {idx < STAGES.filter(s => s !== 'Lost').length - 1 && (
                <ArrowRight size={12} className={`flex-shrink-0 mx-0.5 ${passed || active ? 'text-emerald-400' : 'text-slate-300 dark:text-slate-700'}`} />
              )}
            </React.Fragment>
          );
        })}
        {/* Lost option */}
        {current === 'Lost' && (
          <>
            <ArrowRight size={12} className="flex-shrink-0 mx-0.5 text-red-300" />
            <div className="px-3 py-2 rounded-xl text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 ring-2 ring-red-200 dark:ring-red-800 shadow-sm">
              <XCircle size={12} className="inline mr-1" />{getTranslatedStage('Lost', language)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProbabilityBar({ stage, language }: { stage: string, language: string }) {
  const probs: Record<string, number> = {
    Lead: 10, Qualified: 25, Discovery: 40, Proposal: 60, Negotiation: 75, Won: 100, Lost: 0
  };
  const pct = probs[stage] ?? 0;
  const color = pct >= 70 ? 'from-emerald-500 to-teal-500' : pct >= 40 ? 'from-amber-500 to-orange-500' : 'from-slate-400 to-slate-500';
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{language === 'es' ? 'Probabilidad de Ganar' : 'Win Probability'}</span>
        <span className="text-xs font-black text-slate-800 dark:text-slate-200">{pct}%</span>
      </div>
      <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
        />
      </div>
    </div>
  );
}

export default function OpportunitiesTab({ client, timeline, serviceRequests, research, emails = [] }: OpportunitiesTabProps) {
  const { language } = useLanguage();
  // Derive current stage from client status + service requests
  const hasAcceptedProposal = serviceRequests.some(r => r.status === 'Accepted');
  const hasProposal = serviceRequests.some(r => ['Quoted', 'Pending'].includes(r.status));
  const isWon = client?.status === 'Won' || serviceRequests.some(r => r.status === 'In Progress' || r.status === 'Delivered');
  const isLost = client?.status === 'Lost';

  let currentStage = 'Lead';
  if (isWon) currentStage = 'Won';
  else if (isLost) currentStage = 'Lost';
  else if (hasAcceptedProposal) currentStage = 'Negotiation';
  else if (hasProposal) currentStage = 'Proposal';
  else if (serviceRequests.length > 0) currentStage = 'Discovery';
  else if (client?.status === 'Active') currentStage = 'Qualified';

  const dealValue = client?.deal_value ? `$${Number(client.deal_value).toLocaleString()}` : '—';

  // Milestones from timeline
  const milestoneEvents = timeline.filter(e => e.type === 'milestone').slice(0, 5);

  const [activeSubTab, setActiveSubTab] = React.useState('email_agent');
  const [expandedEmailId, setExpandedEmailId] = React.useState<number | null>(null);

  let eaData: any = null;
  if (research?.email_agent_data) {
    try { eaData = JSON.parse(research.email_agent_data); } catch (e) {}
  }

  const [isAutoResearching, setIsAutoResearching] = React.useState(false);
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [extractResult, setExtractResult] = React.useState<{ count: number; marketplace: number } | null>(null);
  const [extractError, setExtractError] = React.useState<string | null>(null);

  const handleAutoResearch = async () => {
    try {
      setIsAutoResearching(true);
      const res = await fetch(`${API_BASE_URL}/clients/${client?.id}/auto-research`, {
        method: 'POST'
      });
      if (res.ok) {
        window.dispatchEvent(new CustomEvent('refresh-client-data'));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAutoResearching(false);
    }
  };

  const handleExtractServices = async () => {
    setIsExtracting(true);
    setExtractResult(null);
    setExtractError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/clients/${client?.id}/extract-services`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setExtractError(data.detail || 'Failed to extract services');
      } else {
        setExtractResult({ count: data.services?.length || 0, marketplace: data.marketplace_entries_added || 0 });
        window.dispatchEvent(new CustomEvent('refresh-client-data'));
      }
    } catch (e: any) {
      setExtractError(e.message || 'Network error');
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-4 overflow-x-auto">
        {[
          { id: 'email_agent', label: language === 'es' ? 'Análisis del Agente IA' : 'AI Agent Analysis', icon: Target },
          { id: 'presales', label: language === 'es' ? 'Investigación Pre-Ventas' : 'Pre-Sales Research', icon: Brain },
          { id: 'emails', label: language === 'es' ? 'Correos Salientes' : 'Outbound Emails', icon: Mail },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveSubTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
              activeSubTab === t.id ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'email_agent' && (
        <div className="space-y-6">
          {/* AI Agent Analysis Card */}
          <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-white dark:bg-slate-900 p-6 md:p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 border-b border-slate-100 dark:border-slate-800 pb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-widest">
                    {language === 'es' ? 'Inteligencia de Negocios' : 'Business Intelligence'}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${eaData ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                    {eaData ? 'Agent Data Extracted' : 'No Agent Data'}
                  </span>
                </div>
                <h3 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white mb-1">{eaData?.company_info?.company_name || client?.companyName || 'Unknown Client'}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium flex items-center gap-1.5">
                  <Target size={14} className="text-slate-400" />
                  {eaData?.company_info?.likely_industry || eaData?.company_info?.industry || client?.industry || 'General Industry'}
                </p>
              </div>
            </div>

            {eaData ? (
              <div className="space-y-6">
                {eaData.company_info?.summary && (
                  <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50">
                    <p className="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-2">Company Summary</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed">{eaData.company_info.summary}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {eaData.company_info?.best_conversion_opportunity && (
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-500 mb-1">Conversion Priority</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{eaData.company_info.best_conversion_opportunity}</p>
                    </div>
                  )}
                  {eaData.company_info?.sales_follow_up_focus && (
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-500 mb-1">Follow Up Focus</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{eaData.company_info.sales_follow_up_focus}</p>
                    </div>
                  )}
                  {eaData.company_info?.business_model && (
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-500 mb-1">Business Model</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{eaData.company_info.business_model}</p>
                    </div>
                  )}
                  {eaData.company_info?.target_market && (
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-500 mb-1">Target Market</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{eaData.company_info.target_market}</p>
                    </div>
                  )}
                </div>
                
                <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 mt-4">
                   <p className="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-3">Extracted Contacts</p>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700/50 shadow-sm">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Emails</p>
                        <p className="text-sm text-slate-800 dark:text-slate-200 font-mono break-all">{eaData.company_info?.extracted_emails || 'None'}</p>
                      </div>
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700/50 shadow-sm">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Phones</p>
                        <p className="text-sm text-slate-800 dark:text-slate-200 font-mono break-all">{eaData.company_info?.extracted_phone_numbers || 'None'}</p>
                      </div>
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700/50 shadow-sm">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">LinkedIn</p>
                        <p className="text-sm text-slate-800 dark:text-slate-200 font-mono break-all">{eaData.company_info?.extracted_linkedin || 'None'}</p>
                      </div>
                   </div>
                </div>
                
                {/* Additional Intelligence: Recommended Services, Extracted Services, and Drafts */}
                {eaData.recommended_services && eaData.recommended_services.length > 0 && (
                  <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 mt-4">
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-500 mb-3 flex items-center gap-2"><Target size={14} /> Recommended Services</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {eaData.recommended_services.map((rs: any, i: number) => {
                         const sName = typeof rs === 'string' ? rs : rs.service_name;
                         const sReason = typeof rs === 'string' ? null : rs.reasoning;
                         return (
                           <div key={i} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-sm">
                             <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">{sName}</p>
                             {sReason && <p className="text-xs text-slate-500 leading-relaxed">{sReason}</p>}
                           </div>
                         );
                      })}
                    </div>
                  </div>
                )}

                {eaData.extracted_services && eaData.extracted_services.length > 0 && (
                  <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 mt-4">
                    <p className="text-xs font-black uppercase tracking-widest text-sky-600 dark:text-sky-500 mb-3 flex items-center gap-2"><Store size={14} /> Services Offered By This Company</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {eaData.extracted_services.map((es: any, i: number) => (
                        <div key={i} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[9px] font-bold uppercase tracking-widest rounded-md text-sky-600 dark:text-sky-400">{es.category || 'Service'}</span>
                            {es.approx_cost > 0 && (
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500">${es.approx_cost.toLocaleString()} {es.cost_is_estimated && 'est.'}</span>
                            )}
                          </div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">{es.name}</p>
                          <p className="text-xs text-slate-500 leading-relaxed">{es.brief}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {eaData.draft && (
                  <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 mt-4">
                    <p className="text-xs font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 mb-3 flex items-center gap-2"><Mail size={14} /> Generated Email Draft</p>
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">Subject</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4">{eaData.draft.subject}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {eaData.draft.english_body && (
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">English</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-mono leading-relaxed bg-slate-50 dark:bg-slate-800/80 p-3 rounded-lg border border-slate-100 dark:border-slate-800">{eaData.draft.english_body}</p>
                          </div>
                        )}
                        {(eaData.draft.spanish_body || (!eaData.draft.english_body && eaData.draft.body)) && (
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">{eaData.draft.spanish_body ? 'Spanish' : 'Body'}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-mono leading-relaxed bg-slate-50 dark:bg-slate-800/80 p-3 rounded-lg border border-slate-100 dark:border-slate-800">{eaData.draft.spanish_body || eaData.draft.body}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {eaData.email_hook && (
                   <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 mt-4">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-500 mb-1 flex items-center gap-1.5"><ArrowRight size={12} /> Email Hook</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-amber-100">{eaData.email_hook}</p>
                   </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed">
                 <p className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-3">No AI Agent data found for this client.</p>
                 <p className="text-xs text-slate-500">Run the AI Email Agent and save a draft to capture deep intelligence.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'presales' && (
        <div className="space-y-6">
          {/* Pre-Sales Research Section */}
        <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-slate-900 p-6 shadow-sm relative overflow-hidden mt-6">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Brain size={120} />
          </div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-indigo-600 rounded-xl text-white">
                <Brain size={16} />
              </div>
              <h4 className="text-lg font-black text-slate-800 dark:text-white">Pre-Sales Research</h4>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <button
                onClick={handleAutoResearch}
                disabled={isAutoResearching}
                className="flex-1 py-2 px-4 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50"
              >
                {isAutoResearching ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {isAutoResearching ? (language === 'es' ? 'Investigando Empresa...' : 'Researching Company...') : (language === 'es' ? 'Analizar Cliente con IA' : 'Analyze Client with AI')}
              </button>
              <button
                onClick={handleExtractServices}
                disabled={isExtracting || !client?.websiteUrl}
                title={!client?.websiteUrl ? 'Add a website URL first' : 'Extract services from website'}
                className="flex-1 py-2 px-4 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50"
              >
                {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <Store size={16} />}
                {isExtracting ? 'Extracting Services...' : 'Extract Services from Website'}
              </button>
            </div>

            {extractResult && (
              <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <p className="text-xs font-bold text-emerald-700">
                  Found {extractResult.count} services · {extractResult.marketplace} added to Marketplace
                </p>
              </div>
            )}
            {extractError && (
              <div className="mb-4 flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs font-bold text-red-600">{extractError}</p>
              </div>
            )}
            {research ? (
            <div className="space-y-4">
              {research.company_overview && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-1">Company Overview</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{research.company_overview}</p>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {research.pain_points && (
                  <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-indigo-50 dark:border-indigo-900/30">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-500 mb-1">Pain Points</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{research.pain_points}</p>
                  </div>
                )}
                {research.competitors && (
                  <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-indigo-50 dark:border-indigo-900/30">
                    <p className="text-[10px] font-black uppercase tracking-wider text-rose-500 mb-1">Competitors</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{research.competitors}</p>
                  </div>
                )}
                {research.business_goals && (
                  <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-indigo-50 dark:border-indigo-900/30 md:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-1">Business Goals</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{research.business_goals}</p>
                  </div>
                )}
              </div>
            </div>
            ) : (
              <div className="text-center py-8 bg-white/50 dark:bg-slate-900/50 rounded-xl border border-dashed border-indigo-200 mt-4">
                <p className="text-sm text-indigo-400 font-medium">{language === 'es' ? 'No se ha realizado investigación. Haz clic en analizar arriba.' : 'No research found. Click analyze above to start.'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {activeSubTab === 'emails' && (
        <div className="space-y-6">
          {/* Outbound Emails / Round 1 */}
          {emails && emails.length > 0 ? (
        <div className="rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-white dark:bg-slate-900 p-6 shadow-sm mt-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-blue-500 rounded-xl text-white">
              <Mail size={16} />
            </div>
            <h4 className="text-lg font-black text-slate-800 dark:text-white">Outbound Communications</h4>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 ml-auto">
              {emails.length} Emails
            </span>
          </div>
          
          <div className="space-y-3">
            {emails.map((em: any, idx: number) => {
              const isExpanded = expandedEmailId === idx;
              return (
              <div key={idx} className="p-4 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setExpandedEmailId(isExpanded ? null : idx)}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Mail size={10} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{em.subject || 'No Subject'}</p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold bg-white dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700">
                    <Calendar size={10} />
                    {em.sent_at ? new Date(em.sent_at).toLocaleDateString() : 'Draft'}
                  </div>
                </div>
                {em.english_body && (
                  <div className="ml-8">
                    {!isExpanded ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {em.english_body}
                      </p>
                    ) : (
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                          <p className="text-[10px] font-black uppercase text-blue-600 mb-2">English</p>
                          <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{em.english_body}</p>
                        </div>
                        {em.spanish_body && (
                          <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                            <p className="text-[10px] font-black uppercase text-blue-600 mb-2">Spanish</p>
                            <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{em.spanish_body}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {em.manual && (
                  <span className="inline-block ml-8 mt-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold uppercase tracking-wider rounded-md">
                    Manual Draft
                  </span>
                )}
                {!isExpanded && (
                  <p className="ml-8 mt-1 text-[10px] text-indigo-500 font-medium">Click to view full email</p>
                )}
              </div>
            )})}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 shadow-sm mt-6">
          <p className="text-slate-500 font-medium">No outbound communications found.</p>
        </div>
      )}
      </div>
      )}

    </div>
  );
}
