'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Star, User, ArrowLeft, Plus, MessageSquare,
  Calendar, Mail, Target, Zap,
  TrendingUp, Phone, Globe, Sun, Moon, MapPin, Linkedin,
  Pencil, X, Check, Loader2, Trash2
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { API_BASE_URL } from '@/config';

interface ClientHeaderProps {
  client: any;
  employees: any[];
  onBack: () => void;
  onAddNote: () => void;
  onAddConversation: () => void;
  onScheduleMeeting: () => void;
  onSendEmail: () => void;
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
  onScheduleMeeting, onSendEmail,
  onCreateOpportunity, darkMode, onToggleDarkMode
}: ClientHeaderProps) {
  const { language } = useLanguage();
  const statusCfg = STATUS_CONFIG[client?.status] || STATUS_CONFIG.Inactive;
  const assignedEmp = employees.find((e: any) => e.id === client?.assignedEmployeeId);
  const leadScore = client?.lead_score ?? 0;
  const dealValue = client?.deal_value ? `$${Number(client.deal_value).toLocaleString()}` : '—';


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
  const description = client?.description || client?.tagline || client?.seoStrategy || client?.gmbName || null;
  const services = client?.services_offered || null;
  const companyName = client?.company_name || client?.companyName || client?.projectName || (client?.customFields?.sheet_data?.['Client Name']) || null;

  // Custom fields state
  const [showFieldsModal, setShowFieldsModal] = useState(false);
  const rawCustomFields = client?.custom_fields || client?.customFields || {};
  const [fieldsList, setFieldsList] = useState<{ key: string; value: string }[]>(() => {
    if (typeof rawCustomFields === 'object' && rawCustomFields !== null && !Array.isArray(rawCustomFields)) {
      return Object.entries(rawCustomFields).filter(([k]) => k !== 'sheet_data' && k !== 'is_sample').map(([k, v]) => ({ key: k, value: String(v) }));
    }
    return [];
  });
  const [savingFields, setSavingFields] = useState(false);

  useEffect(() => {
    const raw = client?.custom_fields || client?.customFields || {};
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      setFieldsList(
        Object.entries(raw)
          .filter(([k]) => k !== 'sheet_data' && k !== 'is_sample')
          .map(([k, v]) => ({ key: k, value: String(v) }))
      );
    } else {
      setFieldsList([]);
    }
  }, [client?.id, client?.customFields, client?.custom_fields, showFieldsModal]);

  const saveCustomFields = async () => {
    setSavingFields(true);
    const obj = fieldsList.reduce((acc, curr) => {
      if (curr.key.trim()) acc[curr.key.trim()] = curr.value.trim();
      return acc;
    }, {} as Record<string, string>);
    try {
      const res = await fetch(`${API_BASE_URL}/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customFields: obj, custom_fields: obj })
      });
      if (res.ok) {
        setShowFieldsModal(false);
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingFields(false);
    }
  };

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
          <button
            onClick={onSendEmail}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm shadow-indigo-500/20 transition-colors hover:bg-indigo-700"
          >
            <Mail size={14} /> {language === 'es' ? 'Enviar correo' : 'Send Email'}
          </button>
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
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${statusCfg.bg} ${statusCfg.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                {client?.status || 'Unknown'}
              </span>
              {client?.industry && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-zinc-800  text-slate-600 dark:text-zinc-300 ">
                  {client.industry}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowFieldsModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-violet-600 dark:text-violet-400 hover:text-violet-700 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 border border-violet-200/60 dark:border-violet-800/40 transition-colors shadow-2xs cursor-pointer"
                title="Add or edit custom metadata fields for this client"
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

            {/* Custom Metadata Fields Badges */}
            {fieldsList.filter(f => f.key.trim()).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-100 dark:border-zinc-800/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 mr-1">
                  Custom Fields:
                </span>
                {fieldsList.filter(f => f.key.trim()).map(({ key: k, value: v }) => (
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

      {/* Custom Fields Modal */}
      <AnimatePresence>
        {showFieldsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Manage Custom Fields
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Add custom attributes displayed prominently in this client's header
                  </p>
                </div>
                <button
                  onClick={() => setShowFieldsModal(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {fieldsList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">No custom fields added yet. Click below to add one.</p>
                ) : (
                  fieldsList.map((cf, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Field Name (e.g. Contract Term, SLA)"
                        value={cf.key}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFieldsList(prev => prev.map((item, i) => i === idx ? { ...item, key: v } : item));
                        }}
                        className="w-1/2 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={cf.value}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFieldsList(prev => prev.map((item, i) => i === idx ? { ...item, value: v } : item));
                        }}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => setFieldsList(prev => prev.filter((_, i) => i !== idx))}
                        className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => setFieldsList(prev => [...prev, { key: "", value: "" }])}
                className="w-full py-2 border border-dashed border-indigo-300 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus size={13} /> Add Another Field
              </button>

              <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowFieldsModal(false)}
                  disabled={savingFields}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveCustomFields}
                  disabled={savingFields}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingFields ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
                  Save Fields
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
