"use client";
import { API_BASE_URL } from "@/config";
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Filter, MoreVertical, Building2, Globe, Mail, Phone, Upload, Download, X, Loader2, ChevronDown, ArrowUpRight, CheckCircle2, Clock, Zap, Edit2, Trash2, Tag, CalendarClock, UserCheck, Calendar } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ViewSwitcher, ViewType } from "@/components/ViewSwitcher";
import DemoLimits from "@/components/DemoLimits";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useLanguage } from "@/context/LanguageContext";
import SalesAssignModal from "@/components/SalesAssignModal";
import AddFollowUpModal, { FollowUpTarget } from "@/components/AddFollowUpModal";
import InstituteLeadScheduleModal from "@/components/InstituteLeadScheduleModal";
import { leadStages, scheduleStage, type ScheduleStage } from "@/lib/leadWorkflow";

interface Lead {
  id: number;
  company_name: string;
  ai_analysis_results?: { website_form?: { form_name?: string; page_url?: string } } | null;
  website?: string | null;
  industry?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  source?: string | null;
  status: string;
  is_converted: boolean;
  notes?: string | null;
  created_at: string;
  owner_id?: number | null;
  owner_name?: string | null;
  salesperson_name?: string | null;
}

interface ActivityLogEntry {
  id: number;
  action: string;
  method: string;
  content: string;
  details?: string;
  leadId: number;
  createdAt: string;
}

const INDUSTRIES = [
  "Technology", "Marketing", "E-commerce", "Healthcare", "Finance",
  "Real Estate", "Education", "Manufacturing", "Retail", "Legal",
  "Consulting", "Media", "Hospitality", "Construction", "Other"
];
const SOURCES = ["Website", "Meta Ads", "Google Ads", "Email", "Referral", "LinkedIn", "Cold Call", "Event", "Radar", "Import", "Other"];
// The standard pipeline; a company can name its own stages in Company profile -> Lead statuses.
const DEFAULT_STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"];

const STATUS_STYLE: Record<string, string> = {
  New: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  Contacted: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  "Not Responded": "bg-zinc-500/10 text-zinc-600 border-zinc-500/20",
  Neutral: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Positive: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  Negative: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  Converted: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  // the standard pipeline (companies that have not named their own stages)
  Qualified: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  "Proposal Sent": "bg-orange-500/10 text-orange-600 border-orange-500/20",
  Negotiation: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  Won: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  Lost: "bg-red-500/10 text-red-500 border-red-500/20",
};

const emptyForm = {
  company_name: "", website: "", industry: "", email: "",
  phone: "", address: "", source: "Website", status: "New", notes: ""
};
import { useRole } from "@/context/RoleContext";
import { useTenantConfig } from "@/context/TenantConfigContext";

export default function LeadsPage() {
  const { t } = useLanguage();
  const { role, user } = useRole();
  const { settings: tenantSettings, isOn } = useTenantConfig();
  const sourcesOn = isOn('lead_sources');
  const institute = isOn('institute');
  const router = useRouter();
  const isAdmin = role === 'Admin' || role === 'SuperAdmin';

  useEffect(() => {
    if (role && !['SuperAdmin', 'Admin', 'Employee', 'Intern', 'SalesManager', 'Sales', 'Demo'].includes(role)) {
      router.replace('/');
    }
  }, [role, router]);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadError, setLoadError] = useState("");
  const [schedule, setSchedule] = useState<{ lead: Lead; stage: ScheduleStage } | null>(null);
  const STATUSES = useMemo(() => {
    return leadStages(tenantSettings.lead_statuses, institute, DEFAULT_STATUSES, leads.map(l => l.status));
  }, [tenantSettings.lead_statuses, institute, leads]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('list');
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [sortOption, setSortOption] = useState<"recent" | "name">("recent");
  const [noteLead, setNoteLead] = useState<Lead | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [showSalesAssign, setShowSalesAssign] = useState(false);
  const [pendingLeadForm, setPendingLeadForm] = useState<any>(null);
  const [availableSources, setAvailableSources] = useState<string[]>(SOURCES);
  const [followUpTarget, setFollowUpTarget] = useState<FollowUpTarget | null>(null);
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([]);
  const [autoAssigning, setAutoAssigning] = useState(false);

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/employees/workload`);
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch (e) {}
  };

  const handleAssignSalesperson = async (leadId: number, employeeId: number | null) => {
    const emp = employees.find(e => e.id === employeeId);
    setLeads(prev => prev.map(l => l.id === leadId ? {
      ...l,
      owner_id: employeeId,
      owner_name: emp ? emp.name : null,
      salesperson_name: emp ? emp.name : null
    } : l));
    try {
      await fetch(`${API_BASE_URL}/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_id: employeeId })
      });
    } catch (err) {
      console.error("Failed to assign salesperson", err);
      fetchLeads();
    }
  };

  const handleAutoAssignLeads = async () => {
    setAutoAssigning(true);
    try {
      const res = await fetch(`${API_BASE_URL}/leads/auto-assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Auto-assign complete: ${data.assigned_count} unassigned leads distributed fairly across ${data.salespeople_count} team members!`);
        fetchLeads();
        fetchEmployees();
      } else {
        alert("Auto-assign failed");
      }
    } catch (e) {
      alert("Error calling auto-assign");
    } finally {
      setAutoAssigning(false);
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchActivities();
    fetchEmployees();
  }, []);

  // configured lead sources (module "Lead sources"); other companies keep the built-in list
  useEffect(() => {
    if (!sourcesOn) return;
    fetch(`${API_BASE_URL}/lead-sources`)
      .then(r => r.json())
      .then(d => {
        const list = (d.sources || []).map((s: any) => s.name).filter(Boolean);
        if (list.length) {
          setAvailableSources(Array.from(new Set([...list, ...SOURCES])));
        }
      })
      .catch(() => {});
  }, [sourcesOn]);

  const searchParams = useSearchParams();
  useEffect(() => {
    const requestedSearch = searchParams?.get("search");
    if (requestedSearch) setSearchQuery(requestedSearch);
    if (searchParams?.get("action") === "add") {
      openCreate();
      window.history.replaceState({}, "", "/leads");
    }
  }, []);

  const fetchActivities = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/activities`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setActivities((data.activities || []).filter((a: any) => a.lead_id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLeads = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const url = new URL(`${API_BASE_URL}/leads`, window.location.origin);
      if ((role === 'SalesManager' || role === 'Employee') && user?.id) {
        url.searchParams.append('owner_id', String(user.id));
      }
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Could not load leads. Please retry.");
      setLeads((await res.json()).leads || []);
    } catch (e) {
      console.error("Failed to fetch leads", e);
      setLoadError(e instanceof Error ? e.message : "Could not load leads");
    } finally { setLoading(false); }
  };

  const handleStatusChange = async (leadId: number, newStatus: string) => {
    const scheduledStage = scheduleStage(newStatus, institute);
    const lead = leads.find(l => l.id === leadId);
    if (scheduledStage && lead) {
      setSchedule({ lead, stage: scheduledStage });
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/leads/${leadId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not update lead status');
      }
      await fetchLeads();
    } catch (e) {
      console.error("Failed to update lead status", e);
      setLoadError(e instanceof Error ? e.message : 'Could not update lead status');
    }
  };

  const filtered = useMemo(() => {
    let result = leads.filter(l => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || (l.company_name || "").toLowerCase().includes(q)
        || (l.email || "").toLowerCase().includes(q)
        || (l.industry || "").toLowerCase().includes(q)
        || (l.source || "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "All"
        || (statusFilter === "Converted" ? l.is_converted : l.status === statusFilter);
      return matchSearch && matchStatus;
    });

    if (sortOption === "recent") {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortOption === "name") {
      result.sort((a, b) => (a.company_name || "").localeCompare(b.company_name || ""));
    }

    return result;
  }, [leads, searchQuery, statusFilter, sortOption]);

  const openCreate = () => {
    setEditLead(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditLead(lead);
    setForm({
      company_name: lead.company_name,
      website: lead.website || "",
      industry: lead.industry || "",
      email: lead.email || "",
      phone: lead.phone || "",
      address: lead.address || "",
      source: lead.source || "Website",
      status: lead.status,
      notes: lead.notes || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.company_name.trim()) return;
    setSaving(true);
    try {
      if (editLead) {
        const stage = scheduleStage(form.status, institute);
        const response = await fetch(`${API_BASE_URL}/leads/${editLead.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, status: stage ? editLead.status : form.status }),
        });
        if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not save lead'); }
        setShowModal(false);
        if (stage) setSchedule({ lead: editLead, stage });
        fetchLeads();
      } else {
        if (!isAdmin) {
          // Salesperson creates lead: automatically assign to themselves
          const stage = scheduleStage(form.status, institute);
          const payload = { ...form, status: stage ? 'New' : form.status, owner_id: user?.id || null };
          const response = await fetch(`${API_BASE_URL}/leads`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not create lead'); }
          const created = await response.json();
          setShowModal(false);
          if (stage) setSchedule({ lead: created, stage });
          fetchLeads();
        } else {
          // New lead: show sales assign modal for admins
          setPendingLeadForm({ ...form });
          setShowModal(false);
          setShowSalesAssign(true);
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not save lead');
    } finally { setSaving(false); }
  };

  const doCreateLead = async (employeeId: number | null, _employeeName: string | null) => {
    setShowSalesAssign(false);
    if (!pendingLeadForm) return;
    try {
      const payload = { ...pendingLeadForm };
      const stage = scheduleStage(payload.status, institute);
      if (stage) payload.status = 'New';
      if (employeeId) payload.owner_id = employeeId;
      const response = await fetch(`${API_BASE_URL}/leads`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not create lead'); }
      const created = await response.json();
      if (stage) setSchedule({ lead: created, stage });
      setPendingLeadForm(null);
      fetchLeads();
    } catch (err) { setLoadError(err instanceof Error ? err.message : 'Could not create lead'); }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t("leads.confirm_delete"))) return;
    await fetch(`${API_BASE_URL}/leads/${id}`, { method: "DELETE" });
    fetchLeads();
  };

  const handleConvert = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t("leads.confirm_convert"))) return;
    try {
      const response = await fetch(`${API_BASE_URL}/leads/${id}/convert`, { method: "POST" });
      if (!response.ok) throw new Error('Could not convert lead');
      fetchLeads();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not convert lead');
    }
  };

  const handleAddNote = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    setNoteText("");
    setNoteLead(lead);
  };

  const handleSaveNote = async () => {
    const content = noteText.trim();
    if (!content || !noteLead) return;
    try {
      setNoteSaving(true);
      const res = await fetch(`${API_BASE_URL}/leads/${noteLead.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        alert(data?.error || t("leads.failed_add_note"));
        return;
      }
      setNoteLead(null);
      setNoteText("");
      fetchLeads();
      fetchActivities();
    } catch {
      alert(t("leads.network_error_note"));
    } finally {
      setNoteSaving(false);
    }
  };

  const stats = [
    { label: t("leads.total_leads"), value: leads.length, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: t("leads.new"), value: leads.filter(l => l.status === "New").length, color: "text-violet-600", bg: "bg-violet-500/10" },
    { label: t("leads.qualified"), value: leads.filter(l => l.status === "Qualified").length, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: t("leads.converted"), value: leads.filter(l => l.is_converted).length, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  ];

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] dark:bg-black">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-black">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-xs shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{t("leads.title")}</h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-300 border border-slate-200/80 dark:border-white/5">
                  {leads.length} total
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("leads.subtitle")}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <button
              onClick={async () => {
                try {
                  const token = localStorage.getItem('token');
                  const res = await fetch(`${API_BASE_URL}/leads/export-csv`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  if (!res.ok) throw new Error("Export failed");
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'serphawk_leads.csv';
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  a.remove();
                } catch (err) {
                  console.error(err);
                  alert("Failed to export leads.");
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-white/5 transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            {isAdmin && (
              <button
                onClick={handleAutoAssignLeads}
                disabled={autoAssigning}
                title="Automatically distribute unassigned leads by round-robin with conversion rate tie-breaker"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white shadow-xs transition-all active:scale-95 disabled:opacity-50"
              >
                {autoAssigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-300" />}
                Auto-Assign Leads
              </button>
            )}
            <Link href="/import" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-white/5 transition-colors shadow-xs">
              <Upload className="w-3.5 h-3.5" /> {t("leads.import")}
            </Link>
            <button
              id="add-lead-btn"
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-95 shadow-xs transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" /> {t("leads.add_lead")}
            </button>
          </div>
        </div>

        {/* High-density Compact Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-slate-200/90 dark:border-white/10 bg-white/90 dark:bg-[#111111]/90 p-2 sm:px-3 sm:py-2 flex items-center justify-between shadow-xs hover:border-slate-300 dark:hover:border-white/20 transition-all"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-7 h-7 rounded-lg ${s.bg} border border-slate-200/40 dark:border-white/5 flex items-center justify-center shrink-0`}>
                  <Building2 className={`w-3.5 h-3.5 ${s.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">{s.label}</p>
                  <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none mt-0.5">{loading ? "—" : s.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Demo Limits Banner */}
      <div className="px-4 sm:px-6 pt-2">
        <DemoLimits type="clients" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 bg-white dark:bg-black border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2.5">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text" placeholder={t("leads.search_placeholder")}
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all text-slate-900 dark:text-white placeholder:text-slate-400 shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap max-w-full overflow-x-auto scrollbar-none pb-0.5 sm:pb-0">
          <ViewSwitcher currentView={currentView} onViewChange={setCurrentView} />

          <select
            value={sortOption}
            onChange={e => setSortOption(e.target.value as "recent" | "name")}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-white/5 focus:outline-none cursor-pointer"
          >
            <option value="recent">{t("leads.sort_recent")}</option>
            <option value="name">{t("leads.sort_name")}</option>
          </select>

          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {["All", ...STATUSES].map(s => {
              const count = s === "All" ? leads.length : leads.filter(l => (l.is_converted ? "Converted" : l.status) === s).length;
              return (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${statusFilter === s ? "bg-blue-600 text-white shadow-xs font-semibold" : "bg-slate-100/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>
                  <span>{s}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${statusFilter === s ? "bg-blue-700/80 text-white" : "bg-slate-200/80 dark:bg-white/10 text-slate-600 dark:text-slate-400"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="w-full flex flex-1 overflow-hidden">
      {/* Table */}
      <div className="w-full flex-1 overflow-auto bg-white dark:bg-black">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin w-8 h-8 text-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t("leads.no_leads_found")}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{t("leads.try_adjusting")}</p>
            <button onClick={openCreate} className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all">
              <Plus className="w-4 h-4" /> {t("leads.add_first_lead")}
            </button>
          </div>
        ) : currentView === 'kanban' ? (
          <div className="flex gap-4 p-6 overflow-x-auto h-full items-start">
            {STATUSES.map(status => {
              const colLeads = filtered.filter(l => (l.is_converted ? "Converted" : l.status) === status);
              return (
                <div
                  key={status}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const draggedId = e.dataTransfer.getData("leadId");
                    if (draggedId) {
                      handleStatusChange(Number(draggedId), status);
                    }
                  }}
                  className="w-80 shrink-0 flex flex-col bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-2xl max-h-full transition-all hover:border-blue-400/50"
                >
                  <div className="p-4 font-bold text-slate-800 dark:text-white flex items-center justify-between border-b border-slate-200 dark:border-[#222222]">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${STATUS_STYLE[status]?.split(' ')[1] || 'bg-blue-500'}`} />
                      <span>{status}</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-slate-200 dark:bg-[#222222] text-xs text-slate-600 dark:text-[#a3a3a3]">{colLeads.length}</span>
                  </div>
                  <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[220px]">
                    {colLeads.map(lead => (
                      <motion.div
                        key={lead.id}
                        layoutId={`lead-${lead.id}`}
                        draggable={true}
                        onDragStartCapture={(e: React.DragEvent<HTMLDivElement>) => {
                          e.dataTransfer.setData("leadId", String(lead.id));
                        }}
                        onClick={() => router.push(`/leads/${lead.id}`)}
                        className="p-4 bg-white dark:bg-[#000000] rounded-xl shadow-sm border border-slate-200 dark:border-[#222222] cursor-grab active:cursor-grabbing hover:border-blue-500 dark:hover:border-white transition-colors group"
                      >
                        <div className="font-semibold text-slate-900 dark:text-white text-sm">{lead.company_name}</div>
                        <div className="text-[12px] text-slate-500 mt-1 line-clamp-1">{lead.industry || 'No industry'}</div>
                        {lead.email && <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1"><Mail className="w-3 h-3"/>{lead.email}</div>}

                        {/* Quick Stage Dropdown on Card */}
                        <div className="mt-2.5 flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
                          <select
                            value={lead.is_converted ? "Converted" : lead.status}
                            onChange={e => handleStatusChange(lead.id, e.target.value)}
                            aria-label={`Status for ${lead.company_name}`}
                            className={`max-w-full min-h-11 text-xs font-bold px-2 py-2 rounded border cursor-pointer focus:outline-none ${STATUS_STYLE[lead.is_converted ? "Converted" : lead.status] || STATUS_STYLE.New}`}
                          >
                            {STATUSES.map(st => (
                              <option key={st} value={st} className="bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100">{st}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 dark:border-zinc-800 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1 truncate max-w-[170px]">
                            <UserCheck className="w-3 h-3 text-violet-500 shrink-0" />
                            <span className="truncate">{lead.salesperson_name || lead.owner_name || 'Unassigned'}</span>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFollowUpTarget({
                                type: "lead",
                                id: lead.id,
                                name: lead.company_name,
                                email: lead.email,
                                phone: lead.phone,
                                salespersonName: lead.salesperson_name || lead.owner_name
                              });
                            }}
                            className="p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-400 hover:text-amber-600"
                            title="Schedule Follow-up"
                          >
                            <CalendarClock className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                    {colLeads.length === 0 && <div className="p-4 text-center text-sm text-slate-400 border-2 border-dashed border-slate-200 dark:border-[#222222] rounded-xl">{t("leads.no_leads")}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : currentView === 'graph' ? (
          <div className="p-3 sm:p-8 h-full overflow-x-auto">
            <div className="bg-white dark:bg-[#111111] p-3 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-[#222222] min-w-[280px]">
              <h3 className="text-lg font-bold mb-6 text-slate-900 dark:text-white">{t("leads.leads_by_status")}</h3>
              <ResponsiveContainer width="100%" height={Math.max(300, STATUSES.length * 40)}>
                <BarChart layout="vertical" data={STATUSES.map(s => ({ name: s, count: filtered.filter(l => l.status === s).length }))} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                  <XAxis type="number" stroke="#888" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={135} stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#000', borderColor: '#222', color: '#fff'}} />
                  <Bar dataKey="count" fill="currentColor" className="fill-blue-500 dark:fill-white" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : currentView === 'pivot' ? (
          <div className="p-6 h-full overflow-auto">
            <table className="w-full text-left border-collapse bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-2xl overflow-hidden shadow-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#000000] border-b border-slate-200 dark:border-[#222222] text-xs uppercase tracking-wider text-slate-500 dark:text-[#a3a3a3]">
                  <th className="p-4 font-semibold">{t("leads.industry_status2")}</th>
                  {STATUSES.map(s => <th key={s} className="p-4 font-semibold text-center">{s}</th>)}
                  <th className="p-4 font-bold text-center border-l border-slate-200 dark:border-[#222222]">{t("leads.total_leads")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#222222]">
                {Array.from(new Set(filtered.map(l => l.industry || 'Other'))).map(ind => {
                  const indLeads = filtered.filter(l => (l.industry || 'Other') === ind);
                  return (
                    <tr key={ind} className="hover:bg-slate-50 dark:hover:bg-[#0a0a0a]">
                      <td className="p-4 font-medium text-slate-900 dark:text-white">{ind}</td>
                      {STATUSES.map(s => <td key={s} className="p-4 text-center text-slate-600 dark:text-[#a3a3a3]">{indLeads.filter(l => l.status === s).length || '-'}</td>)}
                      <td className="p-4 text-center font-bold text-slate-900 dark:text-white border-l border-slate-200 dark:border-[#222222]">{indLeads.length}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="w-full p-3 sm:p-4 space-y-2">
            {/* Subtle column headers for desktop */}
            <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
              <div className="col-span-3">Company</div>
              <div className="col-span-2">Contact</div>
              <div className="col-span-2">Salesperson</div>
              <div className="col-span-2">Source</div>
              <div className="col-span-3 text-right">Status & Actions</div>
            </div>

            <AnimatePresence>
              {filtered.map((lead, idx) => (
                <motion.div
                  key={lead.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.02, 0.25) }}
                  onClick={() => router.push(`/leads/${lead.id}`)}
                  className="group rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-2.5 shadow-xs hover:border-blue-500/60 dark:hover:border-blue-500/50 hover:shadow-md transition-all duration-150 cursor-pointer"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
                    {/* Company & Website */}
                    <div className="col-span-1 sm:col-span-2 lg:col-span-3 min-w-0 flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs">
                        {lead.company_name[0]?.toUpperCase() || "L"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate flex items-center gap-1">
                          <span className="truncate">{lead.company_name}</span>
                          <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 shrink-0" />
                        </span>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] truncate">
                          {lead.website ? (
                            <div className="flex items-center gap-1 text-slate-400 truncate">
                              <Globe className="w-3 h-3 shrink-0" />
                              <a
                                href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="hover:text-blue-600 hover:underline truncate max-w-[140px]"
                              >
                                {lead.website.replace(/^https?:\/\//, '')}
                              </a>
                            </div>
                          ) : null}
                          {lead.industry && (
                            <span className="text-slate-500 dark:text-zinc-400 truncate text-[10.5px]">
                              {lead.website ? "• " : ""}{lead.industry}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="col-span-1 lg:col-span-2 min-w-0">
                      {lead.email ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-300 truncate" title={lead.email}>
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{lead.email}</span>
                        </div>
                      ) : null}
                      {lead.phone ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 truncate mt-0.5" title={lead.phone}>
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{lead.phone}</span>
                        </div>
                      ) : null}
                      {!lead.email && !lead.phone && (
                        <span className="text-xs text-slate-400 italic">—</span>
                      )}
                    </div>

                    {/* Salesperson */}
                    <div className="col-span-1 lg:col-span-2 min-w-0" onClick={e => e.stopPropagation()}>
                      {isAdmin ? (
                        <select
                          value={lead.owner_id || ""}
                          onChange={e => handleAssignSalesperson(lead.id, e.target.value ? Number(e.target.value) : null)}
                          className="text-xs font-medium bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[150px] truncate shadow-xs"
                          title="Assign Salesperson"
                        >
                          <option value="">Unassigned</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-1.5 truncate">
                          <div className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {(lead.salesperson_name || lead.owner_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 truncate max-w-[130px]">
                            {lead.salesperson_name || lead.owner_name || 'Unassigned'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Source */}
                    <div className="col-span-1 lg:col-span-2 min-w-0">
                      {lead.source?.toLowerCase().includes("website") ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40 truncate max-w-[150px]">
                            <Globe className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                            <span className="truncate">
                              {(() => {
                                try {
                                  return new URL(String(lead.ai_analysis_results?.website_form?.page_url || lead.website || '')).hostname.replace(/^www\./, '');
                                } catch {
                                  return 'Website';
                                }
                              })()}
                            </span>
                          </span>
                          {lead.ai_analysis_results?.website_form?.form_name && (
                            <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-semibold truncate max-w-[140px]" title={lead.ai_analysis_results.website_form.form_name}>
                              {lead.ai_analysis_results.website_form.form_name}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/60 dark:border-white/5 truncate max-w-[130px]">
                          {lead.source || "Unknown"}
                        </span>
                      )}
                    </div>

                    {/* Status & Actions */}
                    <div className="col-span-1 sm:col-span-2 lg:col-span-3 flex items-center justify-end gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      <select
                        value={lead.is_converted ? "Converted" : lead.status}
                        onChange={e => handleStatusChange(lead.id, e.target.value)}
                        className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border cursor-pointer focus:outline-none transition-all shadow-xs whitespace-nowrap ${STATUS_STYLE[lead.is_converted ? "Converted" : lead.status] || STATUS_STYLE.New}`}
                        title="Change lead stage"
                      >
                        {STATUSES.map(st => (
                          <option key={st} value={st} className="bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100">
                            {st}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1">
                        <Link
                          href={`/meetings?new=true&lead_id=${lead.id}&title=${encodeURIComponent(`Meeting with ${lead.company_name}`)}`}
                          title="Schedule Meeting"
                          className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 dark:hover:bg-indigo-900/30 text-slate-400 transition-colors shadow-xs"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setFollowUpTarget({
                              type: "lead",
                              id: lead.id,
                              name: lead.company_name,
                              email: lead.email,
                              phone: lead.phone,
                              salespersonName: lead.salesperson_name || lead.owner_name
                            });
                          }}
                          title="Schedule Follow-up"
                          className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300 dark:hover:bg-amber-900/30 text-slate-400 transition-colors shadow-xs"
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                        </button>
                        {!lead.is_converted && isOn('clients') && !institute && (
                          <button
                            onClick={e => handleConvert(lead.id, e)}
                            title={t("leads.convert_to_client")}
                            className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300 dark:hover:bg-emerald-900/30 text-slate-400 transition-colors shadow-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={e => handleAddNote(lead, e)}
                          title={t("leads.add_note")}
                          className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300 dark:hover:bg-yellow-900/30 text-slate-400 transition-colors shadow-xs"
                        >
                          <Tag className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => openEdit(lead, e)}
                          title={t("leads.edit_lead")}
                          className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 dark:hover:bg-blue-900/30 text-slate-400 transition-colors shadow-xs"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={e => handleDelete(lead.id, e)}
                            title={t("leads.delete_lead")}
                            className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 dark:hover:bg-rose-900/30 text-slate-400 transition-colors shadow-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      </div>

      {/* ADD / EDIT MODAL */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="bg-white dark:bg-black rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editLead ? t("leads.edit_lead") : t("leads.add_new_lead")}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t("leads.all_incoming_stored")}</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form */}
              <div className="px-6 py-5 space-y-4">
                {/* Company Name — required */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">
                    {t("leads.company_name")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    autoFocus
                    value={form.company_name}
                    onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                    placeholder="e.g. Acme Corp"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("leads.email")}</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@company.com"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("leads.phone")}</label>
                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("leads.industry")}</label>
                    <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                      <option value="">{t("leads.select_industry")}</option>
                      {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("leads.source")}</label>
                    <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                      {availableSources.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("leads.website")}</label>
                    <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://example.com"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("leads.status")}</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("leads.address")}</label>
                  <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="City, Country"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("leads.notes")}</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                    placeholder={t("leads.notes_placeholder")}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none" />
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">
                  {t("leads.cancel")}
                </button>
                <button onClick={handleSave} disabled={saving || !form.company_name.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-500/20">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editLead ? t("leads.save_changes") : t("leads.add_lead")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Note Modal */}
      <AnimatePresence>
        {noteLead && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              className="w-full max-w-lg bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t("leads.add_note")}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{noteLead.company_name}</p>
                </div>
                <button onClick={() => setNoteLead(null)} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder={t("leads.write_note_placeholder")}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
                />
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Timestamp {new Date().toLocaleString()} {t("leads.timestamp_recorded")}</span>
                </div>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
                <button onClick={() => setNoteLead(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">
                  {t("leads.cancel")}
                </button>
                <button onClick={handleSaveNote} disabled={noteSaving || !noteText.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-500/20">
                  {noteSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t("leads.add_note")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sales Assignment Modal */}
      <SalesAssignModal
        isOpen={showSalesAssign}
        onClose={() => { setShowSalesAssign(false); setPendingLeadForm(null); }}
        onAssign={doCreateLead}
        entityType="lead"
      />

      {/* Add Follow-up Modal */}
      {loadError && <div role="alert" className="fixed bottom-4 left-4 right-4 z-40 rounded-xl bg-red-50 p-4 text-red-800 shadow-lg">{loadError} <button onClick={fetchLeads} className="ml-3 underline">Retry</button></div>}
      {schedule && <InstituteLeadScheduleModal lead={schedule.lead} stage={schedule.stage} onClose={() => setSchedule(null)} onSuccess={fetchLeads} />}
      <AddFollowUpModal
        open={!!followUpTarget}
        onClose={() => setFollowUpTarget(null)}
        target={followUpTarget}
        onSuccess={fetchLeads}
      />
    </div>
  );
}
