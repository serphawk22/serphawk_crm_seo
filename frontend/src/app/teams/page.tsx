"use client";

import { useState, useEffect } from "react";
import { Users, Plus, Check, X, Shield, Mail, Phone, Loader2, Briefcase, GraduationCap } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { cn } from "@/lib/utils";
import PageGuide from "@/components/PageGuide";
import { useLanguage } from "@/context/LanguageContext";

export default function TeamsPage() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Employee");

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error("Error fetching users:", error);
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
        body: JSON.stringify({ name, email, password, role }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        fetchUsers();
        setName("");
        setEmail("");
        setPassword("");
        setRole("Employee");
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

  const salesTeam = users.filter(u => ['Admin', 'SalesManager', 'Employee'].includes(u.role));
  const devTeam = users.filter(u => ['ProjectMember', 'Intern'].includes(u.role));

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-zinc-50 tracking-tight">{t("teams.title")}</h1>
          <p className="text-gray-500 dark:text-zinc-400 font-medium">{t("teams.subtitle")}</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" /> {t("teams.add_member")}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-gray-50/50 dark:bg-zinc-950/50">
            <h3 className="font-bold text-lg text-gray-900 dark:text-zinc-50 flex items-center gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-500/10 rounded-xl">
                <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/>
              </div>
              {t("teams.sales_mgmt_team")}
            </h3>
            <span className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-zinc-800 px-3 py-1 rounded-full">{salesTeam.length} {t("teams.members")}</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-zinc-800 flex-1">
            {salesTeam.map(u => (
              <div key={u.id} className="p-5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-zinc-950/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-lg">
                    {u.name?.charAt(0) || u.email?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-black text-gray-900 dark:text-zinc-50">{u.name || t("teams.unnamed")}</p>
                    <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mt-0.5">{u.email}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 rounded-lg">
                    {u.role}
                  </span>
                </div>
              </div>
            ))}
            {salesTeam.length === 0 && (
              <div className="p-10 text-center flex flex-col items-center">
                <Users className="w-10 h-10 text-gray-300 dark:text-zinc-700 mb-3" />
                <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">{t("teams.no_members")}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-gray-50/50 dark:bg-zinc-950/50">
            <h3 className="font-bold text-lg text-gray-900 dark:text-zinc-50 flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl">
                <GraduationCap className="w-5 h-5 text-emerald-600 dark:text-emerald-400"/>
              </div>
              {t("teams.dev_team")}
            </h3>
            <span className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-zinc-800 px-3 py-1 rounded-full">{devTeam.length} {t("teams.members")}</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-zinc-800 flex-1">
            {devTeam.map(u => (
              <div key={u.id} className="p-5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-zinc-950/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-lg">
                    {u.name?.charAt(0) || u.email?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-black text-gray-900 dark:text-zinc-50">{u.name || t("teams.unnamed")}</p>
                    <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mt-0.5">{u.email}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 rounded-lg">
                    {u.role}
                  </span>
                </div>
              </div>
            ))}
            {devTeam.length === 0 && (
              <div className="p-10 text-center flex flex-col items-center">
                <Users className="w-10 h-10 text-gray-300 dark:text-zinc-700 mb-3" />
                <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">{t("teams.no_members")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-gray-50 dark:bg-zinc-950/50">
              <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-zinc-50 tracking-tight">{t("teams.modal_title")}</h2>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t("teams.modal_subtitle")}</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-3 hover:bg-white dark:bg-zinc-900 rounded-2xl transition-all shadow-sm">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t("teams.field_name")}</label>
                <input 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("teams.name_ph")} 
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-zinc-950 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t("teams.field_email")}</label>
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("teams.email_ph")} 
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-zinc-950 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t("teams.field_password")}</label>
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("teams.password_ph")} 
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-zinc-950 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t("teams.field_role")}</label>
                <select 
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-zinc-950 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none appearance-none"
                >
                  <optgroup label={t("teams.optgroup_sales")}>
                    <option value="Admin">Admin</option>
                    <option value="SalesManager">{t("teams.opt_sales_manager")}</option>
                    <option value="Employee">{t("teams.opt_sales_rep")}</option>
                  </optgroup>
                  <optgroup label={t("teams.optgroup_dev")}>
                    <option value="ProjectMember">{t("teams.opt_project_member")}</option>
                    <option value="Intern">{t("teams.opt_intern")}</option>
                  </optgroup>
                </select>
              </div>

              {createError && (
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold rounded-2xl px-4 py-3">
                  {createError}
                </div>
              )}

              <div className="pt-4 flex gap-4">
                <button 
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-6 py-4 bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 rounded-2xl font-bold text-sm hover:bg-gray-200 transition-all"
                >
                  {t("teams.cancel")}
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {t("teams.add_member_btn")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
