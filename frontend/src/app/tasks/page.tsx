"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Plus, X, Loader2, CheckCircle2, Clock, AlertCircle, Zap,
  User, Calendar, Tag, Trash2, MessageSquare, ChevronDown,
  LayoutList, LayoutGrid, Search, Check, Filter
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";
import PageGuide from '@/components/PageGuide';
import { useLanguage } from "@/context/LanguageContext";

interface Task {
  id: number;
  title: string;
  description?: string;
  status: "Todo" | "InProgress" | "Done";
  priority: "Low" | "Medium" | "High" | "Urgent";
  due_date?: string;
  client_id?: number;
  project_id?: number;
  assigned_to?: number;
  assignee_name?: string;
  client_name?: string;
  creator_name?: string;
  created_at: string;
}

interface Employee { id: number; name: string; email: string; }
interface Client { id: number; companyName?: string; name?: string; }

const PRIORITY_STYLES: Record<string, string> = {
  Low: "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200/80 dark:border-zinc-700",
  Medium: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/40",
  High: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200/60 dark:border-orange-800/40",
  Urgent: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-800/40",
};

export default function TasksPage() {
  const { t } = useLanguage();
  const { user, role } = useRole();
  const userId = user?.id;
  const isClient = role === "Client";
  const clientId = user?.client_id;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [taskComments, setTaskComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);

  // Filter & View Mode
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const [form, setForm] = useState({
    title: "", description: "", priority: "Medium",
    due_date: "", assigned_to: "", client_id: "", project_id: "",
  });

  const COLUMNS: { key: Task["status"]; label: string; color: string; bg: string; icon: any }[] = [
    { key: "Todo", label: t("tasks.col_todo"), color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: Clock },
    { key: "InProgress", label: t("tasks.col_in_progress"), color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500/10 border-sky-500/20", icon: Zap },
    { key: "Done", label: t("tasks.col_done"), color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  ];

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    let taskUrl = isClient && clientId
      ? `${API_BASE_URL}/tasks?client_id=${clientId}`
      : `${API_BASE_URL}/tasks`;
    if (!isClient && role === 'Employee' && userId) {
      taskUrl += (taskUrl.includes('?') ? '&' : '?') + `assigned_to=${userId}`;
    }
    const [tasksData, e, c] = await Promise.all([
      fetch(taskUrl).then(r => r.json()),
      isClient ? Promise.resolve({ employees: [] }) : fetch(`${API_BASE_URL}/employees`).then(r => r.json()),
      isClient ? Promise.resolve({ clients: [] }) : fetch(`${API_BASE_URL}/clients`).then(r => r.json()),
    ]);
    setTasks(tasksData.tasks || []);
    setEmployees(e.employees || []);
    setClients(c.clients || []);
    setLoading(false);
  }

  async function openDetail(task: Task) {
    setSelectedTask(task);
    setShowDetailModal(true);
    const res = await fetch(`${API_BASE_URL}/tasks/${task.id}`);
    const data = await res.json();
    setTaskComments(data.task?.comments || []);
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch(`${API_BASE_URL}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        client_id: form.client_id ? Number(form.client_id) : null,
        project_id: form.project_id ? Number(form.project_id) : null,
        created_by: userId || null,
      }),
    });
    setShowModal(false);
    setForm({ title: "", description: "", priority: "Medium", due_date: "", assigned_to: "", client_id: "", project_id: "" });
    fetchAll();
    setSubmitting(false);
  }

  async function moveTask(taskId: number, newStatus: Task["status"]) {
    await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  }

  async function deleteTask(taskId: number) {
    await fetch(`${API_BASE_URL}/tasks/${taskId}`, { method: "DELETE" });
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setShowDetailModal(false);
  }

  async function addComment() {
    if (!newComment.trim() || !selectedTask) return;
    const res = await fetch(`${API_BASE_URL}/tasks/${selectedTask.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newComment, author_id: userId || null }),
    });
    const data = await res.json();
    setTaskComments(prev => [...prev, data]);
    setNewComment("");
  }

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchesSearch = !searchQuery ||
        (t.title && t.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.assignee_name && t.assignee_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.client_name && t.client_name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;
      return matchesSearch && matchesPriority;
    });
  }, [tasks, searchQuery, priorityFilter]);

  const columnTasks = (status: Task["status"]) => filteredTasks.filter(t => t.status === status);

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-16">
      {/* Compact Executive Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">
                {isClient ? t("tasks.title_client") : t("tasks.title_staff")}
              </h1>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700">
                {tasks.length}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 leading-none mt-0.5 truncate">
              {isClient ? t("tasks.subtitle_client") : t("tasks.subtitle_staff")}
            </p>
          </div>
        </div>
        {!isClient && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 shadow-2xs transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> {t("tasks.new_task")}
          </button>
        )}
      </div>

      <PageGuide
        pageKey="tasks"
        title={isClient ? t("tasks.guide_title_client") : t("tasks.guide_title_staff")}
        description={isClient ? t("tasks.guide_desc_client") : t("tasks.guide_desc_staff")}
        steps={isClient ? [
          { icon: '📋', text: t("tasks.guide_cs1") },
          { icon: '🏷️', text: t("tasks.guide_cs2") },
          { icon: '📅', text: t("tasks.guide_cs3") },
          { icon: '💬', text: t("tasks.guide_cs4") },
        ] : [
          { icon: '➕', text: t("tasks.guide_s1") },
          { icon: '🔄', text: t("tasks.guide_s2") },
          { icon: '🏷️', text: t("tasks.guide_s3") },
          { icon: '🗑️', text: t("tasks.guide_s4") },
        ]}
      />

      {/* Compact 3-KPI Metric Strip */}
      <div className="grid grid-cols-3 gap-2">
        {COLUMNS.map(col => {
          const count = tasks.filter(t => t.status === col.key).length;
          return (
            <div key={col.key} className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2">
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center border shrink-0", col.bg)}>
                  <col.icon className={cn("w-3.5 h-3.5", col.color)} />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none">{col.label}</div>
                  <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{count}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Single-row Search & Filter Toolbar */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2 px-3 flex items-center justify-between gap-3 shadow-2xs flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search tasks..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 rounded-lg border border-slate-200/90 dark:border-white/10 bg-slate-50 dark:bg-zinc-800/60 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-zinc-200"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            {["all", "Urgent", "High", "Medium", "Low"].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap",
                  priorityFilter === p 
                    ? "bg-blue-600 text-white shadow-2xs" 
                    : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                )}
              >
                {p === "all" ? "All" : p}
              </button>
            ))}
          </div>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-slate-200/80 dark:border-white/5 shrink-0">
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "p-1 rounded-md transition-colors",
              viewMode === "list" ? "bg-white dark:bg-zinc-700 text-blue-600 shadow-2xs" : "text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
            )}
            title="List view"
          >
            <LayoutList className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode("board")}
            className={cn(
              "p-1 rounded-md transition-colors",
              viewMode === "board" ? "bg-white dark:bg-zinc-700 text-blue-600 shadow-2xs" : "text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
            )}
            title="Board view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-1.5">
          {/* Desktop Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-3 px-3 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
            <div className="col-span-5">Task & Details</div>
            <div className="col-span-2">Priority</div>
            <div className="col-span-2">Assignee & Due</div>
            <div className="col-span-3 text-right">Status & Action</div>
          </div>

          {filteredTasks.map(task => (
            <div
              key={task.id}
              onClick={() => openDetail(task)}
              className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 shadow-2xs hover:shadow-xs hover:border-blue-500/60 dark:hover:border-blue-500/50 transition-all duration-150 group cursor-pointer"
            >
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 items-center">
                {/* Title & Description */}
                <div className="col-span-5 min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white text-[13px] leading-tight truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {task.title}
                  </div>
                  {task.description && (
                    <div className="text-[11px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">
                      {task.description}
                    </div>
                  )}
                  {task.client_name && (
                    <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium truncate mt-0.5 flex items-center gap-1">
                      <Tag className="w-2.5 h-2.5" />
                      {task.client_name}
                    </div>
                  )}
                </div>

                {/* Priority */}
                <div className="col-span-2 flex items-center">
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border", PRIORITY_STYLES[task.priority])}>
                    {task.priority}
                  </span>
                </div>

                {/* Assignee & Due */}
                <div className="col-span-2 flex flex-col justify-center text-[11px] text-slate-600 dark:text-zinc-300 min-w-0">
                  {task.assignee_name ? (
                    <span className="truncate flex items-center gap-1 font-medium">
                      <User className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{task.assignee_name}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Unassigned</span>
                  )}
                  {task.due_date && (
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                      {task.due_date}
                    </span>
                  )}
                </div>

                {/* Status Dropdown & Action */}
                <div className="col-span-3 flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                  <select
                    value={task.status}
                    onChange={e => moveTask(task.id, e.target.value as Task["status"])}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-bold rounded-md border outline-none cursor-pointer",
                      task.status === "Todo" ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 border-amber-200/60 dark:border-amber-800/40" :
                      task.status === "InProgress" ? "bg-sky-50 dark:bg-sky-950/40 text-sky-600 border-sky-200/60 dark:border-sky-800/40" :
                      "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border-emerald-200/60 dark:border-emerald-800/40"
                    )}
                  >
                    <option value="Todo">Todo</option>
                    <option value="InProgress">In Progress</option>
                    <option value="Done">Done</option>
                  </select>

                  <button
                    onClick={() => openDetail(task)}
                    className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
                    title="View details"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredTasks.length === 0 && (
            <div className="p-8 text-center bg-white dark:bg-zinc-900 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800">
              <CheckCircle2 className="w-6 h-6 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-zinc-400">No tasks match your filters</p>
            </div>
          )}
        </div>
      ) : (
        /* Board Mode */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {COLUMNS.map(col => (
            <div
              key={col.key}
              className="rounded-xl bg-slate-50/60 dark:bg-zinc-950 border border-slate-200/90 dark:border-white/10 p-3 min-h-[360px]"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                if (dragging !== null) moveTask(dragging, col.key);
                setDragging(null);
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <col.icon className={cn("w-3.5 h-3.5", col.color)} />
                <h3 className={cn("font-bold text-xs uppercase tracking-wide", col.color)}>{col.label}</h3>
                <span className="ml-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 text-[10px] font-bold rounded-full px-1.5 py-0.2">
                  {columnTasks(col.key).length}
                </span>
              </div>

              <div className="space-y-2">
                {columnTasks(col.key).map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDragging(task.id)}
                    onDragEnd={() => setDragging(null)}
                    onClick={() => openDetail(task)}
                    className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/90 dark:border-white/10 p-2.5 px-3 cursor-pointer shadow-2xs hover:shadow-xs hover:border-blue-500/60 dark:hover:border-blue-500/50 transition-all duration-150 group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="font-semibold text-slate-900 dark:text-zinc-50 text-xs leading-snug truncate">{task.title}</p>
                      <span className={cn("text-[9px] px-1.5 py-0.2 rounded font-bold shrink-0 border", PRIORITY_STYLES[task.priority])}>
                        {task.priority}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 line-clamp-1 mb-2">{task.description}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-500 dark:text-zinc-400">
                      {task.assignee_name && (
                        <span className="flex items-center gap-0.5 truncate">
                          <User className="w-2.5 h-2.5" />{task.assignee_name}
                        </span>
                      )}
                      {task.due_date && (
                        <span className="flex items-center gap-0.5">
                          <Calendar className="w-2.5 h-2.5" />{task.due_date}
                        </span>
                      )}
                      {task.client_name && (
                        <span className="flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400">
                          <Tag className="w-2.5 h-2.5" />{task.client_name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {columnTasks(col.key).length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs italic border border-dashed border-slate-200 dark:border-zinc-800 rounded-lg">{t("tasks.drop_here")}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Task Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-2xl w-full max-w-lg p-5">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-zinc-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50">{t("tasks.create_task")}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={createTask} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1 block">{t("tasks.field_title")}</label>
                <input
                  required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white"
                  placeholder={t("tasks.ph_title")}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1 block">{t("tasks.field_description")}</label>
                <textarea
                  value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={2} className="w-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none text-slate-900 dark:text-white"
                  placeholder={t("tasks.ph_description")}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1 block">{t("tasks.field_priority")}</label>
                  <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white">
                    {["Low", "Medium", "High", "Urgent"].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1 block">{t("tasks.field_due_date")}</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1 block">{t("tasks.field_assign_to")}</label>
                  <select value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white">
                    <option value="">{t("tasks.unassigned")}</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1 block">{t("tasks.field_client")}</label>
                  <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white">
                    <option value="">{t("tasks.no_client")}</option>
                    {clients.map((c: any) => <option key={c.id} value={c.id}>{c.companyName || c.name || `Client #${c.id}`}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2.5 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-1.5 border border-slate-200 dark:border-zinc-700 rounded-lg font-semibold text-xs text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">{t("tasks.cancel")}</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg font-semibold text-xs hover:bg-blue-700 flex items-center justify-center gap-1.5 shadow-2xs transition-colors">
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("tasks.create_btn")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Details Modal */}
      {showDetailModal && selectedTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-3 pb-2 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border", PRIORITY_STYLES[selectedTask.priority])}>
                    {selectedTask.priority}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md font-semibold border border-slate-200/60 dark:border-zinc-700">{selectedTask.status}</span>
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50">{selectedTask.title}</h2>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 ml-4"><X className="w-4 h-4" /></button>
            </div>

            {selectedTask.description && (
              <p className="text-xs text-slate-600 dark:text-zinc-300 mb-3 bg-slate-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-slate-200/60 dark:border-zinc-700">{selectedTask.description}</p>
            )}

            <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
              {selectedTask.assignee_name && (
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-300"><User className="w-3.5 h-3.5 text-slate-400" />{selectedTask.assignee_name}</div>
              )}
              {selectedTask.due_date && (
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-300"><Calendar className="w-3.5 h-3.5 text-slate-400" />{selectedTask.due_date}</div>
              )}
              {selectedTask.client_name && (
                <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400"><Tag className="w-3.5 h-3.5" />{selectedTask.client_name}</div>
              )}
            </div>

            {!isClient && (
            <div className="flex gap-2 mb-4">
              {COLUMNS.filter(c => c.key !== selectedTask.status).map(col => (
                <button key={col.key} onClick={() => { moveTask(selectedTask.id, col.key); setSelectedTask(p => p ? { ...p, status: col.key } : null); }}
                  className={cn("flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all", col.bg, col.color)}>
                  {t("tasks.move_to")} {col.label}
                </button>
              ))}
            </div>
            )}

            <div>
              <h3 className="font-semibold text-xs text-slate-900 dark:text-zinc-50 mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" /> {t("tasks.comments")} ({taskComments.length})
              </h3>
              <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                {taskComments.map((c: any) => (
                  <div key={c.id} className="bg-slate-50 dark:bg-zinc-800/60 rounded-lg p-2 border border-slate-200/60 dark:border-zinc-700">
                    <div className="flex justify-between text-[10px] text-slate-400 dark:text-zinc-500 mb-0.5">
                      <span className="font-bold text-slate-700 dark:text-zinc-300">{c.author_name}</span>
                      <span>{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-zinc-200">{c.content}</p>
                  </div>
                ))}
                {taskComments.length === 0 && <p className="text-xs text-slate-400 text-center py-3">{t("tasks.no_comments")}</p>}
              </div>
              <div className="flex gap-2">
                <input value={newComment} onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addComment()}
                  className="flex-1 border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white"
                  placeholder={t("tasks.ph_comment")} />
                <button onClick={addComment} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors">{t("tasks.post")}</button>
              </div>
            </div>

            {!isClient && (
            <div className="mt-4 pt-2 border-t border-slate-100 dark:border-zinc-800 flex justify-end">
              <button onClick={() => deleteTask(selectedTask.id)}
                className="flex items-center gap-1 text-red-500 hover:text-red-700 text-xs font-semibold transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> {t("tasks.delete_task")}
              </button>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
