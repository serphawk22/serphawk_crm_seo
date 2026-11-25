"use client";
import { API_BASE_URL } from "@/config";
import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileSpreadsheet, Link as LinkIcon, CheckCircle, X, Loader2,
  AlertTriangle, ArrowRight, Download, ChevronRight, Table2, Sparkles,
  Users, Building2, UserCheck, Layers
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useSearchParams } from "next/navigation";

type ImportTarget = "leads" | "clients" | "contacts";
type FailureItem = { row: number; reason: string; data: Record<string, any> };
type ImportResult = { created: number; merged?: number; skipped: number; errors: string[]; failures?: FailureItem[] };

const SAMPLE_CSVS: Record<ImportTarget, string> = {
  contacts: `contact_name,phone,email,business_name,created,last_activity,tags,designation,Annual Budget,Preferred Contact Time
Sophia Davis,+1-555-0192,sophia@apexcorp.com,Apex Digital,2026-11-20,"Completed Product Demo","VIP, Inbound, High-Intent",VP of Engineering,$120000,Morning EST
Ethan Wright,+1-555-0847,ethan@globaltech.io,Global Tech,2026-11-22,"Sent Commercial Quote","Enterprise, Q4 Deal",Procurement Director,$350000,Afternoon PST
Maya Patel,+44-20-7946-0912,maya@innovatelabs.co.uk,Innovate Labs,2026-11-23,"Follow-up scheduled","Key Account, SaaS",Chief Technology Officer,$80000,GMT Flexible`,

  leads: `company_name,email,phone,website,industry,source,status,address,notes,Lead Score,Custom Region
Acme Corp,contact@acme.com,+1-555-0001,https://acme.com,Technology,LinkedIn,New,"123 Main St, San Francisco CA",High priority prospect,92,North America
Tech Startup Inc,hello@techstartup.io,+1-555-0002,https://techstartup.io,SaaS,Google Ads,Qualified,"456 Market St, Austin TX",Referred by partner,85,EMEA
Global Retail Co,info@globalretail.com,+44-20-1234-5678,https://globalretail.com,Retail,Meta Ads,Contacted,"London UK",Interested in multi-store POS,78,UK`,

  clients: `company_name,email,phone,website,industry,address,notes,Account Manager,Contract Type
Apex Enterprises,billing@apex.com,+1-555-4321,https://apex.com,Software,"456 Market St, Austin TX",Active enterprise client,Sarah Jenkins,Annual Enterprise
Starlight Media,contact@starlight.com,+1-555-8765,https://starlight.com,Media,"789 Sunset Blvd, Los Angeles CA",Retainer renewed for 2026,David Ross,Monthly Retainer`
};

export default function ImportPage() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const initialTarget = (searchParams?.get("target") === "clients" ? "clients" : searchParams?.get("target") === "contacts" ? "contacts" : "leads") as ImportTarget;
  const [target, setTarget] = useState<ImportTarget>(initialTarget);

  useEffect(() => {
    const tParam = searchParams?.get("target");
    if (tParam === "contacts" || tParam === "clients" || tParam === "leads") {
      setTarget(tParam as ImportTarget);
    }
  }, [searchParams]);

  const getAuthHeaders = (extra: Record<string, string> = {}) => {
    const token = typeof window !== "undefined" ? (localStorage.getItem("crm_token") || localStorage.getItem("token")) : null;
    const userStr = typeof window !== "undefined" ? (localStorage.getItem("crm_user") || localStorage.getItem("user")) : null;
    let uid = "";
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        if (u?.id) uid = String(u.id);
      } catch {}
    }
    return {
      ...extra,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(uid ? { "X-User-ID": uid } : {}),
    };
  };
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [googleSheetUrl, setGoogleSheetUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [mode, setMode] = useState<"file" | "google">("file");
  const [duplicateMode, setDuplicateMode] = useState<"merge" | "skip">("merge");
  const [leadSpaces, setLeadSpaces] = useState<{ id: number; name: string; is_default: boolean }[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/lead-spaces`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((spaces) => {
        if (Array.isArray(spaces)) {
          setLeadSpaces(spaces);
          const qSpace = searchParams?.get("space_id");
          if (qSpace && spaces.some((s: any) => String(s.id) === qSpace)) {
            setSelectedSpaceId(Number(qSpace));
          } else {
            const def = spaces.find((s: any) => s.is_default) || spaces[0];
            if (def) setSelectedSpaceId(def.id);
          }
        }
      })
      .catch(() => {});
  }, [searchParams]);
  const [importProgress, setImportProgress] = useState<{
    batch: number;
    totalBatches: number;
    processed: number;
    total: number;
    percent: number;
    created: number;
    merged: number;
    skipped: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseCSV = async (text: string): Promise<{ headers: string[]; rows: string[][] }> => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(text, { type: "string", raw: true });
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "", raw: false });
    if (!rows.length) throw new Error("The sheet is empty");
    return { headers: rows[0].map(String), rows: rows.slice(1).map(row => row.map(String)).filter(row => row.some(value => value.trim())) };
  };

  const handleFile = useCallback((f: File) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(e.target?.result, { type: /\.xlsx?$/i.test(f.name) ? "array" : "string", raw: true });
        const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "", raw: false });
        if (!rows.length) throw new Error("The file is empty");
        setPreview({ headers: rows[0].map(String), rows: rows.slice(1).map(row => row.map(String)).filter(row => row.some(value => value.trim())) });
        setStep("preview");
      } catch (error) { alert(error instanceof Error ? error.message : "Could not read import file"); }
    };
    if (/\.xlsx?$/i.test(f.name)) reader.readAsArrayBuffer(f); else reader.readAsText(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))) {
      handleFile(f);
    }
  }, [handleFile]);

  const handleGoogleSheet = async () => {
    if (!googleSheetUrl.trim()) return;
    let csvUrl = googleSheetUrl;
    const match = googleSheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
    }
    setImporting(true);
    try {
      const res = await fetch(csvUrl);
      if (res.ok) {
        const text = await res.text();
        const parsed = await parseCSV(text);
        setPreview(parsed);
        setStep("preview");
      } else {
        alert(t("import.google_fetch_error"));
      }
    } catch {
      alert(t("import.google_load_error"));
    } finally { setImporting(false); }
  };

  const handleImport = async () => {
    if (!preview || !preview.rows.length) return;
    setImporting(true);
    const BATCH_SIZE = 200;
    const totalRows = preview.rows.length;
    const totalBatches = Math.ceil(totalRows / BATCH_SIZE);

    let totalCreated = 0;
    let totalMerged = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];
    const allFailures: FailureItem[] = [];

    setImportProgress({
      batch: 1,
      totalBatches,
      processed: 0,
      total: totalRows,
      percent: 0,
      created: 0,
      merged: 0,
      skipped: 0
    });

    try {
      for (let b = 0; b < totalBatches; b++) {
        const batchRows = preview.rows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        const csvContent = [preview.headers, ...batchRows]
          .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(","))
          .join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv" });
        const formData = new FormData();
        formData.append("file", blob, `import_batch_${b + 1}.csv`);

        let res: Response | null = null;
        let lastErrMsg = "";
        let importUrl = `${API_BASE_URL}/import/${target}/csv?duplicate_mode=${duplicateMode}`;
        if (target === "leads" && selectedSpaceId) {
          importUrl += `&space_id=${selectedSpaceId}`;
        }
        try {
          res = await fetch(importUrl, {
            method: "POST",
            headers: getAuthHeaders(),
            body: formData
          });
        } catch (e: any) {
          lastErrMsg = e?.message || "Network error";
          allErrors.push(`Batch ${b + 1} (${batchRows.length} rows): ${lastErrMsg}`);
          totalSkipped += batchRows.length;
        }

        if (res && !res.ok) {
          const errData = await res.json().catch(() => ({}));
          lastErrMsg = typeof errData.detail === "string" ? errData.detail : `HTTP ${res.status}`;
          allErrors.push(`Batch ${b + 1} (${batchRows.length} rows): ${lastErrMsg}`);
          totalSkipped += batchRows.length;
        } else if (res && res.ok) {
          const data: ImportResult = await res.json();
          totalCreated += data.created || 0;
          totalMerged += data.merged || 0;
          totalSkipped += data.skipped || 0;
          if (data.errors?.length) allErrors.push(...data.errors);
          if (data.failures?.length) allFailures.push(...data.failures);
        }

        const processed = Math.min((b + 1) * BATCH_SIZE, totalRows);
        setImportProgress({
          batch: b + 1,
          totalBatches,
          processed,
          total: totalRows,
          percent: Math.round((processed / totalRows) * 100),
          created: totalCreated,
          merged: totalMerged,
          skipped: totalSkipped
        });
      }

      setResult({
        created: totalCreated,
        merged: totalMerged,
        skipped: totalSkipped,
        errors: allErrors,
        failures: allFailures
      });
      setStep("result");
    } catch (err: any) {
      alert("Could not complete the import. " + (err?.message || "Please try again."));
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const handleDownloadSample = () => {
    const sampleText = SAMPLE_CSVS[target] || SAMPLE_CSVS.leads;
    const blob = new Blob([sampleText], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `serphawk_${target}_sample.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadFailures = () => {
    if (!result?.failures?.length) return;
    const allHeaders = new Set<string>(["row", "reason"]);
    result.failures.forEach(f => Object.keys(f.data || {}).forEach(k => allHeaders.add(k)));
    const headerList = Array.from(allHeaders);
    const csvRows = [headerList.join(",")];
    result.failures.forEach(f => {
      const row = headerList.map(h => {
        let v = "";
        if (h === "row") v = String(f.row);
        else if (h === "reason") v = String(f.reason);
        else v = String(f.data?.[h] ?? "");
        return `"${v.replaceAll('"', '""')}"`;
      });
      csvRows.push(row.join(","));
    });
    const blob = new Blob([csvRows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${target}_import_failures.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setResult(null);
    setGoogleSheetUrl("");
  };

  const supportedColumns = target === "contacts" ? [
    { col: "contact_name / name", desc: "Full name (or first_name + last_name)" },
    { col: "phone / mobile", desc: "Primary phone or WhatsApp number" },
    { col: "email / email_address", desc: "Direct email address" },
    { col: "business_name / company", desc: "Associated company (auto-links to Lead/Client)" },
    { col: "created / created_at", desc: "Creation or onboarding date" },
    { col: "last_activity / activity", desc: "Latest interaction note or date" },
    { col: "tags / labels", desc: "Comma-separated tags (e.g. VIP, Inbound)" },
    { col: "designation / title", desc: "Job title or executive role" },
    { col: "notes / comments", desc: "Meeting notes, background, or comments" },
    { col: "+ Any Custom Fields", desc: "Any other column is auto-saved as a custom field!" }
  ] : target === "clients" ? [
    { col: "company_name / company", desc: "Client organization or business name" },
    { col: "email / email_address", desc: "Primary billing or contact email" },
    { col: "phone / mobile", desc: "Direct phone number" },
    { col: "website / url", desc: "Website domain" },
    { col: "industry / sector", desc: "Industry classification" },
    { col: "address / location", desc: "Office or postal address" },
    { col: "status", desc: "Account status (Active, Hold, Pending)" },
    { col: "notes / comments", desc: "Client account notes" },
    { col: "+ Any Custom Fields", desc: "Any other column is auto-saved as a custom field!" }
  ] : [
    { col: "company_name / company", desc: "Company or prospect name" },
    { col: "name / contact_name", desc: "Primary contact person name" },
    { col: "email / email_address", desc: "Lead email address" },
    { col: "phone / mobile", desc: "Lead mobile or phone number" },
    { col: "website / url", desc: "Company website URL" },
    { col: "industry / sector", desc: "Industry category" },
    { col: "source / lead_source", desc: "Discovery channel (Google Ads, Meta Ads, Web)" },
    { col: "status", desc: "Pipeline stage (New, Contacted, Qualified, etc.)" },
    { col: "notes / comments", desc: "Inquiry details or custom notes" },
    { col: "+ Any Custom Fields", desc: "Any other column is auto-saved as a custom field!" }
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-black p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Universal Data &amp; Custom Fields Importer</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Import Contacts, Leads, or Clients from CSV/Excel with automatic custom fields capture.</p>
            </div>
          </div>
          <button
            onClick={handleDownloadSample}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-500" />
            Download {target.charAt(0).toUpperCase() + target.slice(1)} Sample CSV
          </button>
        </div>

        {/* Custom Fields Auto-Capture Feature Notice */}
        <div className="p-3.5 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-blue-500/10 border border-indigo-500/20 rounded-2xl mb-6 flex items-start gap-3">
          <div className="p-1.5 rounded-lg bg-indigo-600 text-white shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider">
              Automatic Custom Fields Extraction Active
            </h4>
            <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
              Whatever columns exist in your CSV (e.g. <code>tags</code>, <code>last_activity</code>, <code>Annual Budget</code>, <code>Region</code>, <code>Custom ID</code>, etc.), SerpHawk CRM will automatically parse and preserve them into the record's custom fields without losing any data!
            </p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8">
          {["upload", "preview", "result"].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${step === s ? "bg-blue-600 text-white shadow-sm" : i < ["upload", "preview", "result"].indexOf(step) ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "bg-slate-100 dark:bg-slate-800 text-slate-400"}`}>
                {i < ["upload", "preview", "result"].indexOf(step) ? <CheckCircle className="w-3.5 h-3.5" /> : <span>{i + 1}</span>}
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </div>
              {i < 2 && <ChevronRight className="w-4 h-4 text-slate-300" />}
            </React.Fragment>
          ))}
        </div>

        {/* Target Entity Switcher: Contacts | Leads | Clients */}
        {step !== "result" && (
          <div className="flex items-center gap-3 mb-6 p-2 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 shadow-xs">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 px-2 uppercase tracking-wider">Import Record Type:</span>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { id: "contacts", label: "Contacts", icon: Users },
                { id: "leads", label: "Leads", icon: UserCheck },
                { id: "clients", label: "Clients", icon: Building2 },
              ].map(item => {
                const Icon = item.icon;
                const isSelected = target === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setTarget(item.id as ImportTarget)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                        : "bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Target Lead Pipeline Space Selector */}
        {step !== "result" && target === "leads" && leadSpaces.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Target Lead Pipeline Space</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Imported leads will route to this specific space and adopt its customized stages.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedSpaceId || ""}
                onChange={(e) => setSelectedSpaceId(Number(e.target.value))}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                {leadSpaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.is_default ? "(Default)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* STEP 1: Upload */}
        {step === "upload" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            {/* Mode Switch */}
            <div className="flex gap-2 mb-4">
              {(["file", "google"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${mode === m ? "bg-slate-900 dark:bg-white text-white dark:text-black" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}>
                  {m === "file" ? "Upload CSV / Excel File" : "Import from Google Sheets"}
                </button>
              ))}
            </div>

            {mode === "file" ? (
              <>
                {/* Drop Zone */}
                <div onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)} onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${dragging ? "border-blue-500 bg-blue-50 dark:bg-blue-900/10" : "border-slate-200 dark:border-slate-700 hover:border-blue-400 bg-white dark:bg-[#111]"}`}>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <FileSpreadsheet className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                    Drag &amp; Drop your {target.charAt(0).toUpperCase() + target.slice(1)} file here
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Supports .CSV, .XLSX, and .XLS files up to 10 MB.
                  </p>
                  <button className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-all cursor-pointer">
                    Browse Computer Files
                  </button>
                </div>

                {/* Column Mapping Guide */}
                <div className="mt-6 bg-white dark:bg-[#111] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs">
                  <h3 className="font-bold text-slate-800 dark:text-white text-sm mb-3 flex items-center gap-2">
                    <Table2 className="w-4 h-4 text-blue-500" /> Supported Columns for {target.charAt(0).toUpperCase() + target.slice(1)}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                    {supportedColumns.map(c => (
                      <div key={c.col} className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
                        <code className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 block truncate">{c.col}</code>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 truncate">{c.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white dark:bg-[#111] rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <span className="text-3xl">📊</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white text-center mb-2">Import from Google Sheets</h3>
                <p className="text-xs text-slate-500 text-center mb-6">
                  Paste a publicly shared Google Sheet link (Anyone with the link can view).
                </p>
                <div className="flex gap-2">
                  <input value={googleSheetUrl} onChange={e => setGoogleSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={handleGoogleSheet} disabled={importing || !googleSheetUrl.trim()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-all cursor-pointer">
                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Load Sheet
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* STEP 2: Preview */}
        {step === "preview" && preview && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">Data &amp; Custom Fields Preview</h2>
                <p className="text-xs text-slate-500">
                  Found {preview.rows.length} rows and {preview.headers.length} columns. Review your mapping below.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={reset} className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-all cursor-pointer">
                  Back
                </button>
                <button onClick={handleImport} disabled={importing}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md shadow-blue-500/20 cursor-pointer">
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Confirm &amp; Import {preview.rows.length} {target}
                </button>
              </div>
            </div>

            {target === "leads" && leadSpaces.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 rounded-2xl mb-4">
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                      Destination Pipeline Space: {leadSpaces.find((s) => s.id === selectedSpaceId)?.name || "Default Pipeline"}
                    </p>
                    <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
                      Imported leads will be placed into this space and default to its first stage if stage is omitted in the file.
                    </p>
                  </div>
                </div>
                <select
                  value={selectedSpaceId || ""}
                  onChange={(e) => setSelectedSpaceId(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-800 border border-indigo-200 dark:border-indigo-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  {leadSpaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.is_default ? "(Default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Duplicate Handling Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl mb-4">
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Duplicate Records Handling</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {target === "contacts"
                    ? "Duplicate handling strictly compares verified email and phone number. Records without matches are safely created as new contacts."
                    : "Choose what to do when a record with the same email, phone or name already exists."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDuplicateMode("merge")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${duplicateMode === "merge" ? "bg-indigo-600 text-white shadow-sm" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700"}`}
                >
                  Merge &amp; Update Existing
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateMode("skip")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${duplicateMode === "skip" ? "bg-indigo-600 text-white shadow-sm" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700"}`}
                >
                  Skip Duplicates
                </button>
              </div>
            </div>

            {/* Live Chunked Progress Bar */}
            {importProgress && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl mb-4 shadow-sm animate-pulse">
                <div className="flex justify-between items-center text-xs font-bold text-blue-900 dark:text-blue-200 mb-2">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    Importing in Batches: Batch {importProgress.batch} of {importProgress.totalBatches} ({importProgress.processed.toLocaleString()} of {importProgress.total.toLocaleString()} rows)
                  </span>
                  <span className="text-sm font-black text-blue-700 dark:text-blue-300">{importProgress.percent}%</span>
                </div>
                <div className="w-full h-3 bg-blue-200/60 dark:bg-blue-900/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{ width: `${importProgress.percent}%` }}
                  />
                </div>
                <div className="flex gap-4 mt-2.5 text-[11px] font-semibold">
                  <span className="text-emerald-700 dark:text-emerald-400">Created: {importProgress.created.toLocaleString()}</span>
                  <span className="text-blue-700 dark:text-blue-400">Merged: {importProgress.merged.toLocaleString()}</span>
                  <span className="text-amber-700 dark:text-amber-400">Skipped: {importProgress.skipped.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Table Preview */}
            <div className="bg-white dark:bg-[#111] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                    <tr>
                      <th className="px-3 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 w-8">#</th>
                      {preview.headers.map(h => (
                        <th key={h} className="px-4 py-3 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {preview.rows.slice(0, 20).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                        <td className="px-3 py-2.5 text-[11px] text-slate-400">{i + 1}</td>
                        {preview.headers.map((_, j) => (
                          <td key={j} className="px-4 py-2.5 text-slate-700 dark:text-slate-300 max-w-[200px] truncate">{row[j] || ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 20 && (
                <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                  Showing first 20 of {preview.rows.length} total rows.
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* STEP 3: Result */}
        {step === "result" && result && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-12">
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 ${result.created > 0 ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
              {result.created > 0 ? <CheckCircle className="w-10 h-10 text-emerald-600" /> : <AlertTriangle className="w-10 h-10 text-amber-600" />}
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
              {result.created > 0 ? "Import Completed Successfully" : "Import Completed"}
            </h2>
            <div className="flex flex-wrap justify-center items-center gap-8 mt-4 mb-6">
              <div className="text-center">
                <p className="text-3xl font-black text-emerald-600">{result.created}</p>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{target} Created</p>
              </div>
              {(result.merged ?? 0) > 0 && (
                <div className="text-center">
                  <p className="text-3xl font-black text-blue-600">{result.merged}</p>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Merged Duplicates</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-3xl font-black text-amber-600">{result.skipped}</p>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rows Skipped</p>
              </div>
              {(result.failures?.length || result.errors.length) > 0 && (
                <div className="text-center">
                  <p className="text-3xl font-black text-red-600">{result.failures?.length || result.errors.length}</p>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Errors</p>
                </div>
              )}
            </div>

            {/* Failure List Section & CSV Download */}
            {result.failures && result.failures.length > 0 && (
              <div className="w-full max-w-2xl bg-white dark:bg-[#111] border border-red-200 dark:border-red-900/60 rounded-2xl p-5 mb-6 text-left space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      Failed Rows ({result.failures.length})
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Review reasons for failed rows or download them to correct and re-import.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadFailures}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-950/60 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Failures CSV
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 font-bold text-slate-500">
                      <tr>
                        <th className="p-2 border-b border-slate-200 dark:border-slate-800 w-16">Row #</th>
                        <th className="p-2 border-b border-slate-200 dark:border-slate-800">Reason</th>
                        <th className="p-2 border-b border-slate-200 dark:border-slate-800">Record Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {result.failures.map((f, i) => (
                        <tr key={i} className="hover:bg-red-50/50 dark:hover:bg-red-950/20">
                          <td className="p-2 font-mono text-slate-500">{f.row}</td>
                          <td className="p-2 text-red-600 dark:text-red-400 font-medium">{f.reason}</td>
                          <td className="p-2 text-slate-700 dark:text-slate-300">{f.data?.name || f.data?.contact_name || f.data?.company_name || f.data?.email || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={reset}
                className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs hover:bg-slate-200 transition-all cursor-pointer">
                Import More Data
              </button>
              <a href={`/${target}`} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 transition-all flex items-center gap-2 cursor-pointer">
                View {target.charAt(0).toUpperCase() + target.slice(1)} Board <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
