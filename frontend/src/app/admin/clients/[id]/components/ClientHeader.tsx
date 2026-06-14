'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Star, User, ArrowLeft, Plus, MessageSquare,
  CheckSquare, Calendar, Mail, Upload, Target, Zap,
  TrendingUp, Phone, Globe, Sun, Moon, MapPin, Linkedin
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface ClientHeaderProps {
  client: any;
  employees: any[];
  onBack: () => void;
  onAddNote: () => void;
  onAddConversation: () => void;
  onCreateTask: () => void;
  onScheduleMeeting: () => void;
  onSendEmail: () => void;
  onUploadFile: () => void;
  onCreateOpportunity: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  Active:   { bg: 'bg-emerald-100 ', text: 'text-emerald-700 ', dot: 'bg-emerald-500' },
  Hold:     { bg: 'bg-amber-100 ',   text: 'text-amber-700 ',   dot: 'bg-amber-500'   },
  Pending:  { bg: 'bg-blue-100 ',    text: 'text-blue-700 ',    dot: 'bg-blue-500'    },
  Inactive: { bg: 'bg-slate-100 dark:bg-zinc-800 ',     text: 'text-slate-600 dark:text-zinc-300 ',  dot: 'bg-slate-400'   },
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

export default function ClientHeader({
  client, employees, onBack, onAddNote, onAddConversation,
  onCreateTask, onScheduleMeeting, onSendEmail, onUploadFile,
  onCreateOpportunity, darkMode, onToggleDarkMode
}: ClientHeaderProps) {
  const { language } = useLanguage();
  const statusCfg = STATUS_CONFIG[client?.status] || STATUS_CONFIG.Inactive;
  const assignedEmp = employees.find((e: any) => e.id === client?.assignedEmployeeId);
  const leadScore = client?.lead_score ?? 0;
  const dealValue = client?.deal_value ? `$${Number(client.deal_value).toLocaleString()}` : '—';

  const quickActions = [
    { icon: MessageSquare, label: language === 'es' ? 'Añadir Nota' : 'Add Note',        onClick: onAddNote,          color: 'text-violet-600 ', bg: 'hover:bg-violet-50 ' },
    { icon: Phone,         label: language === 'es' ? 'Registrar Llamada' : 'Log Call',  onClick: onAddConversation,  color: 'text-blue-600 ',     bg: 'hover:bg-blue-50 '   },
    { icon: CheckSquare,   label: language === 'es' ? 'Crear Tarea' : 'Create Task',     onClick: onCreateTask,       color: 'text-emerald-600 ', bg: 'hover:bg-emerald-50 ' },
    { icon: Calendar,      label: language === 'es' ? 'Agendar' : 'Schedule',            onClick: onScheduleMeeting,  color: 'text-amber-600 ',   bg: 'hover:bg-amber-50 ' },
    { icon: Mail,          label: language === 'es' ? 'Enviar Correo' : 'Send Email',    onClick: onSendEmail,        color: 'text-sky-600 ',       bg: 'hover:bg-sky-50 '     },
    { icon: Upload,        label: language === 'es' ? 'Subir Archivo' : 'Upload File',   onClick: onUploadFile,       color: 'text-pink-600 ',     bg: 'hover:bg-pink-50 '   },
    { icon: Target,        label: language === 'es' ? 'Nueva Oportunidad' : 'New Opportunity', onClick: onCreateOpportunity, color: 'text-indigo-600 ', bg: 'hover:bg-indigo-50 ' },
  ];

  // Contact info pills for display in header
  const contactChips = [
    client?.contact_person && { icon: User,     value: client.contact_person },
    client?.email          && { icon: Mail,     value: client.email,     href: `mailto:${client.email}` },
    client?.phone          && { icon: Phone,    value: client.phone,     href: `tel:${client.phone}` },
    client?.websiteUrl     && { icon: Globe,    value: client.websiteUrl, href: client.websiteUrl },
    client?.linkedin_url   && { icon: Linkedin, value: 'LinkedIn',       href: client.linkedin_url },
    client?.address        && { icon: MapPin,   value: client.address },
    assignedEmp            && { icon: Star,     value: `${language === 'es' ? 'Asignado:' : 'Assigned:'} ${assignedEmp.name}`, accent: true },
  ].filter(Boolean) as { icon: any; value: string; href?: string; accent?: boolean }[];

  // Brief description from research or tagline
  const description = client?.tagline || client?.seoStrategy || client?.gmbName || null;

  return (
    <div className="sticky top-0 z-40 bg-white dark:bg-zinc-900 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border-b border-slate-200 dark:border-zinc-700">
      <div className="w-full px-6 py-4">

        {/* Row 1: Breadcrumb + Controls */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-zinc-400 hover:text-indigo-600 transition-colors font-bold tracking-tight"
          >
            <ArrowLeft size={16} className="text-slate-400" /> {language === 'es' ? 'Volver a Clientes' : 'Back to Clients'}
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 overflow-x-auto mr-2">
              {quickActions.map(({ icon: Icon, label, onClick, color, bg }) => (
                <motion.button
                  key={label}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={onClick}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold
                             transition-all whitespace-nowrap ${color} ${bg}`}
                >
                  <Icon size={12} />
                  {label}
                </motion.button>
              ))}
            </div>
            <button
              onClick={onToggleDarkMode}
              className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:text-indigo-600 hover:bg-slate-100 dark:bg-zinc-800 hover:border-slate-300 dark:border-zinc-600 transition-all shadow-sm"
            >
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
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
                {client?.companyName || (language === 'es' ? 'Empresa Desconocida' : 'Unknown Company')}
              </h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${statusCfg.bg} ${statusCfg.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                {client?.status || 'Unknown'}
              </span>
              {client?.industry && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-zinc-800  text-slate-600 dark:text-zinc-300 ">
                  {client.industry}
                </span>
              )}
            </div>

            {/* Company Description */}
            {description && (
              <p className="text-xs text-slate-500 dark:text-zinc-400  mb-1.5 max-w-2xl leading-snug line-clamp-1">
                {description}
              </p>
            )}

            {/* Contact Info Chips */}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {contactChips.map(({ icon: Icon, value, href, accent }, i) => {
                const cls = `flex items-center gap-1 text-[11px] font-medium ${
                  accent
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

        {/* ── Sheet Data Row (shown only for sheet-imported clients) ── */}
        {client?.customFields?.sheet_data && Object.keys(client.customFields.sheet_data).length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 flex items-center gap-1.5 shrink-0">
                <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path d="M3 3a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H3zm0 2h14v1H3V5zm0 3h14v7H3V8z"/></svg>
                Sheet Data
              </span>
              {Object.entries(client.customFields.sheet_data)
                .filter(([k, v]) => v && String(v).trim() && ![''].includes(String(v).trim()))
                .slice(0, 8)
                .map(([key, val]) => (
                  <span key={key} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/40">
                    <span className="text-emerald-400 dark:text-emerald-600 font-black">{key}:</span>
                    <span className="truncate max-w-[140px]">{String(val)}</span>
                  </span>
                ))
              }
              {Object.keys(client.customFields.sheet_data).length > 8 && (
                <span className="text-[10px] text-slate-400 dark:text-zinc-500">+{Object.keys(client.customFields.sheet_data).length - 8} more</span>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
