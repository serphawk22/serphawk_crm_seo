'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Mail, Phone, Globe, MapPin, Linkedin, Building2,
  Users, DollarSign, Edit3, Save, X, ChevronDown, ChevronUp,
  Briefcase, Target, Calendar, Zap, Wand2, Loader2, FileText, FileSignature
} from 'lucide-react';
import Link from 'next/link';
import { API_BASE_URL } from '@/config';
import { useLanguage } from '@/context/LanguageContext';

interface ClientSidebarPanelProps {
  client: any;
  research: any;
  onClientUpdate: (updates: any) => void;
  onResearchUpdate: (research: any) => void;
  clientId: string | string[];
}

const InfoRow = ({ icon: Icon, label, value, href }: { icon: any; label: string; value: string; href?: string }) => (
  <div className="flex items-start gap-3 py-2">
    <div className="mt-0.5 p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex-shrink-0">
      <Icon size={13} />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer"
          className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline truncate block">
          {value}
        </a>
      ) : (
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">{value || '—'}</p>
      )}
    </div>
  </div>
);

const ResearchField = ({
  label, value, field, onSave, clientId
}: { label: string; value: string; field: string; onSave: (f: string, v: string) => void; clientId: any }) => {
  const { language } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [val, setVal] = useState(value || '');

  React.useEffect(() => {
    setVal(value || '');
  }, [value]);

  const save = () => {
    onSave(field, val);
    setEditing(false);
  };

  const hasContent = !!val;
  const preview = val?.length > 80 ? val.slice(0, 80) + '…' : val;

  return (
    <div className="mb-2 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Field header row — always visible */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/40">
        <button
          onClick={() => setExpanded(p => !p)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <ChevronDown
            size={12}
            className={`text-slate-400 transition-transform duration-150 shrink-0 ${expanded ? 'rotate-180' : ''}`}
          />
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{label}</span>
          {hasContent && !expanded && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate ml-1 max-w-[90px]">{preview}</span>
          )}
        </button>
        <button
          onClick={() => { setExpanded(true); editing ? save() : setEditing(true); }}
          className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
        >
          {editing ? <Save size={11} /> : <Edit3 size={11} />}
        </button>
      </div>

      {/* Expandable body */}
      {expanded && (
        <div className="px-3 py-2">
          {editing ? (
            <div className="relative">
              <textarea
                value={val}
                onChange={e => setVal(e.target.value)}
                rows={4}
                autoFocus
                className="w-full px-3 py-2 text-xs rounded-xl border border-indigo-300 dark:border-indigo-700
                           bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <div className="flex gap-1.5 mt-1.5">
                <button
                  onClick={save}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700"
                >
                  <Save size={10} /> Save
                </button>
                <button
                  onClick={() => { setEditing(false); setVal(value || ''); }}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-red-500"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {val || <span className="italic text-slate-400 dark:text-slate-600">{language === 'es' ? 'Haga clic en editar para añadir...' : 'Click edit to add...'}</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
};


export default function ClientSidebarPanel({
  client, research, onClientUpdate, onResearchUpdate, clientId
}: ClientSidebarPanelProps) {
  const { t, language } = useLanguage();
  const [researchOpen, setResearchOpen] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    contact_person: client?.contact_person || '',
    phone: client?.phone || '',
    address: client?.address || '',
    websiteUrl: client?.websiteUrl || '',
    linkedin_url: client?.linkedin_url || '',
    industry: client?.industry || '',
    employee_count: client?.employee_count || '',
    revenue_range: client?.revenue_range || '',
    lead_source: client?.lead_source || '',
    lead_score: client?.lead_score ?? '',
    deal_value: client?.deal_value ?? '',
    last_contact_date: client?.last_contact_date || '',
    next_followup_date: client?.next_followup_date || '',
  });

  const handleSaveProfile = async () => {
    await fetch(`${API_BASE_URL}/clients/${clientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...profileForm,
        lead_score: profileForm.lead_score !== '' ? Number(profileForm.lead_score) : null,
        deal_value: profileForm.deal_value !== '' ? Number(profileForm.deal_value) : null,
      }),
    });
    onClientUpdate({ ...profileForm });
    setEditingProfile(false);
  };

  const handleResearchSave = async (field: string, value: string) => {
    await fetch(`${API_BASE_URL}/clients/${clientId}/research`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    onResearchUpdate({ ...(research || {}), [field]: value });
  };

  const [isAutoResearching, setIsAutoResearching] = useState(false);
  const handleAutoResearch = async () => {
    try {
      setIsAutoResearching(true);
      const res = await fetch(`${API_BASE_URL}/clients/${clientId}/auto-research`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        onResearchUpdate(data.research);
        setResearchOpen(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAutoResearching(false);
    }
  };

  const formFields: [keyof typeof profileForm, string, string][] = [
    ['contact_person', language === 'es' ? 'Persona de Contacto' : 'Contact Person', 'text'],
    ['phone', language === 'es' ? 'Teléfono' : 'Phone', 'text'],
    ['address', language === 'es' ? 'Dirección' : 'Address', 'text'],
    ['websiteUrl', language === 'es' ? 'Sitio Web' : 'Website', 'url'],
    ['linkedin_url', 'LinkedIn URL', 'url'],
    ['industry', language === 'es' ? 'Industria' : 'Industry', 'text'],
    ['employee_count', language === 'es' ? 'Cantidad de Empleados' : 'Employee Count', 'text'],
    ['revenue_range', language === 'es' ? 'Rango de Ingresos' : 'Revenue Range', 'text'],
    ['lead_source', language === 'es' ? 'Fuente del Lead' : 'Lead Source', 'text'],
    ['lead_score', language === 'es' ? 'Puntaje Lead (0-100)' : 'Lead Score (0-100)', 'number'],
    ['deal_value', language === 'es' ? 'Valor ($)' : 'Deal Value ($)', 'number'],
    ['last_contact_date', language === 'es' ? 'Último Contacto' : 'Last Contact Date', 'date'],
    ['next_followup_date', language === 'es' ? 'Próximo Seguimiento' : 'Next Follow-up Date', 'date'],
  ];

  const researchFields = [
    ['company_overview', language === 'es' ? 'Resumen de la Empresa' : 'Company Overview'],
    ['competitors', language === 'es' ? 'Competidores' : 'Competitors'],
    ['tech_stack', language === 'es' ? 'Stack Tecnológico' : 'Tech Stack'],
    ['recent_news', language === 'es' ? 'Noticias Recientes' : 'Recent News'],
    ['pain_points', language === 'es' ? 'Puntos de Dolor' : 'Pain Points'],
    ['business_goals', language === 'es' ? 'Objetivos de Negocio' : 'Business Goals'],
    ['key_decision_makers', language === 'es' ? 'Tomadores de Decisiones' : 'Key Decision Makers'],
  ];

  return (
    <div className="space-y-4">
      {/* ── Pre-Sales Research Card ─────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60
                      bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <button
          onClick={() => setResearchOpen(p => !p)}
          className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-600 text-white">
              <Wand2 size={14} />
            </div>
            <span className="font-black text-sm text-slate-800 dark:text-white">{t("client_profile.research")}</span>
          </div>
          {researchOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>

        <AnimatePresence>
          {researchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800">
                <div className="pt-3">
                  <button
                    onClick={handleAutoResearch}
                    disabled={isAutoResearching}
                    className="w-full mb-4 py-2 px-3 flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-semibold text-xs rounded-xl transition-colors disabled:opacity-50"
                  >
                    {isAutoResearching ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    {isAutoResearching ? (language === 'es' ? 'Investigando Empresa...' : 'Researching Company...') : (language === 'es' ? 'Autocompletar con IA' : 'Auto-Fill with AI')}
                  </button>
                  {researchFields.map(([field, label]) => (
                    <ResearchField
                      key={field}
                      label={label}
                      value={research?.[field] || ''}
                      field={field}
                      onSave={handleResearchSave}
                      clientId={clientId}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
