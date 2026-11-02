"use client";

import { useState, useEffect, useMemo } from "react";
import { StickyNote, Users, Plus, Search, MoreVertical, X, Check, Loader2, LayoutList, LayoutGrid, ChevronRight, Folder } from "lucide-react";
import { API_BASE_URL } from '@/config';
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRole } from "@/context/RoleContext";
import PageGuide from '@/components/PageGuide';
import DemoLimits from '@/components/DemoLimits';
import ProjectMemberSelect from '@/components/ProjectMemberSelect';
import { useLanguage } from "@/context/LanguageContext";

export default function ProjectsPage() {
  const { t } = useLanguage();
  const { role, user } = useRole();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");
  
  // Toolbar state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  
  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Planning");
  const [progress, setProgress] = useState(0);
  const [projectType, setProjectType] = useState("Development");
  const [clientId, setClientId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [projectMemberIds, setProjectMemberIds] = useState<number[]>([]);

  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [availableClients, setAvailableClients] = useState<any[]>([]);
  const [availableLeads, setAvailableLeads] = useState<any[]>([]);

  useEffect(() => {
    if (showCreateModal) {
      fetch(`${API_BASE_URL}/users`).then(r => r.json()).then(d => setAvailableUsers(d.users || []));
      fetch(`${API_BASE_URL}/clients`).then(r => r.json()).then(d => setAvailableClients(d.clients || []));
      fetch(`${API_BASE_URL}/leads`).then(r => r.json()).then(d => setAvailableLeads(d.leads || []));
    }
  }, [showCreateModal]);

  const fetchProjects = async () => {
    try {
      const url = new URL(`${API_BASE_URL}/projects`, window.location.origin);
      if (['Employee', 'Intern', 'ProjectMember'].includes(role) && user?.id) {
        url.searchParams.append('member_id', String(user.id));
      }
      const res = await fetch(url.toString());
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          description, 
          status, 
          progress,
          project_type: projectType,
          clientId: clientId ? parseInt(clientId) : null,
          leadId: leadId ? parseInt(leadId) : null,
          projectMemberIds
        })
      });
      if (res.ok) {
        setShowCreateModal(false);
        fetchProjects();
        setName("");
        setDescription("");
        setStatus("Planning");
        setProgress(0);
        setProjectType("Development");
        setClientId("");
        setLeadId("");
        setProjectMemberIds([]);
      } else {
        const error = await res.json().catch(() => ({}));
        setCreateError(typeof error.detail === "string" ? error.detail : "Unable to create project. Please check the selected members.");
      }
    } catch (error) {
      setCreateError("Unable to create project. Please try again.");
      console.error("Failed to create project:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateProjectStatus = async (e: React.ChangeEvent<HTMLSelectElement>, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    const newStatus = e.target.value;
    try {
      await fetch(`${API_BASE_URL}/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      fetchProjects();
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((p: any) => {
      const matchesSearch = !searchQuery || 
        (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === "all" || (p.status || "").toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [projects, searchQuery, statusFilter]);

  const activeCount = projects.filter((p: any) => p.status === 'Active').length;
  const planningCount = projects.filter((p: any) => p.status === 'Planning').length;
  const completedCount = projects.filter((p: any) => p.status === 'Completed').length;

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-16">
      {/* Compact Executive Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Folder className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">{t("projects.title")}</h1>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700">
                {projects.length}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 leading-none mt-0.5 truncate">{t("projects.subtitle")}</p>
          </div>
        </div>
        {role === "Admin" || role === "SuperAdmin" ? (
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-2xs transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("projects.new_project")}</span>
          </button>
        ) : null}
      </div>

      <DemoLimits type="projects" />

      {/* Compact 4-KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Folder className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">Total Projects</div>
            <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{projects.length}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <StickyNote className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">Active</div>
            <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{activeCount}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <StickyNote className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">Planning</div>
            <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{planningCount}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Check className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold leading-none truncate">Completed</div>
            <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{completedCount}</div>
          </div>
        </div>
      </div>

      {/* Single-row Search & Filter Toolbar */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2 px-3 flex items-center justify-between gap-3 shadow-2xs flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search projects..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 rounded-lg border border-slate-200/90 dark:border-white/10 bg-slate-50 dark:bg-zinc-800/60 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-zinc-200"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            {["all", "Active", "Planning", "Completed"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap",
                  statusFilter === st 
                    ? "bg-blue-600 text-white shadow-2xs" 
                    : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                )}
              >
                {st === "all" ? "All" : st}
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
            onClick={() => setViewMode("cards")}
            className={cn(
              "p-1 rounded-md transition-colors",
              viewMode === "cards" ? "bg-white dark:bg-zinc-700 text-blue-600 shadow-2xs" : "text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
            )}
            title="Cards view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <PageGuide
        pageKey="projects"
        title={t("projects.guide_title")}
        description={t("projects.guide_desc")}
        steps={[
          { icon: '📁', text: t("projects.guide_s1") },
          { icon: '👥', text: t("projects.guide_s2") },
          { icon: '📊', text: t("projects.guide_s3") },
          { icon: '💬', text: t("projects.guide_s4") },
        ]}
      />

      {/* Main Content Area */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-14 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredProjects.length > 0 ? (
        viewMode === "list" ? (
          <div className="space-y-1.5">
            {/* Desktop Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-3 px-3 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
              <div className="col-span-5">Project & Objective</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-3">Progress</div>
              <div className="col-span-2 text-right">Team & Link</div>
            </div>

            {filteredProjects.map((project: any) => (
              <Link 
                href={`/projects/${project.id}`} 
                key={project.id} 
                className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-2.5 px-3 shadow-2xs hover:shadow-xs hover:border-blue-500/60 dark:hover:border-blue-500/50 transition-all duration-150 group block"
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 items-center">
                  {/* Left: Icon + Title + Description */}
                  <div className="col-span-5 flex items-center gap-2.5 min-w-0">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
                      project.status === 'Planning' ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/40" :
                      project.status === 'Active' ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/40" :
                      project.status === 'Completed' ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/40" : 
                      "bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200/50 dark:border-zinc-700"
                    )}>
                      <StickyNote className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 dark:text-white text-[13px] leading-tight truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {project.name}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">
                        {project.description || t("projects.no_description")}
                      </div>
                    </div>
                  </div>

                  {/* Status Dropdown */}
                  <div className="col-span-2 flex items-center" onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
                    <select
                      value={project.status}
                      onClick={e => { e.preventDefault(); e.stopPropagation(); }}
                      onChange={e => updateProjectStatus(e, project.id)}
                      className={cn(
                        "px-2 py-0.5 text-[11px] font-bold uppercase rounded-md border outline-none cursor-pointer hover:opacity-90 transition-opacity",
                        project.status === 'Planning' ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/40" :
                        project.status === 'Active' ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/40" :
                        project.status === 'Completed' ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/40" : 
                        "bg-slate-50 dark:bg-zinc-800 text-slate-400 border-slate-200 dark:border-zinc-700"
                      )}
                    >
                      <option value="Planning">Planning</option>
                      <option value="Active">Active</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>

                  {/* Progress Bar */}
                  <div className="col-span-3 flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          project.progress > 80 ? "bg-emerald-500" : project.progress > 40 ? "bg-blue-500" : "bg-amber-500"
                        )}
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 w-8 text-right">
                      {project.progress}%
                    </span>
                  </div>

                  {/* Team & Link */}
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-zinc-400 font-semibold bg-slate-50 dark:bg-zinc-800/60 px-1.5 py-0.5 rounded border border-slate-200/60 dark:border-zinc-700">
                      <Users className="w-3 h-3 text-slate-400" />
                      <span>{(project.employeeIds?.length || 0) + (project.internIds?.length || 0)}</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProjects.map((project: any) => (
              <Link 
                href={`/projects/${project.id}`} 
                key={project.id} 
                className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl p-3.5 shadow-2xs hover:shadow-xs hover:border-blue-500/60 dark:hover:border-blue-500/50 transition-all duration-150 group block"
              >
                <div className="flex justify-between items-start mb-2.5">
                  <div className={cn(
                    "p-2 rounded-lg border",
                    project.status === 'Planning' ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/40" :
                    project.status === 'Active' ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/40" :
                    project.status === 'Completed' ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/40" : 
                    "bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200/50 dark:border-zinc-700"
                  )}>
                    <StickyNote className="w-4 h-4" />
                  </div>
                  <select
                    value={project.status}
                    onClick={e => { e.preventDefault(); e.stopPropagation(); }}
                    onChange={e => updateProjectStatus(e, project.id)}
                    className={cn(
                      "px-2 py-0.5 text-[10px] font-bold uppercase rounded-md border outline-none cursor-pointer",
                      project.status === 'Planning' ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/40" :
                      project.status === 'Active' ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/40" :
                      project.status === 'Completed' ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/40" : 
                      "bg-slate-50 dark:bg-zinc-800 text-slate-400 border-slate-200 dark:border-zinc-700"
                    )}
                  >
                    <option value="Planning">Planning</option>
                    <option value="Active">Active</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
                
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" title={project.name}>
                  {project.name}
                </h3>
                <p className="text-xs text-slate-400 dark:text-zinc-500 mb-3 line-clamp-2 min-h-[2rem]">
                  {project.description || t("projects.no_description")}
                </p>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase">
                    <span>{t("projects.progress")}</span>
                    <span className="text-slate-800 dark:text-zinc-200 font-bold">{project.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        project.progress > 80 ? "bg-emerald-500" : project.progress > 40 ? "bg-blue-500" : "bg-amber-500"
                      )}
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>
                
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5 flex justify-between items-center">
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                    <Users className="w-3 h-3 text-slate-400" />
                    <span>+{(project.employeeIds?.length || 0) + (project.internIds?.length || 0)} members</span>
                  </div>
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                    View <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : (
        <div className="p-12 text-center bg-white dark:bg-zinc-900 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800">
          <div className="w-12 h-12 bg-slate-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-2xs">
            <StickyNote className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100 mb-1">{t("projects.empty_title")}</p>
          <p className="text-xs text-slate-400 dark:text-zinc-500 max-w-xs mx-auto mb-4">{t("projects.empty_desc")}</p>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-xs hover:bg-blue-700 transition-colors shadow-2xs"
          >
            {t("projects.create_new_project")}
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-xl border border-slate-200/90 dark:border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center bg-slate-50/50 dark:bg-zinc-950/50">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50">{t("projects.create_project_title")}</h2>
                <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mt-0.5">{t("projects.create_project_sub")}</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="p-4 space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{t("projects.field_project_title")}</label>
                <input 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("projects.project_title_placeholder")} 
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500 transition-all outline-none text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{t("projects.field_objective")}</label>
                <textarea 
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("projects.objective_placeholder")} 
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 transition-all outline-none resize-none text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{t("projects.field_project_type")}</label>
                <select 
                  value={projectType}
                  onChange={(e) => setProjectType(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500 transition-all outline-none text-slate-900 dark:text-white"
                >
                  <option value="Development">{t("projects.type_development")}</option>
                  <option value="Sales">{t("projects.type_sales")}</option>
                </select>
              </div>

              {projectType === 'Sales' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{t("projects.field_assign_client")}</label>
                    <select 
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500 transition-all outline-none text-slate-900 dark:text-white"
                    >
                      <option value="">{t("projects.none")}</option>
                      {availableClients.map(c => <option key={c.id} value={c.id}>{c.companyName || c.email}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{t("projects.field_assign_lead")}</label>
                    <select 
                      value={leadId}
                      onChange={(e) => setLeadId(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500 transition-all outline-none text-slate-900 dark:text-white"
                    >
                      <option value="">{t("projects.none")}</option>
                      {availableLeads.map(l => <option key={l.id} value={l.id}>{l.name || l.email}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{t("projects.field_assign_members")}</label>
                <ProjectMemberSelect users={availableUsers} value={projectMemberIds} onChange={setProjectMemberIds} />
                {createError && <p role="alert" className="text-xs text-red-600 mt-1">{createError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{t("projects.field_initial_status")}</label>
                  <select 
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500 transition-all outline-none text-slate-900 dark:text-white"
                  >
                    <option>Planning</option>
                    <option>Active</option>
                    <option>Hold</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{t("projects.field_progress")}</label>
                  <input 
                    type="number" 
                    min="0" 
                    max="100"
                    value={progress}
                    onChange={(e) => setProgress(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500 transition-all outline-none text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 rounded-lg font-semibold text-xs hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  {t("projects.cancel")}
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-xs hover:bg-blue-700 shadow-2xs transition-colors flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {t("projects.create_project_btn")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
