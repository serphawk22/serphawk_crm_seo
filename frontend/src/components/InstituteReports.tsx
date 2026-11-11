"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  TrendingUp,
  Users,
  Target,
  Phone,
  Video,
  Download,
  RefreshCw,
  CalendarDays,
  GraduationCap,
  CreditCard,
  UserCheck,
  ChevronDown,
  ChevronRight,
  PieChart as PieChartIcon,
  BarChart3,
  Award,
  FileSpreadsheet,
  Sparkles,
  DollarSign,
  AlertCircle
} from "lucide-react";
import { jsPDF } from "jspdf";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { API_BASE_URL } from "@/config";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from "recharts";

// ── TYPES ───────────────────────────────────────────────────────────────────

interface CompanyOverview {
  total_leads_in_range: number;
  total_leads_all_time: number;
  total_students_enrolled_in_range: number;
  total_students_all_time: number;
  active_students: number;
  total_tuition_value: number;
  advance_collected: number;
  total_collected_all_time: number;
  total_pending_due: number;
  collection_percentage: number;
  demos_scheduled: number;
  demos_successful: number;
  demo_conversion_rate: number;
  overall_conversion_rate: number;
  total_followups: number;
  active_batches_count: number;
  instructors_count: number;
  courses_count: number;
}

interface RecentConversion {
  student_id: number;
  student_name: string;
  course_name: string;
  batch_name: string;
  total_fee: number;
  amount_paid: number;
  amount_due: number;
  payment_status: string;
  slip_number?: string;
  enrollment_date?: string;
}

interface SalesPerformance {
  user_id: number;
  name: string;
  email: string;
  role: string;
  leads_assigned: number;
  total_leads_all_time: number;
  demos_scheduled: number;
  demos_successful: number;
  demo_success_rate: number;
  followups_count: number;
  students_enrolled: number;
  conversion_rate: number;
  tuition_booked: number;
  advance_collected: number;
  pending_due: number;
  recent_conversions: RecentConversion[];
}

interface LeadSource {
  source: string;
  total_leads: number;
  demos_scheduled: number;
  converted_students: number;
  conversion_rate: number;
  tuition_booked: number;
  advance_collected: number;
  pending_due: number;
}

interface PipelineStage {
  stage: string;
  count: number;
  percentage: number;
}

interface CoursePerformance {
  course_id: number;
  title: string;
  category: string;
  price: number;
  advance_amount: number;
  students_enrolled: number;
  tuition_booked: number;
  advance_collected: number;
  pending_due: number;
  collection_percentage: number;
}

interface InstructorBatch {
  batch_id: number;
  batch_name: string;
  course_title: string;
  enrolled_count: number;
  max_seats: number;
  status: string;
  progress_percent: number;
}

interface InstructorPerformance {
  instructor_id: number;
  name: string;
  email?: string;
  phone?: string;
  specialization: string;
  avg_rating: number;
  batches_count: number;
  active_batches_count: number;
  total_students: number;
  attendance_rate: number;
  sessions_count: number;
  batches: InstructorBatch[];
}

interface DailyTrend {
  date: string;
  leads: number;
  demos: number;
  enrollments: number;
  advance_collected: number;
  followups: number;
}

interface MonthlyTrend {
  month: string;
  leads: number;
  demos: number;
  enrollments: number;
  advance_collected: number;
}

interface RecentAdmission {
  id: number;
  student_id: number;
  student_name: string;
  course_title: string;
  batch_name: string;
  salesperson_name: string;
  total_fee: number;
  amount_paid: number;
  amount_due: number;
  payment_status: string;
  slip_number: string;
  enrollment_date: string;
}

interface DemoLog {
  id: number;
  lead_name: string;
  salesperson: string;
  course: string;
  status: string;
  scheduled_at: string;
  meeting_url?: string;
  notes?: string;
}

interface FollowupLog {
  id: number;
  phone_number: string;
  lead_name: string;
  agent: string;
  date: string;
  duration: number;
  followup_needed: boolean;
  followup_date?: string;
  summary?: string;
}

interface ReportResponse {
  range: {
    start_date: string;
    end_date: string;
    is_all_time: boolean;
  };
  company_overview: CompanyOverview;
  sales_performance: SalesPerformance[];
  lead_sources: LeadSource[];
  lead_pipeline_stages: PipelineStage[];
  course_performance: CoursePerformance[];
  instructor_performance: InstructorPerformance[];
  daily_trends: DailyTrend[];
  monthly_trends: MonthlyTrend[];
  recent_admissions: RecentAdmission[];
  demo_logs: DemoLog[];
  followup_logs: FollowupLog[];
}

// ── COLOR PALETTE ───────────────────────────────────────────────────────────
const SOURCE_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#14b8a6", "#f97316", "#64748b"];

const TABS = [
  { id: "overview", label: "Executive Overview", icon: BarChart3 },
  { id: "sales", label: "Sales Performance", icon: Target },
  { id: "sources", label: "Lead Sources", icon: PieChartIcon },
  { id: "students", label: "Students & Courses", icon: GraduationCap },
  { id: "instructors", label: "Instructor Delivery", icon: UserCheck },
  { id: "demos_calls", label: "Demos & Follow-ups", icon: Video },
] as const;

export default function ReportsPage() {
  const { settings } = useTenantConfig();
  const currency = settings.default_currency || "USD";
  const money = (value: number | undefined) => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value || 0);

  const [activeTab, setActiveTab] = useState<string>("overview");

  // Dates
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [isAllTime, setIsAllTime] = useState(false);
  const [selectedRep, setSelectedRep] = useState<string>("all");
  const [selectedCourse, setSelectedCourse] = useState<string>("all");

  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedRep, setExpandedRep] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getAuthHeaders = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
    let userId: string | null = null;
    if (userStr) {
      try { userId = String(JSON.parse(userStr)?.id); } catch {}
    }
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { "X-User-ID": userId } : {}),
    };
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (isAllTime) {
        params.set("all_time", "true");
      } else {
        params.set("start_date", startDate);
        params.set("end_date", endDate);
      }
      if (selectedRep !== "all") params.set("salesperson_id", selectedRep);
      if (selectedCourse !== "all") params.set("course_id", selectedCourse);

      const response = await fetch(`${API_BASE_URL}/institute/reports?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.message || "Failed to load reports");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, isAllTime, selectedRep, selectedCourse]);

  useEffect(() => {
    void load();
  }, [load]);

  // Quick preset helper
  const applyPreset = (preset: "today" | "week" | "month" | "all") => {
    setIsAllTime(false);
    if (preset === "today") {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === "week") {
      const d = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
      setStartDate(d);
      setEndDate(today);
    } else if (preset === "month") {
      setStartDate(monthStart);
      setEndDate(today);
    } else if (preset === "all") {
      setIsAllTime(true);
    }
  };

  // PDF Export
  const downloadExecutivePdf = () => {
    if (!data) return;
    const doc = new jsPDF();
    const overview = data.company_overview;

    // Cover Title
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 35, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Admissions & Performance Decision Center", 14, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Period: ${isAllTime ? "All Time" : `${data.range.start_date} to ${data.range.end_date}`} · Generated: ${new Date().toLocaleDateString()}`,
      14,
      27
    );

    // Section 1: Company KPIs
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Executive Company Overview", 14, 48);

    const kpiMetrics = [
      ["Total Leads in Period", String(overview.total_leads_in_range), "Tuition Value Booked", `${currency} ${overview.total_tuition_value.toLocaleString()}`],
      ["Students Enrolled", String(overview.total_students_enrolled_in_range), "Advance / Paid", `${currency} ${overview.advance_collected.toLocaleString()}`],
      ["Overall Conversion Rate", `${overview.overall_conversion_rate}%`, "Outstanding Balance", `${currency} ${overview.total_pending_due.toLocaleString()}`],
      ["Demos Scheduled", String(overview.demos_scheduled), "Demos Converted", `${overview.demos_successful} (${overview.demo_conversion_rate}%)`],
      ["Follow-ups & Calls", String(overview.total_followups), "Active Batches / Courses", `${overview.active_batches_count} / ${overview.courses_count}`],
    ];

    let y = 56;
    kpiMetrics.forEach(([k1, v1, k2, v2]) => {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text(k1, 14, y);
      doc.text(k2, 110, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(v1, 65, y);
      doc.text(v2, 160, y);
      y += 8;
    });

    // Section 2: Sales Performance Table
    y += 8;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("Sales Team Conversions & Advance Collections", 14, y);
    y += 6;

    // Headers
    doc.setFillColor(30, 41, 59);
    doc.rect(14, y, 182, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text("Salesperson", 16, y + 5.5);
    doc.text("Leads", 65, y + 5.5);
    doc.text("Demos (Succ)", 82, y + 5.5);
    doc.text("Enrolled", 110, y + 5.5);
    doc.text("Conv %", 128, y + 5.5);
    doc.text(`Advance (${currency})`, 146, y + 5.5);
    doc.text(`Tuition (${currency})`, 172, y + 5.5);
    y += 8;

    data.sales_performance.forEach((rep, idx) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y, 182, 7, "F");
      }
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.text(rep.name.substring(0, 22), 16, y + 5);
      doc.text(String(rep.leads_assigned), 65, y + 5);
      doc.text(`${rep.demos_scheduled} (${rep.demos_successful})`, 82, y + 5);
      doc.text(String(rep.students_enrolled), 110, y + 5);
      doc.text(`${rep.conversion_rate}%`, 128, y + 5);
      doc.text(rep.advance_collected.toLocaleString(), 146, y + 5);
      doc.text(rep.tuition_booked.toLocaleString(), 172, y + 5);
      y += 7;
    });

    // Page 2: Sources & Instructors
    doc.addPage();
    y = 20;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("Lead Sources Performance", 14, y);
    y += 8;

    doc.setFillColor(30, 41, 59);
    doc.rect(14, y, 182, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text("Source Channel", 16, y + 5.5);
    doc.text("Leads", 70, y + 5.5);
    doc.text("Enrolled", 95, y + 5.5);
    doc.text("Conv Rate", 120, y + 5.5);
    doc.text("Advance Collected", 150, y + 5.5);
    y += 8;

    data.lead_sources.forEach((src, idx) => {
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y, 182, 7, "F");
      }
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.text(src.source, 16, y + 5);
      doc.text(String(src.total_leads), 70, y + 5);
      doc.text(String(src.converted_students), 95, y + 5);
      doc.text(`${src.conversion_rate}%`, 120, y + 5);
      doc.text(`${currency} ${src.advance_collected.toLocaleString()}`, 150, y + 5);
      y += 7;
    });

    y += 12;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("Faculty Delivery & Student Engagement", 14, y);
    y += 8;

    doc.setFillColor(30, 41, 59);
    doc.rect(14, y, 182, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text("Instructor", 16, y + 5.5);
    doc.text("Specialization", 65, y + 5.5);
    doc.text("Batches", 115, y + 5.5);
    doc.text("Students", 135, y + 5.5);
    doc.text("Attendance %", 158, y + 5.5);
    doc.text("Rating", 182, y + 5.5);
    y += 8;

    data.instructor_performance.forEach((inst, idx) => {
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y, 182, 7, "F");
      }
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.text(inst.name, 16, y + 5);
      doc.text(inst.specialization.substring(0, 25), 65, y + 5);
      doc.text(String(inst.batches_count), 115, y + 5);
      doc.text(String(inst.total_students), 135, y + 5);
      doc.text(`${inst.attendance_rate}%`, 158, y + 5);
      doc.text(String(inst.avg_rating), 182, y + 5);
      y += 7;
    });

    doc.save(`institute-admissions-report-${startDate}-to-${endDate}.pdf`);
  };

  // CSV Export
  const downloadCsv = () => {
    if (!data) return;
    const rows = [
      ["Salesperson", "Role", "Leads Assigned", "Demos Scheduled", "Demos Successful", "Demo Success %", "Followups", "Students Enrolled", "Conversion %", `Tuition Booked (${currency})`, `Advance Collected (${currency})`, `Pending Due (${currency})`],
      ...data.sales_performance.map(s => [
        `"${s.name}"`,
        s.role,
        s.leads_assigned,
        s.demos_scheduled,
        s.demos_successful,
        s.demo_success_rate,
        s.followups_count,
        s.students_enrolled,
        s.conversion_rate,
        s.tuition_booked,
        s.advance_collected,
        s.pending_due,
      ]),
    ];
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sales-performance-${startDate}-to-${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const overview = data?.company_overview;

  return (
    <div className="mx-auto max-w-[1600px] space-y-7 pb-16">
      {/* ── HEADER & CONTROLS ── */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" />
              Admissions & Operations Decision Center
            </span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            Comprehensive Institute Reports
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
            Real-time executive intelligence on leads, enrollments, sales conversions, advance collections, and faculty delivery.
          </p>
        </div>

        {/* Date Filter & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Presets */}
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold dark:border-zinc-800 dark:bg-zinc-900">
            <button
              onClick={() => applyPreset("today")}
              className={`rounded-lg px-2.5 py-1.5 transition ${!isAllTime && startDate === today && endDate === today ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"}`}
            >
              Today
            </button>
            <button
              onClick={() => applyPreset("week")}
              className={`rounded-lg px-2.5 py-1.5 transition ${!isAllTime && startDate === new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10) ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"}`}
            >
              7 Days
            </button>
            <button
              onClick={() => applyPreset("month")}
              className={`rounded-lg px-2.5 py-1.5 transition ${!isAllTime && startDate === monthStart ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"}`}
            >
              This Month
            </button>
            <button
              onClick={() => applyPreset("all")}
              className={`rounded-lg px-2.5 py-1.5 transition ${isAllTime ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"}`}
            >
              All Time
            </button>
          </div>

          {/* Custom Date Pickers */}
          {!isAllTime && (
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold dark:border-zinc-800 dark:bg-zinc-900">
              <CalendarDays className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <input
                type="date"
                value={startDate}
                onChange={e => { setIsAllTime(false); setStartDate(e.target.value); }}
                className="bg-transparent text-slate-800 dark:text-zinc-200 focus:outline-none"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => { setIsAllTime(false); setEndDate(e.target.value); }}
                className="bg-transparent text-slate-800 dark:text-zinc-200 focus:outline-none"
              />
            </div>
          )}

          {/* Refresh */}
          <button
            onClick={load}
            disabled={loading}
            title="Refresh analytics"
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-emerald-600" : ""}`} />
          </button>

          {/* Export Buttons */}
          <button
            onClick={downloadCsv}
            disabled={!data}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            CSV
          </button>

          <label className="text-xs font-semibold">Salesperson<select aria-label="Report salesperson" value={selectedRep} onChange={e => setSelectedRep(e.target.value)} className="ml-2 rounded-lg border bg-transparent p-2"><option value="all">All salespeople</option>{data?.sales_performance.map(person => <option key={person.user_id} value={person.user_id}>{person.name}</option>)}</select></label>
        <label className="text-xs font-semibold">Course<select aria-label="Report course" value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)} className="ml-2 rounded-lg border bg-transparent p-2"><option value="all">All courses</option>{data?.course_performance.map(course => <option key={course.course_id} value={course.course_id}>{course.title}</option>)}</select></label>
        <button
            onClick={downloadExecutivePdf}
            disabled={!data}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </button>
        </div>
      </div>

      {/* ── TOP EXECUTIVE KPI METRIC CARDS ── */}
      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* Card 1: Leads */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Leads</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
              {overview.total_leads_in_range}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
              {overview.total_leads_all_time} total on record
            </p>
          </div>

          {/* Card 2: Students Enrolled */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Admissions Closed</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <GraduationCap className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {overview.total_students_enrolled_in_range}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              {overview.overall_conversion_rate}% conversion rate
            </p>
          </div>

          {/* Card 3: Advance Collected */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Advance Collected</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-500">
                <CreditCard className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
              {money(overview.advance_collected)}
            </p>
            <p className="mt-1 text-[11px] text-teal-600 dark:text-teal-400 font-semibold">
              {overview.collection_percentage}% collection rate
            </p>
          </div>

          {/* Card 4: Tuition Booked */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tuition Booked</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
              {money(overview.total_tuition_value)}
            </p>
            <p className="mt-1 text-[11px] text-rose-500 font-semibold">
              {money(overview.total_pending_due)} balance due
            </p>
          </div>

          {/* Card 5: Demos Scheduled & Success */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Demos Scheduled</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                <Video className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
              {overview.demos_scheduled}
            </p>
            <p className="mt-1 text-[11px] text-purple-600 dark:text-purple-400 font-semibold">
              {overview.demos_successful} successful ({overview.demo_conversion_rate}%)
            </p>
          </div>

          {/* Card 6: Follow-ups Logged */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Follow-ups & Calls</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                <Phone className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
              {overview.total_followups}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
              {overview.active_batches_count} batches active
            </p>
          </div>
        </div>
      )}

      {/* ── TAB NAVIGATION BAR ── */}
      <div className="flex gap-1.5 overflow-x-auto rounded-2xl bg-slate-100 p-1.5 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-black transition-all ${
                isActive
                  ? "bg-white text-emerald-700 shadow-sm dark:bg-zinc-800 dark:text-emerald-400"
                  : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-zinc-900" />
          ))}
        </div>
      ) : data ? (
        <>
          {/* ══════════════════════════════════════════════════════════════════
              TAB 1: EXECUTIVE OVERVIEW
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Financial Donut & Pipeline Funnel */}
              <div className="grid gap-6 lg:grid-cols-12">
                {/* Collection Health Donut */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-black text-slate-900 dark:text-white">Revenue & Collection Health</h2>
                      <p className="text-xs text-slate-400">Advance collected vs pending balance</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {overview?.collection_percentage}% Collected
                    </span>
                  </div>

                  <div className="flex items-center justify-center py-4">
                    {/* SVG Donut */}
                    <div className="relative h-44 w-44">
                      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="12" className="text-slate-100 dark:text-zinc-800" />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="transparent"
                          stroke="#10b981"
                          strokeWidth="12"
                          strokeDasharray={251.2}
                          strokeDashoffset={251.2 - (251.2 * (overview?.collection_percentage || 0)) / 100}
                          strokeLinecap="round"
                          className="transition-all duration-1000"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-2xl font-black text-slate-900 dark:text-white">
                          {money(overview?.advance_collected || 0)}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-slate-400">Advance Paid</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center dark:border-zinc-800">
                    <div>
                      <p className="text-[11px] font-bold text-slate-400">Tuition Booked</p>
                      <p className="text-sm font-black text-slate-900 dark:text-white">{money(overview?.total_tuition_value)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Advance Paid</p>
                      <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{money(overview?.advance_collected)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-rose-500">Balance Due</p>
                      <p className="text-sm font-black text-rose-500">{money(overview?.total_pending_due)}</p>
                    </div>
                  </div>
                </div>

                {/* Lead Pipeline Conversion Funnel */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-7">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-black text-slate-900 dark:text-white">Admissions Pipeline Funnel</h2>
                      <p className="text-xs text-slate-400">Distribution across active admission stages</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-400">
                      {data.company_overview.total_leads_in_range} Leads Processed
                    </span>
                  </div>

                  <div className="space-y-3 pt-2">
                    {data.lead_pipeline_stages.map(stg => (
                      <div key={stg.stage} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-700 dark:text-zinc-300">{stg.stage}</span>
                          <span className="text-slate-500 dark:text-zinc-400">
                            {stg.count} ({stg.percentage}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              stg.stage === "Enrolled"
                                ? "bg-emerald-500"
                                : stg.stage.includes("Demo")
                                ? "bg-purple-500"
                                : stg.stage === "New"
                                ? "bg-indigo-500"
                                : "bg-sky-500"
                            }`}
                            style={{ width: `${Math.max(4, stg.percentage)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Admissions & Revenue Velocity Chart */}
              {mounted && data.daily_trends.length > 1 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-emerald-500" />
                        Admissions & Revenue Velocity
                      </h3>
                      <p className="text-xs text-slate-400">Daily trajectory of advance collections and student inquiry flow</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Advance Collected (₹)
                      </span>
                      <span className="flex items-center gap-1.5 font-bold text-indigo-600 dark:text-indigo-400">
                        <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Inquiries
                      </span>
                    </div>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.daily_trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorAdvance" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(val) => val.slice(5)} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: 12, color: "#fff", fontSize: 12 }}
                          formatter={(value, name) => [name === "advance_collected" ? money(Number(value)) : value, name === "advance_collected" ? "Advance Collected" : "Leads"]}
                        />
                        <Area type="monotone" dataKey="advance_collected" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAdvance)" />
                        <Area type="monotone" dataKey="leads" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorLeads)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Top Sales & Sources Highlights */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Sales Performers Leaderboard Preview */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Award className="h-5 w-5 text-amber-500" />
                      Sales Leaderboard
                    </h3>
                    <button
                      onClick={() => setActiveTab("sales")}
                      className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                    >
                      View All Reps <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {data.sales_performance.slice(0, 4).map((rep, idx) => (
                      <div key={rep.user_id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                            idx === 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}>
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{rep.name}</p>
                            <p className="text-xs text-slate-400">{rep.role} · {rep.leads_assigned} leads</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                            {money(rep.advance_collected)}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {rep.students_enrolled} enrolled ({rep.conversion_rate}%)
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lead Sources Distribution Preview */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <PieChartIcon className="h-5 w-5 text-indigo-500" />
                      Top Acquisition Channels
                    </h3>
                    <button
                      onClick={() => setActiveTab("sources")}
                      className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                    >
                      View Sources <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {data.lead_sources.slice(0, 4).map((src, idx) => (
                      <div key={src.source} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: SOURCE_COLORS[idx % SOURCE_COLORS.length] }}
                          />
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{src.source}</p>
                            <p className="text-xs text-slate-400">{src.total_leads} leads · {src.converted_students} admissions</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-slate-900 dark:text-white">
                            {money(src.advance_collected)}
                          </p>
                          <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {src.conversion_rate}% conv.
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 2: SALES PERFORMANCE ("Which sales done what")
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "sales" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  Sales Team Execution & Advance Collections
                </h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  Comprehensive performance audit: which sales rep handled which leads, demos scheduled vs converted, follow-ups logged, admissions secured, and advance payments collected.
                </p>
              </div>

              {/* Sales Rep Comparative Chart */}
              {mounted && data.sales_performance.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-indigo-500" />
                        Executive Revenue Collected & Admissions
                      </h3>
                      <p className="text-xs text-slate-400">Comparing actual advance payments collected (₹) and student admissions closed per sales executive</p>
                    </div>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.sales_performance} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: 12, color: "#fff", fontSize: 12 }}
                          formatter={(value, name) => [name === "advance_collected" ? money(Number(value)) : value, name === "advance_collected" ? "Advance Collected" : "Students Enrolled"]}
                        />
                        <Bar dataKey="advance_collected" fill="#10b981" radius={[6, 6, 0, 0]} name="advance_collected" />
                        <Bar dataKey="students_enrolled" fill="#6366f1" radius={[6, 6, 0, 0]} name="students_enrolled" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Master Sales Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:bg-zinc-950">
                    <tr>
                      <th className="px-5 py-3.5">Sales Executive</th>
                      <th className="px-4 py-3.5 text-center">Leads Assigned</th>
                      <th className="px-4 py-3.5 text-center">Demos (Succ)</th>
                      <th className="px-4 py-3.5 text-center">Demo Rate</th>
                      <th className="px-4 py-3.5 text-center">Follow-ups</th>
                      <th className="px-4 py-3.5 text-center">Admissions</th>
                      <th className="px-4 py-3.5 text-center">Conv. Rate</th>
                      <th className="px-4 py-3.5 text-right">Advance Collected</th>
                      <th className="px-4 py-3.5 text-right">Tuition Booked</th>
                      <th className="px-4 py-3.5 text-right">Due</th>
                      <th className="px-5 py-3.5 text-center">Audit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {data.sales_performance.map((rep, idx) => {
                      const isExpanded = expandedRep === rep.user_id;
                      return (
                        <React.Fragment key={rep.user_id}>
                          <tr className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 font-bold text-white shadow-sm">
                                  {rep.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-slate-900 dark:text-white">{rep.name}</p>
                                    {idx === 0 && rep.advance_collected > 0 && (
                                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                        Top Earner
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-400">{rep.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center font-bold">{rep.leads_assigned}</td>
                            <td className="px-4 py-4 text-center font-semibold">
                              <span className="text-slate-900 dark:text-white">{rep.demos_scheduled}</span>
                              <span className="text-xs text-emerald-600 dark:text-emerald-400"> ({rep.demos_successful})</span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className={`font-bold ${rep.demo_success_rate > 50 ? "text-emerald-600" : "text-slate-500"}`}>
                                {rep.demo_success_rate}%
                              </span>
                            </td>
                            <td className="px-4 py-4 text-center font-semibold">{rep.followups_count}</td>
                            <td className="px-4 py-4 text-center font-black text-emerald-600 dark:text-emerald-400">
                              {rep.students_enrolled}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-black ${
                                rep.conversion_rate >= 50
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}>
                                {rep.conversion_rate}%
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                              {money(rep.advance_collected)}
                            </td>
                            <td className="px-4 py-4 text-right font-bold text-slate-900 dark:text-white">
                              {money(rep.tuition_booked)}
                            </td>
                            <td className="px-4 py-4 text-right font-semibold text-rose-500">
                              {money(rep.pending_due)}
                            </td>
                            <td className="px-5 py-4 text-center">
                              <button
                                onClick={() => setExpandedRep(isExpanded ? null : rep.user_id)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                              >
                                {isExpanded ? "Close" : "Conversions"}
                                <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Conversions Drilldown */}
                          {isExpanded && (
                            <tr className="bg-slate-50/70 dark:bg-zinc-950/50">
                              <td colSpan={11} className="px-6 py-4">
                                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
                                    Admissions Closed by {rep.name} ({rep.recent_conversions.length})
                                  </h4>
                                  {rep.recent_conversions.length === 0 ? (
                                    <p className="text-xs text-slate-400">No student enrollment conversions recorded yet for this sales representative.</p>
                                  ) : (
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                      {rep.recent_conversions.map((conv, cIdx) => (
                                        <div key={cIdx} className="rounded-lg border border-slate-200 p-3 text-xs dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40">
                                          <div className="flex items-center justify-between">
                                            <p className="font-bold text-slate-900 dark:text-white">{conv.student_name}</p>
                                            <span className="font-mono text-[10px] text-slate-400">{conv.slip_number}</span>
                                          </div>
                                          <p className="text-slate-500 mt-0.5">{conv.course_name} · {conv.batch_name}</p>
                                          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-zinc-800">
                                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                              Paid: {money(conv.amount_paid)}
                                            </span>
                                            <span className="text-rose-500 font-semibold">
                                              Due: {money(conv.amount_due)}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 3: LEAD SOURCES
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "sources" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  Acquisition Channel Effectiveness & ROI
                </h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  Track student admissions, advance collections, and conversion rates by inquiry channel.
                </p>
              </div>

              {/* Channel Charts */}
              {mounted && data.lead_sources.length > 0 && (
                <div className="grid gap-6 lg:grid-cols-12">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-7">
                    <h3 className="text-base font-black text-slate-900 dark:text-white mb-4">
                      Advance Collections by Inquiry Channel (₹)
                    </h3>
                    <div className="h-60 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.lead_sources} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                          <XAxis dataKey="source" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: 12, color: "#fff", fontSize: 12 }}
                            formatter={(value) => [money(Number(value)), "Advance Collected"]}
                          />
                          <Bar dataKey="advance_collected" fill="#10b981" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-5">
                    <h3 className="text-base font-black text-slate-900 dark:text-white mb-2">
                      Inquiry Volume Share
                    </h3>
                    <div className="h-60 w-full flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.lead_sources}
                            dataKey="total_leads"
                            nameKey="source"
                            cx="50%"
                            cy="50%"
                            outerRadius={75}
                            innerRadius={45}
                            paddingAngle={3}
                          >
                            {data.lead_sources.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={SOURCE_COLORS[index % SOURCE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: 12, color: "#fff", fontSize: 12 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:bg-zinc-950">
                    <tr>
                      <th className="px-5 py-3.5">Acquisition Channel</th>
                      <th className="px-4 py-3.5 text-center">Inquiries / Leads</th>
                      <th className="px-4 py-3.5 text-center">Demos Scheduled</th>
                      <th className="px-4 py-3.5 text-center">Admissions Closed</th>
                      <th className="px-4 py-3.5 text-center">Conversion Rate</th>
                      <th className="px-4 py-3.5 text-right">Advance Collected</th>
                      <th className="px-4 py-3.5 text-right">Total Tuition Booked</th>
                      <th className="px-4 py-3.5 text-right">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {data.lead_sources.map((src, idx) => (
                      <tr key={src.source} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: SOURCE_COLORS[idx % SOURCE_COLORS.length] }}
                            />
                            <span className="font-bold text-slate-900 dark:text-white">{src.source}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center font-bold">{src.total_leads}</td>
                        <td className="px-4 py-4 text-center font-semibold">{src.demos_scheduled}</td>
                        <td className="px-4 py-4 text-center font-black text-emerald-600 dark:text-emerald-400">
                          {src.converted_students}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-black ${
                            src.conversion_rate >= 50
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}>
                            {src.conversion_rate}%
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                          {money(src.advance_collected)}
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-slate-900 dark:text-white">
                          {money(src.tuition_booked)}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-rose-500">
                          {money(src.pending_due)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 4: STUDENTS & COURSES
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "students" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  Courses & Student Admissions Roster
                </h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  Course admissions performance, payment statuses, and detailed enrollment audit records.
                </p>
              </div>

              {/* Course Performance Breakdown */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:bg-zinc-950">
                    <tr>
                      <th className="px-5 py-3.5">Course Title</th>
                      <th className="px-4 py-3.5">Category</th>
                      <th className="px-4 py-3.5 text-right">Tuition Price</th>
                      <th className="px-4 py-3.5 text-center">Students Enrolled</th>
                      <th className="px-4 py-3.5 text-right">Advance Collected</th>
                      <th className="px-4 py-3.5 text-right">Total Booked</th>
                      <th className="px-4 py-3.5 text-right">Balance Due</th>
                      <th className="px-4 py-3.5 text-center">Collection %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {data.course_performance.map(course => (
                      <tr key={course.course_id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
                        <td className="px-5 py-4 font-bold text-slate-900 dark:text-white">{course.title}</td>
                        <td className="px-4 py-4 text-xs text-slate-500">{course.category}</td>
                        <td className="px-4 py-4 text-right font-semibold">{money(course.price)}</td>
                        <td className="px-4 py-4 text-center font-black text-emerald-600 dark:text-emerald-400">
                          {course.students_enrolled}
                        </td>
                        <td className="px-4 py-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                          {money(course.advance_collected)}
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-slate-900 dark:text-white">
                          {money(course.tuition_booked)}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-rose-500">
                          {money(course.pending_due)}
                        </td>
                        <td className="px-4 py-4 text-center font-bold">
                          {course.collection_percentage}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Recent Admissions Audit Table */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="text-base font-black text-slate-900 dark:text-white mb-4">
                  Recent Admissions Audit Records
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:bg-zinc-950">
                      <tr>
                        <th className="px-4 py-3">Student Name</th>
                        <th className="px-4 py-3">Course</th>
                        <th className="px-4 py-3">Batch</th>
                        <th className="px-4 py-3">Salesperson</th>
                        <th className="px-4 py-3 text-right">Total Fee</th>
                        <th className="px-4 py-3 text-right">Paid</th>
                        <th className="px-4 py-3 text-right">Due</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 font-mono text-xs">Slip #</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                      {data.recent_admissions.map(adm => (
                        <tr key={adm.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40">
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{adm.student_name}</td>
                          <td className="px-4 py-3 text-xs">{adm.course_title}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{adm.batch_name}</td>
                          <td className="px-4 py-3 text-xs font-semibold">{adm.salesperson_name}</td>
                          <td className="px-4 py-3 text-right font-semibold">{money(adm.total_fee)}</td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {money(adm.amount_paid)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-rose-500">
                            {money(adm.amount_due)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              adm.payment_status === "Paid"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            }`}>
                              {adm.payment_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{adm.slip_number}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 5: INSTRUCTOR PERFORMANCE
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "instructors" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  Faculty Delivery, Attendance & Syllabus Progress
                </h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  Measure batch progress, student attendance compliance, and instructor delivery across active academic runs.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {data.instructor_performance.map(inst => (
                  <div
                    key={inst.instructor_id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 font-bold text-white shadow-sm">
                          {inst.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{inst.name}</p>
                          <p className="text-xs text-slate-400">{inst.specialization}</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        ⭐ {inst.avg_rating}
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-2 border-y border-slate-100 py-3 text-center dark:border-zinc-800">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Batches</p>
                        <p className="text-base font-black text-slate-900 dark:text-white">{inst.batches_count}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Students</p>
                        <p className="text-base font-black text-slate-900 dark:text-white">{inst.total_students}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Attendance</p>
                        <p className="text-base font-black text-emerald-600 dark:text-emerald-400">{inst.attendance_rate}%</p>
                      </div>
                    </div>

                    {/* Batches roster */}
                    <div className="mt-4 space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Assigned Batches</p>
                      {inst.batches.length === 0 ? (
                        <p className="text-xs text-slate-400">No active batches assigned at present.</p>
                      ) : (
                        inst.batches.map(b => (
                          <div key={b.batch_id} className="rounded-lg border border-slate-100 p-2 text-xs dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-950/40">
                            <div className="flex items-center justify-between font-bold">
                              <span>{b.batch_name}</span>
                              <span className="text-emerald-600 dark:text-emerald-400">{b.enrolled_count} Students</span>
                            </div>
                            <p className="text-slate-400 text-[11px] mt-0.5">{b.course_title}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 6: DEMOS & FOLLOW-UPS
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "demos_calls" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  Demo Sessions & Prospect Follow-up Audit
                </h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  Comprehensive audit trail of course demos conducted and phone/outreach follow-up touchpoints.
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Demos Table */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <h3 className="text-base font-black text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Video className="h-4 w-4 text-purple-500" /> Course Demo Sessions
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:bg-zinc-950">
                        <tr>
                          <th className="px-3 py-2.5">Lead</th>
                          <th className="px-3 py-2.5">Sales Rep</th>
                          <th className="px-3 py-2.5">Scheduled</th>
                          <th className="px-3 py-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                        {data.demo_logs.map(demo => (
                          <tr key={demo.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40">
                            <td className="px-3 py-2.5 font-bold">{demo.lead_name}</td>
                            <td className="px-3 py-2.5 text-slate-500">{demo.salesperson}</td>
                            <td className="px-3 py-2.5">{demo.scheduled_at ? new Date(demo.scheduled_at).toLocaleDateString() : "–"}</td>
                            <td className="px-3 py-2.5">
                              <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                                {demo.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Followups Table */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <h3 className="text-base font-black text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-emerald-500" /> Outreach Follow-up Logs
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:bg-zinc-950">
                        <tr>
                          <th className="px-3 py-2.5">Contact</th>
                          <th className="px-3 py-2.5">Agent</th>
                          <th className="px-3 py-2.5">Date</th>
                          <th className="px-3 py-2.5">Summary</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                        {data.followup_logs.map(call => (
                          <tr key={call.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40">
                            <td className="px-3 py-2.5 font-mono">{call.phone_number}</td>
                            <td className="px-3 py-2.5 font-bold">{call.agent}</td>
                            <td className="px-3 py-2.5">{call.date ? new Date(call.date).toLocaleDateString() : "–"}</td>
                            <td className="px-3 py-2.5 text-slate-500 truncate max-w-[150px]">{call.summary || "–"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
