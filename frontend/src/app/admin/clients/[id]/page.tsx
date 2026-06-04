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
  return <div className={`animate-pulse bg-slate-200  rounded-xl ${className}`} />;
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 ">
      <div className="h-36 bg-white  border-b border-slate-200  animate-pulse" />
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

// ─── Collapsible section — forced light ────────────────────────────────────
function CollapsibleSection({ title, icon: Icon, count, defaultOpen = false, accentColor = '#6366f1', hexText = '#1e293b', children }: {
  title: string; icon: any; count?: number; defaultOpen?: boolean; accentColor?: string; hexText?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', marginTop: 0 }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: 'transparent', border: 'none', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: accentColor, borderRadius: 8, padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={12} color="#fff" />
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: hexText }}>{title}</span>
          {count !== undefined && count > 0 && (
            <span style={{ background: '#eef2ff', color: '#4f46e5', borderRadius: 999, padding: '1px 7px', fontSize: 10, fontWeight: 800 }}>{count}</span>
          )}
        </div>
        <ChevronDown size={14} color="#94a3b8" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 20px 16px', borderTop: '1px solid #f1f5f9' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Overview Tab — premium light ──────────────────────────────────────────
function OverviewTab({ client, employees, serviceRequests, activities, timeline, research, notes, conversations, clientId, onNotesRefresh, onConversationsRefresh }: any) {
  const { t, language } = useLanguage();
  const recentActivities = (activities || []).slice(0, 8);

  // ── Add Note ────────────────────────────────────────────────────────────
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteFocus, setNoteFocus] = useState(false);

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
    } finally { setSavingNote(false); }
  };

  // ── Log Conversation ─────────────────────────────────────────────────────
  const CONV_TYPES = [
    { key: 'call', label: '📞 Call', color: '#3b82f6' },
    { key: 'email', label: '✉️ Email', color: '#6366f1' },
    { key: 'meeting', label: '🗓 Meeting', color: '#8b5cf6' },
    { key: 'whatsapp', label: '💬 WhatsApp', color: '#10b981' },
    { key: 'chat', label: '⚡ Chat', color: '#0ea5e9' },
    { key: 'other', label: '📝 Other', color: '#64748b' },
  ];
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
      setConvTitle(''); setConvBody(''); setConvType('call');
      onConversationsRefresh?.();
    } finally { setSavingConv(false); }
  };

  const activeConvType = CONV_TYPES.find(t => t.key === convType)!;

  const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' as const };
  const input = { width: '100%', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '11px 14px', fontSize: 13.5, color: '#1e293b', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14, background: '#f8fafc', minHeight: '100%' }}>

      {/* Company Overview */}
      {research?.company_overview && (
        <div style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)', border: '1px solid #c7d2fe', borderRadius: 18, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ background: '#7c3aed', borderRadius: 8, padding: '4px 7px', display: 'flex' }}><Building2 size={13} color="#fff" /></div>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#5b21b6' }}>Company Overview</span>
          </div>
          <p style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.65, margin: 0 }}>{research.company_overview}</p>
        </div>
      )}

      {/* ── Add Note ──────────────────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
          <div style={{ background: '#059669', borderRadius: 9, padding: '5px 7px', display: 'flex' }}><StickyNote size={13} color="#fff" /></div>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#1e293b' }}>Add Note</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>Ctrl+Enter to save</span>
        </div>
        <div style={{ padding: '14px 20px 16px' }}>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitNote(); }}
            onFocus={() => setNoteFocus(true)}
            onBlur={() => setNoteFocus(false)}
            placeholder="What happened? Write your note here…"
            rows={3}
            style={{ ...input, resize: 'none', border: noteFocus ? '1.5px solid #059669' : '1.5px solid #e2e8f0', transition: 'border 0.15s', display: 'block' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              onClick={submitNote}
              disabled={!noteText.trim() || savingNote}
              style={{ background: noteText.trim() ? '#059669' : '#d1fae5', color: noteText.trim() ? '#fff' : '#6ee7b7', border: 'none', borderRadius: 10, padding: '8px 20px', fontSize: 12.5, fontWeight: 700, cursor: noteText.trim() ? 'pointer' : 'default', transition: 'all 0.15s' }}
            >
              {savingNote ? 'Saving…' : '✓ Save Note'}
            </button>
          </div>
        </div>

        {/* Previous notes — collapsed */}
        {notes && notes.length > 0 && (
          <div style={{ borderTop: '1px solid #f1f5f9' }}>
            <CollapsibleSection title="Previous Notes" icon={StickyNote} count={notes.length} accentColor="#059669">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10 }}>
                {notes.slice(0, 10).map((n: any) => (
                  <div key={n.id} style={{ background: '#f8fafc', border: '1px solid #e8f5e9', borderRadius: 12, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#059669' }}>{n.type || 'Note'}</span>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}</span>
                    </div>
                    <p style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.6, margin: 0 }}>{n.content}</p>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </div>
        )}
      </div>

      {/* ── Log Conversation ───────────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
          <div style={{ background: '#0284c7', borderRadius: 9, padding: '5px 7px', display: 'flex' }}><MessageSquare size={13} color="#fff" /></div>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#1e293b' }}>Log Conversation</span>
        </div>
        <div style={{ padding: '14px 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Type pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
            {CONV_TYPES.map(tp => (
              <button
                key={tp.key}
                onClick={() => setConvType(tp.key)}
                style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  border: convType === tp.key ? `2px solid ${tp.color}` : '1.5px solid #e2e8f0',
                  background: convType === tp.key ? tp.color : '#f8fafc',
                  color: convType === tp.key ? '#fff' : '#475569',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {tp.label}
              </button>
            ))}
          </div>
          <input
            value={convTitle}
            onChange={e => setConvTitle(e.target.value)}
            placeholder={`${activeConvType.label} summary — what was discussed?`}
            style={input}
          />
          <textarea
            value={convBody}
            onChange={e => setConvBody(e.target.value)}
            placeholder="Additional details, action items, follow-ups… (optional)"
            rows={2}
            style={{ ...input, resize: 'none', display: 'block' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={submitConv}
              disabled={!convTitle.trim() || savingConv}
              style={{ background: convTitle.trim() ? activeConvType.color : '#e2e8f0', color: convTitle.trim() ? '#fff' : '#94a3b8', border: 'none', borderRadius: 10, padding: '8px 20px', fontSize: 12.5, fontWeight: 700, cursor: convTitle.trim() ? 'pointer' : 'default', transition: 'all 0.15s' }}
            >
              {savingConv ? 'Saving…' : `✓ Log ${activeConvType.label}`}
            </button>
          </div>
        </div>

        {/* Previous conversations — collapsed */}
        {conversations && conversations.length > 0 && (
          <div style={{ borderTop: '1px solid #f1f5f9' }}>
            <CollapsibleSection title="Previous Conversations" icon={MessageSquare} count={conversations.length} accentColor="#0284c7">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10 }}>
                {conversations.slice(0, 10).map((c: any) => {
                  const ct = CONV_TYPES.find(t => t.key === c.type) || CONV_TYPES[5];
                  return (
                    <div key={c.id} style={{ background: '#f8fafc', border: '1px solid #e0f2fe', borderRadius: 12, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: ct.color, background: ct.color + '18', borderRadius: 999, padding: '2px 8px' }}>{c.type || 'Conversation'}</span>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}</span>
                      </div>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b', margin: '4px 0 2px' }}>{c.subject || c.title || '—'}</p>
                      {c.body && <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{c.body}</p>}
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <CollapsibleSection title={t('client_tabs.recent_activity')} icon={Activity} accentColor="#6366f1" defaultOpen={false}>
        <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {recentActivities.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '16px 0' }}>{t('client_tabs.no_activity')}</p>
          ) : (
            recentActivities.map((a: any) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <Clock size={12} color="#94a3b8" style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.action}</p>
                  {a.method && <p style={{ fontSize: 11, color: '#94a3b8', margin: '1px 0 0' }}>via {a.method}</p>}
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
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

  useEffect(() => {
    const handleRefresh = () => fetchAll();
    window.addEventListener('refresh-client-data', handleRefresh);
    return () => window.removeEventListener('refresh-client-data', handleRefresh);
  }, [fetchAll]);

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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 ">
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 ">
        <div className="text-center">
          <p className="text-2xl font-black text-red-500 mb-2">{language === 'es' ? 'No autorizado' : 'Unauthorized'}</p>
          <p className="text-slate-500">{language === 'es' ? 'Solo puedes ver clientes que te han sido asignados.' : 'You can only view clients assigned to you.'}</p>
        </div>
      </div>
    );
  }

  if (pageLoading) return <PageSkeleton />;
  if (!client) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 ">
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
    <div className={`min-h-screen bg-slate-50  transition-colors duration-300`}>
      <AnimatePresence>
        {isCreateUserOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white  rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 "
            >
              <div className="p-4 border-b border-slate-100  flex justify-between items-center">
                <h2 className="font-bold text-slate-800 ">{language === 'es' ? 'Crear Nuevo Vendedor' : 'Create New Salesperson'}</h2>
                <button onClick={() => setIsCreateUserOpen(false)} className="text-slate-400 hover:text-slate-600 ">
                  <Activity size={20} className="opacity-0" /> {/* Spacer */}
                  <span className="text-xl leading-none">&times;</span>
                </button>
              </div>
              <form onSubmit={handleCreateSalesperson} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">{language === 'es' ? 'Nombre' : 'Name'}</label>
                  <input required value={newUserForm.name} onChange={e => setNewUserForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200  bg-slate-50  focus:outline-none focus:ring-2 focus:ring-indigo-500 " />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Email</label>
                  <input required type="email" value={newUserForm.email} onChange={e => setNewUserForm(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200  bg-slate-50  focus:outline-none focus:ring-2 focus:ring-indigo-500 " />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">{language === 'es' ? 'Rol' : 'Role'}</label>
                  <select value={newUserForm.role} onChange={e => setNewUserForm(p => ({ ...p, role: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200  bg-slate-50  focus:outline-none focus:ring-2 focus:ring-indigo-500 ">
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
            {/* Tab Bar - Premium Pill Style */}
            <div className="flex items-center gap-2 overflow-x-auto p-1.5 mb-6 bg-slate-100/80 rounded-2xl border border-slate-200/60 scrollbar-thin w-fit max-w-full">
              {TABS.map(({ key, label, icon: Icon }) => {
                const badge = tabBadges[key];
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold
                                whitespace-nowrap transition-all flex-shrink-0
                      ${activeTab === key
                        ? 'bg-white text-indigo-600 shadow-[0_2px_10px_rgba(0,0,0,0.06)] border border-slate-200/50'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                      }`}
                  >
                    <Icon size={14} className={activeTab === key ? 'text-indigo-500' : 'text-slate-400'} />
                    {(t(`client_tabs.${key}`) as string) || label}
                    {badge !== undefined && badge > 0 && (
                      <span className={`ml-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center transition-colors
                        ${activeTab === key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'}`}>
                        {badge}
                      </span>
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
              <div className="rounded-2xl border border-slate-200  bg-white  p-4 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400  mb-3">{language === 'es' ? 'Asignar Vendedor' : 'Assign Salesperson'}</p>
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
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 
                             bg-slate-50  text-slate-800 
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
            <div className="rounded-2xl border border-slate-200  bg-white  p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wider text-slate-400  mb-2">{language === 'es' ? 'Fechas de Seguimiento' : 'Follow-up Dates'}</p>
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] text-slate-400 ">{language === 'es' ? 'Último Contacto' : 'Last Contact'}</p>
                  <p className="text-sm font-bold text-slate-800 ">
                    {client?.last_contact_date ? new Date(client.last_contact_date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 ">{language === 'es' ? 'Próximo Seguimiento' : 'Next Follow-up'}</p>
                  <p className="text-sm font-bold text-amber-600 ">
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
