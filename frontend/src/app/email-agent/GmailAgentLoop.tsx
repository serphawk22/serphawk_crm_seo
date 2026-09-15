"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Play, FileText, Trash2, StopCircle, Globe,
  CheckCircle, XCircle, Clock, AlertCircle, Sparkles, Loader2
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import * as xlsx from "xlsx";
import { API_BASE_URL } from "@/config";
import { ResultCard, ResearchResultData, SendEmailResult } from "@/components/email-agent/ResultCard";

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface URLTask {
  id: string;
  url: string;
  status: "pending" | "processing" | "done" | "no_email" | "error";
  details?: string;
}

interface BulkResultEntry {
  id: string;
  resultData: ResearchResultData;
  companyName: string;
  companyUrl: string;
}

interface GmailAgentLoopProps {
  onSendManually: (result: ResearchResultData, name: string, url: string, skip_send?: boolean, action_type?: string) => Promise<SendEmailResult>;
  onSendAutomatically: (result: ResearchResultData, name: string, url: string) => Promise<SendEmailResult>;
  onSaveFollowUp: (result: ResearchResultData, note: string, title: string) => Promise<boolean>;
  onRemoveResult: (id: string) => void;
}

export default function GmailAgentLoop({
  onSendManually,
  onSendAutomatically,
  onSaveFollowUp,
  onRemoveResult,
}: GmailAgentLoopProps) {
  const [tasks, setTasks] = useState<URLTask[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const isStoppedRef = useRef(false);
  const [processedCount, setProcessedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkText, setBulkText] = useState("");
  const [results, setResults] = useState<BulkResultEntry[]>([]);

  const extractUrls = (text: string): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    const httpRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;
    (text.match(httpRegex) || []).forEach(u => {
      const clean = u.trim().replace(/[,;'"]+$/, "");
      if (!seen.has(clean)) { seen.add(clean); out.push(clean); }
    });
    const bareRegex = /(?:^|[\s,;\t"'])(((?:www\.)?[a-zA-Z0-9](?:[-a-zA-Z0-9]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+(?:\/[^\s,;"']*)?))(?=[\s,;"'\n]|$)/gm;
    let m;
    while ((m = bareRegex.exec(text)) !== null) {
      const domain = m[1].trim().replace(/[,;'"]+$/, "");
      if (!domain || domain.includes("@") || /^\d+$/.test(domain)) continue;
      const withHttp = `https://${domain}`;
      if (!seen.has(withHttp) && !seen.has(`http://${domain}`)) { seen.add(withHttp); out.push(withHttp); }
    }
    return out;
  };

  const handleBulkTextSubmit = () => {
    if (!bulkText.trim()) return;
    const urls = extractUrls(bulkText);
    if (urls.length === 0) { alert("No URLs found. Provide valid URLs like https://example.com"); return; }
    setTasks(urls.map(url => ({ id: Math.random().toString(36).substring(7), url, status: "pending" as const })));
    setResults([]); setProcessedCount(0); isStoppedRef.current = false; setBulkText("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    let text = "";
    try {
      if (ext === "pdf") {
        const ab = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          text += (await page.getTextContent()).items.map((x: any) => x.str).join(" ") + " ";
        }
      } else if (ext === "docx") {
        text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
      } else if (ext === "xlsx" || ext === "xls") {
        const wb = xlsx.read(await file.arrayBuffer(), { type: "array" });
        (wb.SheetNames as string[]).forEach((sn: string) => { text += xlsx.utils.sheet_to_csv(wb.Sheets[sn]) + "\n"; });
      } else if (ext === "txt" || ext === "csv") {
        text = await file.text();
      } else { alert("Unsupported format."); return; }
      const urls = extractUrls(text);
      if (urls.length === 0) { alert("No URLs found in file."); return; }
      setTasks(urls.map(url => ({ id: Math.random().toString(36).substring(7), url, status: "pending" as const })));
      setResults([]); setProcessedCount(0); isStoppedRef.current = false;
    } catch (err) { console.error(err); alert("Error reading file."); }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startLoop = async () => {
    if (tasks.length === 0) return;
    setIsProcessing(true); isStoppedRef.current = false;
    const snapshot = [...tasks];
    for (let i = 0; i < snapshot.length; i++) {
      if (isStoppedRef.current) break;
      if (snapshot[i].status !== "pending" && snapshot[i].status !== "error") continue;
      setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, status: "processing" } : t));
      const url = snapshot[i].url;
      const derivedName = url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split("/")[0];
      const cleanUrl = url.replace(/^https?:\/\//i, "");
      try {
        const res = await fetch(`${API_BASE_URL}/smart-research`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_name: derivedName, company_url: cleanUrl }),
        });
        if (!res.ok) throw new Error(`Research failed (${res.status})`);
        const data: ResearchResultData = await res.json();
        const hasDraft = !!(data.draft?.english_body || (data.draft as any)?.body || data.draft?.spanish_body);
        if (!hasDraft) {
          setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, status: "no_email", details: "No draft generated" } : t));
        } else {
          const entryId = (data as any).db_id ? String((data as any).db_id) : `bulk-${Date.now()}-${i}`;
          setResults(prev => [...prev, { id: entryId, resultData: data, companyName: derivedName, companyUrl: url }]);
          setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, status: "done", details: `Draft ready` } : t));
        }
      } catch (err: any) {
        setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, status: "error", details: err.message || "Unknown error" } : t));
      }
      setProcessedCount(i + 1);
      if (!isStoppedRef.current && i < snapshot.length - 1) await new Promise(r => setTimeout(r, 1500));
    }
    setIsProcessing(false);
  };

  const stopLoop = () => { isStoppedRef.current = true; setIsProcessing(false); };
  const clearAll = () => { setTasks([]); setResults([]); setProcessedCount(0); isStoppedRef.current = false; };
  const handleRemoveBulkResult = (id: string) => { setResults(prev => prev.filter(r => r.id !== id)); onRemoveResult(id); };

  const doneCount = tasks.filter(t => t.status === "done").length;
  const noEmailCount = tasks.filter(t => t.status === "no_email").length;
  const errorCount = tasks.filter(t => t.status === "error").length;
  const progress = tasks.length > 0 ? processedCount / tasks.length : 0;

  const statusIcon = (s: string) => {
    const map: Record<string, React.ReactNode> = {
      pending: <Clock className="w-3.5 h-3.5 text-slate-400" />,
      processing: <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />,
      done: <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />,
      no_email: <AlertCircle className="w-3.5 h-3.5 text-amber-500" />,
      error: <XCircle className="w-3.5 h-3.5 text-red-500" />,
    };
    return map[s] || null;
  };

  const statusBadge = (s: string) => {
    const cls: Record<string, string> = {
      pending:    "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400",
      processing: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
      done:       "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
      no_email:   "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
      error:      "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400",
    };
    const labels: Record<string, string> = {
      pending: "Pending", processing: "Researching…", done: "Draft Ready", no_email: "No Draft", error: "Error",
    };
    return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide ${cls[s] || ""}`}>{labels[s] || s}</span>;
  };

  return (
    <div className="w-full space-y-6">
      {/* Input Panel */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-zinc-100">Bulk Draft Generator</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
              Paste URLs or upload a file — AI researches each site and generates email drafts for you to review &amp; send.
            </p>
          </div>
          {tasks.length > 0 && (
            <div className="flex gap-2">
              {!isProcessing ? (
                <button
                  onClick={startLoop}
                  disabled={tasks.every(t => t.status === "done" || t.status === "no_email")}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-md shadow-indigo-500/20"
                >
                  <Sparkles className="w-4 h-4" />
                  {processedCount > 0 ? "Continue" : "Generate Drafts"}
                </button>
              ) : (
                <button onClick={stopLoop} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-all">
                  <StopCircle className="w-4 h-4" /> Stop
                </button>
              )}
              <button onClick={clearAll} disabled={isProcessing} className="p-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 rounded-xl transition-all disabled:opacity-50" title="Clear all">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {tasks.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* File Upload */}
            <div
              className="border-2 border-dashed border-slate-200 dark:border-zinc-700 rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-slate-50 dark:bg-zinc-950/50 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-colors cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="p-4 bg-white dark:bg-zinc-900 shadow-sm rounded-full mb-4 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/10 transition-colors">
                <Upload className="w-8 h-8 text-indigo-500" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-zinc-100 mb-1">Upload File</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4 max-w-xs">PDF, DOCX, XLSX, TXT, CSV — URLs extracted automatically.</p>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.docx,.xlsx,.xls,.txt,.csv" className="hidden" />
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Click to browse</span>
            </div>
            {/* Text Paste */}
            <div className="border-2 border-slate-200 dark:border-zinc-700 rounded-2xl p-6 flex flex-col bg-white dark:bg-zinc-900 shadow-sm">
              <h3 className="font-bold text-slate-800 dark:text-zinc-100 mb-1 flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-500" /> Paste URLs
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mb-3">One URL per line, or comma-separated.</p>
              <textarea
                className="flex-1 w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none mb-4 custom-scrollbar text-slate-800 dark:text-zinc-100 placeholder-slate-400 min-h-[120px]"
                placeholder={"https://serphawk.com\nhttps://example.com\nhttps://google.com"}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
              />
              <button
                onClick={handleBulkTextSubmit}
                disabled={!bulkText.trim()}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Load URLs
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats */}
            <div className="flex flex-wrap gap-3 text-sm font-bold">
              <span className="text-slate-600 dark:text-zinc-300">Total: <span className="text-indigo-600">{tasks.length}</span></span>
              <span className="text-emerald-600">✓ Drafts: {doneCount}</span>
              {noEmailCount > 0 && <span className="text-amber-600">⚠ No Draft: {noEmailCount}</span>}
              {errorCount > 0 && <span className="text-red-600">✗ Error: {errorCount}</span>}
              <span className="text-slate-400 dark:text-zinc-500">Pending: {tasks.filter(t => t.status === "pending").length}</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
              <motion.div className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-2 rounded-full" animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.4 }} />
            </div>
            <div className="flex justify-between items-center">
              {isProcessing ? (
                <span className="text-xs font-bold text-indigo-500 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping inline-block" />
                  Researching {processedCount + 1} of {tasks.length}…
                </span>
              ) : (
                <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                  {processedCount >= tasks.length && processedCount > 0 ? "All done! Review drafts below ↓" : processedCount > 0 ? "Paused" : "Ready — click Generate Drafts"}
                </span>
              )}
              <span className="text-xs font-bold text-slate-400">{Math.round(progress * 100)}%</span>
            </div>
            {/* Queue table */}
            <div className="max-h-[260px] overflow-y-auto custom-scrollbar border border-slate-200 dark:border-zinc-700 rounded-xl">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700 z-10">
                  <tr className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
                    <th className="py-2.5 px-4 font-black w-8">#</th>
                    <th className="py-2.5 px-4 font-black">URL</th>
                    <th className="py-2.5 px-4 font-black w-36">Status</th>
                    <th className="py-2.5 px-4 font-black">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task, i) => (
                    <tr key={task.id} className={`border-b border-slate-100 dark:border-zinc-800 last:border-0 transition-colors ${task.status === "processing" ? "bg-indigo-50/50 dark:bg-indigo-900/10" : "hover:bg-slate-50 dark:hover:bg-zinc-900/50"}`}>
                      <td className="py-2.5 px-4 text-slate-400 font-mono text-xs">{i + 1}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-700 dark:text-zinc-200 truncate max-w-[200px]">
                        <a href={task.url} target="_blank" rel="noreferrer" className="hover:text-indigo-500 hover:underline text-xs">{task.url}</a>
                      </td>
                      <td className="py-2.5 px-4"><div className="flex items-center gap-1.5">{statusIcon(task.status)}{statusBadge(task.status)}</div></td>
                      <td className="py-2.5 px-4 text-xs text-slate-500 dark:text-zinc-400 truncate max-w-[160px]">{task.details || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Generated Drafts */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex items-center gap-3">
              <h3 className="font-black text-xl text-slate-800 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 px-4 py-2 rounded-xl shadow-sm inline-flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500" />
                Generated Drafts
                <span className="ml-1 px-2 py-0.5 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-black">{results.length}</span>
              </h3>
              {isProcessing && (
                <span className="text-xs text-slate-500 dark:text-zinc-400 font-bold flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> More drafts coming…
                </span>
              )}
            </div>
            {results.map(res => (
              <motion.div key={res.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <ResultCard
                  historyId={res.id}
                  result={res.resultData}
                  companyName={res.companyName}
                  companyUrl={res.companyUrl}
                  onSendManually={onSendManually}
                  onSendAutomatically={onSendAutomatically}
                  onSaveFollowUp={onSaveFollowUp}
                  onRemove={handleRemoveBulkResult}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
