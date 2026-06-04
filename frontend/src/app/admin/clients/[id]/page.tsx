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

// ─── Collapsible section (light only) ──────────────────────────────────────
function CollapsibleSection({ title, icon: Icon, count, defaultOpen = false, accentColor = 'bg-indigo-600', children }: {
  title: string; icon: any; count?: number; defaultOpen?: boolean; accentColor?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg ${accentColor} text-white`}>
            <Icon size={13} />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-slate-700">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-black">{count}</span>
          )}
        </div>
        <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-4 pt-0 border-t border-slate-100">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ client, employees, serviceRequests, activities, timeline, research, notes, conversations, clientId, onNotesRefresh, onConversationsRefresh }: any) {
  const { t, language } = useLanguage();
  const recentActivities = (activities || []).slice(0, 8);

  // ── Add Note state ─────────────────────────────────────────────────────────
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const submitNote = async () => {
    const txt = noteText.trim();
    if (!txt) return;
    setSavingNote(true);
    try {
      await fetch(`${API_BASE_URL}/clients/${clientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: txt, author_name: 'Admin' }),
      });
      setNoteText('');
      onNotesRefresh?.();
    } finally {
      setSavingNote(false);
    }
  };

  const handleNoteKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitNote();
  };

  // ── Log Conversation state ─────────────────────────────────────────────────
  const CONV_TYPES = ['call', 'email', 'meeting', 'whatsapp', 'chat', 'other'];
  const [convTitle, setConvTitle] = useState('');
  const [convType, setConvType] = useState('call');
  const [convBody, setConvBody] = useState('');
  const [savingConv, setSavingConv] = useState(false);

  const submitConv = async () => {
    const title = convTitle.trim();
    if (!title) return;
    setSavingConv(true);
    try {
      await fetch(`${API_BASE_URL}/clients/${clientId}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type: convType, description: convBody.trim(), author_name: 'Admin' }),
      });
      setConvTitle('');
      setConvBody('');
      setConvType('call');
      onConversationsRefresh?.();
    } finally {
      setSavingConv(false);
    }
  };

  const TYPE_COLORS: Record<string, string> = {
    call: 'bg-blue-100 text-blue-700',
    email: 'bg-indigo-100 text-indigo-700',
    meeting: 'bg-violet-100 text-violet-700',
    whatsapp: 'bg-emerald-100 text-emerald-700',
    chat: 'bg-sky-100 text-sky-700',
    other: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="space-y-4">

      {/* Company Overview */}
      {research?.company_overview && (
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-violet-600 text-white"><Building2 size={13} /></div>
            <span className="text-xs font-black uppercase tracking-wider text-violet-700">Company Overview</span>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{research.company_overview}</p>
        </div>
      )}

      {/* ── Add Note (always visible inline) ─────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3 border-b border-slate-100">
          <div className="p-1.5 rounded-lg bg-emerald-600 text-white"><StickyNote size={13} /></div>
          <span className="text-xs font-black uppercase tracking-wider text-slate-700">Add Note</span>
        </div>
        <div className="px-5 py-3">
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={handleNoteKey}
            placeholder="Type your note here… (Ctrl+Enter to save)"
            rows={3}
            className="w-full resize-none text-sm text-slate-800 placeholder-slate-400 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent bg-slate-50"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={submitNote}
              disabled={!noteText.trim() || savingNote}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {savingNote ? 'Saving…' : 'Save Note'}
            </button>
          </div>
        </div>

        {/* Existing notes — collapsed by default */}
        {notes && notes.length > 0 && (
          <CollapsibleSection title="Previous Notes" icon={StickyNote} count={notes.length} accentColor="bg-emerald-500" defaultOpen={false}>
            <div className="space-y-2 pt-3">
              {notes.slice(0, 10).map((n: any) => (
                <div key={n.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">{n.type || 'Note'}</span>
                    <span className="text-[10px] text-slate-400">{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{n.content}</p>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* ── Log Conversation (always visible inline) ──────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3 border-b border-slate-100">
          <div className="p-1.5 rounded-lg bg-sky-600 text-white"><MessageSquare size={13} /></div>
          <span className="text-xs font-black uppercase tracking-wider text-slate-700">Log Conversation</span>
        </div>
        <div className="px-5 py-3 space-y-3">
          {/* Type selector */}
          <div className="flex flex-wrap gap-1.5">
            {CONV_TYPES.map(type => (
              <button
                key={type}
                onClick={() => setConvType(type)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold capitalize transition-all border ${
                  convType === type
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:border-sky-300'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <input
            value={convTitle}
            onChange={e => setConvTitle(e.target.value)}
            placeholder="Summary / Title of conversation…"
            className="w-full text-sm text-slate-800 placeholder-slate-400 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent bg-slate-50"
          />
          <textarea
            value={convBody}
            onChange={e => setConvBody(e.target.value)}
            placeholder="Details, notes from the call / meeting… (optional)"
            rows={2}
            className="w-full resize-none text-sm text-slate-800 placeholder-slate-400 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent bg-slate-50"
          />
          <div className="flex justify-end">
            <button
              onClick={submitConv}
              disabled={!convTitle.trim() || savingConv}
              className="px-4 py-1.5 rounded-xl bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {savingConv ? 'Saving…' : 'Log Conversation'}
            </button>
          </div>
        </div>

        {/* Existing conversations — collapsed by default */}
        {conversations && conversations.length > 0 && (
          <CollapsibleSection title="Previous Conversations" icon={MessageSquare} count={conversations.length} accentColor="bg-sky-500" defaultOpen={false}>
            <div className="space-y-2 pt-3">
              {conversations.slice(0, 10).map((c: any) => (
                <div key={c.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${TYPE_COLORS[c.type] || TYPE_COLORS.other}`}>{c.type || 'Conversation'}</span>
                    <span className="text-[10px] text-slate-400">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-700 mb-0.5">{c.subject || c.title || '—'}</p>
                  {c.body && <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{c.body}</p>}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* Recent Activity — collapsed by default */}
      <CollapsibleSection title={t('client_tabs.recent_activity')} icon={Activity} accentColor="bg-indigo-600" defaultOpen={false}>
        <div className="space-y-1 pt-2">
          {recentActivities.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">{t('client_tabs.no_activity')}</p>
          ) : (
            recentActivities.map((a: any) => (
              <div key={a.id} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                <Clock size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{a.action}</p>
                  {a.method && <p className="text-[10px] text-slate-400">{t('client_tabs.via') || 'via'} {a.method}</p>}
                </div>
                <span className="text-[10px] text-slate-400 flex-shrink-0">
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

  // Force light theme always — no dark mode on this page
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('crm-dark-mode', 'false');
    setDarkMode(false);
  }, []);

  const toggleDarkMode = () => {
    // Light theme only — toggle is a no-op
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
                    clientId={id}
                    onNotesRefresh={() => fetch(`${API_BASE_URL}/clients/${id}/notes`).then(r => r.json()).then(d => setNotes(d.notes || []))}
                    onConversationsRefresh={() => fetch(`${API_BASE_URL}/clients/${id}/conversations`).then(r => r.json()).then(d => setConversations(d.conversations || []))}
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
