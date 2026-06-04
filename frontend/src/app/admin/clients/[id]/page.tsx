'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, MessageSquare, StickyNote, CheckSquare, Building2, ChevronDown,
  Target, FolderOpen, HeartPulse, LayoutDashboard, Users,
  TrendingUp, DollarSign, Zap, Star, Mail, Clock, Ticket
} from 'lucide-react';

import { API_BASE_URL } from '@/config';
import { useRole } from '@/context/RoleContext';
import { useLanguage } from '@/context/LanguageContext';

import ClientHeader from './components/ClientHeader';
import ClientSidebarPanel from './components/ClientSidebarPanel';
import AiCopilotPanel from './components/AiCopilotPanel';
import TimelineTab from './components/tabs/TimelineTab';
import ConversationsTab from './components/tabs/ConversationsTab';
import NotesTab from './components/tabs/NotesTab';
import TasksTab from './components/tabs/TasksTab';
import OpportunitiesTab from './components/tabs/OpportunitiesTab';
import FilesTab from './components/tabs/FilesTab';
import HealthTab from './components/tabs/HealthTab';
import TicketsTab from './components/tabs/TicketsTab';

// ─── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview',       label: 'Overview',       icon: LayoutDashboard },
  { key: 'timeline',       label: 'Timeline',        icon: Activity        },
  { key: 'conversations',  label: 'Conversations',   icon: MessageSquare   },
  { key: 'notes',          label: 'Notes',           icon: StickyNote      },
  { key: 'tasks',          label: 'Tasks',           icon: CheckSquare     },
  { key: 'tickets',        label: 'Tickets',         icon: Ticket          },
  { key: 'opportunities',  label: 'Opportunities',   icon: Target          },
  { key: 'files',          label: 'Files',           icon: FolderOpen      },
  { key: 'health',         label: 'Health',          icon: HeartPulse      },
];

// ─── Loading Skeleton ────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />;
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="h-36 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 animate-pulse" />
      <div className="w-full px-6 py-6 grid grid-cols-[280px_1fr_300px] gap-6">
        <div className="space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
        <div>
          <Skeleton className="h-[500px]" />
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible section ────────────────────────────────────────────────────
function CollapsibleSection({ title, icon: Icon, count, defaultOpen = true, accentColor = 'bg-indigo-600', children }: {
  title: string; icon: any; count?: number; defaultOpen?: boolean; accentColor?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg ${accentColor} text-white`}>
            <Icon size={13} />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-black">{count}</span>
          )}
        </div>
        <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-4 pt-0 border-t border-slate-100 dark:border-slate-800">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Overview Tab (inline) ───────────────────────────────────────────────────
function OverviewTab({ client, employees, serviceRequests, activities, timeline, research, notes, conversations }: any) {
  const { t, language } = useLanguage();
  const assignedEmp = employees.find((e: any) => e.id === client?.assignedEmployeeId);
  const recentActivities = (activities || []).slice(0, 8);

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('client_tabs.lead_score'),       value: client?.lead_score ? `${client.lead_score}/100` : '—',  icon: Star,      color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/20'   },
          { label: t('client_tabs.deal_value'),       value: client?.deal_value ? `$${Number(client.deal_value).toLocaleString()}` : '—', icon: DollarSign, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
          { label: t('client_tabs.active_requests'),  value: serviceRequests.filter((r: any) => !['Delivered'].includes(r.status)).length, icon: Zap, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: t('client_tabs.total_activities'), value: activities.length, icon: Activity, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${bg}`}>
              <Icon size={16} className={color} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
            <p className={`text-2xl font-black mt-0.5 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Company Overview from Pre-Sales Research */}
      {research?.company_overview && (
        <CollapsibleSection title="Company Overview" icon={Building2} accentColor="bg-violet-600">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed pt-3">
            {research.company_overview}
          </p>
        </CollapsibleSection>
      )}

      {/* Assigned Salesperson + Account Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">{t('client_tabs.assigned_salesperson')}</p>
          {assignedEmp ? (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-black text-white">{assignedEmp.name.charAt(0)}</span>
              </div>
              <div>
                <p className="font-black text-slate-900 dark:text-white">{assignedEmp.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{assignedEmp.email}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
                  {assignedEmp.role}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-2">
              <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Users size={20} className="text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">{t('client_tabs.no_salesperson')}</p>
                <p className="text-xs text-slate-300 dark:text-slate-600">{t('client_tabs.assign_one')}</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">{t('client_tabs.account_info')}</p>
          <div className="space-y-2">
            {[
              { label: t('client_tabs.status'),       value: client?.status || '—'       },
              { label: t('client_tabs.industry'),     value: client?.industry || '—'     },
              { label: t('client_tabs.lead_source'),  value: client?.lead_source || '—'  },
              { label: t('client_tabs.revenue'),      value: client?.customFields?.total_revenue || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-800 last:border-0">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</span>
                <span className="text-xs font-black text-slate-800 dark:text-slate-200">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notes inline — collapsible */}
      <CollapsibleSection title="Notes" icon={StickyNote} count={notes?.length} accentColor="bg-emerald-600">
        <div className="space-y-2 pt-3">
          {!notes || notes.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 italic">No notes yet.</p>
          ) : (
            notes.slice(0, 5).map((n: any) => (
              <div key={n.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/40">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{n.type || 'Note'}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{n.content}</p>
              </div>
            ))
          )}
        </div>
      </CollapsibleSection>

      {/* Conversations inline — collapsible */}
      <CollapsibleSection title="Recent Conversations" icon={MessageSquare} count={conversations?.length} accentColor="bg-sky-600">
        <div className="space-y-2 pt-3">
          {!conversations || conversations.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 italic">No conversations yet.</p>
          ) : (
            conversations.slice(0, 5).map((c: any) => (
              <div key={c.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/40">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400">{c.type || c.channel || 'Conversation'}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}</span>
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-0.5">{c.subject || c.title || '—'}</p>
                {c.body && <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">{c.body}</p>}
              </div>
            ))
          )}
        </div>
      </CollapsibleSection>

      {/* Recent Activity */}
      <CollapsibleSection title={t('client_tabs.recent_activity')} icon={Activity} accentColor="bg-indigo-600" defaultOpen={true}>
        <div className="space-y-1 pt-2">
          {recentActivities.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">{t('client_tabs.no_activity')}</p>
          ) : (
            recentActivities.map((a: any) => (
              <div key={a.id} className="flex items-start gap-3 py-2 border-b border-slate-50 dark:border-slate-800 last:border-0">
                <Clock size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{a.action}</p>
                  {a.method && <p className="text-[10px] text-slate-400 dark:text-slate-500">{t('client_tabs.via') || 'via'} {a.method}</p>}
                </div>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                  {a.createdAt ? new Date(a.createdAt).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' }) : ''}
                </span>
              </div>
            ))
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────
export default function AdminClientDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { role, user, loading } = useRole();
  const { t, language } = useLanguage();

  // Data state
  const [client, setClient]               = useState<any>(null);
  const [employees, setEmployees]         = useState<any[]>([]);
  const [activities, setActivities]       = useState<any[]>([]);
  const [emails, setEmails]               = useState<any[]>([]);
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [timeline, setTimeline]           = useState<any[]>([]);
  const [notes, setNotes]                 = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [tasks, setTasks]                 = useState<any[]>([]);
  const [files, setFiles]                 = useState<any[]>([]);
  const [research, setResearch]           = useState<any>(null);

  // UI state
  const [activeTab, setActiveTab]         = useState('overview');
  const [timelineFilter, setTimelineFilter] = useState('all');
  const [pageLoading, setPageLoading]     = useState(true);
  const [darkMode, setDarkMode]           = useState(false);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', role: 'SalesManager', password: 'password123' });

  // Dark mode persisted — fix: properly remove class when toggling back to light
  useEffect(() => {
    const saved = localStorage.getItem('crm-dark-mode');
    if (saved === 'true') {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('crm-dark-mode', String(next));
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };


  // ─── Fetch helpers ────────────────────────────────────────────────────────
  const fetchClient = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/clients/${id}`);
      const data = await res.json();
      setClient(data.client || data);
    } catch (e) { console.error(e); }
  }, [id]);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    try {
      const [clientRes, empRes, actRes, emailRes, svcRes, tlRes, notesRes, convRes, taskRes, filesRes, researchRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/clients/${id}`).then(r => r.json()),
        fetch(`${API_BASE_URL}/users?role=Employee,SalesManager`).then(r => r.json()),
        fetch(`${API_BASE_URL}/clients/${id}/activities`).then(r => r.json()),
        fetch(`${API_BASE_URL}/clients/${id}/emails`).then(r => r.json()),
        fetch(`${API_BASE_URL}/services/requests`).then(r => r.json()),
        fetch(`${API_BASE_URL}/clients/${id}/timeline`).then(r => r.json()),
        fetch(`${API_BASE_URL}/clients/${id}/notes`).then(r => r.json()),
        fetch(`${API_BASE_URL}/clients/${id}/conversations`).then(r => r.json()),
        fetch(`${API_BASE_URL}/tasks?client_id=${id}`).then(r => r.json()),
        fetch(`${API_BASE_URL}/clients/${id}/files`).then(r => r.json()),
        fetch(`${API_BASE_URL}/clients/${id}/research`).then(r => r.json()),
      ]);

      if (clientRes.status === 'fulfilled') setClient(clientRes.value.client || clientRes.value);
      if (empRes.status === 'fulfilled') setEmployees(empRes.value.users || []);
      if (actRes.status === 'fulfilled') setActivities(actRes.value.activities || []);
      if (emailRes.status === 'fulfilled') setEmails(emailRes.value.emails || []);
      if (svcRes.status === 'fulfilled') setServiceRequests((svcRes.value.requests || []).filter((r: any) => String(r.client_id) === String(id)));
      if (tlRes.status === 'fulfilled') setTimeline(tlRes.value.timeline || []);
      if (notesRes.status === 'fulfilled') setNotes(notesRes.value.notes || []);
      if (convRes.status === 'fulfilled') setConversations(convRes.value.conversations || []);
      if (taskRes.status === 'fulfilled') setTasks((taskRes.value.tasks || taskRes.value || []).filter((t: any) => String(t.client_id) === String(id)));
      if (filesRes.status === 'fulfilled') setFiles(filesRes.value.files || filesRes.value || []);
      if (researchRes.status === 'fulfilled') setResearch(researchRes.value.research || null);
    } catch (e) { console.error(e); }
    finally { setPageLoading(false); }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Quick action stubs ───────────────────────────────────────────────────
  const switchTab = (tab: string) => setActiveTab(tab);

  const handleCreateSalesperson = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUserForm),
      });
      if (res.ok) {
        const data = await res.json();
        // Automatically assign the newly created user to this client
        await fetch(`${API_BASE_URL}/clients/${id}/assign-employee`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_id: data.user.id }),
        });
        setNewUserForm({ name: '', email: '', role: 'SalesManager', password: 'password123' });
        setIsCreateUserOpen(false);
        fetchAll(); // Refresh employees and client details
      } else {
        alert('Failed to create user. Email might already exist.');
      }
    } catch (err) {
      console.error(err);
      alert('Error creating salesperson');
    }
  };

  // ─── Loading & Auth Guards ────────────────────────────────────────────────
  if (loading || pageLoading) return <PageSkeleton />;

  // Auth guard
  if (role && role !== 'Admin' && role !== 'Employee' && role !== 'SalesManager') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <p className="text-2xl font-black text-red-500 mb-2">{language === 'es' ? 'No autorizado' : 'Unauthorized'}</p>
          <p className="text-slate-500">{language === 'es' ? 'No tienes acceso a esta página.' : 'You do not have access to this page.'}</p>
        </div>
      </div>
    );
  }

  // Enforce assignment for SalesManager
  if (client && role === 'SalesManager' && String(client.assignedEmployeeId) !== String(user?.id)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <p className="text-2xl font-black text-red-500 mb-2">{language === 'es' ? 'No autorizado' : 'Unauthorized'}</p>
          <p className="text-slate-500">{language === 'es' ? 'Solo puedes ver clientes que te han sido asignados.' : 'You can only view clients assigned to you.'}</p>
        </div>
      </div>
    );
  }

  if (pageLoading) return <PageSkeleton />;
  if (!client) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <p className="text-red-500 font-bold">{language === 'es' ? 'Cliente no encontrado.' : 'Client not found.'}</p>
    </div>
  );

  const tabBadges: Record<string, number> = {
    conversations: conversations.length,
    notes:         notes.length,
    tasks:         tasks.filter(t => t.status !== 'Done').length,
    files:         files.length,
  };

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300`}>
      <AnimatePresence>
        {isCreateUserOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800"
            >
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h2 className="font-bold text-slate-800 dark:text-white">{language === 'es' ? 'Crear Nuevo Vendedor' : 'Create New Salesperson'}</h2>
                <button onClick={() => setIsCreateUserOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <Activity size={20} className="opacity-0" /> {/* Spacer */}
                  <span className="text-xl leading-none">&times;</span>
                </button>
              </div>
              <form onSubmit={handleCreateSalesperson} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">{language === 'es' ? 'Nombre' : 'Name'}</label>
                  <input required value={newUserForm.name} onChange={e => setNewUserForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Email</label>
                  <input required type="email" value={newUserForm.email} onChange={e => setNewUserForm(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">{language === 'es' ? 'Rol' : 'Role'}</label>
                  <select value={newUserForm.role} onChange={e => setNewUserForm(p => ({ ...p, role: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white">
                    <option value="Employee">{language === 'es' ? 'Empleado' : 'Employee'}</option>
                    <option value="SalesManager">{language === 'es' ? 'Gerente de Ventas' : 'Sales Manager'}</option>
                  </select>
                </div>
                <button type="submit" className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700">{language === 'es' ? 'Crear y Asignar' : 'Create & Assign'}</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Sticky Header ────────────────────────────────────────────── */}
      <ClientHeader
        client={client}
        employees={employees}
        onBack={() => router.back()}
        onAddNote={() => switchTab('notes')}
        onAddConversation={() => switchTab('conversations')}
        onCreateTask={() => switchTab('tasks')}
        onScheduleMeeting={() => switchTab('conversations')}
        onSendEmail={() => switchTab('conversations')}
        onUploadFile={() => switchTab('files')}
        onCreateOpportunity={() => switchTab('opportunities')}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* ── Full-Width layout ──────────────────────────────────────── */}
      <div className="w-full px-4 py-4">
        <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr_300px] gap-5">

          {/* ── LEFT: Pre-Sales Research only ────────────────── */}
          <aside className="space-y-4">
            <ClientSidebarPanel
              client={client}
              research={research}
              onClientUpdate={(u) => setClient((prev: any) => ({ ...prev, ...u }))}
              onResearchUpdate={setResearch}
              clientId={id}
            />
          </aside>

          {/* ── CENTER MAIN ──────────────────────────────────────────── */}
          <main className="min-w-0">
            {/* Tab Bar */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-5 scrollbar-thin">
              {TABS.map(({ key, label, icon: Icon }) => {
                const badge = tabBadges[key];
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold
                                whitespace-nowrap transition-all flex-shrink-0
                      ${activeTab === key
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-white/70 dark:hover:bg-slate-900/70 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    <Icon size={13} />
                    {(t(`client_tabs.${key}`) as string) || label}
                    {badge !== undefined && badge > 0 && (
                      <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center">
                        {badge}
                      </span>
                    )}
                    {activeTab === key && (
                      <motion.div
                        layoutId="tab-indicator"
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-full"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'overview' && (
                  <OverviewTab
                    client={client}
                    employees={employees}
                    serviceRequests={serviceRequests}
                    activities={activities}
                    timeline={timeline}
                    research={research}
                    notes={notes}
                    conversations={conversations}
                  />
                )}
                {activeTab === 'timeline' && (
                  <TimelineTab
                    timeline={timeline}
                    timelineFilter={timelineFilter}
                    onFilterChange={setTimelineFilter}
                  />
                )}
                {activeTab === 'conversations' && (
                  <ConversationsTab
                    clientId={id}
                    conversations={conversations}
                    employees={employees}
                    currentUser="Admin"
                    onRefresh={() => fetch(`${API_BASE_URL}/clients/${id}/conversations`).then(r => r.json()).then(d => setConversations(d.conversations || []))}
                  />
                )}
                {activeTab === 'notes' && (
                  <NotesTab
                    clientId={id}
                    notes={notes}
                    onRefresh={() => fetch(`${API_BASE_URL}/clients/${id}/notes`).then(r => r.json()).then(d => setNotes(d.notes || []))}
                  />
                )}
                {activeTab === 'tasks' && (
                  <TasksTab
                    clientId={id}
                    tasks={tasks}
                    employees={employees}
                    onRefresh={() => fetch(`${API_BASE_URL}/tasks?client_id=${id}`).then(r => r.json()).then(d => {
                      const all = d.tasks || d || [];
                      setTasks(all.filter((t: any) => String(t.client_id) === String(id)));
                    })}
                  />
                )}
                {activeTab === 'opportunities' && (
                  <OpportunitiesTab
                    client={client}
                    timeline={timeline}
                    serviceRequests={serviceRequests}
                  />
                )}
                {activeTab === 'files' && (
                  <FilesTab
                    clientId={id}
                    files={files}
                    onRefresh={() => fetch(`${API_BASE_URL}/clients/${id}/files`).then(r => r.json()).then(d => setFiles(d.files || d || []))}
                  />
                )}
                {activeTab === 'health' && (
                  <HealthTab
                    client={client}
                    activities={activities}
                    emails={emails}
                    timeline={timeline}
                    serviceRequests={serviceRequests}
                  />
                )}
                
                {activeTab === 'tickets' && (
                  <TicketsTab clientId={id} />
                )}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* ── RIGHT AI PANEL ──────────────────────────────────────── */}
          <aside className="space-y-4">
            <AiCopilotPanel clientId={id} client={client} />

            {/* Assign Salesperson Card */}
            {role === 'Admin' && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">{language === 'es' ? 'Asignar Vendedor' : 'Assign Salesperson'}</p>
                <select
                  value={client?.assignedEmployeeId || ''}
                  onChange={async (e) => {
                    const val = e.target.value;
                    if (!val) return;
                    if (val === 'create_new') {
                      setIsCreateUserOpen(true);
                      // Reset to original value visually so 'create_new' doesn't stay selected
                      e.target.value = client?.assignedEmployeeId || '';
                      return;
                    }
                    await fetch(`${API_BASE_URL}/clients/${id}/assign-employee`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ employee_id: Number(val) }),
                    });
                    fetchClient();
                  }}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700
                             bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200
                             focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{language === 'es' ? 'Seleccionar vendedor' : 'Select salesperson'}</option>
                  <option value="create_new" className="font-bold text-indigo-600">➕ {language === 'es' ? 'Crear Nuevo Vendedor' : 'Create New Salesperson'}</option>
                  {employees.map((e: any) => (
                    <option key={e.id} value={e.id}>{e.name} — {e.role}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Next Follow-up */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">{language === 'es' ? 'Fechas de Seguimiento' : 'Follow-up Dates'}</p>
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{language === 'es' ? 'Último Contacto' : 'Last Contact'}</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {client?.last_contact_date ? new Date(client.last_contact_date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{language === 'es' ? 'Próximo Seguimiento' : 'Next Follow-up'}</p>
                  <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                    {client?.next_followup_date ? new Date(client.next_followup_date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
