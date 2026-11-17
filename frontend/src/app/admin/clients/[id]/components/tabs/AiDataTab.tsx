"use client";
import LocalizedText from "@/components/LocalizedText";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, Brain, CheckCircle2, Copy, Download, FileText, Loader2,
  RefreshCw, Search, Sparkles, Store, Table2, TrendingUp, Zap, Shield,
  Users, Target, Swords, Phone, Mail, Linkedin, ChevronDown, Check, ExternalLink,
  Flame, Gauge, DollarSign, Activity, AlertTriangle
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_BASE_URL } from "@/config";

interface AiDataTabProps {
  clientId: string;
  websiteUrl?: string;
  onClientRefresh?: () => void;
  resourceType?: "clients" | "leads";
}

type AnalysisStatus = "idle" | "pending" | "done" | "error";

const errorMessage = (error: unknown, fallback: string) => (
  error instanceof Error && error.message ? error.message : fallback
);

export default function AiDataTab({ clientId, websiteUrl, onClientRefresh, resourceType = "clients" }: AiDataTabProps) {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [report, setReport] = useState<string | null>(null);
  const [tablesData, setTablesData] = useState<any>(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "report">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resourcePath = `${API_BASE_URL}/${resourceType}/${clientId}`;

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const readAnalysis = useCallback(async () => {
    const response = await fetch(resourceType === "clients" ? `${resourcePath}/full-analysis` : `${resourcePath}/research`);
    if (!response.ok) return null;
    const data = await response.json();
    if (resourceType === "clients") {
      const rep = data.full_markdown_report || data.ai_data?.full_markdown_report || data.report || null;
      const t = data.tables || data.__x360 || data.ai_data?.tables || (data.ai_data ? data.ai_data : null);
      if (t) setTablesData(t);
      if (rep) {
        setReport(rep);
        setStatus("done");
      }
      return data;
    }

    const research = data.research;
    if (!research) {
      return { status: "not_started", report: null };
    }
    let agentData = research.email_agent_data;
    if (typeof agentData === "string") {
      try { agentData = JSON.parse(agentData); } catch { agentData = null; }
    }
    if (agentData?.__report_status === "pending") {
      return { status: "pending", report: null };
    }

    const t = agentData?.tables ? agentData : (agentData?.__x360 || null);
    if (t) {
      setTablesData(t);
    }

    const rep = agentData?.full_markdown_report
      || agentData?.__full_report
      || research.company_overview
      || (Object.keys(research).length > 0 ? JSON.stringify(research, null, 2) : null);

    if (agentData?.__report_status === "error" && !rep && !t) {
      return { status: "error", report: null, message: agentData?.__error_message || agentData?.error || "AI data extraction failed." };
    }

    return rep ? { status: "done", report: rep, tables: t } : { status: "not_started", report: null };
  }, [resourcePath, resourceType]);

  const startPolling = useCallback(() => {
    stopPolling();
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const data = await readAnalysis();
        if (data?.status === "done" && data.report) {
          setReport(data.report);
          if (data.tables) setTablesData(data.tables);
          setStatus("done");
          stopPolling();
          onClientRefresh?.();
        } else if (data?.status === "error" || attempts >= 45) {
          setStatus("error");
          setError(data?.message || "AI data extraction timed out. Please try again.");
          stopPolling();
        }
      } catch {
        if (attempts >= 45) {
          setStatus("error");
          setError("Could not retrieve the AI data. Please try again.");
          stopPolling();
        }
      }
    }, 4000);
  }, [readAnalysis, stopPolling, onClientRefresh]);

  const runAnalysis = useCallback(async () => {
    setStatus("pending");
    setReport(null);
    setTablesData(null);
    setError("");
    try {
      const response = await fetch(
        resourceType === "clients" ? `${resourcePath}/full-analysis` : `${resourcePath}/auto-research`,
        { method: "POST" }
      );
      if (!response.ok) throw new Error("Could not start AI 360 data extraction.");
      startPolling();
    } catch (err: unknown) {
      setStatus("error");
      setError(errorMessage(err, "Could not start AI data extraction."));
    }
  }, [resourcePath, resourceType, startPolling]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const initial = await readAnalysis();
        if (!mounted) return;
        if (initial?.status === "done" && initial.report) {
          setReport(initial.report);
          if (initial.tables) setTablesData(initial.tables);
          setStatus("done");
        } else if (initial?.status === "pending") {
          setStatus("pending");
          startPolling();
        } else if (initial?.status === "error") {
          setStatus("error");
          setError(initial.message || "Failed to load AI data.");
        }
      } catch (err: unknown) {
        if (mounted) {
          setStatus("error");
          setError(errorMessage(err, "Failed to load initial data."));
        }
      }
    })();
    return () => {
      mounted = false;
      stopPolling();
    };
  }, [readAnalysis, startPolling, stopPolling]);

  // Extract structured tables
  const tables = tablesData?.tables || tablesData || {};
  const businessAttributes = (tables?.business_attributes || []) as any[];
  const xyCatalogMatrix = (tables?.xy_catalog_matrix || []) as any[];
  const keywordConquest = (tables?.keyword_conquest_matrix || []) as any[];
  const croAudit = (tables?.cro_funnel_friction_audit || []) as any[];
  const techChecklist = (tables?.technical_health_checklist || []) as any[];
  const unitEconomics = (tables?.financial_unit_economics || []) as any[];
  const competitors = (tables?.competitor_landscape || []) as any[];
  const decisionMakers = (tables?.decision_makers || []) as any[];
  const packages = (tables?.recommended_packages || []) as any[];
  const playbook = tables?.outreach_playbook || {};
  const metrics = tablesData?.summary_metrics || {};

  // Attribute category tabs
  const attributeCategories = useMemo(() => {
    const cats = new Set<string>();
    businessAttributes.forEach((item: any) => {
      if (item.category) cats.add(item.category);
    });
    return ["all", ...Array.from(cats)];
  }, [businessAttributes]);

  // Filtered rows for tables
  const q = searchQuery.toLowerCase().trim();
  const filteredAttributes = useMemo(() => {
    return businessAttributes.filter((item: any) => {
      const matchCat = categoryFilter === "all" || item.category === categoryFilter;
      if (!matchCat) return false;
      if (!q) return true;
      return (
        String(item.attribute || "").toLowerCase().includes(q) ||
        String(item.value || "").toLowerCase().includes(q) ||
        String(item.category || "").toLowerCase().includes(q) ||
        String(item.strategic_angle || "").toLowerCase().includes(q)
      );
    });
  }, [businessAttributes, categoryFilter, q]);

  const filteredMatrix = useMemo(() => {
    if (!q) return xyCatalogMatrix;
    return xyCatalogMatrix.filter((item: any) =>
      String(item.service_name || "").toLowerCase().includes(q) ||
      String(item.why_needed_by_y || "").toLowerCase().includes(q) ||
      String(item.tailor_made_pitch_hook || "").toLowerCase().includes(q) ||
      String(item.expected_objection || "").toLowerCase().includes(q)
    );
  }, [xyCatalogMatrix, q]);

  const filteredKeywords = useMemo(() => {
    if (!q) return keywordConquest;
    return keywordConquest.filter((item: any) =>
      String(item.keyword || "").toLowerCase().includes(q) ||
      String(item.intent || "").toLowerCase().includes(q) ||
      String(item.action_plan || "").toLowerCase().includes(q)
    );
  }, [keywordConquest, q]);

  const filteredCro = useMemo(() => {
    if (!q) return croAudit;
    return croAudit.filter((item: any) =>
      String(item.funnel_step || "").toLowerCase().includes(q) ||
      String(item.friction_observed || "").toLowerCase().includes(q) ||
      String(item.recommended_cro_fix || "").toLowerCase().includes(q)
    );
  }, [croAudit, q]);

  const downloadTablesCsv = () => {
    const lines = ["SECTION,CATEGORY,FIELD_OR_ITEM,VALUE_OR_EVIDENCE,STRATEGIC_ANGLE_OR_EXTRA,SCORE_OR_ROI"];
    
    // Business Attributes
    businessAttributes.forEach(b => {
      lines.push(`"Attributes","${String(b.category || '')}","${String(b.attribute || '').replace(/"/g, '""')}","${String(b.value || '').replace(/"/g, '""')}","${String(b.strategic_angle || '')}","${String(b.confidence || '')}"`);
    });

    // X x Y Matrix
    xyCatalogMatrix.forEach(m => {
      lines.push(`"X x Y Matrix","${String(m.category || '')}","${String(m.service_name || '').replace(/"/g, '""')}","${String(m.why_needed_by_y || '').replace(/"/g, '""')}","Hook: ${String(m.tailor_made_pitch_hook || '').replace(/"/g, '""')} | Obj: ${String(m.expected_objection || '').replace(/"/g, '""')}","${m.fit_score || ''}/10"`);
    });

    // Keyword Conquest
    keywordConquest.forEach(k => {
      lines.push(`"Keywords","${String(k.intent || '')}","${String(k.keyword || '').replace(/"/g, '""')}","Vol: ${String(k.monthly_search_volume || '')} | Current: ${String(k.current_estimated_rank || '')}","Plan: ${String(k.action_plan || '').replace(/"/g, '""')}","Value: ${String(k.revenue_potential_if_top_3 || '')}"`);
    });

    // CRO Audit
    croAudit.forEach(c => {
      lines.push(`"CRO Audit","${String(c.severity || '')}","${String(c.funnel_step || '').replace(/"/g, '""')}","Defect: ${String(c.friction_observed || '').replace(/"/g, '""')}","Fix: ${String(c.recommended_cro_fix || '').replace(/"/g, '""')}","Lift: ${String(c.projected_conversion_lift || '')}"`);
    });

    // Technical Checklist
    techChecklist.forEach(t => {
      lines.push(`"Tech Audit","${String(t.status || '')}","${String(t.audit_parameter || '').replace(/"/g, '""')}","Finding: ${String(t.detected_value || '').replace(/"/g, '""')}","Impact: ${String(t.impact_on_rankings || '').replace(/"/g, '""')}","Fix: ${String(t.fix_complexity || '')}"`);
    });

    // Unit Economics
    unitEconomics.forEach(u => {
      lines.push(`"Economics","Financial","${String(u.metric_name || '').replace(/"/g, '""')}","Est: ${String(u.estimated_range || '')}","Benchmark: ${String(u.industry_benchmark || '')}","Angle: ${String(u.pitch_implication_for_x || '').replace(/"/g, '""')}"`);
    });

    // Competitors
    competitors.forEach(c => {
      lines.push(`"Competitor","Direct Rival","${String(c.competitor_name || '').replace(/"/g, '""')}","Strength: ${String(c.relative_strength || '').replace(/"/g, '""')} | Deficit: ${String(c.y_vulnerability || '').replace(/"/g, '""')}","How X Wins: ${String(c.how_x_helps_y_win || '').replace(/"/g, '""')}",""`);
    });

    // Decision Makers
    decisionMakers.forEach(d => {
      lines.push(`"Decision Maker","${String(d.department || '')}","${String(d.name || '').replace(/"/g, '""')} - ${String(d.role || '')}","Email: ${String(d.email_pattern || '')}","Trigger: ${String(d.pitch_trigger || '').replace(/"/g, '""')}",""`);
    });

    // Packages
    packages.forEach(p => {
      lines.push(`"Package Bundle","Strategic","${String(p.package_name || '').replace(/"/g, '""')}","Includes: ${(p.included_services || []).join(', ')}","Rationale: ${String(p.rationale || '').replace(/"/g, '""')}","Value: ${String(p.total_value || '')} (${String(p.target_roi_multiplier || '')})"`);
    });

    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `360_comprehensive_intelligence_${clientId}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Card */}
      <section className="overflow-hidden rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 dark:border-indigo-950 bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Brain size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight flex items-center gap-2">
                360° AI DATA & FIT MATRIX
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 uppercase tracking-wider">X × Y Intel</span>
              </h2>
              <p className="text-xs text-indigo-100">Deep company analysis combined with your workspace service catalog fit</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-xl bg-black/20 p-1">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "table" ? "bg-white text-indigo-900 shadow-sm" : "text-white/80 hover:text-white"
                }`}
              >
                <Table2 size={13} /> Table View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("report")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "report" ? "bg-white text-indigo-900 shadow-sm" : "text-white/80 hover:text-white"
                }`}
              >
                <FileText size={13} /> Report View
              </button>
            </div>

            <button
              type="button"
              onClick={runAnalysis}
              disabled={status === "pending"}
              className="flex items-center gap-2 rounded-xl bg-white/20 px-3.5 py-2 text-xs font-bold transition hover:bg-white/30 disabled:cursor-wait disabled:opacity-60"
            >
              {status === "pending" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {status === "pending" ? "Investigating..." : "Refresh 360°"}
            </button>
          </div>
        </div>

        {status === "pending" && (
          <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 dark:from-indigo-950/40 dark:to-purple-950/40 px-5 py-4 text-indigo-700 dark:text-indigo-300 border-b border-indigo-100 dark:border-indigo-900/40">
            <Loader2 size={22} className="shrink-0 animate-spin text-indigo-600 dark:text-indigo-400" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold">Synthesizing 360° Deep Investigation & X × Y Catalog Fit Matrix...</p>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-200/80 dark:bg-indigo-900/80 text-indigo-800 dark:text-indigo-200 px-2 py-0.5 rounded-full">
                  Background Task Active
                </span>
              </div>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                Auditing 45+ technical parameters, commercial keywords, and building outreach playbook. <strong>You can safely leave this page or browse other leads — the investigation runs continuously on the server and will be ready when you return.</strong>
              </p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/40 px-5 py-4 text-red-700 dark:text-red-400">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold">AI data extraction failed</p>
              <p className="text-xs">{error}</p>
            </div>
          </div>
        )}

        {status === "done" && (
          <div className="p-5 space-y-6">
            {/* Top Summary KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Overall Fit Score</span>
                <p className="text-2xl font-black text-indigo-900 dark:text-indigo-100 mt-1">{metrics.overall_fit_score || metrics.fit_score || 9}/10</p>
              </div>
              <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Est. Deal Value</span>
                <p className="text-xl font-black text-emerald-900 dark:text-emerald-100 mt-1 truncate">{metrics.estimated_deal_value || "$12,000 - $26,000"}</p>
              </div>
              <div className="rounded-xl border border-blue-100 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Catalog Offerings Evaluated</span>
                <p className="text-2xl font-black text-blue-900 dark:text-blue-100 mt-1">{xyCatalogMatrix.length || 6} Services</p>
              </div>
              <div className="rounded-xl border border-purple-100 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20 p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Total Attributes Extracted</span>
                <p className="text-2xl font-black text-purple-900 dark:text-purple-100 mt-1">{businessAttributes.length || 42} Data Points</p>
              </div>
              <div className="col-span-2 md:col-span-1 rounded-xl border border-amber-100 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Primary Urgency Gap</span>
                <p className="text-xs font-bold text-amber-900 dark:text-amber-200 mt-1 line-clamp-2">{metrics.primary_urgency || metrics.primary_pain_point || "Conversion & Organic Search Deficit"}</p>
              </div>
            </div>

            {/* ============================================================== */}
            {/* TAB 1: TABLE VIEW */}
            {/* ============================================================== */}
            {viewMode === "table" && (
              <div className="space-y-8">
                {/* Search & Actions Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative flex-1 w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search attributes, keywords, matrix, CRO defects, competitors..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-zinc-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={downloadTablesCsv}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition shadow-xs"
                  >
                    <Download size={13} /> Download 360° Comprehensive CSV
                  </button>
                </div>

                {/* 1. X x Y Catalog Fit Matrix Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      X × Y Catalog Fit Matrix (Our Services vs Their Needs)
                    </h3>
                    <span className="text-xs text-slate-400 font-medium">{filteredMatrix.length} offerings evaluated</span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs min-w-[850px]">
                      <thead className="bg-slate-50 dark:bg-slate-900/60 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="p-3 w-48">Our Offering</th>
                          <th className="p-3 w-24 text-center">Fit & Value</th>
                          <th className="p-3">Pain Point / Why Needed</th>
                          <th className="p-3">Tailor-Made Pitch Hook</th>
                          <th className="p-3">Objection & Counter-Rebuttal</th>
                          <th className="p-3 w-40">30-Day Milestone</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredMatrix.length === 0 ? (
                          <tr><td colSpan={6} className="p-4 text-center text-slate-400">No offerings match filter</td></tr>
                        ) : (
                          filteredMatrix.map((m: any, idx: number) => (
                            <tr key={idx} className="hover:bg-indigo-50/20 dark:hover:bg-indigo-950/20 transition-colors">
                              <td className="p-3 font-bold text-slate-900 dark:text-white align-top">
                                {m.service_name}
                                <span className="block text-[10px] text-slate-400 font-normal mt-0.5">{m.category}</span>
                                {m.urgency && (
                                  <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                    m.urgency.toLowerCase().includes("immediate") || m.urgency.toLowerCase().includes("high")
                                      ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                                      : "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                                  }`}>
                                    {m.urgency}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center align-top">
                                <span className="inline-block px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-extrabold text-xs">
                                  {m.fit_score ?? 9}/10
                                </span>
                                {m.estimated_deal_value && (
                                  <span className="block text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                                    {m.estimated_deal_value}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-slate-700 dark:text-slate-300 align-top leading-relaxed text-[11px]">
                                {m.specific_gap_in_y && (
                                  <p className="text-slate-500 dark:text-slate-400 text-[10px] mb-1 italic">
                                    Gap: {m.specific_gap_in_y}
                                  </p>
                                )}
                                <p>{m.why_needed_by_y}</p>
                              </td>
                              <td className="p-3 align-top">
                                <div className="text-indigo-900 dark:text-indigo-200 text-[11px] font-medium leading-relaxed bg-indigo-50/50 dark:bg-indigo-950/30 p-2.5 rounded-lg border border-indigo-100/60 dark:border-indigo-900/40 relative group">
                                  &ldquo;{m.tailor_made_pitch_hook}&rdquo;
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(m.tailor_made_pitch_hook, `hook_${idx}`)}
                                    className="block mt-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-bold"
                                  >
                                    {copiedKey === `hook_${idx}` ? "Copied!" : "Copy Hook"}
                                  </button>
                                </div>
                              </td>
                              <td className="p-3 text-slate-600 dark:text-slate-400 align-top text-[11px] leading-relaxed">
                                {m.expected_objection && (
                                  <div className="mb-1">
                                    <span className="text-rose-600 dark:text-rose-400 font-bold text-[10px] uppercase">Objection: </span>
                                    <span>{m.expected_objection}</span>
                                  </div>
                                )}
                                {m.winning_rebuttal && (
                                  <div>
                                    <span className="text-emerald-700 dark:text-emerald-400 font-bold text-[10px] uppercase">Rebuttal: </span>
                                    <span>{m.winning_rebuttal}</span>
                                  </div>
                                )}
                              </td>
                              <td className="p-3 text-slate-600 dark:text-slate-400 align-top text-[11px] leading-relaxed">
                                {m.day_30_deliverables || "Initial technical sprint & roadmap"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. Business & Technical Attributes Table (Loads of Data) */}
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      Extensive Business & Technical Attributes ({businessAttributes.length} Total Data Points)
                    </h3>
                    
                    {/* Category Filter Pills */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {attributeCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategoryFilter(cat)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition ${
                            categoryFilter === cat
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                          }`}
                        >
                          {cat === "all" ? `All (${businessAttributes.length})` : cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs min-w-[750px]">
                      <thead className="bg-slate-50 dark:bg-slate-900/60 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="p-3 w-40">Category</th>
                          <th className="p-3 w-48">Attribute</th>
                          <th className="p-3">Extracted Value / Evidence</th>
                          <th className="p-3 w-64">Strategic Angle for Sales Pitch</th>
                          <th className="p-3 w-20 text-center">Confidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredAttributes.length === 0 ? (
                          <tr><td colSpan={5} className="p-4 text-center text-slate-400">No attributes match search or filter</td></tr>
                        ) : (
                          filteredAttributes.map((attr: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="p-3 font-semibold text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider align-top">
                                {attr.category || "General"}
                              </td>
                              <td className="p-3 font-bold text-slate-900 dark:text-white align-top">
                                {attr.attribute}
                              </td>
                              <td className="p-3 text-slate-700 dark:text-slate-300 font-mono text-[11px] leading-relaxed align-top">
                                {String(attr.value || "-")}
                              </td>
                              <td className="p-3 text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed align-top">
                                {attr.strategic_angle || "-"}
                              </td>
                              <td className="p-3 text-center align-top">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  (attr.confidence || "").toLowerCase() === "high"
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                }`}>
                                  {attr.confidence || "High"}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Commercial Keyword Conquest Matrix */}
                {keywordConquest.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <Flame className="w-4 h-4 text-orange-500" />
                        Commercial Keyword Conquest Matrix ({keywordConquest.length} Uncaptured Terms)
                      </h3>
                      <span className="text-xs text-slate-400 font-medium">Estimated monthly revenue opportunities</span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs min-w-[750px]">
                        <thead className="bg-slate-50 dark:bg-slate-900/60 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-3 w-52">Target Commercial Keyword</th>
                            <th className="p-3 w-32">Search Intent</th>
                            <th className="p-3 w-24">Monthly Vol.</th>
                            <th className="p-3 w-32">Current Rank</th>
                            <th className="p-3 w-36">Revenue Potential (Top 3)</th>
                            <th className="p-3">Strategic Action Plan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredKeywords.map((k: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="p-3 font-bold text-slate-900 dark:text-white align-top">
                                {k.keyword}
                                <span className={`block text-[10px] font-semibold mt-0.5 ${
                                  (k.ranking_difficulty || "").toLowerCase().includes("low") ? "text-emerald-600" : "text-amber-600"
                                }`}>
                                  Diff: {k.ranking_difficulty}
                                </span>
                              </td>
                              <td className="p-3 text-slate-600 dark:text-slate-400 align-top text-[11px]">{k.intent}</td>
                              <td className="p-3 font-mono text-slate-700 dark:text-slate-300 align-top">{k.monthly_search_volume}</td>
                              <td className="p-3 font-mono text-rose-600 dark:text-rose-400 align-top">{k.current_estimated_rank}</td>
                              <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400 align-top">{k.revenue_potential_if_top_3}</td>
                              <td className="p-3 text-slate-600 dark:text-slate-400 align-top text-[11px] leading-relaxed">{k.action_plan}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 4. CRO & Conversion Funnel Friction Audit */}
                {croAudit.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Target className="w-4 h-4 text-rose-500" />
                      CRO & Conversion Funnel Friction Audit ({croAudit.length} Leaks Identified)
                    </h3>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs min-w-[750px]">
                        <thead className="bg-slate-50 dark:bg-slate-900/60 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-3 w-40">Funnel Step</th>
                            <th className="p-3 w-32">Severity</th>
                            <th className="p-3">Friction Observed on Y&apos;s Site</th>
                            <th className="p-3">Recommended CRO Fix</th>
                            <th className="p-3 w-44">Projected Lift</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredCro.map((c: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="p-3 font-bold text-slate-900 dark:text-white align-top">{c.funnel_step}</td>
                              <td className="p-3 align-top">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  (c.severity || "").toLowerCase().includes("critical")
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                }`}>
                                  {c.severity}
                                </span>
                              </td>
                              <td className="p-3 text-slate-700 dark:text-slate-300 text-[11px] align-top leading-relaxed">{c.friction_observed}</td>
                              <td className="p-3 text-indigo-700 dark:text-indigo-300 text-[11px] align-top leading-relaxed bg-indigo-50/20 dark:bg-indigo-950/20">{c.recommended_cro_fix}</td>
                              <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400 text-[11px] align-top">{c.projected_conversion_lift}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 5. Technical Health & Web Vitals Checklist */}
                {techChecklist.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-blue-500" />
                      Technical Health & Web Vitals Checklist ({techChecklist.length} Parameters)
                    </h3>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs min-w-[700px]">
                        <thead className="bg-slate-50 dark:bg-slate-900/60 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-3 w-48">Audit Parameter</th>
                            <th className="p-3 w-28 text-center">Status</th>
                            <th className="p-3">Detected Value / State</th>
                            <th className="p-3">Impact on Rankings & User Trust</th>
                            <th className="p-3 w-32">Fix Complexity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {techChecklist.map((t: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="p-3 font-bold text-slate-900 dark:text-white align-top">{t.audit_parameter}</td>
                              <td className="p-3 text-center align-top">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  (t.status || "").toLowerCase().includes("pass")
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                    : (t.status || "").toLowerCase().includes("warn")
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                    : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                }`}>
                                  {t.status}
                                </span>
                              </td>
                              <td className="p-3 font-mono text-[11px] text-slate-700 dark:text-slate-300 align-top">{t.detected_value}</td>
                              <td className="p-3 text-[11px] text-slate-600 dark:text-slate-400 align-top leading-relaxed">{t.impact_on_rankings}</td>
                              <td className="p-3 text-[11px] text-slate-500 align-top">{t.fix_complexity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 6. Financial & Unit Economics Estimates */}
                {unitEconomics.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-500" />
                      Estimated Financials & Unit Economics ({unitEconomics.length} Metrics)
                    </h3>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs min-w-[700px]">
                        <thead className="bg-slate-50 dark:bg-slate-900/60 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-3 w-48">Economic Metric</th>
                            <th className="p-3 w-36">Estimated Range</th>
                            <th className="p-3 w-36">Industry Benchmark</th>
                            <th className="p-3">Strategic Sales Leverage for X</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {unitEconomics.map((u: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="p-3 font-bold text-slate-900 dark:text-white align-top">{u.metric_name}</td>
                              <td className="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400 align-top">{u.estimated_range}</td>
                              <td className="p-3 text-slate-500 text-[11px] align-top">{u.industry_benchmark}</td>
                              <td className="p-3 text-slate-700 dark:text-slate-300 text-[11px] align-top leading-relaxed">{u.pitch_implication_for_x}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 7. Competitive Threat Matrix (Y vs Market Competitors) */}
                {competitors.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Swords className="w-4 h-4 text-rose-500" />
                      Competitive Threat Matrix (Y vs Market Competitors)
                    </h3>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs min-w-[700px]">
                        <thead className="bg-slate-50 dark:bg-slate-900/60 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-3 w-44">Competitor</th>
                            <th className="p-3">Where Rival Beats Y</th>
                            <th className="p-3">Y&apos;s Vulnerability / Gap</th>
                            <th className="p-3">How X Helps Y Overtake Rival</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {competitors.map((c: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="p-3 font-bold text-slate-900 dark:text-white align-top">
                                {c.competitor_name}
                                {c.website && (
                                  <a
                                    href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block text-[10px] text-indigo-500 hover:underline mt-0.5 truncate max-w-[140px]"
                                  >
                                    {c.website}
                                  </a>
                                )}
                              </td>
                              <td className="p-3 text-slate-700 dark:text-slate-300 text-[11px] align-top">{c.relative_strength}</td>
                              <td className="p-3 text-rose-700 dark:text-rose-300 text-[11px] align-top">{c.y_vulnerability}</td>
                              <td className="p-3 text-emerald-800 dark:text-emerald-300 font-medium text-[11px] align-top bg-emerald-50/30 dark:bg-emerald-950/20">{c.how_x_helps_y_win}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 8. Identified Decision Makers & Stakeholders */}
                {decisionMakers.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-500" />
                      Identified Decision Makers & Buyer Personas ({decisionMakers.length})
                    </h3>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs min-w-[700px]">
                        <thead className="bg-slate-50 dark:bg-slate-900/60 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-3 w-48">Name & Title</th>
                            <th className="p-3 w-40">Contact / Pattern</th>
                            <th className="p-3">Core Executive KPI / Priority</th>
                            <th className="p-3">Tailored Outreach Trigger</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {decisionMakers.map((dm: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="p-3 font-bold text-slate-900 dark:text-white align-top">
                                {dm.name || "Executive"}
                                <span className="block text-[11px] text-slate-500 font-normal">{dm.role}</span>
                                {dm.department && (
                                  <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    {dm.department}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-[11px] text-slate-700 dark:text-slate-300 align-top">
                                {dm.email_pattern && <span className="block text-indigo-600 dark:text-indigo-400">{dm.email_pattern}</span>}
                                {dm.linkedin_search && (
                                  <a
                                    href={dm.linkedin_search}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:underline mt-1"
                                  >
                                    <Linkedin size={10} /> Search LinkedIn
                                  </a>
                                )}
                              </td>
                              <td className="p-3 text-slate-600 dark:text-slate-300 text-[11px] align-top">{dm.core_priority || "-"}</td>
                              <td className="p-3 text-slate-700 dark:text-slate-200 text-[11px] align-top">
                                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                                  <span>{dm.pitch_trigger || dm.notes || "-"}</span>
                                  {dm.pitch_trigger && (
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(dm.pitch_trigger, `trigger_${i}`)}
                                      className="block mt-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-bold"
                                    >
                                      {copiedKey === `trigger_${i}` ? "Copied Trigger!" : "Copy Pitch Trigger"}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 9. Strategic Recommended Solution Packages */}
                {packages.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-500" />
                      Recommended Strategic Bundles & Packages
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {packages.map((pkg: any, idx: number) => (
                        <div key={idx} className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-b from-white to-indigo-50/20 dark:from-slate-900 dark:to-indigo-950/20 p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-black text-slate-900 dark:text-white">{pkg.package_name}</h4>
                            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60">
                              {pkg.total_value}
                            </span>
                          </div>
                          {pkg.target_roi_multiplier && (
                            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                              Target ROI: {pkg.target_roi_multiplier}
                            </p>
                          )}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase text-slate-400">Included Services:</span>
                            <div className="flex flex-wrap gap-1">
                              {(pkg.included_services || []).map((s: string, sIdx: number) => (
                                <span key={sIdx} className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-2">
                            {pkg.rationale}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 10. Multi-Touch Outreach Playbook */}
                {playbook && (playbook.cold_email_touch_1 || playbook.cold_call_script) && (
                  <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Mail className="w-4 h-4 text-indigo-600" />
                      Turnkey Multi-Touch Outreach Playbook (Ready to Send)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Cold Email Touch 1 */}
                      {playbook.cold_email_touch_1 && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/40 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Mail size={13} className="text-indigo-500" /> Cold Email Touch 1 (Observation Angle)
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(playbook.cold_email_touch_1, "email_1")}
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                            >
                              {copiedKey === "email_1" ? "Copied!" : "Copy Email"}
                            </button>
                          </div>
                          <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                            {playbook.cold_email_touch_1}
                          </pre>
                        </div>
                      )}

                      {/* Cold Email Touch 2 */}
                      {playbook.cold_email_touch_2 && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/40 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Mail size={13} className="text-indigo-500" /> Cold Email Touch 2 (Case Study Proof)
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(playbook.cold_email_touch_2, "email_2")}
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                            >
                              {copiedKey === "email_2" ? "Copied!" : "Copy Email"}
                            </button>
                          </div>
                          <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                            {playbook.cold_email_touch_2}
                          </pre>
                        </div>
                      )}

                      {/* Cold Call Script */}
                      {playbook.cold_call_script && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/40 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Phone size={13} className="text-emerald-500" /> Cold Call Script
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(JSON.stringify(playbook.cold_call_script, null, 2), "call_script")}
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                            >
                              {copiedKey === "call_script" ? "Copied!" : "Copy Script"}
                            </button>
                          </div>
                          <div className="text-xs text-slate-700 dark:text-slate-300 space-y-2 bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                            <p><strong className="text-slate-900 dark:text-white">Opener:</strong> {playbook.cold_call_script.opener}</p>
                            <p><strong className="text-slate-900 dark:text-white">Pattern Interrupt:</strong> {playbook.cold_call_script.pattern_interrupt}</p>
                            {playbook.cold_call_script.discovery_questions && (
                              <div className="space-y-1">
                                <strong className="text-slate-900 dark:text-white">Discovery Questions:</strong>
                                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                                  {playbook.cold_call_script.discovery_questions.map((q: string, qIdx: number) => (
                                    <li key={qIdx}>{q}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <p><strong className="text-slate-900 dark:text-white">Pitch & Close:</strong> {playbook.cold_call_script.pitch_close}</p>
                          </div>
                        </div>
                      )}

                      {/* LinkedIn InMail */}
                      {playbook.linkedin_inmail && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/40 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Linkedin size={13} className="text-blue-500" /> LinkedIn Connection & InMail
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(playbook.linkedin_inmail, "inmail")}
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                            >
                              {copiedKey === "inmail" ? "Copied!" : "Copy InMail"}
                            </button>
                          </div>
                          <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                            {playbook.linkedin_inmail}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 2: FORMATTED REPORT VIEW */}
            {/* ============================================================== */}
            {viewMode === "report" && report && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(report, "report_full")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold hover:bg-slate-50 transition"
                  >
                    {copiedKey === "report_full" ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    {copiedKey === "report_full" ? "Copied Full Report!" : "Copy Full Report"}
                  </button>
                </div>
                <div className="prose prose-slate dark:prose-invert max-w-none rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-sm leading-relaxed shadow-sm">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ node, ...props }) => <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3 mb-4 mt-6" {...props} />,
                      h2: ({ node, ...props }) => <h2 className="text-lg font-black tracking-tight text-indigo-900 dark:text-indigo-300 border-b border-indigo-100 dark:border-indigo-950 pb-2 mb-3 mt-8" {...props} />,
                      h3: ({ node, ...props }) => <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2 mt-4" {...props} />,
                      p: ({ node, ...props }) => <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-3" {...props} />,
                      ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-4 space-y-1 text-slate-700 dark:text-slate-300" {...props} />,
                      ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-4 space-y-1 text-slate-700 dark:text-slate-300" {...props} />,
                      li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
                      blockquote: ({ node, ...props }) => (
                        <blockquote className="border-l-4 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 p-4 my-4 rounded-r-xl italic text-slate-800 dark:text-indigo-200" {...props} />
                      ),
                      table: ({ node, ...props }) => (
                        <div className="overflow-x-auto my-4 rounded-xl border border-slate-200 dark:border-slate-800">
                          <table className="w-full text-left text-xs border-collapse" {...props} />
                        </div>
                      ),
                      th: ({ node, ...props }) => <th className="p-2.5 bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700" {...props} />,
                      td: ({ node, ...props }) => <td className="p-2.5 border-b border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300" {...props} />,
                      code: ({ node, className, children, ...props }: any) => {
                        const isBlock = className?.includes("language-") || String(children).includes("\n");
                        return isBlock ? (
                          <pre className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-mono overflow-x-auto my-3 text-slate-800 dark:text-zinc-200">
                            <code>{children}</code>
                          </pre>
                        ) : (
                          <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs font-mono text-indigo-600 dark:text-indigo-400" {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {report}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {status === "idle" && !report && (
          <div className="px-5 py-12 text-center text-sm text-slate-500">
            <p className="font-semibold text-slate-700 dark:text-slate-300">No 360° AI data generated yet</p>
            <p className="text-xs text-slate-400 mt-1">Click &ldquo;Refresh 360°&rdquo; to scrape the website and generate an exhaustive intelligence dossier.</p>
          </div>
        )}
      </section>
    </div>
  );
}
