"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  GraduationCap,
  CalendarCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserCheck,
  Building,
  TrendingUp,
  Award,
  Layers,
  ChevronRight,
  Receipt,
  PhoneCall
} from "lucide-react";
import { useRole } from "@/context/RoleContext";

interface StudentExecutiveOverviewProps {
  student: {
    id: number;
    name: string;
    email?: string | null;
    phone?: string | null;
    status: string;
    lead_id?: number | null;
    course_interest?: string | null;
    gpa?: number | null;
    education_level?: string | null;
    academic_background?: string | null;
  };
  enrollments: Array<{
    id: number;
    batch_id?: number;
    course_id?: number;
    batch_name?: string | null;
    course_title?: string | null;
    instructor_name?: string | null;
    total_fee: number;
    amount_paid: number;
    amount_due: number;
    payment_status: string;
    status: string;
    slip_number?: string | null;
    enrollment_date?: string;
    progress_percent?: number;
    attendance_rate?: number;
    session_count?: number;
  }>;
  tasks: Array<{
    id: number;
    title: string;
    status: string;
    priority: string;
    due_date?: string | null;
  }>;
  performance?: {
    course_progress_percent: number;
    attendance_rate: number;
  } | null;
  salesperson?: {
    id: number;
    name?: string | null;
    email: string;
  } | null;
  lead?: {
    id: number;
    source?: string | null;
    created_at?: string;
  } | null;
  onRecordPaymentClick?: () => void;
}

export default function StudentExecutiveOverview({
  student,
  enrollments,
  tasks,
  performance,
  salesperson,
  lead,
  onRecordPaymentClick,
}: StudentExecutiveOverviewProps) {
  const { role } = useRole();
  const isPrivileged = ["Admin", "SalesManager", "Employee", "SuperAdmin", "Sales", "Demo"].includes(role);

  // If not privileged role (e.g. student), don't show the executive sales/admin dashboard
  if (!isPrivileged) return null;

  // Aggregate financial metrics
  const totalFee = enrollments.reduce((sum, e) => sum + Number(e.total_fee || 0), 0);
  const amountPaid = enrollments.reduce((sum, e) => sum + Number(e.amount_paid || 0), 0);
  const amountDue = enrollments.reduce((sum, e) => sum + Number(e.amount_due || 0), 0);
  const paymentPct = totalFee > 0 ? Math.min(100, Math.round((amountPaid / totalFee) * 100)) : 100;

  // Aggregate task metrics
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "Done").length;
  const pendingTasks = totalTasks - completedTasks;
  const taskPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Academic / Attendance metrics
  const primaryEnrollment = enrollments[0];
  const attendanceRate = performance?.attendance_rate ?? primaryEnrollment?.attendance_rate ?? 0;
  const courseProgress = performance?.course_progress_percent ?? primaryEnrollment?.progress_percent ?? 0;

  // Overall Performance Score
  const performanceScore = Math.round((attendanceRate * 0.5) + (taskPct * 0.3) + (courseProgress * 0.2));

  // Pie / Donut chart helpers
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76
  const paidStroke = (paymentPct / 100) * circumference;
  const dueStroke = circumference - paidStroke;

  const attendanceRadius = 38;
  const attendanceCirc = 2 * Math.PI * attendanceRadius;
  const attendanceStroke = (attendanceRate / 100) * attendanceCirc;

  const taskRadius = 38;
  const taskCirc = 2 * Math.PI * taskRadius;
  const taskStroke = (taskPct / 100) * taskCirc;

  return (
    <div className="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <TrendingUp className="h-4 w-4" />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Executive Overview & Analytics
            </h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Sales & Admin View
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Consolidated financial tracking, attendance performance, and task execution for {student.name}.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {amountDue > 0 && onRecordPaymentClick && (
            <button
              type="button"
              onClick={onRecordPaymentClick}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <CreditCard className="h-4 w-4" />
              Record Payment
            </button>
          )}
          {salesperson && (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs">
              <UserCheck className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              <span className="text-[var(--text-secondary)]">Sales:</span>
              <span className="font-semibold text-[var(--text-primary)]">{salesperson.name || "Assigned"}</span>
            </div>
          )}
        </div>
      </div>

      {/* 4 Key Stat Cards with Rich Visual Graphs */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Fee & Payment Donut */}
        <div className="relative flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 shadow-sm transition hover:border-emerald-500/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Payment Health
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                amountDue === 0
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : amountPaid > 0
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
              }`}
            >
              {amountDue === 0 ? "Fully Paid" : amountPaid > 0 ? "Partial" : "Pending"}
            </span>
          </div>

          {/* Donut Chart */}
          <div className="my-3 flex items-center justify-center gap-4">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  className="stroke-slate-200 dark:stroke-zinc-800"
                  strokeWidth="10"
                  fill="transparent"
                />
                {/* Due Ring (Rose) */}
                {amountDue > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="stroke-rose-500"
                    strokeWidth="10"
                    strokeDasharray={`${circumference} ${circumference}`}
                    fill="transparent"
                  />
                )}
                {/* Paid Ring (Emerald) */}
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  className="stroke-emerald-600 transition-all duration-700"
                  strokeWidth="10"
                  strokeDasharray={`${paidStroke} ${circumference}`}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-sm font-extrabold text-[var(--text-primary)]">{paymentPct}%</span>
                <span className="text-[9px] font-medium text-[var(--text-secondary)]">Paid</span>
              </div>
            </div>

            <div className="flex flex-col space-y-1 text-xs">
              <div>
                <span className="text-[10px] text-[var(--text-secondary)]">Paid to Date</span>
                <p className="font-bold text-emerald-700 dark:text-emerald-400">
                  ₹{amountPaid.toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-secondary)]">Remaining Due</span>
                <p className={`font-bold ${amountDue > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-500"}`}>
                  ₹{amountDue.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-secondary)] flex justify-between">
            <span>Total Fee:</span>
            <span className="font-bold text-[var(--text-primary)]">₹{totalFee.toLocaleString()}</span>
          </div>
        </div>

        {/* Card 2: Attendance Gauge */}
        <div className="relative flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 shadow-sm transition hover:border-sky-500/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Attendance Rate
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                attendanceRate >= 80
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : attendanceRate >= 60
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
              }`}
            >
              {attendanceRate >= 80 ? "Regular" : attendanceRate >= 60 ? "Average" : "Low"}
            </span>
          </div>

          <div className="my-3 flex items-center justify-center gap-4">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r={attendanceRadius}
                  className="stroke-slate-200 dark:stroke-zinc-800"
                  strokeWidth="10"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={attendanceRadius}
                  className={`transition-all duration-700 ${
                    attendanceRate >= 80
                      ? "stroke-sky-600"
                      : attendanceRate >= 60
                      ? "stroke-amber-500"
                      : "stroke-rose-500"
                  }`}
                  strokeWidth="10"
                  strokeDasharray={`${attendanceStroke} ${attendanceCirc}`}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-sm font-extrabold text-[var(--text-primary)]">{attendanceRate}%</span>
                <span className="text-[9px] font-medium text-[var(--text-secondary)]">Present</span>
              </div>
            </div>

            <div className="flex flex-col space-y-1 text-xs">
              <div>
                <span className="text-[10px] text-[var(--text-secondary)]">Status Track</span>
                <p className="font-bold text-sky-700 dark:text-sky-400">
                  {attendanceRate >= 80 ? "On Track" : "Follow-up"}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-secondary)]">Class Record</span>
                <p className="font-semibold text-[var(--text-secondary)]">
                  {primaryEnrollment?.session_count ? `${primaryEnrollment.session_count} Classes` : "Live sessions"}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-secondary)] flex justify-between">
            <span>Discipline:</span>
            <span className="font-bold text-[var(--text-primary)]">
              {attendanceRate >= 80 ? "Consistent ✓" : "Needs Call"}
            </span>
          </div>
        </div>

        {/* Card 3: Tasks & Performance Donut */}
        <div className="relative flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 shadow-sm transition hover:border-violet-500/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Tasks & Projects
            </span>
            <span className="rounded bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
              {completedTasks}/{totalTasks} Done
            </span>
          </div>

          <div className="my-3 flex items-center justify-center gap-4">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r={taskRadius}
                  className="stroke-slate-200 dark:stroke-zinc-800"
                  strokeWidth="10"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={taskRadius}
                  className="stroke-violet-600 transition-all duration-700"
                  strokeWidth="10"
                  strokeDasharray={`${taskStroke} ${taskCirc}`}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-sm font-extrabold text-[var(--text-primary)]">{taskPct}%</span>
                <span className="text-[9px] font-medium text-[var(--text-secondary)]">Done</span>
              </div>
            </div>

            <div className="flex flex-col space-y-1 text-xs">
              <div>
                <span className="text-[10px] text-[var(--text-secondary)]">Completed</span>
                <p className="font-bold text-emerald-700 dark:text-emerald-400">
                  {completedTasks} Submissions
                </p>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-secondary)]">Pending</span>
                <p className="font-bold text-amber-600 dark:text-amber-400">
                  {pendingTasks} Tasks
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-secondary)] flex justify-between">
            <span>Execution:</span>
            <span className="font-bold text-[var(--text-primary)]">
              {totalTasks === 0 ? "No tasks assigned" : taskPct >= 80 ? "Excellent" : "In Progress"}
            </span>
          </div>
        </div>

        {/* Card 4: Course Progress & Overall Performance Score */}
        <div className="relative flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 shadow-sm transition hover:border-emerald-500/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Course Progress
            </span>
            <span className="rounded bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
              {courseProgress}% Syllabus
            </span>
          </div>

          <div className="my-3 space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1 font-medium">
                <span className="text-[var(--text-secondary)]">Syllabus Completion</span>
                <span className="font-bold text-[var(--text-primary)]">{courseProgress}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-600 to-emerald-500 transition-all duration-700"
                  style={{ width: `${courseProgress}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1 font-medium">
                <span className="text-[var(--text-secondary)]">Combined Score</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{performanceScore}/100</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-all duration-700"
                  style={{ width: `${performanceScore}%` }}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-secondary)] flex justify-between">
            <span>Overall Rating:</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400">
              {performanceScore >= 80 ? "Top Performer ⭐" : performanceScore >= 60 ? "On Track ✓" : "Needs Support"}
            </span>
          </div>
        </div>
      </div>

      {/* Course Details & Admissions Attribution Row */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Enrolled Course & Academic Information */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Enrolled Course & Batch Details</h3>
          </div>
          {primaryEnrollment ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                <span className="text-[var(--text-secondary)]">Course Title</span>
                <span className="font-bold text-sm text-[var(--text-primary)]">
                  {primaryEnrollment.course_title || "Course"}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                <span className="text-[var(--text-secondary)]">Batch Assignment</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {primaryEnrollment.batch_name || "Batch"}
                </span>
              </div>
              {primaryEnrollment.instructor_name && (
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--text-secondary)]">Assigned Instructor</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {primaryEnrollment.instructor_name}
                  </span>
                </div>
              )}
              {primaryEnrollment.slip_number && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Admission Slip #</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {primaryEnrollment.slip_number}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-secondary)]">No active course enrollments recorded.</p>
          )}
        </div>

        {/* Lead & Sales Attribution Card */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Sales & Lead Attribution</h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <span className="text-[var(--text-secondary)]">Assigned Salesperson</span>
              <span className="font-bold text-[var(--text-primary)]">
                {salesperson?.name || "Unassigned"}
              </span>
            </div>
            {lead && (
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                <span className="text-[var(--text-secondary)]">Source Lead</span>
                <Link
                  href={`/leads/${lead.id}`}
                  className="font-semibold text-sky-700 hover:underline dark:text-sky-400 flex items-center gap-1"
                >
                  Lead #{lead.id} {lead.source ? `(${lead.source})` : ""}
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            )}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <span className="text-[var(--text-secondary)]">Student Status</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400">{student.status}</span>
            </div>
            {student.academic_background && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">Academic Background</span>
                <span className="font-medium text-[var(--text-primary)] truncate max-w-[200px]">
                  {student.academic_background}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
