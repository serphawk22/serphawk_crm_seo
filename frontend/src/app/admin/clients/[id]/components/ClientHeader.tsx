'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Star, User, ArrowLeft, Plus, MessageSquare,
  CheckSquare, Calendar, Mail, Upload, Target, Zap,
  TrendingUp, Phone, Globe, Sun, Moon
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
  Active:   { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  Hold:     { bg: 'bg-amber-100 dark:bg-amber-900/30',   text: 'text-amber-700 dark:text-amber-400',   dot: 'bg-amber-500'   },
  Pending:  { bg: 'bg-blue-100 dark:bg-blue-900/30',    text: 'text-blue-700 dark:text-blue-400',    dot: 'bg-blue-500'    },
  Inactive: { bg: 'bg-slate-100 dark:bg-slate-700',     text: 'text-slate-600 dark:text-slate-400',  dot: 'bg-slate-400'   },
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
        <circle cx="28" cy="28" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200 dark:text-slate-700" />
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
    { icon: MessageSquare, label: language === 'es' ? 'Añadir Nota' : 'Add Note',        onClick: onAddNote,          color: 'text-violet-600 dark:text-violet-400', bg: 'hover:bg-violet-50 dark:hover:bg-violet-900/20' },
    { icon: Phone,         label: language === 'es' ? 'Registrar Llamada' : 'Log Call',        onClick: onAddConversation,  color: 'text-blue-600 dark:text-blue-400',     bg: 'hover:bg-blue-50 dark:hover:bg-blue-900/20'   },
    { icon: CheckSquare,   label: language === 'es' ? 'Crear Tarea' : 'Create Task',     onClick: onCreateTask,       color: 'text-emerald-600 dark:text-emerald-400', bg: 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20' },
    { icon: Calendar,      label: language === 'es' ? 'Agendar' : 'Schedule',        onClick: onScheduleMeeting,  color: 'text-amber-600 dark:text-amber-400',   bg: 'hover:bg-amber-50 dark:hover:bg-amber-900/20' },
    { icon: Mail,          label: language === 'es' ? 'Enviar Correo' : 'Send Email',      onClick: onSendEmail,        color: 'text-sky-600 dark:text-sky-400',       bg: 'hover:bg-sky-50 dark:hover:bg-sky-900/20'     },
    { icon: Upload,        label: language === 'es' ? 'Subir Archivo' : 'Upload File',     onClick: onUploadFile,       color: 'text-pink-600 dark:text-pink-400',     bg: 'hover:bg-pink-50 dark:hover:bg-pink-900/20'   },
    { icon: Target,        label: language === 'es' ? 'Nueva Oportunidad' : 'New Opportunity', onClick: onCreateOpportunity, color: 'text-indigo-600 dark:text-indigo-400', bg: 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20' },
  ];

  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-700/60
                    bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-sm">
      <div className="max-w-[1600px] mx-auto px-6 py-4">
        {/* Row 1: Breadcrumb + Controls */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400
                       hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium"
          >
            <ArrowLeft size={15} /> {language === 'es' ? 'Volver a Clientes' : 'Back to Clients'}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleDarkMode}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300
                         hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>

        {/* Row 2: Main header content */}
        <div className="flex items-start gap-6 flex-wrap">
          {/* Company Avatar */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600
                          flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
            <Building2 size={28} className="text-white" />
          </div>

          {/* Name + Meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1.5">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white truncate">
                {client?.companyName || (language === 'es' ? 'Empresa Desconocida' : 'Unknown Company')}
              </h1>
              {/* Status Badge */}
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusCfg.bg} ${statusCfg.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                {client?.status || (language === 'es' ? 'Desconocido' : 'Unknown')}
              </span>
              {/* Industry badge */}
              {client?.industry && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {client.industry}
                </span>
              )}
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-4 flex-wrap text-sm text-slate-500 dark:text-slate-400">
              {client?.contact_person && (
                <span className="flex items-center gap-1.5">
                  <User size={13} /> {client.contact_person}
                </span>
              )}
              {assignedEmp && (
                <span className="flex items-center gap-1.5">
                  <Star size={13} className="text-amber-400" />
                  <span>{language === 'es' ? 'Asignado:' : 'Assigned:'} <span className="font-semibold text-slate-700 dark:text-slate-300">{assignedEmp.name}</span></span>
                </span>
              )}
              {client?.lead_source && (
                <span className="flex items-center gap-1.5">
                  <Globe size={13} /> {client.lead_source}
                </span>
              )}
              {client?.last_contact_date && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={13} /> {language === 'es' ? 'Último:' : 'Last:'} {new Date(client.last_contact_date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
              {client?.next_followup_date && (
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                  <Zap size={13} /> {language === 'es' ? 'Seguimiento:' : 'Follow-up:'} {new Date(client.next_followup_date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          </div>

          {/* Score + Deal Value */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <LeadScoreRing score={leadScore} />
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5 uppercase tracking-wider">{language === 'es' ? 'Puntaje' : 'Score'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{language === 'es' ? 'Valor' : 'Deal Value'}</p>
              <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">{dealValue}</p>
            </div>
          </div>
        </div>

        {/* Row 3: Quick Action Bar */}
        <div className="flex items-center gap-1 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 overflow-x-auto">
          {quickActions.map(({ icon: Icon, label, onClick, color, bg }) => (
            <motion.button
              key={label}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={onClick}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold
                         transition-all whitespace-nowrap ${color} ${bg} dark:bg-transparent`}
            >
              <Icon size={14} />
              {label}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
