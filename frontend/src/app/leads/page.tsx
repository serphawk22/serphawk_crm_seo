"use client";
import LocalizedText from "@/components/LocalizedText";
import BulkLeadTransferModal from "@/components/BulkLeadTransferModal";
import TransferredLeadsModal from "@/components/TransferredLeadsModal";
import OCRScannerModal, { OCRResult } from "@/components/OCRScannerModal";
import DuplicateLeadModal, { DuplicateLeadInfo, DuplicateDiff } from "@/components/DuplicateLeadModal";
import { API_BASE_URL } from "@/config";
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Filter, MoreVertical, Building2, Globe, Mail, Phone, PhoneCall, MapPin, Sparkles, Upload, Download, X, Loader2, ChevronDown, ArrowUpRight, CheckCircle2, Clock, Zap, Edit2, Trash2, Tag, CalendarClock, UserCheck, Calendar, ArrowRightLeft, History, User, Briefcase, UserPlus, FileScan, Layers, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ViewSwitcher, ViewType } from "@/components/ViewSwitcher";
import PipelineWorkflowFlowchart from "@/components/PipelineWorkflowFlowchart";
import DemoLimits from "@/components/DemoLimits";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useLanguage } from "@/context/LanguageContext";
import SalesAssignModal from "@/components/SalesAssignModal";
import AddFollowUpModal, { FollowUpTarget } from "@/components/AddFollowUpModal";
import InstituteLeadScheduleModal from "@/components/InstituteLeadScheduleModal";
import ContactSynopsisModal from "@/components/ContactSynopsisModal";
import LeadBatchEnrollmentAction from "@/components/LeadBatchEnrollmentAction";
import LeadCallModal, { type LeadCallTarget } from "@/components/voice-agent/LeadCallModal";
import LeadCallStatusBadge from "@/components/voice-agent/LeadCallStatusBadge";
import PhoneInput from "@/components/PhoneInput";
import { voiceAgentApi } from "@/lib/voiceAgentApi";
import { leadStages, scheduleStage, type ScheduleStage } from "@/lib/leadWorkflow";

interface Lead {
  id: number;
  company_name: string;
  ai_analysis_results?: { website_form?: { form_name?: string; page_url?: string } } | null;
  website?: string | null;
  industry?: string | null;
  course_interest_id?: number | null;
  course_interest_title?: string | null;
  gpa?: number | null;
  education_level?: string | null;
  academic_background?: string | null;
  career_goal?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  deal_value?: number | null;
  linkedin_url?: string | null;
  twitter_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  ai_status?: "done" | "pending" | "not_started";
  source?: string | null;
  status: string;
  is_converted: boolean;
  converted_student_id?: number | null;
  space_id?: number | null;
  notes?: string | null;
  created_at: string;
  owner_id?: number | null;
  owner_name?: string | null;
  salesperson_name?: string | null;
  latest_call_id?: number | null;
  latest_call_status?: string | null;
  latest_call_at?: string | null;
  auto_call_status?: string | null;
  auto_call_reason?: string | null;
  follow_up_needed?: boolean | null;
  next_follow_up_at?: string | null;
  follow_up_reason?: string | null;
}

function validatePhoneInput(raw: string): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  if (!/^[\d\s+\-().]+$/.test(trimmed)) {
    return "Please enter a valid phone number (digits and optional + country code, e.g. +919876543210).";
  }
  const normalized = trimmed.replace(/[^\d+]/g, "");
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return "Phone number must contain between 7 and 15 digits (e.g. +919876543210).";
  }
  if (normalized.startsWith("+") && !/^\+[1-9]\d{7,14}$/.test(normalized)) {
    return "Please enter a valid phone number with country code (e.g. +919876543210).";
  }
  return null;
}

export interface LeadStageItem {
  id: string;
  name: string;
  color: string;
  order: number;
  is_won?: boolean;
  is_lost?: boolean;
}

export interface LeadSpaceItem {
  id: number;
  tenant_id?: number | null;
  name: string;
  description?: string | null;
  is_default: boolean;
  sort_order: number;
  stages: LeadStageItem[];
  leads_count?: number;
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
  Student: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  // the standard pipeline (companies that have not named their own stages)
  Qualified: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  "Proposal Sent": "bg-orange-500/10 text-orange-600 border-orange-500/20",
  Negotiation: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  Won: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  Lost: "bg-red-500/10 text-red-500 border-red-500/20",
};

const emptyForm = {
  company_name: "", website: "", industry: "", email: "", course_interest_id: "", gpa: "", education_level: "", academic_background: "", career_goal: "",
  phone: "", address: "", source: "Website", status: "New", notes: "",
  add_contact: false,
  contact_name: "",
  contact_designation: "Key Decision Maker",
  contact_email: "",
  contact_phone: "",
  contact_department: "Executive",
};
import { useRole } from "@/context/RoleContext";
import { useTenantConfig } from "@/context/TenantConfigContext";

function LeadShimmerList({ count = 8 }: { count?: number }) {
  return (
    <div className="w-full space-y-2.5">
      {/* Mobile Shimmer */}
      <div className="block lg:hidden space-y-2.5">
        {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-3.5 space-y-3 animate-pulse">
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-zinc-800 shrink-0" />
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="h-4 bg-slate-200 dark:bg-zinc-800 rounded w-32" />
                  <div className="h-3 bg-slate-100 dark:bg-zinc-800/60 rounded w-24" />
                </div>
              </div>
              <div className="h-6 w-20 rounded-lg bg-slate-200 dark:bg-zinc-800 shrink-0" />
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
              <div className="h-6 w-24 bg-slate-100 dark:bg-zinc-800/60 rounded-lg" />
              <div className="h-6 w-28 bg-slate-100 dark:bg-zinc-800/60 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Shimmer */}
      <div className="hidden lg:block overflow-x-auto scrollbar-thin">
        <div className="min-w-[1360px] space-y-2.5">
          {Array.from({ length: count }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-2.5 animate-pulse"
            >
              <div className="grid grid-cols-[minmax(220px,2fr)_minmax(180px,1.4fr)_minmax(160px,1.2fr)_minmax(130px,1.1fr)_minmax(130px,1fr)_minmax(140px,1.1fr)_minmax(200px,1.5fr)] gap-4 items-center">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-zinc-800 shrink-0" />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="h-3.5 bg-slate-200 dark:bg-zinc-800 rounded w-28" />
                    <div className="h-2.5 bg-slate-100 dark:bg-zinc-800/60 rounded w-20" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 bg-slate-200 dark:bg-zinc-800 rounded w-32" />
                  <div className="h-2.5 bg-slate-100 dark:bg-zinc-800/60 rounded w-24" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 bg-slate-200 dark:bg-zinc-800 rounded w-24" />
                  <div className="h-2 bg-slate-100 dark:bg-zinc-800/60 rounded w-16" />
                </div>
                <div className="h-7 bg-slate-200 dark:bg-zinc-800 rounded-lg w-28" />
                <div className="h-6 bg-slate-200 dark:bg-zinc-800 rounded-md w-24" />
                <div className="h-7 bg-slate-200 dark:bg-zinc-800 rounded-md w-28" />
                <div className="flex items-center justify-end gap-1.5">
                  <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-zinc-800" />
                  <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-zinc-800" />
                  <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-zinc-800" />
                  <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-zinc-800" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const { t, language } = useLanguage();
  const { role, user } = useRole();
  const { settings: tenantSettings, isOn } = useTenantConfig();
  const sourcesOn = isOn('lead_sources');
  const institute = isOn('institute') || tenantSettings.company_type === 'institute' || Boolean((tenantSettings as any)?.institute);
  const router = useRouter();
  const isAdmin = role === 'Admin' || role === 'SuperAdmin';
  const notify = (message: string) => alert(message);

  useEffect(() => {
    if (role && !['SuperAdmin', 'Admin', 'Employee', 'Intern', 'SalesManager', 'Sales', 'Demo'].includes(role)) {
      router.replace('/');
    }
  }, [role, router]);

  const [spaces, setSpaces] = useState<LeadSpaceItem[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<LeadSpaceItem | null>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);
  const selectedSpaceIdRef = React.useRef<number | null>(null);
  const [spaceDropdownOpen, setSpaceDropdownOpen] = useState(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadError, setLoadError] = useState("");
  const [schedule, setSchedule] = useState<{ lead: Lead; stage: ScheduleStage } | null>(null);
  const STATUSES = useMemo(() => {
    if (selectedSpace?.stages && selectedSpace.stages.length > 0) {
      const spaceStageNames = selectedSpace.stages.map(s => s.name);
      const present = leads.map(l => l.status).filter(Boolean);
      const combined = [...spaceStageNames];
      for (const st of present) {
        if (!combined.includes(st)) combined.push(st);
      }
      return combined;
    }
    return leadStages(tenantSettings.lead_statuses, institute, DEFAULT_STATUSES, leads.map(l => l.status));
  }, [selectedSpace, tenantSettings.lead_statuses, institute, leads]);
  const [courses, setCourses] = useState<{ id: number; title: string; category?: string }[]>([]);
  useEffect(() => { if (institute) fetch(`${API_BASE_URL}/courses`).then(r => r.ok ? r.json() : Promise.reject()).then(d => setCourses(d.courses || [])).catch(() => setLoadError("Could not load courses")); }, [institute]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [serverTotalCount, setServerTotalCount] = useState<number | null>(null);
  const [serverStatusCounts, setServerStatusCounts] = useState<Record<string, number> | null>(null);
  const [customFields, setCustomFields] = useState<{ key: string; value: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<{ message: string; duplicate?: boolean } | null>(null);
  const [watchingAutoCall, setWatchingAutoCall] = useState<{ id: number; company_name: string; phone?: string | null } | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('kanban');
  const [sampleStats, setSampleStats] = useState<{ has_sample_data: boolean; sample_leads_count: number } | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [sortOption, setSortOption] = useState<string>("recent");
  const [ownerFilter, setOwnerFilter] = useState<string>("All");
  const [sourceFilter, setSourceFilter] = useState<string>("All");
  const [industryFilter, setIndustryFilter] = useState<string>("All");
  const [dealValueFilter, setDealValueFilter] = useState<string>("All");
  const [contactSynopsisTarget, setContactSynopsisTarget] = useState<{ id: number; name: string } | null>(null);
  const [analyzingLeadId, setAnalyzingLeadId] = useState<number | null>(null);
  const [noteLead, setNoteLead] = useState<Lead | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [showSalesAssign, setShowSalesAssign] = useState(false);
  const [pendingLeadForm, setPendingLeadForm] = useState<any>(null);
  const [availableSources, setAvailableSources] = useState<string[]>(SOURCES);
  const [followUpTarget, setFollowUpTarget] = useState<FollowUpTarget | null>(null);
  const [callTarget, setCallTarget] = useState<LeadCallTarget | null>(null);
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([]);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [autofillUrl, setAutofillUrl] = useState("");
  const [autofilling, setAutofilling] = useState(false);
  const [autofillSuccess, setAutofillSuccess] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showTransfersHistoryModal, setShowTransfersHistoryModal] = useState(false);
  const [isOCRModalOpen, setIsOCRModalOpen] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<{ existing: DuplicateLeadInfo; diff?: DuplicateDiff | null; incoming: any } | null>(null);
  const [enrollLead, setEnrollLead] = useState<Lead | null>(null);

  const handleOCRExtracted = (data: OCRResult) => {
    setForm(f => ({
      ...f,
      company_name: data.company_name || f.company_name,
      email: data.email || f.email,
      phone: data.mobile || f.phone,
      website: data.website || f.website,
      address: data.address || f.address,
      add_contact: Boolean(data.name) || f.add_contact,
      contact_name: data.name || f.contact_name,
      contact_designation: data.designation || f.contact_designation || "Key Decision Maker",
      contact_email: data.email || f.contact_email,
      contact_phone: data.mobile || f.contact_phone,
    }));
    if (data.website) setAutofillUrl(data.website);
    setEditLead(null);
    setShowModal(true);
  };

  const handleAutofillFromWebsite = async (targetUrl?: string) => {
    const rawUrl = (targetUrl || autofillUrl || form.website || "").trim();
    if (!rawUrl) return;
    setAutofilling(true);
    setAutofillSuccess(false);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${API_BASE_URL}/leads/auto-fill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ website: rawUrl })
      });
      if (res.ok) {
        const resp = await res.json();
        if (resp.ok && resp.data) {
          const d = resp.data;
          setForm(f => ({
            ...f,
            company_name: d.company_name || f.company_name,
            email: d.email || f.email,
            phone: d.phone || f.phone,
            website: d.website || f.website || rawUrl,
            industry: d.industry && INDUSTRIES.includes(d.industry) ? d.industry : (f.industry || "Other"),
            address: d.address || f.address,
            notes: d.notes || f.notes,
            contact_name: d.contact_name || f.contact_name,
            contact_designation: d.contact_designation || f.contact_designation,
            add_contact: Boolean(d.contact_name) || f.add_contact,
          }));
          setAutofillUrl(d.website || rawUrl);
          setAutofillSuccess(true);
          setTimeout(() => setAutofillSuccess(false), 4000);
        } else {
          alert(resp.error || (language === 'es' ? "No se pudieron extraer los detalles del sitio web." : "Could not extract details from this website."));
        }
      } else {
        alert(language === 'es' ? "Error al consultar el servicio de autocompletado." : "Autofill service request failed. Please check the URL.");
      }
    } catch (err) {
      console.error("Autofill error:", err);
      alert(language === 'es' ? "Error al conectar con el servicio de autocompletado." : "Error connecting to website autofill service.");
    } finally {
      setAutofilling(false);
    }
  };

  const fetchSampleStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/sample-data/status`);
      if (res.ok) {
        const d = await res.json();
        setSampleStats(d);
      }
    } catch (e) { }
  };

  const handleDeleteSampleData = async () => {
    if (!window.confirm("Remove all sample records? Your original real leads will remain completely untouched.")) return;
    setSampleBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/sample-data/delete`, { method: "DELETE" });
      if (res.ok) {
        await fetchLeads();
        await fetchSampleStatus();
      }
    } catch (e) {
      alert("Failed to delete sample data.");
    } finally {
      setSampleBusy(false);
    }
  };

  const handleSeedSampleData = async () => {
    setSampleBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/sample-data/seed`, { method: "POST" });
      if (res.ok) {
        await fetchLeads();
        await fetchSampleStatus();
      }
    } catch (e) {
      alert("Failed to seed sample data.");
    } finally {
      setSampleBusy(false);
    }
  };

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    STATUSES.forEach(s => {
      c[s] = leads.filter(l => (l.is_converted ? "Converted" : l.status) === s).length;
    });
    return c;
  }, [leads, STATUSES]);

  const fetchEmployees = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${API_BASE_URL}/employees/workload`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch (e) { }
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

  const handleManualAnalyze = async (leadId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setAnalyzingLeadId(leadId);
    try {
      const res = await fetch(`${API_BASE_URL}/leads/${leadId}/auto-research`, { method: "POST" });
      if (res.ok) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ai_status: 'pending' as const } : l));
      }
    } catch (err) {
      console.error("Failed to trigger 360 AI analysis", err);
    } finally {
      setTimeout(() => setAnalyzingLeadId(null), 1500);
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
    const initLeadSpaces = async () => {
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('crm_token');
        const res = await fetch(`${API_BASE_URL}/lead-spaces`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data: LeadSpaceItem[] = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setSpaces(data);
            const querySpaceId = searchParams?.get("space_id");
            const matched = querySpaceId ? data.find(s => String(s.id) === querySpaceId) : null;
            const targetSpace = matched || data.find(s => s.is_default) || data[0];
            setSelectedSpace(targetSpace);
            setSelectedSpaceId(targetSpace.id);
            selectedSpaceIdRef.current = targetSpace.id;
            fetchLeads(false, targetSpace.id);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to load lead spaces", err);
      }
      fetchLeads(false, null);
    };
    initLeadSpaces();
    fetchActivities();
    fetchEmployees();
    fetchSampleStatus();
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
      .catch(() => { });
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

  const fetchLeads = async (forceFull = false, spaceIdOverride?: number | null) => {
    if (leads.length === 0) setLoading(true);
    setLoadError("");
    try {
      const activeSpaceId = spaceIdOverride !== undefined ? spaceIdOverride : selectedSpaceIdRef.current;
      const url = new URL(`${API_BASE_URL}/leads`, window.location.origin);
      if ((role === 'SalesManager' || role === 'Employee') && user?.id) {
        url.searchParams.append('owner_id', String(user.id));
      }
      if (activeSpaceId) {
        url.searchParams.append('space_id', String(activeSpaceId));
      }
      if (!forceFull) {
        url.searchParams.append('limit', '20');
      }
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) throw new Error("Could not load leads. Please retry.");
      const data = await res.json();
      const initialLeads: Lead[] = data.leads || [];
      setLeads(initialLeads);
      if (typeof data.total_count === "number") {
        setServerTotalCount(data.total_count);
      }
      if (data.status_counts) {
        setServerStatusCounts(data.status_counts);
      }
      setLoading(false);

      // Background progressive fetch for remaining leads if there are more than 20
      if (!forceFull && typeof data.total_count === "number" && data.total_count > 20) {
        setLoadingMore(true);
        const remUrl = new URL(`${API_BASE_URL}/leads`, window.location.origin);
        if ((role === 'SalesManager' || role === 'Employee') && user?.id) {
          remUrl.searchParams.append('owner_id', String(user.id));
        }
        if (activeSpaceId) {
          remUrl.searchParams.append('space_id', String(activeSpaceId));
        }
        remUrl.searchParams.append('offset', '20');
        fetch(remUrl.toString(), { headers })
          .then(r => r.ok ? r.json() : Promise.reject())
          .then(remData => {
            if (remData.leads && remData.leads.length > 0) {
              setLeads(prev => {
                const existingIds = new Set(prev.map(l => l.id));
                const newItems = remData.leads.filter((l: Lead) => !existingIds.has(l.id));
                return [...prev, ...newItems];
              });
            }
          })
          .catch(err => console.error("Background fetch for remaining leads error:", err))
          .finally(() => setLoadingMore(false));
      }
    } catch (e) {
      console.error("Failed to fetch leads", e);
      setLoadError(e instanceof Error ? e.message : "Could not load leads");
      setLoading(false);
    }
  };

  const handleStatusChange = async (leadId: number, newStatus: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (newStatus === "Contacted" && lead) {
      setContactSynopsisTarget({ id: leadId, name: lead.company_name });
      return;
    }
    if (institute && (newStatus === "Student" || newStatus === "Converted") && lead && !lead.is_converted) {
      setEnrollLead(lead);
      return;
    }
    const scheduledStage = scheduleStage(newStatus, institute);
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
        || (l.city || "").toLowerCase().includes(q)
        || (l.country || "").toLowerCase().includes(q)
        || (l.address || "").toLowerCase().includes(q)
        || (l.source || "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "All"
        || (statusFilter === "Converted" ? l.is_converted : l.status === statusFilter);

      // Owner filter
      const matchOwner = ownerFilter === "All"
        || (ownerFilter === "Unassigned" ? (!l.owner_id && !l.owner_name && !l.salesperson_name) : (String(l.owner_id) === ownerFilter || l.owner_name === ownerFilter || l.salesperson_name === ownerFilter));

      // Source filter
      const matchSource = sourceFilter === "All"
        || (sourceFilter === "Unassigned" ? (!l.source || l.source.trim() === "") : (l.source || "").toLowerCase() === sourceFilter.toLowerCase());

      // Industry filter
      const matchIndustry = industryFilter === "All"
        || (l.industry || "").toLowerCase() === industryFilter.toLowerCase();

      // Deal value filter
      let matchValue = true;
      const dv = Number(l.deal_value || 0);
      if (dealValueFilter === ">100k") matchValue = dv >= 100000;
      else if (dealValueFilter === "25k-100k") matchValue = dv >= 25000 && dv < 100000;
      else if (dealValueFilter === "<25k") matchValue = dv > 0 && dv < 25000;

      return matchSearch && matchStatus && matchOwner && matchSource && matchIndustry && matchValue;
    });

    if (sortOption === "recent") {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortOption === "oldest") {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortOption === "name" || sortOption === "name_asc") {
      result.sort((a, b) => (a.company_name || "").localeCompare(b.company_name || ""));
    } else if (sortOption === "name_desc") {
      result.sort((a, b) => (b.company_name || "").localeCompare(a.company_name || ""));
    } else if (sortOption === "country") {
      result.sort((a, b) => (a.country || "").localeCompare(b.country || ""));
    } else if (sortOption === "place") {
      result.sort((a, b) => (a.city || a.address || "").localeCompare(b.city || b.address || ""));
    } else if (sortOption === "val_high") {
      result.sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0));
    } else if (sortOption === "val_low") {
      result.sort((a, b) => (a.deal_value || 0) - (b.deal_value || 0));
    }

    return result;
  }, [leads, searchQuery, statusFilter, sortOption, ownerFilter, sourceFilter, industryFilter, dealValueFilter]);

  const openCreate = () => {
    setEditLead(null);
    const initialStatus = selectedSpace?.stages?.[0]?.name || "New";
    setForm({ ...emptyForm, status: initialStatus });
    setCustomFields([]);
    setFormError(null);
    setAutofillUrl("");
    setAutofillSuccess(false);
    setShowModal(true);
  };

  const openEdit = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditLead(lead);
    setFormError(null);
    setAutofillUrl(lead.website || "");
    setAutofillSuccess(false);
    const existingCf = (lead as any).custom_fields || (lead as any).customFields || {};
    setCustomFields(
      typeof existingCf === "object" && existingCf !== null && !Array.isArray(existingCf)
        ? Object.entries(existingCf).map(([k, v]) => ({ key: k, value: String(v) }))
        : []
    );
    setForm({
      ...emptyForm,
      company_name: lead.company_name,
      website: lead.website || "",
      industry: lead.industry || "",
      course_interest_id: lead.course_interest_id ? String(lead.course_interest_id) : "", gpa: lead.gpa == null ? "" : String(lead.gpa), education_level: lead.education_level || "", academic_background: lead.academic_background || "", career_goal: lead.career_goal || "",
      email: lead.email || "",
      phone: lead.phone || "",
      address: lead.address || "",
      source: lead.source || "Website",
      status: lead.status,
      notes: lead.notes || "",
    });
    setShowModal(true);
  };

  // Fallback watcher: if auto_call_new_leads wasn't cached as enabled yet in this browser tab,
  // poll the lightweight lead-filtered calls endpoint and auto-open the same Live Conversation modal the moment a call starts.
  useEffect(() => {
    if (!watchingAutoCall || !isOn("calls")) return;
    let cancelled = false;
    let attempts = 0;
    const pollForCall = async () => {
      attempts += 1;
      try {
        const res = await voiceAgentApi.calls(undefined, watchingAutoCall.id);
        if (cancelled) return;
        const latest = res?.calls?.[0];
        if (latest?.id) {
          setWatchingAutoCall(null);
          setCallTarget({
            id: watchingAutoCall.id,
            company_name: watchingAutoCall.company_name,
            phone: watchingAutoCall.phone,
            activeCallId: latest.id,
          });
          fetchLeads();
          return;
        }
        if (attempts >= 12) {
          setWatchingAutoCall(null);
        }
      } catch {
        if (attempts >= 12 && !cancelled) setWatchingAutoCall(null);
      }
    };
    const initialTimer = setTimeout(() => { void pollForCall(); }, 1200);
    const timer = setInterval(() => { void pollForCall(); }, 900);
    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [watchingAutoCall, isOn]);

  const triggerAutoCallModal = (created: { id?: number; company_name?: string; phone?: string | null }) => {
    if (!created?.id || !created?.phone || !isOn("calls")) return;
    const targetInfo = {
      id: created.id,
      company_name: created.company_name || "New Lead",
      phone: created.phone,
    };
    if (isOn("auto_call_new_leads")) {
      setCallTarget({ ...targetInfo, waitingForAutoCall: true });
    } else {
      setWatchingAutoCall(targetInfo);
    }
  };

  const handleSave = async () => {
    if (!form.company_name.trim()) return;
    const phoneErr = validatePhoneInput(form.phone);
    if (phoneErr) {
      setFormError({ message: phoneErr });
      return;
    }
    setFormError(null);
    setSaving(true);
    const cfObj = customFields.reduce((acc, curr) => {
      if (curr.key.trim()) acc[curr.key.trim()] = curr.value.trim();
      return acc;
    }, {} as Record<string, string>);
    const instituteFields = { course_interest_id: form.course_interest_id ? Number(form.course_interest_id) : null, gpa: form.gpa ? Number(form.gpa) : null };
    const leadSpacePayload = { space_id: selectedSpaceId || (selectedSpace ? selectedSpace.id : null) };
    try {
      if (editLead) {
        const stage = scheduleStage(form.status, institute);
        const response = await fetch(`${API_BASE_URL}/leads/${editLead.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, ...instituteFields, ...leadSpacePayload, custom_fields: cfObj, status: stage ? editLead.status : form.status }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const msg = typeof data.detail === 'string' ? data.detail : 'Could not save lead';
          setFormError({ message: msg, duplicate: response.status === 409 });
          return;
        }
        setShowModal(false);
        if (stage) setSchedule({ lead: editLead, stage });
        fetchLeads();
      } else {
        // Check for duplicate lead by email or phone before saving
        if (form.email.trim() || form.phone.trim()) {
          try {
            const token = localStorage.getItem("crm_token");
            const dupRes = await fetch(`${API_BASE_URL}/leads/check-duplicate`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {})
              },
              body: JSON.stringify({
                email: form.email.trim(),
                phone: form.phone.trim(),
                incoming: { ...form, ...instituteFields, custom_fields: cfObj }
              })
            });
            if (dupRes.ok) {
              const dupData = await dupRes.json();
              if (dupData.has_duplicate && dupData.duplicates?.length > 0) {
                setDuplicateMatch({
                  existing: dupData.duplicates[0],
                  diff: dupData.diff,
                  incoming: { ...form, ...instituteFields, custom_fields: cfObj }
                });
                setSaving(false);
                return;
              }
            }
          } catch (dupErr) {
            console.error("Duplicate check error:", dupErr);
          }
        }

        if (!isAdmin) {
          // Salesperson creates lead: automatically assign to themselves
          const stage = scheduleStage(form.status, institute);
          const payload = { ...form, ...instituteFields, ...leadSpacePayload, custom_fields: cfObj, status: stage ? 'New' : form.status, owner_id: user?.id || null };
          const response = await fetch(`${API_BASE_URL}/leads`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            const msg = typeof data.detail === 'string' ? data.detail : 'Could not create lead';
            setFormError({ message: msg, duplicate: response.status === 409 });
            return;
          }
          const created = await response.json();
          setShowModal(false);
          if (stage) setSchedule({ lead: created, stage });
          fetchLeads();
          triggerAutoCallModal(created);
        } else {
          // New lead: show sales assign modal for admins
          setPendingLeadForm({ ...form, ...instituteFields, ...leadSpacePayload, custom_fields: cfObj });
          setShowModal(false);
          setShowSalesAssign(true);
        }
      }
    } catch (err) {
      setFormError({ message: err instanceof Error ? err.message : 'Could not save lead' });
    } finally { setSaving(false); }
  };

  const doCreateLead = async (employeeId: number | null, _employeeName: string | null) => {
    if (saving || !pendingLeadForm) return;
    setSaving(true);
    setShowSalesAssign(false);
    try {
      const payload = { ...pendingLeadForm };
      const stage = scheduleStage(payload.status, institute);
      if (stage) payload.status = 'New';
      if (employeeId) payload.owner_id = employeeId;
      const response = await fetch(`${API_BASE_URL}/leads`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const msg = typeof data.detail === 'string' ? data.detail : 'Could not create lead';
        setFormError({ message: msg, duplicate: response.status === 409 });
        setShowModal(true);
        return;
      }
      const created = await response.json();
      if (stage) setSchedule({ lead: created, stage });
      setPendingLeadForm(null);
      setFormError(null);
      fetchLeads();
      triggerAutoCallModal(created);
    } catch (err) {
      setFormError({ message: err instanceof Error ? err.message : 'Could not create lead' });
      setShowModal(true);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t("leads.confirm_delete"))) return;
    try {
      const res = await fetch(`${API_BASE_URL}/leads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === "string" ? data.detail : `Could not delete lead (HTTP ${res.status})`);
      }
      setLoadError("");
      fetchLeads();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not delete lead");
    }
  };

  const handleOpenFollowUp = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    setFollowUpTarget({
      type: "lead",
      id: lead.id,
      name: lead.company_name,
      email: lead.email,
      phone: lead.phone,
      salespersonName: lead.salesperson_name || lead.owner_name
    });
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
    { label: t("leads.total_leads"), value: serverTotalCount !== null ? serverTotalCount : leads.length, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: t("leads.new"), value: serverStatusCounts?.New ?? leads.filter(l => l.status === "New").length, color: "text-violet-600", bg: "bg-violet-500/10" },
    { label: t("leads.qualified"), value: serverStatusCounts?.Qualified ?? leads.filter(l => l.status === "Qualified").length, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: t("leads.converted"), value: serverStatusCounts?.Converted ?? leads.filter(l => l.is_converted).length, color: "text-emerald-600", bg: "bg-emerald-500/10" },
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
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{t("leads.title")}</h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-300 border border-slate-200/80 dark:border-white/5">
                  {serverTotalCount !== null ? serverTotalCount : leads.length} <LocalizedText text={"total"} />
                </span>

                {/* Lead Space Selector Dropdown */}
                {spaces.length > 0 && (
                  <div className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => setSpaceDropdownOpen(!spaceDropdownOpen)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 shadow-2xs transition-all cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span className="truncate max-w-[130px] sm:max-w-[200px]">
                        {selectedSpace?.name || "Select Space"}
                      </span>
                      {selectedSpace?.is_default && (
                        <span className="text-[9px] font-black px-1 py-0.2 rounded bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 uppercase">
                          Default
                        </span>
                      )}
                      <ChevronDown className={`w-3.5 h-3.5 text-indigo-500 transition-transform ${spaceDropdownOpen ? "rotate-180" : ""}`} />
                    </button>

                    {spaceDropdownOpen && (
                      <div className="absolute left-0 mt-1.5 w-72 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 p-1.5 animate-in fade-in slide-in-from-top-1">
                        <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Select Lead Space (Pipeline)
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-0.5">
                          {spaces.map((sp) => {
                            const isCur = selectedSpace?.id === sp.id;
                            return (
                              <button
                                key={sp.id}
                                type="button"
                                onClick={() => {
                                  setSelectedSpace(sp);
                                  setSelectedSpaceId(sp.id);
                                  selectedSpaceIdRef.current = sp.id;
                                  setSpaceDropdownOpen(false);
                                  fetchLeads(false, sp.id);
                                }}
                                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left transition-colors cursor-pointer ${isCur
                                    ? "bg-indigo-600 text-white"
                                    : "text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
                                  }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: sp.stages?.[0]?.color || "#6366F1" }}
                                  />
                                  <span className="truncate">{sp.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {sp.is_default && (
                                    <span className={`text-[9px] font-bold px-1 rounded ${isCur ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"}`}>
                                      Default
                                    </span>
                                  )}
                                  <span className={`text-[10px] font-medium ${isCur ? "text-indigo-100" : "text-slate-400"}`}>
                                    {sp.leads_count ?? 0}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {isAdmin && (
                          <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-white/5">
                            <Link
                              href="/settings?tab=lead-spaces"
                              onClick={() => setSpaceDropdownOpen(false)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors"
                            >
                              <Settings className="w-3.5 h-3.5" />
                              <span>Manage Spaces &amp; Stages in Settings</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {loadingMore && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-full animate-pulse border border-blue-200/60 dark:border-blue-900/40">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    Fetching rest...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("leads.subtitle")}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <button
              onClick={async () => {
                try {
                  const token = localStorage.getItem('token') || localStorage.getItem('crm_token');
                  const exportUrl = `${API_BASE_URL}/leads/export-csv${selectedSpace ? `?space_id=${selectedSpace.id}` : ''}`;
                  const res = await fetch(exportUrl, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                  });
                  if (!res.ok) throw new Error("Export failed");
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  const safeName = selectedSpace ? selectedSpace.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'leads';
                  a.download = `serphawk_${safeName}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  a.remove();
                } catch (err) {
                  console.error(err);
                  alert("Failed to export leads.");
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-white/5 transition-colors shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> <LocalizedText text={"Export CSV"} />
            </button>
            {isAdmin && (
              <button
                onClick={handleAutoAssignLeads}
                disabled={autoAssigning}
                title="Automatically distribute unassigned leads by round-robin with conversion rate tie-breaker"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {autoAssigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-300" />}
                Auto-Assign Leads
              </button>
            )}
            <Link
              href={`/import?target=leads${selectedSpace ? `&space_id=${selectedSpace.id}` : ''}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-white/5 transition-colors shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" /> {t("leads.import")}
            </Link>
            <button
              type="button"
              onClick={() => setIsOCRModalOpen(true)}
              title={language === 'es' ? "Escanear tarjeta de negocio con cámara o foto (OCR)" : "Scan business card with live camera or photo (OCR)"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 transition-colors shadow-xs cursor-pointer active:scale-95"
            >
              <FileScan className="w-3.5 h-3.5" />
              <span>{language === 'es' ? "Escanear Tarjeta" : "OCR Scan"}</span>
            </button>
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
                  {loading && leads.length === 0 ? (
                    <div className="h-5 w-12 rounded bg-slate-200 dark:bg-zinc-800 animate-pulse mt-0.5" />
                  ) : (
                    <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none mt-0.5">{s.value}</p>
                  )}
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

      {/* Sample Data Banner for Admin / Sales */}
      {(sampleStats?.has_sample_data || leads.some(l => (l as any).custom_fields?.is_sample)) && (
        <div className="mx-3 sm:mx-6 my-2 p-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between flex-wrap gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
              Sample Data Active: Demo records loaded to showcase ideal CRM pipeline structure.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={sampleBusy}
              onClick={handleDeleteSampleData}
              className="px-3 py-1 rounded-xl text-xs font-bold bg-white dark:bg-zinc-900 text-rose-600 border border-rose-300 dark:border-rose-800 hover:bg-rose-50 transition shadow-xs cursor-pointer"
            >
              {sampleBusy ? "Removing..." : "Delete Sample Data"}
            </button>
          </div>
        </div>
      )}

      {/* Interactive Pipeline Workflow Flowchart */}
      <div className="px-3 sm:px-6 pt-2">
        <PipelineWorkflowFlowchart
          entityType="leads"
          stages={STATUSES}
          counts={stageCounts}
          selectedStage={statusFilter}
          onSelectStage={setStatusFilter}
        />
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
          <button
            type="button"
            onClick={() => setShowTransferModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer"
            title="Bulk transfer leads across salespeople"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>{language === 'es' ? "Transferir Leads" : "Transfer Leads"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTransfersHistoryModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 border border-slate-200/60 dark:border-white/5 transition cursor-pointer"
            title="View Transferred Leads Audit Log"
          >
            <History className="w-3.5 h-3.5 text-indigo-500" />
            <span>{language === 'es' ? "Historial" : "History"}</span>
          </button>

          <ViewSwitcher currentView={currentView} onViewChange={setCurrentView} storageKey="crm_pref_view_leads" />

          {/* Extended Sorting Dropdown */}
          <select
            value={sortOption}
            onChange={e => setSortOption(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-white/10 focus:outline-none cursor-pointer"
          >
            <option value="recent">Sort: Recent (Newest)</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="name">Sort: Name (A-Z)</option>
            <option value="name_desc">Sort: Name (Z-A)</option>
            <option value="place">Sort: City / Place (A-Z)</option>
            <option value="country">Sort: Country (A-Z)</option>
            <option value="val_high">Sort: Deal Value (High - Low)</option>
            <option value="val_low">Sort: Deal Value (Low - High)</option>
          </select>

          {/* Owner / Assignee Filter */}
          <select
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-white/10 focus:outline-none cursor-pointer"
          >
            <option value="All">All Owners</option>
            <option value="Unassigned">Unassigned</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.name}>{emp.name}</option>
            ))}
          </select>

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-white/10 focus:outline-none cursor-pointer"
          >
            <option value="All">All Sources</option>
            <option value="Unassigned">Unassigned</option>
            {availableSources.map(src => (
              <option key={src} value={src}>{src}</option>
            ))}
          </select>

          {/* Deal Value Filter */}
          <select
            value={dealValueFilter}
            onChange={e => setDealValueFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-white/10 focus:outline-none cursor-pointer"
          >
            <option value="All">All Deal Values</option>
            <option value=">100k">&ge; ₹100,000 ($1.2k+)</option>
            <option value="25k-100k">₹25,000 - ₹100,000</option>
            <option value="<25k">&lt; ₹25,000</option>
          </select>

          {/* Reset Filters Button */}
          {(ownerFilter !== "All" || sourceFilter !== "All" || dealValueFilter !== "All" || sortOption !== "recent" || statusFilter !== "All" || searchQuery) && (
            <button
              onClick={() => {
                setOwnerFilter("All");
                setSourceFilter("All");
                setDealValueFilter("All");
                setSortOption("recent");
                setStatusFilter("All");
                setSearchQuery("");
              }}
              className="px-2 py-1 rounded-md text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 hover:bg-rose-100 transition flex items-center gap-1 shrink-0"
              title="Reset all active filters"
            >
              <X className="w-3 h-3" /> Reset
            </button>
          )}

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
          {loading && leads.length === 0 ? (
            <div className="p-3 sm:p-6">
              <LeadShimmerList count={8} />
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
            <div className="flex gap-2.5 p-3 overflow-x-auto h-full items-start w-full">
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
                    className="flex-1 min-w-[170px] max-w-[280px] shrink-0 xl:shrink flex flex-col bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-xl max-h-full transition-all hover:border-indigo-400/50 shadow-2xs"
                  >
                    <div className="p-3 font-bold text-slate-800 dark:text-white flex items-center justify-between border-b border-slate-200 dark:border-[#222222]">
                      <div className="flex items-center gap-1.5 truncate">
                        {(() => {
                          const stageObj = selectedSpace?.stages?.find(st => st.name === status);
                          const stageColor = stageObj?.color;
                          return (
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: stageColor || "#3B82F6" }}
                            />
                          );
                        })()}
                        <span className="text-xs truncate">{status}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-[#222222] text-[10px] text-slate-600 dark:text-[#a3a3a3] font-black">{colLeads.length}</span>
                    </div>
                    <div className="p-2 flex-1 overflow-y-auto space-y-2 min-h-[220px]">
                      {colLeads.map(lead => (
                        <motion.div
                          key={lead.id}
                          layoutId={`lead-${lead.id}`}
                          draggable={true}
                          onDragStartCapture={(e: React.DragEvent<HTMLDivElement>) => {
                            e.dataTransfer.setData("leadId", String(lead.id));
                          }}
                          onClick={() => router.push(`/leads/${lead.id}`)}
                          className="p-3 bg-white dark:bg-[#000000] rounded-xl shadow-2xs border border-slate-200 dark:border-[#222222] cursor-grab active:cursor-grabbing hover:border-indigo-500 dark:hover:border-white transition-colors group"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="font-bold text-slate-900 dark:text-white text-xs truncate flex-1">{lead.company_name}</div>
                            {((lead as any).custom_fields?.is_sample || (lead as any).is_sample) && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0">Sample</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">{lead.industry || 'No industry'}</div>
                          {lead.deal_value && (
                            <div className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                              ${lead.deal_value.toLocaleString()}
                            </div>
                          )}
                          {lead.email && <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 truncate"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{lead.email}</span></div>}

                          {/* Quick Stage Dropdown on Card */}
                          <div className="mt-2 flex items-center justify-between gap-1.5" onClick={e => e.stopPropagation()}>
                            <select
                              value={lead.is_converted ? "Converted" : lead.status}
                              onChange={e => handleStatusChange(lead.id, e.target.value)}
                              aria-label={`Status for ${lead.company_name}`}
                              style={(() => {
                                const curStatus = lead.is_converted ? "Converted" : lead.status;
                                const stageObj = selectedSpace?.stages?.find(st => st.name === curStatus);
                                if (stageObj?.color) {
                                  return {
                                    borderColor: `${stageObj.color}66`,
                                    backgroundColor: `${stageObj.color}15`,
                                    color: stageObj.color,
                                  };
                                }
                                return undefined;
                              })()}
                              className={`w-full text-[10px] font-bold px-1.5 py-1 rounded border cursor-pointer focus:outline-none ${STATUS_STYLE[lead.is_converted ? "Converted" : lead.status] || STATUS_STYLE.New}`}
                            >
                              {STATUSES.map(st => (
                                <option key={st} value={st} className="bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100">{st}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100 dark:border-zinc-800 text-[10px] text-slate-500">
                            <span className="flex items-center gap-1 truncate max-w-[130px]">
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
                              <CalendarClock className="w-3 h-3" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                      {colLeads.length === 0 && <div className="p-3 text-center text-xs text-slate-400 border-2 border-dashed border-slate-200 dark:border-[#222222] rounded-xl">{t("leads.no_leads")}</div>}
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
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#000', borderColor: '#222', color: '#fff' }} />
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
            <div className="w-full p-2.5 sm:p-4 space-y-3">
              {/* ── MOBILE / TABLET CARDS VIEW (Clean, touch-friendly, no horizontal scrolling) ── */}
              <div className="block lg:hidden space-y-2.5">
                <AnimatePresence>
                  {filtered.map((lead, idx) => (
                    <motion.div
                      key={`mob-${lead.id}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.02, 0.25) }}
                      onClick={() => router.push(`/leads/${lead.id}`)}
                      className="rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-3.5 shadow-xs hover:border-blue-500/60 transition-all cursor-pointer space-y-3"
                    >
                      {/* Top: Avatar + Company Name + Stage Select */}
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs">
                            {lead.company_name[0]?.toUpperCase() || "L"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate flex items-center gap-1">
                              <span className="truncate">{lead.company_name}</span>
                              <ArrowUpRight className="w-3 h-3 text-blue-500 shrink-0" />
                            </h4>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                              {lead.city || lead.country || lead.address ? (
                                <span className="flex items-center gap-1 truncate">
                                  <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                                  <span className="truncate">{lead.city || (lead.address ? lead.address.split(',')[0] : '—')}</span>
                                </span>
                              ) : lead.industry ? (
                                <span className="truncate">{lead.industry}</span>
                              ) : null}
                              {lead.source && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-medium truncate">
                                  {lead.source}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div onClick={e => e.stopPropagation()} className="shrink-0">
                          <select
                            value={lead.is_converted ? "Converted" : lead.status}
                            onChange={e => handleStatusChange(lead.id, e.target.value)}
                            className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold uppercase tracking-wide border cursor-pointer focus:outline-none transition-all shadow-xs whitespace-nowrap ${STATUS_STYLE[lead.is_converted ? "Converted" : lead.status] || STATUS_STYLE.New}`}
                          >
                            {STATUSES.map(st => (
                              <option key={st} value={st} className="bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100">
                                {st}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Middle: Contact Quick Actions (Call, Email, Website) */}
                      {(lead.phone || lead.email || lead.website) && (
                        <div className="flex items-center gap-2 flex-wrap text-xs pt-1 border-t border-slate-100 dark:border-white/5" onClick={e => e.stopPropagation()}>
                          {lead.phone && (
                            <a
                              href={`tel:${lead.phone}`}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200/60 dark:border-emerald-800/40 text-[11px]"
                            >
                              <Phone className="w-3 h-3 text-emerald-600" />
                              <span className="truncate max-w-[130px]">{lead.phone}</span>
                            </a>
                          )}
                          {lead.email && (
                            <a
                              href={`mailto:${lead.email}`}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200/60 dark:border-blue-800/40 text-[11px]"
                            >
                              <Mail className="w-3 h-3 text-blue-600" />
                              <span className="truncate max-w-[140px]">{lead.email}</span>
                            </a>
                          )}
                          {lead.website && (
                            <a
                              href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-semibold border border-slate-200/60 dark:border-zinc-700 text-[11px]"
                            >
                              <Globe className="w-3 h-3 text-slate-500" />
                              <span className="truncate max-w-[110px]">{lead.website.replace(/^https?:\/\//, '')}</span>
                            </a>
                          )}
                        </div>
                      )}

                      {/* Bottom Bar: Salesperson + Action Icons */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-white/5" onClick={e => e.stopPropagation()}>
                        <div className="min-w-0 flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-400 truncate">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span className="truncate font-medium">{lead.salesperson_name || lead.owner_name || (language === 'es' ? 'Sin asignar' : 'Unassigned')}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {institute ? (
                            <LeadBatchEnrollmentAction
                              leadId={lead.id}
                              leadName={lead.company_name}
                              leadPhone={lead.phone}
                              isConverted={lead.is_converted}
                              convertedStudentId={lead.converted_student_id}
                              compact
                              onEnrolled={fetchLeads}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={e => handleManualAnalyze(lead.id, e)}
                              title="360° AI Analysis"
                              className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-purple-50 hover:text-purple-600 text-slate-400"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <Link
                            href={`/meetings?new=true&lead_id=${lead.id}&title=${encodeURIComponent(`Meeting with ${lead.company_name}`)}`}
                            title="Schedule Meeting"
                            className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-indigo-50 hover:text-indigo-600 text-slate-400"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={e => handleOpenFollowUp(lead, e)}
                            title="Follow-up"
                            className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-amber-50 hover:text-amber-600 text-slate-400"
                          >
                            <CalendarClock className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => openEdit(lead, e)}
                            title={t("leads.edit_lead")}
                            className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-blue-50 hover:text-blue-600 text-slate-400"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* ── DESKTOP TABLE VIEW (Full wide table for lg: screens and up) ── */}
              <div className="hidden lg:block overflow-x-auto scrollbar-thin">
                <div className="min-w-[1360px] space-y-2">
                  {/* Subtle column headers for desktop */}
                  <div className="hidden lg:grid grid-cols-[minmax(220px,2fr)_minmax(180px,1.4fr)_minmax(160px,1.2fr)_minmax(130px,1.1fr)_minmax(130px,1fr)_minmax(140px,1.1fr)_minmax(200px,1.5fr)] gap-4 px-4 py-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider items-center">
                    <div className="cursor-pointer hover:text-blue-500 truncate" onClick={() => setSortOption(s => s === 'name' ? 'recent' : 'name')}>
                      <LocalizedText text={institute ? "Student & course" : "Company"} /> {sortOption === 'name' ? '↑' : ''}
                    </div>
                    <div className="truncate"><LocalizedText text={"Contact"} /></div>
                    <div className="flex items-center gap-1 cursor-pointer hover:text-blue-500 truncate" onClick={() => setSortOption(s => s === 'place' ? 'country' : 'place')}>
                      <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                      <span>Place & Country</span> {sortOption === 'place' ? '↑ City' : sortOption === 'country' ? '↑ Ctr' : ''}
                    </div>
                    <div className="truncate"><LocalizedText text={"Salesperson"} /></div>
                    <div className="truncate"><LocalizedText text={"Source"} /></div>
                    <div className="truncate font-bold text-slate-400 dark:text-zinc-400 tracking-wider">
                      {language === 'es' ? "ETAPAS" : "STAGES"}
                    </div>
                    <div className="text-right truncate font-bold text-slate-400 dark:text-zinc-400 tracking-wider">
                      {language === 'es' ? "ACCIONES" : "ACTIONS"}
                    </div>
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
                        <div className="grid grid-cols-[minmax(220px,2fr)_minmax(180px,1.4fr)_minmax(160px,1.2fr)_minmax(130px,1.1fr)_minmax(130px,1fr)_minmax(140px,1.1fr)_minmax(200px,1.5fr)] gap-4 items-center">
                          {/* Company & Website */}
                          <div className="min-w-0 flex items-center gap-2.5">
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
                                {(lead.industry || (institute && lead.course_interest_id)) && (
                                  <span className="text-slate-500 dark:text-zinc-400 truncate text-[10.5px]">
                                    {lead.website ? "• " : ""}{institute ? (lead.course_interest_title || courses.find(c => c.id === lead.course_interest_id)?.title || lead.industry) : lead.industry}
                                  </span>
                                )}
                                {!institute && (
                                  lead.ai_status === 'done' ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9.5px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0" title="360° AI Dossier & Fit Matrix Ready">
                                      <Sparkles className="w-2.5 h-2.5 text-purple-600" /> 360° Ready
                                    </span>
                                  ) : lead.ai_status === 'pending' ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9.5px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0 animate-pulse">
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" /> Analyzing 360°
                                    </span>
                                  ) : null
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Contact Info */}
                          <div className="min-w-0">
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
                            {(isOn('calls') || lead.next_follow_up_at) && (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {isOn('calls') && (
                                  <LeadCallStatusBadge
                                    status={lead.latest_call_status}
                                    at={lead.latest_call_at}
                                    onClick={lead.latest_call_id ? (e) => {
                                      e.stopPropagation();
                                      setCallTarget({
                                        id: lead.id,
                                        company_name: lead.company_name,
                                        phone: lead.phone,
                                        activeCallId: lead.latest_call_id,
                                      });
                                    } : undefined}
                                  />
                                )}
                                {lead.next_follow_up_at && (() => {
                                  const norm = lead.next_follow_up_at.endsWith("Z") || lead.next_follow_up_at.includes("+") ? lead.next_follow_up_at : `${lead.next_follow_up_at}Z`;
                                  const dueDate = new Date(norm);
                                  const isOverdue = !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now();
                                  return (
                                    <span
                                      title={lead.follow_up_reason ? `Follow-up: ${lead.follow_up_reason}` : "Scheduled follow-up"}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md border text-[9.5px] font-bold tracking-wide shrink-0 ${
                                        isOverdue
                                          ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/70"
                                          : "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                                      }`}
                                    >
                                      <CalendarClock className="w-2.5 h-2.5 shrink-0" />
                                      {isOverdue ? "Overdue" : "Follow-up"} · {dueDate.toLocaleDateString([], { month: "short", day: "numeric" })}
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                          </div>

                          {/* Place & Country */}
                          <div className="min-w-0">
                            {lead.city || lead.country || lead.address ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200 truncate flex items-center gap-1" title={lead.city || lead.address || ''}>
                                  <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                                  <span className="truncate">{lead.city || (lead.address ? lead.address.split(',')[0] : '—')}</span>
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider truncate pl-4">
                                  {lead.country || (lead.address && lead.address.includes(',') ? lead.address.split(',').pop()?.trim() : '—')}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic pl-4">—</span>
                            )}
                          </div>

                          {/* Salesperson */}
                          <div className="min-w-0" onClick={e => e.stopPropagation()}>
                            {isAdmin ? (
                              <select
                                value={lead.owner_id || ""}
                                onChange={e => handleAssignSalesperson(lead.id, e.target.value ? Number(e.target.value) : null)}
                                className="text-xs font-medium bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer w-full max-w-[125px] truncate shadow-xs"
                                title="Assign Salesperson"
                              >
                                <option value=""><LocalizedText text={"Unassigned"} /></option>
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
                                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 truncate max-w-[100px]">
                                  {lead.salesperson_name || lead.owner_name || 'Unassigned'}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Source */}
                          <div className="min-w-0 overflow-hidden">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/60 dark:border-white/5 truncate max-w-full" title={lead.source || "Unknown"}>
                              {lead.source || "Unknown"}
                            </span>
                          </div>

                          {/* Stages (Status) */}
                          <div className="min-w-0" onClick={e => e.stopPropagation()}>
                            <select
                              value={lead.is_converted ? "Converted" : lead.status}
                              onChange={e => handleStatusChange(lead.id, e.target.value)}
                              className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border cursor-pointer focus:outline-none transition-all shadow-xs whitespace-nowrap shrink-0 max-w-full ${STATUS_STYLE[lead.is_converted ? "Converted" : lead.status] || STATUS_STYLE.New}`}
                              title="Change lead stage"
                            >
                              {STATUSES.map(st => (
                                <option key={st} value={st} className="bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100">
                                  {st}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center justify-end gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              {isOn('calls') && (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setCallTarget({ id: lead.id, company_name: lead.company_name, phone: lead.phone });
                                  }}
                                  title={lead.latest_call_status ? "Call again" : "Call with AI"}
                                  className="p-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/30 text-emerald-600 transition-colors shadow-xs"
                                >
                                  <PhoneCall className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {institute ? (
                                <LeadBatchEnrollmentAction
                                  leadId={lead.id}
                                  leadName={lead.company_name}
                                  leadPhone={lead.phone}
                                  isConverted={lead.is_converted}
                                  convertedStudentId={lead.converted_student_id}
                                  compact
                                  onEnrolled={fetchLeads}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={e => handleManualAnalyze(lead.id, e)}
                                  title={lead.ai_status === 'done' ? "360° AI Ready — Click to Re-analyze" : "Run 360° AI Analysis"}
                                  className={`p-1.5 rounded-lg border transition-colors shadow-xs ${lead.ai_status === 'done'
                                    ? "border-purple-300 bg-purple-50 text-purple-600 dark:border-purple-700/60 dark:bg-purple-950/40 dark:text-purple-300"
                                    : analyzingLeadId === lead.id
                                      ? "border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-700 dark:bg-indigo-950/40"
                                      : "border-slate-200/80 dark:border-white/10 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300 dark:hover:bg-purple-900/30 text-slate-400"
                                    }`}
                                >
                                  {analyzingLeadId === lead.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                                  ) : (
                                    <Sparkles className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
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

                  {loadingMore && (
                    <div className="mt-3 space-y-2">
                      <LeadShimmerList count={2} />
                      <div className="flex items-center justify-center py-2.5">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900/40">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Fetching remaining leads in background...
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>            </div>
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
                {/* ── Autofill with Website ── */}
                <div className="p-4 bg-gradient-to-r from-blue-50 dark:from-blue-950/40 via-indigo-50 dark:via-indigo-950/30 to-violet-50 dark:to-violet-950/40 border border-blue-200/80 dark:border-blue-800/40 rounded-2xl shadow-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                        {language === "es" ? "Autocompletar con Sitio Web" : "Autofill with Website"}
                      </span>
                    </div>
                    {autofillSuccess && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        {language === "es" ? "¡Datos completados!" : "Details filled!"}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mb-2.5">
                    {language === "es"
                      ? "Pega la URL de la empresa para extraer automáticamente nombre real, correo verificado, teléfono, sector y resumen."
                      : "Paste the company's website URL to automatically extract real business name, verified email, phone, industry, and summary."}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Globe className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={autofillUrl}
                        onChange={e => setAutofillUrl(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAutofillFromWebsite();
                          }
                        }}
                        placeholder="https://company.com"
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAutofillFromWebsite()}
                      disabled={autofilling || !autofillUrl.trim()}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition-all shrink-0 cursor-pointer"
                    >
                      {autofilling ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{language === "es" ? "Extrayendo..." : "Extracting..."}</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" />
                          <span>{language === "es" ? "Autocompletar" : "Autofill Details"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Company Name — required */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">
                    {institute ? t("Student name") : t("leads.company_name")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    autoFocus
                    value={form.company_name}
                    onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                    placeholder="e.g. Acme Corp"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("leads.email")}</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="info@company.com"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                  </div>
                  {institute && <div className="col-span-full grid gap-4 sm:grid-cols-2">
                    <label className="text-sm">Course<select aria-label="Course interest" value={form.course_interest_id} onChange={e => setForm(f => ({ ...f, course_interest_id: e.target.value, industry: courses.find(course => String(course.id) === e.target.value)?.category || "" }))} className="mt-1 w-full rounded-xl border bg-transparent p-2"><option value="">Select course</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
                    <label className="text-sm">Education level<select value={form.education_level} onChange={e => setForm(f => ({ ...f, education_level: e.target.value }))} className="mt-1 w-full rounded-xl border bg-transparent p-2"><option value="">Select education level</option>{["High school", "Diploma", "Bachelor's", "Master's", "Doctorate", "Other"].map(level => <option key={level}>{level}</option>)}</select></label>
                    <label className="text-sm">GPA<input type="number" min="0" max="10" step="0.01" value={form.gpa} onChange={e => setForm(f => ({ ...f, gpa: e.target.value }))} className="mt-1 w-full rounded-xl border bg-transparent p-2" /></label>
                    {([['academic_background', 'Academic background'], ['career_goal', 'Career goal']] as const).map(([key, label]) => <label key={key} className="text-sm">{label}<input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="mt-1 w-full rounded-xl border bg-transparent p-2" /></label>)}
                  </div>}
                  <div className="min-w-0">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("leads.phone")}</label>
                    <PhoneInput
                      value={form.phone}
                      onChange={phone => { setForm(f => ({ ...f, phone })); setFormError(null); }}
                      defaultDialCode="+91"
                      dropdownAlign={institute ? "left" : "right"}
                      className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 transition-all"
                      buttonClassName="px-2 sm:px-2.5 py-2.5 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80"
                      inputClassName="px-2.5 sm:px-3 py-2.5 text-slate-900 dark:text-white placeholder-slate-400"
                    />
                    <p className="mt-1 text-[10.5px] text-slate-400 dark:text-zinc-500">Include country code (e.g. +91...) for AI calling.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {!institute && <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("leads.industry")}</label>
                    <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                      <option value="">{t("leads.select_industry")}</option>
                      {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                    </select>
                  </div>}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">{t("leads.source")}</label>
                    <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                      {availableSources.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {spaces.length > 1 && (
                  <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-200/60 dark:border-indigo-900/40">
                    <label className="text-xs font-semibold text-indigo-950 dark:text-indigo-200 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Pipeline Space</span>
                    </label>
                    <select
                      value={selectedSpaceId || ""}
                      onChange={e => {
                        const sid = Number(e.target.value);
                        const sp = spaces.find(s => s.id === sid);
                        if (sp) {
                          setSelectedSpace(sp);
                          setSelectedSpaceId(sp.id);
                          selectedSpaceIdRef.current = sp.id;
                          if (sp.stages && sp.stages.length > 0) {
                            setForm(f => ({ ...f, status: sp.stages[0].name }));
                          }
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
                    >
                      {spaces.map(s => (
                        <option key={s.id} value={s.id}>{s.name} {s.is_default ? "(Default Space)" : ""}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {!institute && <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block">{t("leads.website")}</label>
                      <button
                        type="button"
                        onClick={() => handleAutofillFromWebsite(form.website)}
                        disabled={autofilling || !form.website?.trim()}
                        className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 disabled:opacity-40 dark:text-blue-400 transition-colors cursor-pointer"
                        title="Autofill details from website"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{language === "es" ? "Autocompletar" : "Autofill"}</span>
                      </button>
                    </div>
                    <input value={form.website} onChange={e => {
                      const val = e.target.value;
                      setForm(f => ({ ...f, website: val }));
                      if (!autofillUrl) setAutofillUrl(val);
                    }} placeholder="https://example.com"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                  </div>}
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

                {/* ── Add Contact Person / Save to Contacts & Lead Contacts ── */}
                {!editLead && (
                  <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-3.5 transition-all">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.add_contact}
                        onChange={e => setForm(f => ({ ...f, add_contact: e.target.checked }))}
                        className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-zinc-700 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <UserPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {language === 'es' ? "Agregar Persona de Contacto" : "Add a Contact Person"}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            {language === 'es' ? "Contactos + Lead" : "Contacts + Lead"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                          {language === 'es'
                            ? "Guarda este contacto tanto en el Directorio General de Contactos como en los Contactos vinculados a este Lead."
                            : "Saves this contact to both the global Contacts directory and linked Lead Contacts."}
                        </p>
                      </div>
                    </label>

                    {form.add_contact && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3 pt-2 border-t border-indigo-100 dark:border-indigo-900/40"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Contact Person Name */}
                          <div>
                            <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider mb-1 block">
                              {language === 'es' ? "Nombre del Contacto *" : "Contact Full Name *"}
                            </label>
                            <div className="relative">
                              <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                value={form.contact_name}
                                onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                                placeholder="e.g. Carlos Mendoza / Jane Doe"
                                className="w-full pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                              />
                            </div>
                          </div>

                          {/* Contact Heading / Role / Designation */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block">
                                {language === 'es' ? "Encabezado / Cargo *" : "Heading / Role *"}
                              </label>
                              <span className="text-[10px] text-indigo-500 font-semibold">{language === 'es' ? "Editable" : "Editable"}</span>
                            </div>
                            <div className="relative">
                              <Briefcase className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                value={form.contact_designation}
                                onChange={e => setForm(f => ({ ...f, contact_designation: e.target.value }))}
                                placeholder="e.g. CEO / Founder / Decision Maker"
                                className="w-full pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs font-semibold"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Quick Heading Preset Pills */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          <span className="text-[10px] font-medium text-slate-400">{language === 'es' ? "Sugerencias:" : "Heading presets:"}</span>
                          {[
                            "Key Decision Maker",
                            "CEO / Founder",
                            "Managing Director",
                            "VP of Sales",
                            "Commercial Director",
                            "Procurement Lead",
                            "Technical Lead"
                          ].map(preset => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setForm(f => ({ ...f, contact_designation: preset }))}
                              className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${form.contact_designation === preset
                                ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                                : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700 hover:border-indigo-400'
                                }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>

                        {/* Contact Email & Phone */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider mb-1 block">
                              {language === 'es' ? "Correo Directo" : "Direct Email"}
                            </label>
                            <div className="relative">
                              <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="email"
                                value={form.contact_email}
                                onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                                placeholder={form.email || "carlos@company.com"}
                                className="w-full pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider mb-1 block">
                              {language === 'es' ? "Teléfono / Móvil" : "Direct Phone / Mobile"}
                            </label>
                            <div className="relative">
                              <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                value={form.contact_phone}
                                onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                                placeholder={form.phone || "+52 55 1234 5678"}
                                className="w-full pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Department */}
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider mb-1 block">
                            {language === 'es' ? "Departamento / Área" : "Department"}
                          </label>
                          <select
                            value={form.contact_department}
                            onChange={e => setForm(f => ({ ...f, contact_department: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs cursor-pointer"
                          >
                            <option value="Executive">Executive / Management</option>
                            <option value="Sales">Sales & Business Development</option>
                            <option value="Technology">Technology & Engineering</option>
                            <option value="Marketing">Marketing & Growth</option>
                            <option value="Operations">Operations</option>
                            <option value="Procurement">Procurement</option>
                            <option value="Finance">Finance</option>
                          </select>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Custom / Additional Fields */}
                <div className="border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4 bg-slate-50/50 dark:bg-zinc-800/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                        {language === 'es' ? 'Campos Personalizados Adicionales' : 'Custom / Additional Fields'}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {language === 'es' ? 'Agregue campos personalizados que aparecerán en el encabezado de este lead' : 'Add custom metadata fields that will be displayed in the lead header'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomFields(prev => [...prev, { key: "", value: "" }])}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> {language === 'es' ? 'Agregar Campo' : 'Add Field'}
                    </button>
                  </div>

                  {customFields.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {customFields.map((cf, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Field Name (e.g. Budget, Priority, Batch)"
                            value={cf.key}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomFields(prev => prev.map((item, i) => i === idx ? { ...item, key: val } : item));
                            }}
                            className="w-1/2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <input
                            type="text"
                            placeholder="Value"
                            value={cf.value}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomFields(prev => prev.map((item, i) => i === idx ? { ...item, value: val } : item));
                            }}
                            className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => setCustomFields(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 text-slate-400 hover:text-red-500 transition rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {formError && (
                  <div
                    role="alert"
                    className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
                      formError.duplicate
                        ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300"
                        : "bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    {formError.duplicate ? `Duplicate lead: ${formError.message}` : formError.message}
                  </div>
                )}
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
        {contactSynopsisTarget && (
          <ContactSynopsisModal
            leadId={contactSynopsisTarget.id}
            companyName={contactSynopsisTarget.name}
            isOpen={true}
            onClose={() => setContactSynopsisTarget(null)}
            onSuccess={() => {
              fetchLeads();
              setContactSynopsisTarget(null);
            }}
          />
        )}

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
      {loadError && <div role="alert" className="fixed bottom-4 left-4 right-4 z-40 rounded-xl bg-red-50 p-4 text-red-800 shadow-lg">{loadError} <button onClick={() => { fetchLeads(); }} className="ml-3 underline"><LocalizedText text={"Retry"} /></button></div>}
      {schedule && <InstituteLeadScheduleModal lead={schedule.lead} stage={schedule.stage} onClose={() => setSchedule(null)} onSuccess={() => { fetchLeads(); }} />}
      <AddFollowUpModal
        open={!!followUpTarget}
        onClose={() => setFollowUpTarget(null)}
        target={followUpTarget}
        onSuccess={() => { fetchLeads(); }}
      />

      {/* Bulk Lead Transfer Modal */}
      <BulkLeadTransferModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        leads={leads}
        employees={employees}
        isAdmin={isAdmin}
        currentUserId={user?.id}
        onTransferred={() => { fetchLeads(); }}
        onViewHistory={() => {
          setShowTransferModal(false);
          setShowTransfersHistoryModal(true);
        }}
      />

      {/* Transferred Leads Audit Log Modal */}
      <TransferredLeadsModal
        isOpen={showTransfersHistoryModal}
        onClose={() => setShowTransfersHistoryModal(false)}
      />

      {/* OCR Scanner with Live Camera & Photo Upload */}
      <OCRScannerModal
        isOpen={isOCRModalOpen}
        onClose={() => setIsOCRModalOpen(false)}
        onExtracted={handleOCRExtracted}
        targetEntity="lead"
      />

      {/* Duplicate Lead Detection & Resolution Modal */}
      {duplicateMatch && (
        <DuplicateLeadModal
          isOpen={true}
          onClose={() => setDuplicateMatch(null)}
          existingLead={duplicateMatch.existing}
          incomingLead={duplicateMatch.incoming}
          diff={duplicateMatch.diff}
          onMerge={async () => {
            const token = localStorage.getItem("crm_token");
            const res = await fetch(`${API_BASE_URL}/leads/resolve-duplicate`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {})
              },
              body: JSON.stringify({
                action: "merge",
                existing_lead_id: duplicateMatch.existing.id,
                lead_data: duplicateMatch.incoming
              })
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.detail || "Failed to merge with existing lead");
            }
            setDuplicateMatch(null);
            setShowModal(false);
            setForm({ ...emptyForm });
            fetchLeads();
          }}
          onReplace={async () => {
            const token = localStorage.getItem("crm_token");
            const res = await fetch(`${API_BASE_URL}/leads/resolve-duplicate`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {})
              },
              body: JSON.stringify({
                action: "replace",
                existing_lead_id: duplicateMatch.existing.id,
                lead_data: duplicateMatch.incoming
              })
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.detail || "Failed to replace existing lead");
            }
            setDuplicateMatch(null);
            setShowModal(false);
            setForm({ ...emptyForm });
            fetchLeads();
          }}
          onCreateAnyway={async () => {
            setDuplicateMatch(null);
            if (!isAdmin) {
              const stage = scheduleStage(duplicateMatch.incoming.status, institute);
              const payload = { ...duplicateMatch.incoming, status: stage ? 'New' : duplicateMatch.incoming.status, owner_id: user?.id || null };
              const response = await fetch(`${API_BASE_URL}/leads`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not create lead');
              }
              const created = await response.json();
              setShowModal(false);
              setForm({ ...emptyForm });
              if (stage) setSchedule({ lead: created, stage });
              fetchLeads();
            } else {
              setPendingLeadForm({ ...duplicateMatch.incoming });
              setShowModal(false);
              setShowSalesAssign(true);
            }
          }}
        />
      )}

      {enrollLead && (
        <LeadBatchEnrollmentAction
          leadId={enrollLead.id}
          leadName={enrollLead.company_name}
          leadPhone={enrollLead.phone}
          isConverted={enrollLead.is_converted}
          convertedStudentId={enrollLead.converted_student_id}
          externalOpen={!!enrollLead}
          onExternalClose={() => setEnrollLead(null)}
          hideTrigger
          onEnrolled={() => {
            setEnrollLead(null);
            fetchLeads();
          }}
        />
      )}
      <LeadCallModal
        open={!!callTarget}
        target={callTarget}
        onClose={() => setCallTarget(null)}
        notify={notify}
        onCallStarted={fetchLeads}
      />
    </div>
  );
}
