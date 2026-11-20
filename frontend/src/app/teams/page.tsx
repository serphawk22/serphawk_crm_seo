"use client";
import LocalizedText from "@/components/LocalizedText";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, X, Loader2, Briefcase, GraduationCap, Target,
  Ticket, CheckCircle, PlayCircle, Layers, Activity, Search,
  Eye, EyeOff, Shield, Archive, Clock, DollarSign, Calendar,
  ArrowUpRight, Phone, Mail, Award, TrendingUp, UserCheck
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import ResponsiveDialog from "@/components/ResponsiveDialog";
import PageGuide from "@/components/PageGuide";
import { useLanguage } from "@/context/LanguageContext";
import { useTenantConfig } from "@/context/TenantConfigContext";
import InstitutePeople from "@/components/InstitutePeople";
import { useRole } from "@/context/RoleContext";

interface TeamMember { id: number; name: string; email: string; role: string; }

interface AssignedPersonItem {
  id: number;
  name: string;
  type: 'lead' | 'student';
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
  students_assigned?: number;
  active_handling_count?: number;
  leads_converted?: number;
  clients_handling?: number;
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
  const [showPassword, setShowPassword] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("SalesManager");

  const [selectedUser, setSelectedUser] = useState<TeamMember | null>(null);
  const [userStats, setUserStats] = useState<MemberStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'assigned' | 'activity'>('overview');

  const handleUserClick = async (u: TeamMember) => {
    setSelectedUser(u);
    setUserStats(null);
    setDrawerTab('overview');
    setLoadingStats(true);
    try {
      const res = await fetch(`${API_BASE_URL}/users/${u.id}/stats`);
      if (res.ok) {
        setUserStats(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
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

  const filteredUsers = users.filter(u =>
    [u.name, u.email, u.role].some(value => value?.toLowerCase().includes(query.trim().toLowerCase()))
  );
  const salesTeam = filteredUsers.filter(u => ['Admin', 'SalesManager', 'Sales', 'Employee'].includes(u.role));
  const devTeam = filteredUsers.filter(u => ['ProjectMember', 'Intern'].includes(u.role));
  const admissionsTeam = users.filter(u => u.role === 'Admissions');

  const removeMember = async (member: { id: number; name: string }) => {
    if (!window.confirm(`Remove ${member.name || 'this team member'}? All their assigned leads will be automatically transferred fairly among remaining active salespersons, and their record will be saved in Deleted Records.`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/users/${member.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not remove member");
      window.alert(data.message || "Team member removed. Leads transferred fairly.");
      setSelectedUser(null);
      await fetchUsers();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not remove member");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none">{t("teams.title")}</h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {users.length} members
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{t("teams.subtitle")}</p>
          </div>
        </div>

          <div className="flex items-center gap-2">
            <Link
              href="/deleted-records?record_type=salesperson"
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 rounded-lg font-semibold text-xs transition border border-slate-200 dark:border-white/10 shrink-0"
            >
              <Archive className="w-3.5 h-3.5 text-amber-500" />
              <span>Deleted Records</span>
            </Link>
            <button
              onClick={() => { setCreateError(null); setShowCreateModal(true); }}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs transition shadow-xs shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t("teams.add_member")}</span>
            </button>
          </div>
      </div>

      {/* 4-KPI Metric Strip (When not institute) */}
      {!institute && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
          <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Total Members</p>
              <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight mt-0.5">{users.length}</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Sales & Mgmt</p>
              <p className="text-base sm:text-lg font-bold text-indigo-600 dark:text-indigo-400 leading-tight mt-0.5">{salesTeam.length}</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Briefcase className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Delivery Team</p>
              <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5">{devTeam.length}</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <GraduationCap className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="bg-white dark:bg-[#111111]/90 rounded-xl p-2.5 sm:px-3 border border-slate-200/90 dark:border-white/10 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Admins</p>
              <p className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400 leading-tight mt-0.5">{users.filter(u => u.role === 'Admin').length}</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Shield className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      )}

      {/* Search Toolbar */}
      {!institute && (
        <div className="bg-white dark:bg-[#111111]/90 p-2 sm:px-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
            <input
              aria-label="Search team members"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, email, or role..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {loadError && (
        <div role="alert" className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700 flex items-center justify-between">
          <span>Team accounts could not be loaded.</span>
          <button type="button" onClick={fetchUsers} className="font-semibold underline ml-2">Try again</button>
        </div>
      )}

      {institute ? (
        <>
          <InstitutePeople
            key={users.length}
            onPersonClick={(p: any) =>
              handleUserClick({
                id: p.id || p.user_id,
                name: p.name,
                email: p.email || '',
                role: p.role || (p.expertise ? 'Instructor' : 'SalesManager'),
              })
            }
          />
          <section aria-labelledby="admissions-team-heading" className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="admissions-team-heading" className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <GraduationCap className="h-4 w-4 text-emerald-600" />
                  <LocalizedText text="Admissions team" />
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                  <LocalizedText text="Team members receive converted students and manage enrollment payments." />
                </p>
              </div>
              <span className="text-xs text-slate-500 dark:text-zinc-400">{admissionsTeam.length} {t("teams.members")}</span>
            </div>
            {admissionsTeam.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
                <LocalizedText text="Add an Admissions team member to start assigning converted students." />
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {admissionsTeam.map(member => (
                  <div
                    key={member.id}
                    onClick={() => handleUserClick(member)}
                    className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#111111]/90 cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-md transition-all"
                  >
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{member.name || t("teams.unnamed")}</p>
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-zinc-400">{member.email}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-emerald-700 dark:text-emerald-400">{t("topbar.role_admissions")}</span>
                      {user?.role === "Admin" && user.id !== member.id && (
                        <button
                          type="button"
                          className="text-xs text-rose-500 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeMember(member);
                          }}
                        >
                          <LocalizedText text="Remove" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="space-y-4">
          {/* Sales & Management Team */}
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                  <Briefcase className="w-3.5 h-3.5" />
                </span>
                <h3 className="font-bold text-xs text-slate-900 dark:text-white">{t("teams.sales_mgmt_team")}</h3>
              </div>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full border border-slate-200/60 dark:border-white/10">
                {salesTeam.length} {t("teams.members")}
              </span>
            </div>

            {salesTeam.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10">
                <Users className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 dark:text-zinc-400">{t("teams.no_members")}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {salesTeam.map(u => (
                  <div
                    key={u.id}
                    className="group relative flex items-center justify-between gap-3 p-2.5 sm:px-4 sm:py-2 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 hover:border-indigo-500/60 dark:hover:border-indigo-500/50 hover:shadow-xs transition-all duration-150 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        handleUserClick(u);
                      }
                    }}
                    onClick={() => handleUserClick(u)}
                  >
                    <div className="flex min-w-0 items-center gap-2.5 flex-1">
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                        {u.name?.charAt(0) || u.email?.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs text-slate-900 dark:text-white truncate">{u.name || t("teams.unnamed")}</p>
                        <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {user?.id !== u.id && (
                        <button
                          type="button"
                          className="text-[11px] text-rose-500 hover:underline mr-1"
                          onClick={event => {
                            event.stopPropagation();
                            removeMember(u);
                          }}
                        >
                          <LocalizedText text={"Remove"} /> </button>
                      )}
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-300 border border-slate-200/80 dark:border-white/10 rounded-full">
                        {u.role}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Dev / Delivery Team */}
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                  <GraduationCap className="w-3.5 h-3.5" />
                </span>
                <h3 className="font-bold text-xs text-slate-900 dark:text-white">{t("teams.dev_team")}</h3>
              </div>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full border border-slate-200/60 dark:border-white/10">
                {devTeam.length} {t("teams.members")}
              </span>
            </div>

            {devTeam.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10">
                <Users className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 dark:text-zinc-400">{t("teams.no_members")}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {devTeam.map(u => (
                  <div
                    key={u.id}
                    className="group relative flex items-center justify-between gap-3 p-2.5 sm:px-4 sm:py-2 bg-white dark:bg-[#111111]/90 rounded-xl border border-slate-200/90 dark:border-white/10 hover:border-emerald-500/60 dark:hover:border-emerald-500/50 hover:shadow-xs transition-all duration-150 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        handleUserClick(u);
                      }
                    }}
                    onClick={() => handleUserClick(u)}
                  >
                    <div className="flex min-w-0 items-center gap-2.5 flex-1">
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                        {u.name?.charAt(0) || u.email?.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs text-slate-900 dark:text-white truncate">{u.name || t("teams.unnamed")}</p>
                        <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {user?.id !== u.id && (
                        <button
                          type="button"
                          className="text-[11px] text-rose-500 hover:underline mr-1"
                          onClick={event => {
                            event.stopPropagation();
                            removeMember(u);
                          }}
                        >
                          <LocalizedText text={"Remove"} /> </button>
                      )}
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-300 border border-slate-200/80 dark:border-white/10 rounded-full">
                        {u.role}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

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
                  <optgroup label={t("teams.optgroup_sales")}>
                    <option value="Admin"><LocalizedText text={"Admin"} /></option>
                    <option value="SalesManager">{t("teams.opt_sales_manager")}</option>
                    {institute && <option value="Admissions">{t("topbar.role_admissions")}</option>}
                  </optgroup>
                  {!institute && (
                    <optgroup label={t("teams.optgroup_dev")}>
                      <option value="ProjectMember">{t("teams.opt_project_member")}</option>
                      <option value="Intern">{t("teams.opt_intern")}</option>
                    </optgroup>
                  )}
                </select>
                <p className="mt-1 text-[11px] leading-snug text-slate-400 dark:text-zinc-500">
                  {role === "Admin"
                    ? "Administrators manage settings and team accounts."
                    : role === "SalesManager"
                    ? "Sales managers oversee leads and sales activity."
                    : role === "Admissions"
                    ? <LocalizedText text="Admissions team members manage assigned students, enrollments and payments." />
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

      {/* User Stats Drawer */}
      <AnimatePresence>
        {selectedUser && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUser(null)}
              className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-zinc-950 border-l border-slate-200 dark:border-zinc-800 shadow-2xl z-[100] flex flex-col overflow-y-auto"
            >
              <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md z-10">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                    {selectedUser.name?.charAt(0) || selectedUser.email?.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-none truncate max-w-[220px]">
                      {selectedUser.name || "Unnamed Member"}
                    </h2>
                    <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
                      {selectedUser.role}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 flex-1">
                {user?.id !== selectedUser.id && (
                  <button
                    type="button"
                    onClick={() => removeMember(selectedUser)}
                    className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs text-rose-600 font-medium hover:bg-rose-100 transition"
                  >
                    Remove member
                  </button>
                )}

                {loadingStats ? (
                  <div className="flex flex-col items-center justify-center h-48 space-y-2">
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    <p className="text-xs text-slate-500 dark:text-zinc-400">Loading performance stats...</p>
                  </div>
                ) : userStats ? (
                  <div className="space-y-4">
                    {/* Navigation Pills */}
                    <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-zinc-900 rounded-xl border border-slate-200/80 dark:border-zinc-800 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setDrawerTab('overview')}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all ${
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
                        className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all ${
                          drawerTab === 'assigned'
                            ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Assigned ({userStats.assigned_persons?.length || userStats.total_assigned || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrawerTab('activity')}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all ${
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
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-slate-50 dark:bg-zinc-900 rounded-xl p-2.5 border border-slate-200/80 dark:border-zinc-800 text-center">
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block truncate">
                                  ASSIGNED
                                </span>
                                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                                  {userStats.total_assigned ?? (userStats.leads_assigned || 0)}
                                </p>
                                <span className="text-[9px] text-slate-400 block mt-0.5">Persons</span>
                              </div>

                              <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-2.5 border border-amber-200/80 dark:border-amber-800/40 text-center">
                                <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 block truncate">
                                  DOING / IN PROGRESS
                                </span>
                                <p className="text-lg font-bold text-amber-700 dark:text-amber-300 tabular-nums mt-0.5">
                                  {userStats.active_handling_count || 0}
                                </p>
                                <span className="text-[9px] text-amber-600/80 block mt-0.5">Handling now</span>
                              </div>

                              <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-2.5 border border-emerald-200/80 dark:border-emerald-800/40 text-center">
                                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block truncate">
                                  CONVERTED
                                </span>
                                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums mt-0.5">
                                  {userStats.leads_converted || 0}
                                </p>
                                <span className="text-[9px] text-emerald-600/80 block mt-0.5">
                                  {userStats.win_rate ? `${userStats.win_rate}% win` : 'Enrolled'}
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
                      <div className="space-y-2">
                        {userStats.assigned_persons && userStats.assigned_persons.length > 0 ? (
                          userStats.assigned_persons.map((person) => (
                            <div
                              key={`${person.type}-${person.id}`}
                              className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors shadow-2xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                                      person.type === 'student'
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                        : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                                    }`}>
                                      {person.type}
                                    </span>
                                    <Link
                                      href={person.type === 'student' ? `/students/${person.id}` : `/leads/${person.id}`}
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
                          ))
                        ) : (
                          <div className="p-8 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
                            <Users className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                            <p className="text-xs text-slate-500">No persons currently assigned</p>
                          </div>
                        )}
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

      <PageGuide
        pageKey="teams-directory"
        title={t("teams.guide_title")}
        description={t("teams.guide_desc")}
        steps={[
          { icon: <Users className="w-5 h-5 text-blue-500" />, text: t("teams.guide_s1") },
          { icon: <Plus className="w-5 h-5 text-blue-500" />, text: t("teams.guide_s2") }
        ]}
      />
    </div>
  );
}
