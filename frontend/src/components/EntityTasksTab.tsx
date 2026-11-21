'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  CheckSquare,
  User,
  Calendar,
  Flag,
  ArrowRight,
  ShieldCheck,
  Search,
  Filter,
  Sparkles,
  Loader2
} from 'lucide-react';
import { API_BASE_URL } from '@/config';
import { useLanguage } from '@/context/LanguageContext';
import { useRole } from '@/context/RoleContext';

export interface EntityTasksTabProps {
  leadId?: string | number;
  clientId?: string | number;
  entityName?: string;
  tasks: any[];
  employees: any[];
  onRefresh: () => void;
}

const STAGES = [
  { key: 'Todo', label: 'To Do', labelEs: 'Por Hacer', color: 'slate', icon: Clock },
  { key: 'In Progress', label: 'In Progress', labelEs: 'En Progreso', color: 'blue', icon: AlertCircle },
  { key: 'In QA', label: 'In QA', labelEs: 'En QA / Revisión', color: 'purple', icon: ShieldCheck },
  { key: 'Done', label: 'Done', labelEs: 'Completado', color: 'emerald', icon: CheckCircle2 },
];

const STAGE_STYLES: Record<string, { badge: string; border: string; text: string; bg: string }> = {
  'Todo': {
    badge: 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-300 dark:border-zinc-700',
    border: 'border-slate-200 dark:border-zinc-800',
    text: 'text-slate-600 dark:text-zinc-400',
    bg: 'bg-slate-50 dark:bg-zinc-900/50',
  },
  'In Progress': {
    badge: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60',
    border: 'border-blue-200 dark:border-blue-900/40',
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50/40 dark:bg-blue-950/20',
  },
  'In QA': {
    badge: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60',
    border: 'border-purple-200 dark:border-purple-900/40',
    text: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50/40 dark:bg-purple-950/20',
  },
  'Done': {
    badge: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
    border: 'border-emerald-200 dark:border-emerald-900/40',
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50/40 dark:bg-emerald-950/20',
  },
};

const PRIORITY_BADGES: Record<string, { bg: string; text: string }> = {
  Low: { bg: 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400', text: 'Low' },
  Medium: { bg: 'bg-amber-100/80 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300', text: 'Medium' },
  High: { bg: 'bg-orange-100/80 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300', text: 'High' },
  Urgent: { bg: 'bg-rose-100/90 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold', text: 'Urgent' },
};

function normalizeStage(st: string): string {
  const s = (st || '').trim().toLowerCase();
  if (s === 'todo' || s === 'pending') return 'Todo';
  if (s === 'in progress' || s === 'inprogress') return 'In Progress';
  if (s === 'in qa' || s === 'inqa' || s === 'qa' || s === 'review') return 'In QA';
  if (s === 'done' || s === 'completed') return 'Done';
  return 'Todo';
}

export default function EntityTasksTab({
  leadId,
  clientId,
  entityName,
  tasks,
  employees,
  onRefresh,
}: EntityTasksTabProps) {
  const { language } = useLanguage();
  const { user, role } = useRole();

  const [activeStageFilter, setActiveStageFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);

  // Create form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    due_date: '',
    assigned_to: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const isEs = language === 'es';

  // Can create tasks: Admin, SuperAdmin, SalesManager, Employee
  const canCreate = role === 'Admin' || role === 'SuperAdmin' || role === 'SalesManager' || role === 'Employee';

  const handleStageChange = async (taskId: number, newStage: string) => {
    setUpdatingTaskId(taskId);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStage }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to update task stage', err);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        due_date: form.due_date || null,
        status: 'Todo',
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        created_by: user?.id || null,
      };

      if (leadId) payload.lead_id = Number(leadId);
      if (clientId) payload.client_id = Number(clientId);

      const res = await fetch(`${API_BASE_URL}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setForm({
          title: '',
          description: '',
          priority: 'Medium',
          due_date: '',
          assigned_to: '',
        });
        setShowCreateModal(false);
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to create task', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter tasks
  const normalizedTasks = (tasks || []).map(t => ({
    ...t,
    currentStage: normalizeStage(t.status),
  }));

  const filteredTasks = normalizedTasks.filter(t => {
    if (activeStageFilter !== 'all' && t.currentStage !== activeStageFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (t.title || '').toLowerCase().includes(q);
      const matchDesc = (t.description || '').toLowerCase().includes(q);
      const matchAssignee = (t.assignee_name || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchAssignee) return false;
    }
    return true;
  });

  const counts: Record<string, number> = {
    all: normalizedTasks.length,
    Todo: normalizedTasks.filter(t => t.currentStage === 'Todo').length,
    'In Progress': normalizedTasks.filter(t => t.currentStage === 'In Progress').length,
    'In QA': normalizedTasks.filter(t => t.currentStage === 'In QA').length,
    'Done': normalizedTasks.filter(t => t.currentStage === 'Done').length,
  };

  return (
    <div className="space-y-5">
      {/* Top Banner / Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center">
              <CheckSquare className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-zinc-100">
              {isEs ? 'Tareas para el Equipo de Desarrollo / Ingeniería' : 'Engineering & Developer Tasks'}
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {isEs
              ? 'Asigna tareas técnicas a desarrolladores e ingenieros. Notifica automáticamente cambios de estado al Administrador y Vendedor.'
              : 'Assign technical deliverables to developers and engineers. Automatically notifies Admin and Sales Rep on stage transitions.'}
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isEs ? 'Crear Tarea para Ingenieros' : 'New Task for Engineers'}</span>
          </button>
        )}
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Stage Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-xl border border-slate-200/80 dark:border-zinc-700/60 overflow-x-auto w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveStageFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeStageFilter === 'all'
                ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
            }`}
          >
            {isEs ? 'Todas' : 'All'} ({counts.all})
          </button>
          {STAGES.map(s => {
            const Icon = s.icon;
            const count = counts[s.key] || 0;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActiveStageFilter(s.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeStageFilter === s.key
                    ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{isEs ? s.labelEs : s.label}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/80 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-bold">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={isEs ? 'Buscar tarea o asignado...' : 'Search task or engineer...'}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs"
          />
        </div>
      </div>

      {/* Task Cards List */}
      {filteredTasks.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/30">
          <CheckSquare className="w-10 h-10 text-slate-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
            {isEs ? 'No se encontraron tareas en esta etapa' : 'No tasks found for this stage'}
          </p>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
            {canCreate
              ? (isEs ? 'Crea una nueva tarea para asignarla al equipo de desarrollo.' : 'Create a new task to assign deliverables to engineering.')
              : (isEs ? 'No hay tareas asignadas actualmente.' : 'No tasks currently assigned.')}
          </p>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isEs ? 'Crear Primera Tarea' : 'Create First Task'}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredTasks.map(task => {
            const stageStyle = STAGE_STYLES[task.currentStage] || STAGE_STYLES.Todo;
            const priorityStyle = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.Medium;
            const isUpdating = updatingTaskId === task.id;

            return (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border ${stageStyle.border} bg-white dark:bg-zinc-900 p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between`}
              >
                <div>
                  {/* Card Header: Title & Priority */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className={`text-sm font-bold ${task.currentStage === 'Done' ? 'line-through text-slate-400 dark:text-zinc-500' : 'text-slate-900 dark:text-white'}`}>
                      {task.title}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${priorityStyle.bg}`}>
                      {task.priority}
                    </span>
                  </div>

                  {/* Description */}
                  {task.description && (
                    <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-3 mb-3">
                      {task.description}
                    </p>
                  )}

                  {/* Metadata Row */}
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-zinc-400 flex-wrap mb-4">
                    {/* Assignee */}
                    <div className="flex items-center gap-1.5" title="Engineer assigned">
                      <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[10px] font-bold">
                        {(task.assignee_name || 'E').charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-700 dark:text-zinc-300">
                        {task.assignee_name || (isEs ? 'Sin asignar' : 'Unassigned')}
                      </span>
                    </div>

                    {/* Due Date */}
                    {task.due_date && (
                      <div className="flex items-center gap-1" title="Due Date">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {new Date(task.due_date).toLocaleDateString(isEs ? 'es-ES' : 'en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer: Stage Progression Controls */}
                <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
                  {/* Current Stage Indicator */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {isEs ? 'Etapa:' : 'Stage:'}
                    </span>
                    <select
                      value={task.currentStage}
                      disabled={isUpdating}
                      onChange={e => handleStageChange(task.id, e.target.value)}
                      className={`text-xs font-bold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none shadow-xs transition-colors ${stageStyle.badge}`}
                      title={isEs ? 'Cambiar etapa de tarea' : 'Change task stage'}
                    >
                      {STAGES.map(st => (
                        <option key={st.key} value={st.key} className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-white">
                          {isEs ? st.labelEs : st.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 1-Click Stage Advancer */}
                  <div className="flex items-center gap-1">
                    {task.currentStage === 'Todo' && (
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleStageChange(task.id, 'In Progress')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition cursor-pointer"
                        title="Start progress"
                      >
                        {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                        <span>{isEs ? 'Comenzar' : 'Start Progress'}</span>
                      </button>
                    )}

                    {task.currentStage === 'In Progress' && (
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleStageChange(task.id, 'In QA')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition cursor-pointer"
                        title="Send to QA review"
                      >
                        {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                        <span>{isEs ? 'Enviar a QA' : 'Send to QA'}</span>
                      </button>
                    )}

                    {task.currentStage === 'In QA' && (
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleStageChange(task.id, 'Done')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition cursor-pointer"
                        title="Mark Done"
                      >
                        {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        <span>{isEs ? 'Marcar Completado' : 'Mark Done'}</span>
                      </button>
                    )}

                    {task.currentStage === 'Done' && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isEs ? 'Finalizado' : 'Completed'}</span>
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create Task Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            onClick={e => {
              if (e.target === e.currentTarget) setShowCreateModal(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {isEs ? 'Nueva Tarea de Ingeniería' : 'New Engineering Task'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {entityName ? `${isEs ? 'Para' : 'For'}: ${entityName}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateTask} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    {isEs ? 'Título de la Tarea *' : 'Task Title *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder={isEs ? 'ej. Implementar endpoint de webhook o corrección frontend' : 'e.g. Implement webhook endpoint or fix styling'}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    {isEs ? 'Descripción y Requisitos' : 'Description & Scope'}
                  </label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder={isEs ? 'Detalles de especificación técnica...' : 'Technical details, acceptance criteria...'}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      {isEs ? 'Ingeniero / Asignado' : 'Assign Engineer / Developer'}
                    </label>
                    <select
                      value={form.assigned_to}
                      onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs cursor-pointer"
                    >
                      <option value="">{isEs ? 'Sin asignar' : 'Unassigned'}</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.role || 'Member'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      {isEs ? 'Prioridad' : 'Priority'}
                    </label>
                    <select
                      value={form.priority}
                      onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs cursor-pointer"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    {isEs ? 'Fecha de Entrega' : 'Due Date'}
                  </label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                  >
                    {isEs ? 'Cancelar' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !form.title.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{isEs ? 'Creando...' : 'Creating...'}</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isEs ? 'Crear Tarea' : 'Create Task'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

