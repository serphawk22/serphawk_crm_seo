"use client";
import LocalizedText from "@/components/LocalizedText";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, X, Loader2, Briefcase, GraduationCap, Target,
  Ticket, CheckCircle, PlayCircle, Layers, Activity, Search,
  Eye, EyeOff, Shield, Archive, Clock, DollarSign, Calendar,
  ArrowUpRight, Phone, Mail, Award, TrendingUp, UserCheck,
  MessageSquare, MessageCircle, Send, Check, CalendarClock,
  ExternalLink, ChevronRight, UserMinus, BarChart2
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import ResponsiveDialog from "@/components/ResponsiveDialog";
import PageGuide from "@/components/PageGuide";
import { useLanguage } from "@/context/LanguageContext";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { useRole } from "@/context/RoleContext";

interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: string;
  expertise?: string;
  phone?: string;
  stats?: {
    leads_count?: number;
    contacts_count?: number;
    total_assigned?: number;
    converted_count?: number;
    deals_value?: number;
    meetings_count?: number;
    win_rate?: number;
  };
}

function formatRole(r?: string): string {
  if (!r) return "Member";
  const s = r.trim();
  if (s.toLowerCase() === "salesmanager" || s.toLowerCase() === "sales") return "Salesperson";
  return s;
}

function getRoleBadge(role?: string) {
  const r = (role || "").toLowerCase();
  if (r.includes("admin")) return { label: "Admin", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" };
  if (r.includes("sales")) return { label: "Sales", color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" };
  if (r.includes("admissions")) return { label: "Admissions", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" };
  if (r.includes("instructor") || r.includes("faculty")) return { label: "Instructor", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" };
  if (r.includes("project") || r.includes("intern") || r.includes("dev")) return { label: "Tech / Dev", color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20" };
  return { label: formatRole(role), color: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" };
}

interface AssignedPersonItem {
  id: number;
  name: string;
  type: 'lead' | 'student' | 'contact' | 'client';
  status: string;
  email?: string | null;
  phone?: string | null;
  deal_value?: number | null;
  created_at?: string | null;
}

interface ActivityItem {
  id: number;
  action: string;
  details?: string | null;
  lead_id?: number | null;
  createdAt: string;
}

interface MemberStats {
  type: string;
  user?: { id: number; name: string; email?: string; role?: string; expertise?: string };
  total_assigned?: number;
  leads_assigned?: number;
  contacts_count?: number;
  students_assigned?: number;
  clients_handling?: number;
  active_handling_count?: number;
  leads_converted?: number;
  win_rate?: number;
  total_business_made?: number;
  advance_collected?: number;
  cases_assigned?: number;
  batches_count?: number;
  completed_count?: number;
  avg_rating?: number;
  assigned_persons?: AssignedPersonItem[];
  active_tasks?: { id: number; title: string; status: string; priority: string }[];
  recent_activities?: ActivityItem[];
  user_meetings?: { id: number; title: string; scheduled_at?: string; status: string; meeting_type: string; client_name?: string; lead_name?: string; contact_name?: string }[];
  user_followups?: { id: number; title: string; due_at?: string; status: string; priority?: string; contact_id?: number; lead_id?: number; client_id?: number }[];
  total_tickets?: number;
  in_dev?: number;
  in_qa?: number;
  in_prod?: number;
}

export default function TeamsPage() {
  const { loaded, isOn } = useTenantConfig();
  if (!loaded) return <p role="status" className="p-6 text-xs text-slate-500">Loading team configuration…</p>;
  return <StandardTeamsPage institute={isOn('institute')} />;
}

function StandardTeamsPage({ institute }: { institute: boolean }) {
  const { user } = useRole();
  const { t } = useLanguage();
  const { settings } = useTenantConfig();
  const curSym = (settings?.default_currency || "INR").toUpperCase() === "USD" ? "$" : "₹";

  const [users, setUsers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "sales_admissions" | "instructors" | "tech" | "admins">("all");
  const [showPassword, setShowPassword] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("SalesManager");

  // Slide-over drawer state
  const [selectedUser, setSelectedUser] = useState<TeamMember | null>(null);
  const [userStats, setUserStats] = useState<MemberStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'assigned' | 'activity' | 'meetings'>('overview');
  const [handlingSubFilter, setHandlingSubFilter] = useState<'all' | 'lead' | 'contact' | 'client' | 'student'>('all');

  // Direct Message Modal state
  const [messageRecipient, setMessageRecipient] = useState<TeamMember | null>(null);
  const [messageContent, setMessageContent] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageSentSuccess, setMessageSentSuccess] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  const handleUserClick = async (u: TeamMember) => {
    setSelectedUser(u);
    setUserStats({
      type: (u.role || "").toLowerCase() === "admissions" ? "admissions" : "sales",
      user: { id: u.id, name: u.name, email: u.email, role: u.role, expertise: u.expertise },
      total_assigned: u.stats?.total_assigned || 0,
      leads_assigned: u.stats?.leads_count || 0,
      contacts_count: u.stats?.contacts_count || 0,
      students_assigned: 0,
      leads_converted: u.stats?.converted_count || 0,
      win_rate: u.stats?.win_rate || 0,
      total_business_made: u.stats?.deals_value || 0,
      advance_collected: 0,
      assigned_persons: [],
      user_meetings: [],
      user_followups: [],
      active_tasks: [],
      recent_activities: []
    });
    setDrawerTab('overview');
    setHandlingSubFilter('all');
    setLoadingStats(true);
    try {
      const token = typeof window !== "undefined" ? (localStorage.getItem("token") || localStorage.getItem("crm_token") || localStorage.getItem("access_token")) : null;
      const userStr = typeof window !== "undefined" ? (localStorage.getItem("crm_user") || localStorage.getItem("user")) : null;
      let uid = "";
      if (userStr) {
        try {
          const parsed = JSON.parse(userStr);
          if (parsed?.id) uid = String(parsed.id);
        } catch {}
      }
      const res = await fetch(`${API_BASE_URL}/users/${u.id}/stats`, {
        credentials: "include",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(uid ? { "X-User-ID": uid } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUserStats(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  };

  const openMessageModal = (u: TeamMember, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setMessageRecipient(u);
    setMessageContent("");
    setMessageSentSuccess(false);
    setMessageError(null);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageRecipient || !messageContent.trim()) return;
    setIsSendingMessage(true);
    setMessageError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
      const res = await fetch(`${API_BASE_URL}/team-chat/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          recipient_id: messageRecipient.id,
          content: messageContent.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to send message");
      }
      setMessageSentSuccess(true);
      setMessageContent("");
    } catch (err: any) {
      setMessageError(err.message || "Could not send message");
    } finally {
      setIsSendingMessage(false);
    }
  };

  const fetchUsers = async () => {
    setLoadError(false);
    try {
      const res = await fetch(`${API_BASE_URL}/users`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error("Error fetching users:", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        fetchUsers();
        setName("");
        setEmail("");
        setPassword("");
        setRole("SalesManager");
      } else {
        let msg = `Request failed (${res.status})`;
        try {
          const data = await res.json();
          if (typeof data.detail === "string") msg = data.detail;
          else if (Array.isArray(data.detail) && data.detail[0]?.msg) msg = data.detail[0].msg;
          else if (data.message) msg = data.message;
        } catch { /* non-JSON body */ }
        setCreateError(msg);
      }
    } catch (error) {
      console.error("Error creating user:", error);
      setCreateError("Network error — could not reach the server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeMember = async (member: { id: number; name: string }) => {
    if (!window.confirm(`Remove ${member.name || 'this team member'}? All their assigned leads and contacts will be automatically transferred fairly among remaining active members, and their record will be saved in Deleted Records.`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/users/${member.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not remove member");
      window.alert(data.message || "Team member removed. Records transferred fairly.");
      setSelectedUser(null);
      await fetchUsers();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not remove member");
    }
  };

  // Filter users based on search query and role tabs
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const q = query.trim().toLowerCase();
      const matchesQuery = !q || [u.name, u.email, u.role, u.expertise].some(val => val?.toLowerCase().includes(q));
      if (!matchesQuery) return false;

      const r = (u.role || "").toLowerCase();
      if (roleFilter === "sales_admissions") {
        return r.includes("sales") || r.includes("admissions") || r === "employee";
      }
      if (roleFilter === "instructors") {
        return r.includes("instructor") || r.includes("faculty") || !!u.expertise;
      }
      if (roleFilter === "tech") {
        return r.includes("project") || r.includes("intern") || r.includes("dev");
      }
      if (roleFilter === "admins") {
        return r.includes("admin");
      }
      return true;
    });
  }, [users, query, roleFilter]);

  // Metric counts
  const totalCount = users.length;
  const salesAndAdmissionsCount = users.filter(u => {
    const r = (u.role || "").toLowerCase();
    return r.includes("sales") || r.includes("admissions") || r === "employee";
  }).length;
  const instructorsCount = users.filter(u => {
    const r = (u.role || "").toLowerCase();
    return r.includes("instructor") || r.includes("faculty") || !!u.expertise;
  }).length;
  const techCount = users.filter(u => {
    const r = (u.role || "").toLowerCase();
    return r.includes("project") || r.includes("intern") || r.includes("dev");
  }).length;
  const adminsCount = users.filter(u => (u.role || "").toLowerCase().includes("admin")).length;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Executive Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-3 rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none">
                Team Directory & Organizer
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {users.length} members
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Live organizer for team activity, assigned handlings, performance metrics, and direct messaging.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/deleted-records?record_type=salesperson"
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 rounded-xl font-semibold text-xs transition border border-slate-200 dark:border-white/10 shrink-0"
          >
            <Archive className="w-3.5 h-3.5 text-amber-500" />
            <span>Deleted Records</span>
          </Link>
          <button
            onClick={() => { setCreateError(null); setShowCreateModal(true); }}
            className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-xs transition shadow-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("teams.add_member")}</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white dark:bg-[#111111]/90 rounded-2xl p-3 sm:px-4 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Total Members</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">{totalCount}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-2xl p-3 sm:px-4 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Sales & Admissions</p>
            <p className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums mt-0.5">{salesAndAdmissionsCount}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Briefcase className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-2xl p-3 sm:px-4 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              {institute ? "Instructors" : "Tech & Operations"}
            </p>
            <p className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 tabular-nums mt-0.5">
              {institute ? instructorsCount : techCount}
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            {institute ? <GraduationCap className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111]/90 rounded-2xl p-3 sm:px-4 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Admins</p>
            <p className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">{adminsCount}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter Tabs and Search Toolbar */}
      <div className="bg-white dark:bg-[#111111]/90 p-2 sm:p-3 rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Department Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setRoleFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              roleFilter === "all"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300"
            }`}
          >
            All Members ({totalCount})
          </button>
          <button
            onClick={() => setRoleFilter("sales_admissions")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              roleFilter === "sales_admissions"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300"
            }`}
          >
            Sales & Admissions ({salesAndAdmissionsCount})
          </button>
          {instructorsCount > 0 && (
            <button
              onClick={() => setRoleFilter("instructors")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                roleFilter === "instructors"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300"
              }`}
            >
              Instructors ({instructorsCount})
            </button>
          )}
          {techCount > 0 && (
            <button
              onClick={() => setRoleFilter("tech")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                roleFilter === "tech"
                  ? "bg-cyan-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300"
              }`}
            >
              Tech & Operations ({techCount})
            </button>
          )}
          <button
            onClick={() => setRoleFilter("admins")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              roleFilter === "admins"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300"
            }`}
          >
            Admins ({adminsCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px] sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500" />
          <input
            aria-label="Search team members"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, email, role..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {loadError && (
        <div role="alert" className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700 flex items-center justify-between">
          <span>Team accounts could not be loaded.</span>
          <button type="button" onClick={fetchUsers} className="font-semibold underline ml-2">Try again</button>
        </div>
      )}

      {/* Team Members Organizer Grid */}
      {filteredUsers.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-[#111111]/90 rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-xs">
          <Users className="w-10 h-10 text-slate-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700 dark:text-zinc-300">{t("teams.no_members")}</p>
          <p className="text-xs text-slate-400 mt-1">Try refining your search or add a new team member.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredUsers.map(u => {
            const badge = getRoleBadge(u.role);
            const initials = u.name
              ? u.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()
              : (u.email?.[0] || "U").toUpperCase();

            return (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => handleUserClick(u)}
                className="group bg-white dark:bg-[#111111]/90 rounded-2xl border border-slate-200/90 dark:border-white/10 p-4 shadow-xs hover:shadow-md hover:border-blue-500/40 dark:hover:border-blue-500/40 transition-all flex flex-col justify-between cursor-pointer"
              >
                <div>
                  {/* Card Header: Avatar, Name, Role Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                          {initials}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-950" title="Active Member" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {u.name || t("teams.unnamed")}
                        </h3>
                        <p className="text-xs text-slate-400 dark:text-zinc-400 truncate">
                          {formatRole(u.role)}
                        </p>
                      </div>
                    </div>

                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Contact Information */}
                  <div className="mt-3.5 space-y-1 text-xs text-slate-500 dark:text-zinc-400 border-t border-slate-100 dark:border-white/5 pt-2.5">
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <a href={`mailto:${u.email}`} className="truncate hover:text-blue-600 dark:hover:text-blue-400 transition" onClick={e => e.stopPropagation()}>
                        {u.email}
                      </a>
                    </div>
                    {u.phone && (
                      <div className="flex items-center gap-2 truncate">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <a href={`tel:${u.phone}`} className="truncate hover:text-blue-600 dark:hover:text-blue-400 transition" onClick={e => e.stopPropagation()}>
                          {u.phone}
                        </a>
                      </div>
                    )}
                    {u.expertise && (
                      <div className="flex items-center gap-2 truncate text-purple-600 dark:text-purple-400 font-medium">
                        <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{u.expertise}</span>
                      </div>
                    )}
                  </div>

                  {/* Live Numbers & Performance Summary Strip */}
                  <div className="mt-3 grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider block">Assigned</span>
                      <span className="text-xs font-black text-slate-800 dark:text-zinc-200 tabular-nums">
                        {u.stats?.total_assigned ?? 0}
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center border-x border-slate-200/60 dark:border-white/10">
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Won / Conv</span>
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {u.stats?.converted_count ?? 0}
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">Meetings</span>
                      <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                        {u.stats?.meetings_count ?? 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions: Send Message & Organizer Drawer */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => openMessageModal(u, e)}
                    className="flex-1 py-1.5 px-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-blue-200/60 dark:border-blue-500/20"
                    title="Send direct message to this member"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Send Message</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUserClick(u);
                    }}
                    className="flex-1 py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-200 dark:border-white/10"
                    title="View assigned handlings, performance & activity reports"
                  >
                    <BarChart2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>Reports</span>
                  </button>

                  {user?.role === "Admin" && user.id !== u.id && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeMember(u);
                      }}
                      className="p-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 transition border border-transparent hover:border-rose-200 dark:hover:border-rose-800"
                      title="Remove member (leads transferred fairly)"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Direct Send Message Modal */}
      <AnimatePresence>
        {messageRecipient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[110] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      Message {messageRecipient.name || "Colleague"}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                      {formatRole(messageRecipient.role)} • {messageRecipient.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setMessageRecipient(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {messageSentSuccess ? (
                <div className="py-4 space-y-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
                    <Check className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">Message Delivered!</h4>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                      Your message has been sent to {messageRecipient.name} and recorded in Team Messages.
                    </p>
                  </div>
                  <div className="pt-2 flex items-center justify-center gap-2">
                    <Link
                      href="/messages"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open in Team Messages</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setMessageRecipient(null)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 rounded-xl text-xs font-bold transition"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSendMessage} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      Message Content
                    </label>
                    <textarea
                      required
                      autoFocus
                      rows={4}
                      value={messageContent}
                      onChange={e => setMessageContent(e.target.value)}
                      placeholder={`Type your message or update for ${messageRecipient.name}...`}
                      className="w-full text-xs p-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>

                  {messageError && (
                    <div className="p-2 rounded-xl bg-rose-50 text-rose-700 text-xs border border-rose-200">
                      {messageError}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setMessageRecipient(null)}
                      className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSendingMessage || !messageContent.trim()}
                      className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                      {isSendingMessage ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Send Message</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-Over Team Organizer Drawer */}
      <AnimatePresence>
        {selectedUser && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUser(null)}
              className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-lg bg-white dark:bg-zinc-950 border-l border-slate-200 dark:border-zinc-800 shadow-2xl z-[100] flex flex-col overflow-y-auto"
            >
              {/* Drawer Sticky Top Header */}
              <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md z-10">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold text-sm shrink-0">
                    {selectedUser.name?.charAt(0) || selectedUser.email?.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">
                      {selectedUser.name || "Unnamed Member"}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        {formatRole(selectedUser.role)}
                      </span>
                      <span className="text-slate-300 dark:text-zinc-600">•</span>
                      <span className="text-[11px] text-slate-400 dark:text-zinc-500 truncate">
                        {selectedUser.email}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => openMessageModal(selectedUser, e)}
                    className="p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition"
                    title="Send Direct Message"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-slate-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Drawer Content */}
              <div className="p-4 flex-1">
                {loadingStats ? (
                  <div className="flex flex-col items-center justify-center h-48 space-y-2">
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    <p className="text-xs text-slate-500 dark:text-zinc-400">Loading organizer metrics and handlings...</p>
                  </div>
                ) : userStats ? (
                  <div className="space-y-4">
                    {/* Navigation Pills */}
                    <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-zinc-900 rounded-xl border border-slate-200/80 dark:border-zinc-800 text-xs font-bold overflow-x-auto">
                      <button
                        type="button"
                        onClick={() => setDrawerTab('overview')}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all whitespace-nowrap ${
                          drawerTab === 'overview'
                            ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrawerTab('assigned')}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all whitespace-nowrap ${
                          drawerTab === 'assigned'
                            ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Handlings ({userStats.assigned_persons?.length || userStats.total_assigned || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrawerTab('meetings')}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all whitespace-nowrap ${
                          drawerTab === 'meetings'
                            ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Schedule ({(userStats.user_meetings?.length || 0) + (userStats.user_followups?.length || 0)})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrawerTab('activity')}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all whitespace-nowrap ${
                          drawerTab === 'activity'
                            ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Activity ({userStats.recent_activities?.length || 0})
                      </button>
                    </div>

                    {/* OVERVIEW TAB */}
                    {drawerTab === 'overview' && (
                      <div className="space-y-4">
                        {/* Instructor Overview */}
                        {userStats.type === "instructor" ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2.5">
                              <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-xl p-3 border border-indigo-200/80 dark:border-indigo-800/40">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-1">
                                  Students Enrolled
                                </span>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                                  {userStats.total_assigned || 0}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Across assigned batches</p>
                              </div>
                              <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-3 border border-emerald-200/80 dark:border-emerald-800/40">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block mb-1">
                                  Avg Rating
                                </span>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                                  ★ {userStats.avg_rating || 5.0}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{userStats.batches_count || 0} Batches Assigned</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                              <div className="bg-slate-50 dark:bg-zinc-900 rounded-xl p-3 border border-slate-200 dark:border-zinc-800">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                                  Completed Classes
                                </span>
                                <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                                  {userStats.completed_count || 0}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Classes done</p>
                              </div>
                              <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl p-3 border border-blue-200 dark:border-blue-800/40">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block mb-1">
                                  Active / Scheduled
                                </span>
                                <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                                  {userStats.active_handling_count || 0}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Upcoming sessions</p>
                              </div>
                            </div>
                          </div>
                        ) : userStats.type === "dev" ? (
                          <div className="space-y-3">
                            <div className="bg-indigo-50 dark:bg-indigo-500/5 rounded-xl p-3 border border-indigo-200/80 dark:border-indigo-500/20 text-center">
                              <h4 className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-0.5">Total Assigned</h4>
                              <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{userStats.total_tickets || 0}</p>
                            </div>
                            <div className="grid grid-cols-1 gap-1.5">
                              <div className="flex items-center justify-between p-2.5 bg-white dark:bg-[#111111]/90 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-xs">
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                                  <PlayCircle className="w-4 h-4" />
                                  <span className="font-semibold text-xs">In Development</span>
                                </div>
                                <span className="font-bold text-xs text-slate-900 dark:text-white tabular-nums">{userStats.in_dev || 0}</span>
                              </div>
                              <div className="flex items-center justify-between p-2.5 bg-white dark:bg-[#111111]/90 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-xs">
                                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                                  <Ticket className="w-4 h-4" />
                                  <span className="font-semibold text-xs"><LocalizedText text={"Support Cases"} /></span>
                                </div>
                                <span className="font-bold text-xs text-slate-900 dark:text-white tabular-nums">{userStats.cases_assigned || 0}</span>
                              </div>
                              <div className="flex items-center justify-between p-2.5 bg-white dark:bg-[#111111]/90 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-xs">
                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                  <Layers className="w-4 h-4" />
                                  <span className="font-semibold text-xs">Given to QA</span>
                                </div>
                                <span className="font-bold text-xs text-slate-900 dark:text-white tabular-nums">{userStats.in_qa || 0}</span>
                              </div>
                              <div className="flex items-center justify-between p-2.5 bg-white dark:bg-[#111111]/90 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-xs">
                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle className="w-4 h-4" />
                                  <span className="font-semibold text-xs">Prod Release</span>
                                </div>
                                <span className="font-bold text-xs text-slate-900 dark:text-white tabular-nums">{userStats.in_prod || 0}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Sales / Admissions Overview */
                          <div className="space-y-3">
                            {/* Revenue Strip */}
                            <div className="grid grid-cols-2 gap-2.5">
                              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 rounded-xl p-3 border border-indigo-200/80 dark:border-indigo-800/40">
                                <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 mb-1">
                                  <TrendingUp className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-bold uppercase tracking-wider">Business Made</span>
                                </div>
                                <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                                  {curSym}{Number(userStats.total_business_made || 0).toLocaleString()}
                                </p>
                                <p className="text-[10px] text-slate-500 mt-0.5">Total pipeline won</p>
                              </div>

                              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 rounded-xl p-3 border border-emerald-200/80 dark:border-emerald-800/40">
                                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
                                  <DollarSign className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-bold uppercase tracking-wider">Advance Collected</span>
                                </div>
                                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                                  {curSym}{Number(userStats.advance_collected || 0).toLocaleString()}
                                </p>
                                <p className="text-[10px] text-emerald-600/80 mt-0.5">Cash / payments in</p>
                              </div>
                            </div>

                            {/* Handling & Pipeline Strip */}
                            <div className="grid grid-cols-4 gap-2">
                              <div className="bg-slate-50 dark:bg-zinc-900 rounded-xl p-2.5 border border-slate-200/80 dark:border-zinc-800 text-center">
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block truncate">
                                  LEADS
                                </span>
                                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                                  {userStats.leads_assigned || 0}
                                </p>
                                <span className="text-[9px] text-slate-400 block mt-0.5">Assigned</span>
                              </div>

                              <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl p-2.5 border border-blue-200/80 dark:border-blue-800/40 text-center">
                                <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 block truncate">
                                  CONTACTS
                                </span>
                                <p className="text-lg font-bold text-blue-700 dark:text-blue-300 tabular-nums mt-0.5">
                                  {userStats.contacts_count || 0}
                                </p>
                                <span className="text-[9px] text-blue-600/80 block mt-0.5">Owned</span>
                              </div>

                              <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-2.5 border border-amber-200/80 dark:border-amber-800/40 text-center">
                                <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 block truncate">
                                  HANDLING
                                </span>
                                <p className="text-lg font-bold text-amber-700 dark:text-amber-300 tabular-nums mt-0.5">
                                  {userStats.active_handling_count || 0}
                                </p>
                                <span className="text-[9px] text-amber-600/80 block mt-0.5">In Progress</span>
                              </div>

                              <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-2.5 border border-emerald-200/80 dark:border-emerald-800/40 text-center">
                                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block truncate">
                                  CONVERTED
                                </span>
                                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums mt-0.5">
                                  {userStats.leads_converted || 0}
                                </p>
                                <span className="text-[9px] text-emerald-600/80 block mt-0.5">
                                  {userStats.win_rate ? `${userStats.win_rate}% win` : 'Won'}
                                </span>
                              </div>
                            </div>

                            {/* Active Tasks */}
                            <div className="pt-2">
                              <h3 className="text-xs font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5 text-blue-500" />
                                <span>Active Tasks ({userStats.active_tasks?.length || 0})</span>
                              </h3>
                              {!!userStats.active_tasks?.length ? (
                                <div className="space-y-1.5">
                                  {userStats.active_tasks.map((t) => (
                                    <div key={t.id} className="p-2.5 rounded-xl bg-white dark:bg-[#111111]/90 border border-slate-200/90 dark:border-white/10 shadow-xs">
                                      <p className="font-semibold text-xs text-slate-900 dark:text-white">{t.title}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-400">
                                          {t.status}
                                        </span>
                                        <span className={`text-[10px] font-semibold ${
                                          t.priority === 'High' || t.priority === 'Urgent'
                                            ? 'text-rose-500'
                                            : 'text-blue-500'
                                        }`}>
                                          {t.priority} <LocalizedText text={"Priority"} />
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-3 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
                                  <p className="text-xs text-slate-400">No active tasks</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ASSIGNED PERSONS TAB */}
                    {drawerTab === 'assigned' && (
                      <div className="space-y-3">
                        {/* Sub-filter tabs */}
                        <div className="flex items-center gap-1 pb-1 overflow-x-auto text-[11px] font-bold">
                          <button
                            type="button"
                            onClick={() => setHandlingSubFilter('all')}
                            className={`px-2.5 py-1 rounded-lg transition ${
                              handlingSubFilter === 'all'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'
                            }`}
                          >
                            All ({userStats.assigned_persons?.length || 0})
                          </button>
                          <button
                            type="button"
                            onClick={() => setHandlingSubFilter('lead')}
                            className={`px-2.5 py-1 rounded-lg transition ${
                              handlingSubFilter === 'lead'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'
                            }`}
                          >
                            Leads ({userStats.assigned_persons?.filter(p => p.type === 'lead').length || 0})
                          </button>
                          <button
                            type="button"
                            onClick={() => setHandlingSubFilter('contact')}
                            className={`px-2.5 py-1 rounded-lg transition ${
                              handlingSubFilter === 'contact'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'
                            }`}
                          >
                            Contacts ({userStats.assigned_persons?.filter(p => p.type === 'contact').length || 0})
                          </button>
                          <button
                            type="button"
                            onClick={() => setHandlingSubFilter('client')}
                            className={`px-2.5 py-1 rounded-lg transition ${
                              handlingSubFilter === 'client'
                                ? 'bg-cyan-600 text-white'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'
                            }`}
                          >
                            Clients ({userStats.assigned_persons?.filter(p => p.type === 'client').length || 0})
                          </button>
                          {institute && (
                            <button
                              type="button"
                              onClick={() => setHandlingSubFilter('student')}
                              className={`px-2.5 py-1 rounded-lg transition ${
                                handlingSubFilter === 'student'
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'
                              }`}
                            >
                              Students ({userStats.assigned_persons?.filter(p => p.type === 'student').length || 0})
                            </button>
                          )}
                        </div>

                        {/* Persons list */}
                        {userStats.assigned_persons && userStats.assigned_persons.length > 0 ? (
                          <div className="space-y-2">
                            {userStats.assigned_persons
                              .filter(p => handlingSubFilter === 'all' || p.type === handlingSubFilter)
                              .map((person) => {
                                const targetUrl =
                                  person.type === 'student' ? `/students/${person.id}` :
                                  person.type === 'contact' ? `/contacts` :
                                  person.type === 'client' ? `/clients` :
                                  `/leads/${person.id}`;

                                const typeBg =
                                  person.type === 'student' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' :
                                  person.type === 'contact' ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300' :
                                  person.type === 'client' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300' :
                                  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';

                                return (
                                  <div
                                    key={`${person.type}-${person.id}`}
                                    className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors shadow-2xs"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${typeBg}`}>
                                            {person.type}
                                          </span>
                                          <Link
                                            href={targetUrl}
                                            className="font-bold text-xs text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate flex items-center gap-1"
                                          >
                                            <span>{person.name}</span>
                                            <ArrowUpRight className="w-3 h-3 shrink-0 text-slate-400" />
                                          </Link>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-zinc-400">
                                          {person.email && (
                                            <span className="flex items-center gap-1 truncate max-w-[180px]">
                                              <Mail className="w-3 h-3 text-slate-400" />
                                              {person.email}
                                            </span>
                                          )}
                                          {person.phone && (
                                            <span className="flex items-center gap-1">
                                              <Phone className="w-3 h-3 text-slate-400" />
                                              {person.phone}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                                          {person.status}
                                        </span>
                                        {person.deal_value ? (
                                          <p className="text-xs font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                                            {curSym}{Number(person.deal_value).toLocaleString()}
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        ) : (
                          <div className="p-8 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
                            <Users className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                            <p className="text-xs text-slate-500">No records currently assigned</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* MEETINGS & FOLLOW-UPS TAB */}
                    {drawerTab === 'meetings' && (
                      <div className="space-y-4">
                        {/* Meetings Section */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-violet-500" />
                              <span>Meetings ({userStats.user_meetings?.length || 0})</span>
                            </h3>
                            <Link href="/meetings" className="text-[11px] font-semibold text-blue-600 hover:underline">
                              All Meetings
                            </Link>
                          </div>
                          {userStats.user_meetings && userStats.user_meetings.length > 0 ? (
                            <div className="space-y-1.5">
                              {userStats.user_meetings.map((m) => (
                                <div key={m.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-bold text-xs text-slate-900 dark:text-white truncate">{m.title}</p>
                                    <p className="text-[11px] text-slate-400">
                                      {m.scheduled_at ? new Date(m.scheduled_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "Unscheduled"} • {m.client_name || m.lead_name || m.contact_name || m.meeting_type}
                                    </p>
                                  </div>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 border border-violet-500/20 shrink-0">
                                    {m.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-4 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-400">
                              No meetings scheduled
                            </div>
                          )}
                        </div>

                        {/* Follow-ups Section */}
                        <div className="pt-2">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                              <CalendarClock className="w-3.5 h-3.5 text-blue-500" />
                              <span>Follow-ups ({userStats.user_followups?.length || 0})</span>
                            </h3>
                            <Link href="/follow-ups" className="text-[11px] font-semibold text-blue-600 hover:underline">
                              All Follow-ups
                            </Link>
                          </div>
                          {userStats.user_followups && userStats.user_followups.length > 0 ? (
                            <div className="space-y-1.5">
                              {userStats.user_followups.map((f) => (
                                <div key={f.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-bold text-xs text-slate-900 dark:text-white truncate">{f.title}</p>
                                    <p className="text-[11px] text-slate-400">
                                      {f.due_at ? new Date(f.due_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "No due date"}
                                    </p>
                                  </div>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 shrink-0">
                                    {f.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-4 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-400">
                              No follow-ups assigned
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ACTIVITY TIMELINE TAB */}
                    {drawerTab === 'activity' && (
                      <div className="space-y-2">
                        {userStats.recent_activities && userStats.recent_activities.length > 0 ? (
                          <div className="relative pl-4 space-y-3 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-zinc-800">
                            {userStats.recent_activities.map((act) => (
                              <div key={act.id} className="relative">
                                <span className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-white dark:ring-zinc-950" />
                                <div className="p-2.5 bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200/70 dark:border-zinc-800">
                                  <p className="text-xs font-bold text-slate-900 dark:text-white">{act.action}</p>
                                  {act.details && (
                                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                                      {act.details}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                                    <Clock className="w-3 h-3" />
                                    <span>{new Date(act.createdAt).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-8 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
                            <Clock className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                            <p className="text-xs text-slate-500">No recent activity logged</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No data available.</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Member Modal */}
      {showCreateModal && (
        <ResponsiveDialog
          title={t("teams.modal_title")}
          description={t("teams.modal_subtitle")}
          onClose={() => { if (!isSubmitting) setShowCreateModal(false); }}
        >
          <form onSubmit={handleCreate} className="flex flex-col">
            <fieldset disabled={isSubmitting} className="team-member-fields grid min-w-0 gap-3 p-4 disabled:opacity-60 text-xs">
              <div>
                <label htmlFor="member-name" className="team-field-label font-medium text-slate-700 dark:text-zinc-300">{t("teams.field_name")}</label>
                <input
                  autoFocus
                  id="member-name"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t("teams.name_ph")}
                  className="team-field mt-1"
                />
              </div>
              <div>
                <label htmlFor="member-email" className="team-field-label font-medium text-slate-700 dark:text-zinc-300">{t("teams.field_email")}</label>
                <input
                  id="member-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t("teams.email_ph")}
                  className="team-field mt-1"
                />
              </div>
              <div>
                <label htmlFor="member-password" className="team-field-label font-medium text-slate-700 dark:text-zinc-300">{t("teams.field_password")}</label>
                <div className="relative mt-1">
                  <input
                    id="member-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="team-field pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="member-role" className="team-field-label font-medium text-slate-700 dark:text-zinc-300">{t("teams.field_role")}</label>
                <select
                  id="member-role"
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="team-field mt-1"
                >
                  <optgroup label="Management & Sales">
                    <option value="Admin"><LocalizedText text={"Admin"} /></option>
                    <option value="SalesManager">Salesperson</option>
                    <option value="Admissions">{t("topbar.role_admissions")}</option>
                  </optgroup>
                  <optgroup label="Faculty & Tech">
                    <option value="Instructor">Instructor / Faculty</option>
                    <option value="ProjectMember">{t("teams.opt_project_member")}</option>
                    <option value="Intern">{t("teams.opt_intern")}</option>
                  </optgroup>
                </select>
                <p className="mt-1 text-[11px] leading-snug text-slate-400 dark:text-zinc-500">
                  {role === "Admin"
                    ? "Administrators manage settings and team accounts."
                    : role === "SalesManager"
                    ? "Salespeople oversee leads, contacts, and sales activity."
                    : role === "Admissions"
                    ? "Admissions team members manage assigned students, enrollments and payments."
                    : role === "Instructor"
                    ? "Instructors manage classes, batches and student progress."
                    : "Team members work on assigned projects and tasks."}
                </p>
              </div>
              {createError && (
                <div role="alert" className="col-span-full rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                  {createError}
                </div>
              )}
            </fieldset>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 disabled:opacity-50 dark:border-zinc-700"
              >
                {t("teams.cancel")}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                <span>{isSubmitting ? "Creating account..." : t("teams.add_member_btn")}</span>
              </button>
            </div>
          </form>
        </ResponsiveDialog>
      )}

      <PageGuide
        pageKey="teams-directory"
        title="Team Directory & Organizer Guide"
        description="Manage your sales team, admissions, instructors, and staff from a unified executive organizer."
        steps={[
          { icon: <Users className="w-5 h-5 text-blue-500" />, text: "Browse all members, filter by department, or search by name and email." },
          { icon: <MessageSquare className="w-5 h-5 text-blue-500" />, text: "Click 'Send Message' on any member to send direct messages saved directly to Team Chat (/messages)." },
          { icon: <BarChart2 className="w-5 h-5 text-blue-500" />, text: "Click 'Organizer' to open the slide-over drawer to inspect assigned leads, contacts, clients, activity audit logs, and scheduled meetings." }
        ]}
      />
    </div>
  );
}
