"use client";

import React, { useState } from "react";
import {
  GitCommit,
  Clock,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  Users,
  AlertCircle,
  Filter,
  RefreshCw,
  Sparkles
} from "lucide-react";

export interface PipelineStageMetric {
  stage: string;
  count: number;
  avgDurationDays: number;
  percentage: number;
  color: string;
}

interface PipelineWorkflowFlowchartProps {
  entityType?: "leads" | "clients";
  stages: string[];
  counts: Record<string, number>;
  selectedStage?: string;
  onSelectStage: (stage: string) => void;
  className?: string;
}

const STAGE_COLORS: Record<string, { bg: string; text: string; border: string; ring: string }> = {
  New: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800", ring: "ring-blue-500" },
  Contacted: { bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-300", border: "border-sky-200 dark:border-sky-800", ring: "ring-sky-500" },
  Qualified: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800", ring: "ring-amber-500" },
  "Proposal Sent": { bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800", ring: "ring-orange-500" },
  Negotiation: { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200 dark:border-indigo-800", ring: "ring-indigo-500" },
  Converted: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800", ring: "ring-emerald-500" },
  Won: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800", ring: "ring-emerald-500" },
  Lost: { bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300", border: "border-rose-200 dark:border-rose-800", ring: "ring-rose-500" },
  Active: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800", ring: "ring-emerald-500" },
  Pending: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800", ring: "ring-amber-500" },
  Hold: { bg: "bg-zinc-50 dark:bg-zinc-900/60", text: "text-zinc-700 dark:text-zinc-300", border: "border-zinc-200 dark:border-zinc-800", ring: "ring-zinc-500" }
};

// Realistic average cycle times (in days) per stage
const DEFAULT_STAGE_DURATIONS: Record<string, number> = {
  New: 1.4,
  Contacted: 2.8,
  Qualified: 4.5,
  "Proposal Sent": 3.2,
  Negotiation: 5.1,
  Converted: 12.0,
  Won: 14.2,
  Lost: 6.8,
  Active: 45.0,
  Pending: 3.5,
  Hold: 18.0
};

export default function PipelineWorkflowFlowchart({
  entityType = "leads",
  stages,
  counts,
  selectedStage = "All",
  onSelectStage,
  className = ""
}: PipelineWorkflowFlowchartProps) {
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className={`w-full bg-white dark:bg-[#111111] rounded-2xl border border-slate-200/80 dark:border-[#222222] p-4 sm:p-5 shadow-xs mb-4 ${className}`}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <GitCommit className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <span>{entityType === "leads" ? "Lead Conversion Pipeline Flow" : "Client Lifecycle Flow"}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                {totalCount} Total
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Interactive stage sequence: Click any stage card to filter all {entityType} at that stage.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectStage("All")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              selectedStage === "All"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"
            }`}
          >
            <Filter className="w-3 h-3" />
            <span>Show All ({totalCount})</span>
          </button>
        </div>
      </div>

      {/* Visual Pipeline Flowchart Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {stages.map((stage, idx) => {
          const count = counts[stage] || 0;
          const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
          const avgDays = DEFAULT_STAGE_DURATIONS[stage] || 2.5;
          const styling = STAGE_COLORS[stage] || STAGE_COLORS.New;
          const isSelected = selectedStage === stage;

          return (
            <div
              key={stage}
              onClick={() => onSelectStage(isSelected ? "All" : stage)}
              className={`relative rounded-xl border p-2.5 transition-all cursor-pointer group flex flex-col justify-between ${
                styling.bg
              } ${styling.border} ${
                isSelected
                  ? `ring-2 ${styling.ring} shadow-md scale-[1.02] border-transparent`
                  : "hover:scale-[1.01] hover:shadow-xs"
              }`}
            >
              {/* Stage Step Indicator & Connector */}
              <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-[9px] text-slate-600 dark:text-zinc-300 font-black">
                    {idx + 1}
                  </span>
                  <span className="truncate max-w-[85px]">{stage}</span>
                </span>
                {idx < stages.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-slate-300 dark:text-zinc-600 hidden lg:block" />
                )}
              </div>

              {/* Stage Count & Share */}
              <div className="my-1 flex items-baseline justify-between">
                <span className={`text-xl font-black ${styling.text}`}>
                  {count}
                </span>
                <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                  {pct}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-200/80 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden my-1">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(5, pct)}%` }}
                />
              </div>

              {/* Average duration badge */}
              <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 border-t border-slate-200/50 dark:border-zinc-800/60 mt-1">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>Avg:</span>
                </span>
                <span className="font-semibold text-slate-700 dark:text-zinc-300">
                  {avgDays}d
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

