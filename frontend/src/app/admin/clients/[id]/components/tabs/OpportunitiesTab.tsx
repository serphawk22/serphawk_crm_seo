'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, ArrowRight, CheckCircle2, Clock, XCircle, Target, Brain, Mail, Calendar } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

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

  const [activeSubTab, setActiveSubTab] = React.useState('pipeline');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-4 overflow-x-auto">
        {[
          { id: 'pipeline', label: language === 'es' ? 'Resumen del Pipeline' : 'Pipeline Overview', icon: Target },
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

      {activeSubTab === 'pipeline' && (
        <div className="space-y-6">
      {/* Active Opportunity Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{language === 'es' ? 'Oportunidad Activa' : 'Active Opportunity'}</p>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">{client?.companyName}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {serviceRequests.length} {language === 'es' ? 'solicitudes de servicio activas' : `active service request${serviceRequests.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{language === 'es' ? 'Valor' : 'Deal Value'}</p>
            <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{dealValue}</p>
          </div>
        </div>

        {/* Stage Pipeline */}
        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">{language === 'es' ? 'Etapa del Pipeline' : 'Pipeline Stage'}</p>
          <StagePipeline current={currentStage} language={language} />
        </div>

        {/* Probability */}
        <ProbabilityBar stage={currentStage} language={language} />

        {/* Key Metrics Row */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          {[
            { label: language === 'es' ? 'Etapa Actual' : 'Current Stage', value: getTranslatedStage(currentStage, language), color: STAGE_CFG[currentStage]?.text || 'text-slate-600' },
            { label: language === 'es' ? 'Puntaje Lead' : 'Lead Score', value: client?.lead_score ? `${client.lead_score}/100` : '—', color: 'text-indigo-600 dark:text-indigo-400' },
            { label: language === 'es' ? 'Fuente Lead' : 'Lead Source', value: client?.lead_source || '—', color: 'text-slate-700 dark:text-slate-300' },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
              <p className={`text-sm font-black mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Service Requests / Opportunities */}
      {serviceRequests.length > 0 && (
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">{language === 'es' ? 'Solicitudes de Servicio' : 'Service Requests'}</p>
          <div className="space-y-2">
            {serviceRequests.map((req: any) => {
              const statusColor: Record<string, string> = {
                Pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
                Quoted: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
                Accepted: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
                'In Progress': 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
                Delivered: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
              };
              const finalStatusColor = statusColor[req.status] || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';

              const reqStatusEs: Record<string, string> = { Pending: 'Pendiente', Quoted: 'Cotizado', Accepted: 'Aceptado', 'In Progress': 'En Progreso', Delivered: 'Entregado' };
              const finalReqStatusEs = reqStatusEs[req.status] || req.status;

              return (
                <div key={req.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{req.service_name || (language === 'es' ? 'Solicitud de Servicio' : 'Service Request')}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {language === 'es' ? 'Solicitado el' : 'Requested'} {req.requested_at ? new Date(req.requested_at).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${statusColor}`}>{language === 'es' ? reqStatusEs : req.status}</span>
                    {req.quoted_amount && (
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1">${Number(req.quoted_amount).toLocaleString()}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stage History */}
      {milestoneEvents.length > 0 && (
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">{language === 'es' ? 'Historial de Etapas' : 'Stage History'}</p>
          <div className="space-y-2">
            {milestoneEvents.map((ev: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900">
                <div className="w-7 h-7 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center text-xs flex-shrink-0">🎯</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{ev.title}</p>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {ev.date ? new Date(ev.date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' }) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
      )}

      {activeSubTab === 'presales' && (
        <div className="space-y-6">
          {/* Pre-Sales Research Section */}
      {research && (
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
          </div>
        </div>
      )}
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
            {emails.map((em: any, idx: number) => (
              <div key={idx} className="p-4 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 hover:shadow-md transition-shadow">
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed ml-8">
                    {em.english_body}
                  </p>
                )}
                {em.manual && (
                  <span className="inline-block ml-8 mt-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold uppercase tracking-wider rounded-md">
                    Manual Draft
                  </span>
                )}
              </div>
            ))}
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
