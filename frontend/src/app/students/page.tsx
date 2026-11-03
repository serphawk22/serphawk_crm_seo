"use client";
import LocalizedText from "@/components/LocalizedText";
import React, { useState, useEffect, useMemo } from "react";
import { API_BASE_URL } from "@/config";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, Plus, Search, Phone, Mail, X, Loader2, Edit2, Trash2, Eye,
  ChevronRight, Filter, UserCheck, UserX, Layers, Check, LayoutGrid, List,
  ArrowUpRight, User, Users
} from "lucide-react";
import Link from "next/link";
import CreateInstituteLoginButton from "@/components/CreateInstituteLoginButton";
import { useRole } from "@/context/RoleContext";

interface Student {
  id: number;
  user_id?: number | null;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  gender?: string;
  qualification?: string;
  course_interest?: string;
  education_level?: string;
  gpa?: number | null;
  academic_background?: string;
  career_goal?: string;
  guardian_name?: string;
  guardian_phone?: string;
  assigned_salesperson_id?: number | null;
  source?: string;
  status: string;
  enrollment_count: number;
  active_course?: string;
  active_batch?: string;
  active_course_id?: number | null;
  active_batch_id?: number | null;
  created_at: string;
}

interface Salesperson {
  id: number;
  name: string;
  role: string;
}

const SOURCES = ["Walk-in", "Referral", "Online", "Lead", "Social Media", "Phone Call", "Other"];
const STATUSES = ["Active", "Inactive", "Dropped", "Completed"];

const STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  Active: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    dot: "bg-emerald-500",
  },
  Inactive: {
    badge: "bg-slate-100 text-slate-700 border-slate-200/80 dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700",
    dot: "bg-slate-400",
  },
  Dropped: {
    badge: "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    dot: "bg-rose-500",
  },
  Completed: {
    badge: "bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
    dot: "bg-blue-500",
  },
};

export default function StudentsPage() {
  const { role } = useRole();
  const canManageStudents = ["Admin", "Employee", "Demo", "SuperAdmin"].includes(role);
  const canCreateLogin = ["Admin", "SuperAdmin"].includes(role);

  const [students, setStudents] = useState<Student[]>([]);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [showModal, setShowModal] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    gender: "",
    qualification: "",
    course_interest: "",
    education_level: "",
    gpa: "",
    academic_background: "",
    career_goal: "",
    guardian_name: "",
    guardian_phone: "",
    assigned_salesperson_id: "",
    source: "Walk-in",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");

  const fetch_ = async () => {
    setLoading(true);
    setPageError("");
    try {
      const res = await fetch(`${API_BASE_URL}/students`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not load students.");
      setStudents(Array.isArray(data.students) ? data.students : []);
      fetch(`${API_BASE_URL}/users?role=SalesManager,Employee`)
        .then(async (response) => {
          if (!response.ok) return;
          const usersData = await response.json();
          setSalespeople(Array.isArray(usersData.users) ? usersData.users : []);
        })
        .catch(() => setSalespeople([]));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not load students.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch_();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((s) => {
      const matchSearch =
        !query ||
        s.name.toLowerCase().includes(query) ||
        (s.email || "").toLowerCase().includes(query) ||
        (s.phone || "").toLowerCase().includes(query) ||
        (s.active_course || "").toLowerCase().includes(query) ||
        (s.active_batch || "").toLowerCase().includes(query) ||
        (s.course_interest || "").toLowerCase().includes(query);
      const matchStatus = filterStatus === "All" || s.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [students, search, filterStatus]);

  const openCreate = () => {
    setEditStudent(null);
    setFormError("");
    setForm({
      name: "",
      email: "",
      phone: "",
      address: "",
      gender: "",
      qualification: "",
      course_interest: "",
      education_level: "",
      gpa: "",
      academic_background: "",
      career_goal: "",
      guardian_name: "",
      guardian_phone: "",
      assigned_salesperson_id: "",
      source: "Walk-in",
      notes: "",
    });
    setShowModal(true);
  };

  const openEdit = (s: Student) => {
    setEditStudent(s);
    setFormError("");
    setForm({
      name: s.name,
      email: s.email || "",
      phone: s.phone || "",
      address: s.address || "",
      gender: s.gender || "",
      qualification: s.qualification || "",
      course_interest: s.course_interest || "",
      education_level: s.education_level || "",
      gpa: s.gpa == null ? "" : String(s.gpa),
      academic_background: s.academic_background || "",
      career_goal: s.career_goal || "",
      guardian_name: s.guardian_name || "",
      guardian_phone: s.guardian_phone || "",
      assigned_salesperson_id: s.assigned_salesperson_id == null ? "" : String(s.assigned_salesperson_id),
      source: s.source || "Walk-in",
      notes: "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("Enter the student's name.");
      return;
    }
    if (form.gpa && (!Number.isFinite(Number(form.gpa)) || Number(form.gpa) < 0 || Number(form.gpa) > 10)) {
      setFormError("GPA must be between 0 and 10.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const url = editStudent ? `${API_BASE_URL}/students/${editStudent.id}` : `${API_BASE_URL}/students`;
      const response = await fetch(url, {
        method: editStudent ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          gpa: form.gpa ? Number(form.gpa) : null,
          assigned_salesperson_id:
            form.assigned_salesperson_id && form.assigned_salesperson_id !== "auto"
              ? Number(form.assigned_salesperson_id)
              : null,
          auto_assign_salesperson: form.assigned_salesperson_id === "auto",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(data.detail) ? data.detail.map((item: any) => item.msg).join("; ") : data.detail;
        throw new Error(detail || "Could not save student.");
      }
      setShowModal(false);
      fetch_();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save student.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this student?")) return;
    try {
      const response = await fetch(`${API_BASE_URL}/students/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not delete student.");
      fetch_();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not delete student.");
    }
  };

  const total = students.length;
  const active = students.filter((s) => s.status === "Active").length;
  const completed = students.filter((s) => s.status === "Completed").length;
  const dropped = students.filter((s) => s.status === "Dropped").length;

  return (
    <div className="space-y-4">
      {/* Executive Compact Header */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm shrink-0">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                <LocalizedText text={"Students"} /></h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-300 border border-slate-200/80 dark:border-white/5">
                {total} <LocalizedText text={"total"} /> </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              <LocalizedText text={"Manage all enrolled and prospective institute students"} /></p>
          </div>
        </div>

        {canManageStudents && (
          <button
            onClick={openCreate}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm shadow-emerald-500/20 transition-all hover:opacity-95"
          >
            <Plus className="w-4 h-4" /> <LocalizedText text={"Add Student"} /></button>
        )}
      </div>

      {/* High-density Compact Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          {
            label: "Total Students",
            value: total,
            color: "text-emerald-600 dark:text-emerald-400",
            bg: "bg-emerald-50 dark:bg-emerald-500/10",
            border: "border-emerald-200/60 dark:border-emerald-500/20",
            icon: Users,
          },
          {
            label: "Active Enrolled",
            value: active,
            color: "text-green-600 dark:text-green-400",
            bg: "bg-green-50 dark:bg-green-500/10",
            border: "border-green-200/60 dark:border-green-500/20",
            icon: UserCheck,
          },
          {
            label: "Completed",
            value: completed,
            color: "text-blue-600 dark:text-blue-400",
            bg: "bg-blue-50 dark:bg-blue-500/10",
            border: "border-blue-200/60 dark:border-blue-500/20",
            icon: GraduationCap,
          },
          {
            label: "Dropped / Inactive",
            value: dropped,
            color: "text-rose-600 dark:text-rose-400",
            bg: "bg-rose-50 dark:bg-rose-500/10",
            border: "border-rose-200/60 dark:border-rose-500/20",
            icon: UserX,
          },
        ].map((item, idx) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            className="rounded-xl border border-slate-200/90 dark:border-white/10 bg-white/90 dark:bg-[#111111]/90 p-2.5 sm:px-3.5 sm:py-2.5 flex items-center justify-between shadow-xs hover:border-slate-300 dark:hover:border-white/20 transition-all"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-8 h-8 rounded-lg ${item.bg} ${item.border} border flex items-center justify-center shrink-0`}>
                <item.icon className={`w-4 h-4 ${item.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 truncate">{item.label}</p>
                <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none mt-0.5">{item.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Streamlined Search, Status Filter & View Switcher Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students by name, email, phone, course..."
            className="w-full h-9 pl-9 pr-8 text-xs sm:text-sm rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/80 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5 sm:pb-0">
          <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/5 p-0.5 rounded-lg border border-slate-200/60 dark:border-white/5">
            {[
              { id: "All", count: total },
              { id: "Active", count: active },
              { id: "Inactive", count: students.filter((s) => s.status === "Inactive").length },
              { id: "Completed", count: completed },
              { id: "Dropped", count: dropped },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  filterStatus === tab.id
                    ? "bg-white dark:bg-[#1f1f1f] text-emerald-700 dark:text-emerald-400 shadow-xs font-semibold"
                    : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <span>{tab.id}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    filterStatus === tab.id
                      ? "bg-emerald-100/70 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-zinc-400"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-white/10 pl-2">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List Card View"
              className={`p-1.5 rounded-lg border transition-all ${
                viewMode === "list"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40"
                  : "border-slate-200/80 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-[#111111]"
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Grid Card View"
              className={`p-1.5 rounded-lg border transition-all ${
                viewMode === "grid"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40"
                  : "border-slate-200/80 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-[#111111]"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {pageError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs sm:text-sm text-red-600 dark:text-red-300">
          {pageError}
        </div>
      )}

      {/* Main Student Card List / Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-52">
          <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-2">
          {/* Subtle column headers for alignment */}
          <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
            <div className="col-span-3"><LocalizedText text={"Student"} /></div>
            <div className="col-span-2"><LocalizedText text={"Contact"} /></div>
            <div className="col-span-3"><LocalizedText text={"Course / Batch"} /></div>
            <div className="col-span-2"><LocalizedText text={"Enrollment & Status"} /></div>
            <div className="col-span-2 text-right"><LocalizedText text={"Actions"} /></div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/10 p-12 text-center text-slate-500 dark:text-zinc-500 bg-white/40 dark:bg-white/[0.02]">
              <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-30 text-emerald-500" />
              <p className="font-medium text-sm"><LocalizedText text={"No students found matching your criteria"} /></p>
              <p className="text-xs text-slate-400 mt-1"><LocalizedText text={"Try adjusting your search query or filter"} /></p>
            </div>
          ) : (
            filtered.map((s, i) => {
              const salespersonName = salespeople.find((person) => person.id === s.assigned_salesperson_id)?.name;
              const statusCfg = STATUS_STYLES[s.status] || STATUS_STYLES.Active;

              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.25) }}
                  className="group rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-2.5 shadow-xs hover:border-emerald-500/60 dark:hover:border-emerald-500/50 hover:shadow-md transition-all duration-150"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
                    {/* Student Identity */}
                    <div className="col-span-1 sm:col-span-2 lg:col-span-3 min-w-0 flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs">
                        {s.name[0]?.toUpperCase() || "S"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/students/${s.id}`}
                          className="font-semibold text-sm text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate flex items-center gap-1"
                          title={s.name}
                        >
                          <span className="truncate">{s.name}</span>
                          <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-500 shrink-0" />
                        </Link>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] truncate">
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-200/60 dark:border-emerald-800/40 truncate max-w-[120px]">
                            <UserCheck className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{salespersonName || "Unassigned"}</span>
                          </span>
                          <span className="text-slate-400 dark:text-zinc-500 truncate" title={s.course_interest || s.source || ""}>
                            {s.course_interest || s.source || "Direct"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="col-span-1 lg:col-span-2 min-w-0">
                      {s.email ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-300 truncate" title={s.email}>
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <a href={`mailto:${s.email}`} className="truncate hover:text-emerald-600 hover:underline">
                            {s.email}
                          </a>
                        </div>
                      ) : null}
                      {s.phone ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 truncate mt-0.5" title={s.phone}>
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <a href={`tel:${s.phone}`} className="truncate hover:text-emerald-600">
                            {s.phone}
                          </a>
                        </div>
                      ) : null}
                      {!s.email && !s.phone && (
                        <span className="text-xs text-slate-400 italic"><LocalizedText text={"No contact details"} /></span>
                      )}
                    </div>

                    {/* Course / Batch */}
                    <div className="col-span-1 lg:col-span-3 min-w-0">
                      {s.active_course ? (
                        <div>
                          <Link
                            href={`/courses/${s.active_course_id}`}
                            className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 truncate block"
                            title={s.active_course}
                          >
                            {s.active_course}
                          </Link>
                          <div className="flex items-center gap-1 mt-0.5">
                            {s.active_batch_id ? (
                              <Link
                                href={`/batches/${s.active_batch_id}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-zinc-300 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 px-2 py-0.5 rounded border border-slate-200/60 dark:border-white/5 truncate max-w-[170px] transition-colors"
                                title={s.active_batch || ""}
                              >
                                <Layers className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                                <span className="truncate">{s.active_batch || "Active batch"}</span>
                              </Link>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded border border-slate-200/60 dark:border-white/5 truncate max-w-[170px]">
                                <Layers className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                <span className="truncate">{s.active_batch || "—"}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-zinc-500 italic"><LocalizedText text={"Not enrolled"} /></span>
                      )}
                    </div>

                    {/* Enrollment Count & Status */}
                    <div className="col-span-1 lg:col-span-2 flex items-center gap-2">
                      <span
                        title={`${s.enrollment_count} Active Enrollment(s)`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-200/60 dark:border-violet-700/30 whitespace-nowrap shadow-xs shrink-0"
                      >
                        <GraduationCap className="w-3 h-3" />
                        <span>{s.enrollment_count}</span>
                      </span>
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap shadow-xs ${statusCfg.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                        {s.status}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 sm:col-span-2 lg:col-span-2 flex items-center justify-end gap-1.5 shrink-0">
                      <Link
                        href={`/students/${s.id}`}
                        title="View Student Profile"
                        className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300 text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Link>

                      {canCreateLogin && (
                        <div className="shrink-0">
                          <CreateInstituteLoginButton
                            profileId={s.id}
                            profileKind="students"
                            hasAccount={Boolean(s.user_id)}
                            hasEmail={Boolean(s.email)}
                            onCreated={fetch_}
                          />
                        </div>
                      )}

                      {canManageStudents && (
                        <>
                          <button
                            onClick={() => openEdit(s)}
                            aria-label={`Edit ${s.name}`}
                            title={`Edit ${s.name}`}
                            className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            aria-label={`Delete ${s.name}`}
                            title={`Delete ${s.name}`}
                            className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 dark:hover:bg-rose-500/20 dark:hover:text-rose-400 text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      ) : (
        /* Grid Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-slate-200 dark:border-white/10 p-12 text-center text-slate-500 dark:text-zinc-500 bg-white/40 dark:bg-white/[0.02]">
              <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-30 text-emerald-500" />
              <p className="font-medium text-sm"><LocalizedText text={"No students found matching your criteria"} /></p>
            </div>
          ) : (
            filtered.map((s, i) => {
              const salespersonName = salespeople.find((person) => person.id === s.assigned_salesperson_id)?.name;
              const statusCfg = STATUS_STYLES[s.status] || STATUS_STYLES.Active;

              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.25) }}
                  className="group rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111]/90 p-3.5 shadow-xs hover:border-emerald-500/60 dark:hover:border-emerald-500/50 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Avatar, Name, Status */}
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs">
                          {s.name[0]?.toUpperCase() || "S"}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/students/${s.id}`}
                            className="font-semibold text-sm text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate block"
                            title={s.name}
                          >
                            {s.name}
                          </Link>
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
                            <span className="text-emerald-700 dark:text-emerald-300 font-medium">{salespersonName || "Unassigned"}</span>
                            <span>•</span>
                            <span className="truncate">{s.course_interest || s.source || "Direct"}</span>
                          </div>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap shadow-xs ${statusCfg.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                        {s.status}
                      </span>
                    </div>

                    {/* Course & Batch Box */}
                    <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 p-2 mb-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-0.5"><LocalizedText text={"Enrolled Course"} /></p>
                      {s.active_course ? (
                        <div>
                          <Link href={`/courses/${s.active_course_id}`} className="text-xs font-semibold text-slate-900 dark:text-white hover:text-emerald-600 truncate block">
                            {s.active_course}
                          </Link>
                          {s.active_batch && (
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1">
                              <Layers className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                              <span className="truncate">{s.active_batch}</span>
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic"><LocalizedText text={"No course enrollment"} /></p>
                      )}
                    </div>

                    {/* Contact Details */}
                    <div className="space-y-1 mb-2.5 text-xs text-slate-600 dark:text-zinc-300">
                      {s.email && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <a href={`mailto:${s.email}`} className="truncate hover:text-emerald-600">{s.email}</a>
                        </div>
                      )}
                      {s.phone && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <a href={`tel:${s.phone}`} className="truncate hover:text-emerald-600">{s.phone}</a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer & Actions */}
                  <div className="pt-2.5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-200/60 dark:border-violet-700/30">
                      <GraduationCap className="w-3 h-3" />
                      {s.enrollment_count} {s.enrollment_count === 1 ? "course" : "courses"}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/students/${s.id}`}
                        title="View Profile"
                        className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300 text-slate-500 dark:text-zinc-400 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                      {canCreateLogin && (
                        <CreateInstituteLoginButton
                          profileId={s.id}
                          profileKind="students"
                          hasAccount={Boolean(s.user_id)}
                          hasEmail={Boolean(s.email)}
                          onCreated={fetch_}
                        />
                      )}
                      {canManageStudents && (
                        <>
                          <button
                            onClick={() => openEdit(s)}
                            title="Edit"
                            className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            title="Delete"
                            className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/20 dark:hover:text-rose-400 text-slate-500 dark:text-zinc-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* Add / Edit Student Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                    {editStudent ? "Edit Student Profile" : "Add New Student"}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    {editStudent ? "Update details and academic interests" : "Enroll a new student into the institute system"}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {formError && (
                <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs sm:text-sm text-red-600 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { l: "Full Name *", k: "name", p: "Student's full name", col: 2 },
                  { l: "Email", k: "email", p: "email@example.com" },
                  { l: "Phone", k: "phone", p: "+91 XXXXX XXXXX" },
                  { l: "Course Interest", k: "course_interest", p: "Course or program" },
                  { l: "Education Level", k: "education_level", p: "Highest completed education" },
                  { l: "GPA (0-10)", k: "gpa", p: "e.g. 8.2", type: "number" },
                  { l: "Gender", k: "gender", p: "Male/Female/Other" },
                  { l: "Qualification", k: "qualification", p: "Qualification or certification" },
                  { l: "Guardian Name", k: "guardian_name", p: "Parent/Guardian" },
                  { l: "Guardian Phone", k: "guardian_phone", p: "+91 XXXXX XXXXX" },
                  { l: "Address", k: "address", p: "Full address", col: 2 },
                ].map((f: any) => (
                  <div key={f.k} className={f.col === 2 ? "sm:col-span-2" : ""}>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">{f.l}</label>
                    <input
                      type={f.type || "text"}
                      min={f.type === "number" ? 0 : undefined}
                      max={f.type === "number" ? 10 : undefined}
                      step={f.type === "number" ? 0.1 : undefined}
                      value={(form as any)[f.k]}
                      onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                      placeholder={f.p}
                      className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                ))}

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    <LocalizedText text={"Academic / work background"} /></label>
                  <textarea
                    value={form.academic_background}
                    onChange={(e) => setForm({ ...form, academic_background: e.target.value })}
                    rows={2}
                    className="w-full resize-y rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/5 px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                    placeholder="Previous study, experience, strengths, and skills"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"><LocalizedText text={"Career goal"} /></label>
                  <textarea
                    value={form.career_goal}
                    onChange={(e) => setForm({ ...form, career_goal: e.target.value })}
                    rows={2}
                    className="w-full resize-y rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/5 px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                    placeholder="Target role, industry, or learning outcome"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"><LocalizedText text={"Source"} /></label>
                  <select
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  >
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"><LocalizedText text={"Salesperson"} /></label>
                  <select
                    value={form.assigned_salesperson_id}
                    onChange={(e) => setForm({ ...form, assigned_salesperson_id: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-zinc-800 px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                  >
                    <option value="">Use source lead owner / leave unassigned</option>
                    <option value="auto">Auto-assign by collected revenue</option>
                    {salespeople.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} · {person.role}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"><LocalizedText text={"Notes"} /></label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    placeholder="Additional notes..."
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 mt-5">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 transition"
                >
                  <LocalizedText text={"Cancel"} /> </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-xs sm:text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm transition"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editStudent ? "Update Student" : "Add Student"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
