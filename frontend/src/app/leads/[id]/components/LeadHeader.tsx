'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Star, User, ArrowLeft, Plus, MessageSquare,
  CheckSquare, Calendar, Mail, Upload, Target, Zap,
  TrendingUp, Phone, Globe, Sun, Moon, MapPin, Linkedin
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { API_BASE_URL } from '@/config';
import { useTenantConfig } from '@/context/TenantConfigContext';
import InstituteLeadScheduleModal from '@/components/InstituteLeadScheduleModal';
import EditLeadDetailsModal from './EditLeadDetailsModal';
import ContactSynopsisModal from '@/components/ContactSynopsisModal';
import LeadBatchEnrollmentAction from '@/components/LeadBatchEnrollmentAction';
import { Pencil, Twitter, Instagram, Facebook } from 'lucide-react';
import { leadStages, scheduleStage, type ScheduleStage } from '@/lib/leadWorkflow';

interface LeadHeaderProps {
  lead: any;
  employees: any[];
  onBack: () => void;
  onAddNote: () => void;
  onAddConversation: () => void;
  onCreateTask: () => void;
  onScheduleMeeting: () => void;
  onSendEmail: () => void;
  onUploadFile: () => void;
  onCreateOpportunity?: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onStatusChange?: (newStatus: string) => void;
}

const LEAD_STAGES = [
  "New",
  "Contacted",
  "Not Responded",
  "Neutral",
  "Positive",
  "Negative",
  "Converted"
];

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  New: { bg: 'bg-blue-100 dark:bg-blue-950/40 border-blue-200', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  Contacted: { bg: 'bg-sky-100 dark:bg-sky-950/40 border-sky-200', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  "Not Responded": { bg: 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200', text: 'text-zinc-700 dark:text-zinc-300', dot: 'bg-zinc-500' },
  Neutral: { bg: 'bg-amber-100 dark:bg-amber-950/40 border-amber-200', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  Positive: { bg: 'bg-teal-100 dark:bg-teal-950/40 border-teal-200', text: 'text-teal-700 dark:text-teal-300', dot: 'bg-teal-500' },
  Negative: { bg: 'bg-rose-100 dark:bg-rose-950/40 border-rose-200', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
  Converted: { bg: 'bg-emerald-100 dark:bg-emerald-950/40 border-emerald-200', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  Student: { bg: 'bg-emerald-100 dark:bg-emerald-950/40 border-emerald-200', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  Active: { bg: 'bg-emerald-100 dark:bg-emerald-950/40 border-emerald-200', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  Inactive: { bg: 'bg-slate-100 dark:bg-zinc-800 border-slate-200', text: 'text-slate-600 dark:text-zinc-300', dot: 'bg-slate-400' },
};

function LeadScoreRing({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const radius = 22;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="56" height="56">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200 " />
        <circle cx="28" cy="28" r={radius} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      </svg>
      <span className="text-xs font-black" style={{ color }}>{pct}</span>
    </div>
  );
}

export default function LeadHeader({
  lead, employees, onBack, onAddNote, onAddConversation,
  onCreateTask, onScheduleMeeting, onSendEmail, onUploadFile,
  onCreateOpportunity, darkMode, onToggleDarkMode, onStatusChange
}: LeadHeaderProps) {
  const { language } = useLanguage();
  const { settings, isOn } = useTenantConfig();
  const [schedule, setSchedule] = useState<ScheduleStage | null>(null);
  const [statusError, setStatusError] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isContactedModalOpen, setIsContactedModalOpen] = useState(false);
  const [openEnrollment, setOpenEnrollment] = useState(false);
  const isInstitute = isOn('institute') || settings?.company_type === 'institute' || Boolean((settings as any)?.institute);
  const stages = leadStages(settings.lead_statuses, isInstitute, LEAD_STAGES, [lead?.status || 'New']);
  const statusCfg = STATUS_CONFIG[lead?.status] || STATUS_CONFIG.Inactive;
  const assignedEmp = employees.find((e: any) => e.id === lead?.owner_id);
  const leadScore = lead?.lead_score ?? 0;
  const curSym = (settings?.default_currency || "INR").toUpperCase() === "USD" ? "$" : "₹";
  const dealValue = lead?.deal_value ? `${curSym}${Number(lead.deal_value).toLocaleString()}` : '—';


  // Contact info pills for display in header
  const locationStr = [lead?.city, lead?.country].filter(Boolean).join(', ') || lead?.address || '';
  const contactChips = [
    lead?.email && { icon: Mail, value: lead.email, href: `mailto:${lead.email}` },
    lead?.phone && { icon: Phone, value: lead.phone, href: `tel:${lead.phone}` },
    lead?.website && { icon: Globe, value: lead.website?.replace(/^https?:\/\//, '').replace(/\/$/, ''), href: lead.website },
    locationStr && { icon: MapPin, value: locationStr },
    lead?.linkedin_url && { icon: Linkedin, value: 'LinkedIn', href: lead.linkedin_url },
    lead?.twitter_url && { icon: Twitter, value: 'Twitter/X', href: lead.twitter_url },
    lead?.instagram_url && { icon: Instagram, value: 'Instagram', href: lead.instagram_url },
    lead?.facebook_url && { icon: Facebook, value: 'Facebook', href: lead.facebook_url },
    assignedEmp && { icon: Star, value: `${language === 'es' ? 'Asignado:' : 'Assigned:'} ${assignedEmp.name}`, accent: true },
  ].filter(Boolean) as { icon: any; value: string; href?: string; accent?: boolean }[];

  // Brief description from research or tagline
  const description = lead?.description || lead?.tagline || lead?.seoStrategy || lead?.gmbName || null;
  const services = lead?.services_offered || null;
  const companyName = lead?.company_name || lead?.company_name || lead?.projectName || (lead?.customFields?.sheet_data?.['Client Name']) || null;
  const customFieldsData = lead?.custom_fields || lead?.customFields || {};
  const customFieldsEntries = typeof customFieldsData === "object" && customFieldsData !== null && !Array.isArray(customFieldsData)
    ? Object.entries(customFieldsData).filter(([k]) => k !== 'sheet_data')
    : [];

  return (
    <div className="sticky top-0 z-40 bg-white dark:bg-zinc-900 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border-b border-slate-200 dark:border-zinc-700">
      <div className="w-full px-6 py-4">

        {/* Row 1: Breadcrumb + Controls */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-zinc-400 hover:text-indigo-600 transition-colors font-bold tracking-tight"
          >
            <ArrowLeft size={16} className="text-slate-400" /> {language === 'es' ? 'Volver a Clientes' : 'Back to Leads'}
          </button>
          <div className="flex items-center gap-2">
            {isInstitute && (
              <LeadBatchEnrollmentAction
                leadId={lead?.id}
                leadName={lead?.name || lead?.company_name || 'Lead'}
                leadPhone={lead?.phone}
                isConverted={lead?.is_converted}
                convertedStudentId={lead?.converted_student_id}
                externalOpen={openEnrollment}
                onExternalClose={() => setOpenEnrollment(false)}
                onEnrolled={() => {
                  if (onStatusChange) onStatusChange('Student');
                  else window.location.reload();
                }}
              />
            )}
            <button
              onClick={onSendEmail}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm shadow-indigo-500/20 transition-colors hover:bg-indigo-700"
            >
              <Mail size={14} /> {language === 'es' ? 'Enviar correo' : 'Send Email'}
            </button>
          </div>
        </div>

        {/* Row 2: Main header - Company identity + Contact Info + Score */}
        <div className="flex items-start gap-5">
          {/* Company Avatar */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600
                          flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20 mt-0.5">
            <Building2 size={26} className="text-white" />
          </div>

          {/* Name + Description + Contact Chips */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-xl font-black text-slate-900 dark:text-zinc-50  leading-tight">
                {companyName || (language === 'es' ? 'Empresa Desconocida' : 'Unknown Company')}
              </h1>
              <select
                value={lead?.is_converted ? (lead?.status === "Student" ? "Student" : "Converted") : (lead?.status || "New")}
                onChange={async (e) => {
                  const val = e.target.value;
                  if (val === "Contacted") {
                    setIsContactedModalOpen(true);
                    return;
                  }
                  if (isOn('institute') && (val === "Student" || val === "Converted") && !lead?.is_converted) {
                    setOpenEnrollment(true);
                    return;
                  }
                  const stage = scheduleStage(val, isOn('institute'));
                  if (stage) { setSchedule(stage); return; }
                  setStatusError('');
                  try {
                    const response = await fetch(`${API_BASE_URL}/leads/${lead?.id}/status`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: val }),
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not change stage');
                    if (onStatusChange) onStatusChange(val);
                    else window.location.reload();
                  } catch (err) {
                    setStatusError(err instanceof Error ? err.message : 'Could not change stage');
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border cursor-pointer focus:outline-none transition-all shadow-sm ${statusCfg.bg} ${statusCfg.text}`}
                title="Change stage"
              >
                {stages.map((st) => (
                  <option key={st} value={st} className="bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 font-semibold">
                    {st}
                  </option>
                ))}
              </select>
              {statusError && <p role="alert" className="text-sm text-red-600">{statusError}</p>}
              {schedule && <InstituteLeadScheduleModal lead={lead} stage={schedule} onClose={() => setSchedule(null)}
                onSuccess={() => onStatusChange ? onStatusChange(schedule) : window.location.reload()} />}
              {lead?.industry && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                  {lead.industry}
                </span>
              )}
              {lead?.city && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 flex items-center gap-1">
                  <MapPin size={10} /> {lead.city}{lead.country ? `, ${lead.country}` : ''}
                </span>
              )}
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors shadow-2xs cursor-pointer"
                title="Edit contact, category, location, and social media handles"
              >
                <Pencil size={11} /> Edit Details
              </button>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-violet-600 dark:text-violet-400 hover:text-violet-700 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 border border-violet-200/60 dark:border-violet-800/40 transition-colors shadow-2xs cursor-pointer"
                title="Add or edit custom metadata fields for this lead"
              >
                <Plus size={11} /> Add / Edit Fields
              </button>
            </div>

            {/* Company Description */}
            {description && (
              <p className="text-xs text-slate-500 dark:text-zinc-400 mb-2 max-w-3xl leading-snug">
                {description}
              </p>
            )}

            {/* Contact Info Chips */}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {contactChips.map(({ icon: Icon, value, href, accent }, i) => {
                const cls = `flex items-center gap-1 text-[11px] font-medium ${accent
                    ? 'text-amber-600 '
                    : 'text-slate-500 dark:text-zinc-400 '
                  }`;
                return href ? (
                  <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                    className={cls + ' hover:text-indigo-600  transition-colors'}>
                    <Icon size={11} />
                    <span className="truncate max-w-[180px]">{value}</span>
                  </a>
                ) : (
                  <span key={i} className={cls}>
                    <Icon size={11} />
                    <span className="truncate max-w-[180px]">{value}</span>
                  </span>
                );
              })}
            </div>

            {/* Custom Metadata Fields Badges */}
            {customFieldsEntries.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-100 dark:border-zinc-800/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 mr-1">
                  Custom Fields:
                </span>
                {customFieldsEntries.map(([k, v]) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-200/80 dark:border-violet-800/40 shadow-2xs"
                  >
                    <span className="text-violet-400 font-bold uppercase text-[9px] tracking-wider">{k}:</span>
                    <span className="font-bold">{String(v)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Score + Deal Value */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-center">
              <LeadScoreRing score={leadScore} />
              <p className="text-[9px] font-bold text-slate-400  mt-0.5 uppercase tracking-wider">
                {language === 'es' ? 'Puntaje' : 'Score'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 ">
                {language === 'es' ? 'Valor' : 'Deal Value'}
              </p>
              <p className="text-xl font-black text-indigo-600 ">{dealValue}</p>
            </div>
          </div>
        </div>

      </div>

      {/* Edit Lead Details Modal */}
      <EditLeadDetailsModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        lead={lead}
        onSaved={(updated) => {
          if (onStatusChange) onStatusChange(updated.status);
          else window.location.reload();
        }}
      />

      {/* Contact Synopsis Modal */}
      <ContactSynopsisModal
        isOpen={isContactedModalOpen}
        onClose={() => setIsContactedModalOpen(false)}
        leadId={lead?.id}
        companyName={companyName || 'Lead'}
        onSuccess={() => {
          if (onStatusChange) onStatusChange('Contacted');
          else window.location.reload();
        }}
      />
    </div>
  );
}
