"use client";

import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, Play, CheckCircle, XCircle, Clock, FileText, Trash2, StopCircle } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import * as xlsx from "xlsx";
import { API_BASE_URL } from "@/config";

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface URLTask {
  id: string;
  url: string;
  status: "pending" | "processing" | "success" | "no_email" | "error";
  details?: string;
}

export default function GmailAgentLoop() {
  const [tasks, setTasks] = useState<URLTask[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const isStoppedRef = useRef(false);
  const [processedCount, setProcessedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractUrls = (text: string): string[] => {
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
    const matches = text.match(urlRegex) || [];
    return Array.from(new Set(matches.map((u) => u.trim())));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    let text = "";

    try {
      if (extension === "pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item: any) => item.str).join(" ") + " ";
        }
      } else if (extension === "docx") {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else if (extension === "xlsx" || extension === "xls") {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = xlsx.read(arrayBuffer, { type: "array" });
        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          text += xlsx.utils.sheet_to_txt(sheet) + " ";
        });
      } else if (extension === "txt" || extension === "csv") {
        text = await file.text();
      } else {
        alert("Unsupported file format. Please upload PDF, DOCX, XLSX, TXT, or CSV.");
        return;
      }

      const urls = extractUrls(text);
      const newTasks = urls.map(url => ({
        id: Math.random().toString(36).substring(7),
        url,
        status: "pending" as const
      }));

      setTasks(newTasks);
      setProcessedCount(0);
      setIsStopped(false);
      isStoppedRef.current = false;
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Error reading file. See console for details.");
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const startLoop = async () => {
    if (tasks.length === 0) return;
    setIsProcessing(true);
    setIsStopped(false);
    isStoppedRef.current = false;

    let currentTasks = [...tasks];
    
    for (let i = 0; i < currentTasks.length; i++) {
      // Check if user stopped the loop
      if (isStoppedRef.current) {
        break;
      }

      if (currentTasks[i].status !== "pending" && currentTasks[i].status !== "error") {
        continue;
      }

      // Update status to processing
      setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, status: "processing" } : t));

      const url = currentTasks[i].url;
      const derivedName = url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0];
      const cleanUrl = url.replace(/^https?:\/\//i, "");

      // Delay up to 5 seconds to prevent N8N timeout/rate limit issues
      await delay(5000);

      try {
        // Step 1: Research (Calls N8N through backend)
        const res = await fetch(`${API_BASE_URL}/smart-research`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_name: derivedName, company_url: cleanUrl }),
        });

        if (!res.ok) throw new Error("Research failed");
        const data = await res.json();

        // Step 2: Determine Email
        const fallbackEmail = Array.isArray(data.company_info?.contacts) ? data.company_info.contacts[0]?.email : undefined;
        const extractedEmailsArray = Array.isArray(data.company_info?.extracted_emails) ? data.company_info.extracted_emails : (data.company_info?.extracted_emails?.split(",") || []);
        const extractedEmail = extractedEmailsArray[0]?.trim();
        
        const acceptedEmailFromN8N = data.email_delivery_records?.accepted_emails?.[0];
        const emailToSend = acceptedEmailFromN8N || data.contact?.email || fallbackEmail || extractedEmail;

        if (!emailToSend) {
          setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, status: "no_email", details: "No email found on website" } : t));
        } else if (acceptedEmailFromN8N) {
          // N8N automatically sent and logged this email to the database!
          setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, status: "success", details: `Sent to ${acceptedEmailFromN8N}` } : t));
        } else {
          // Step 3: Log Auto Email (N8N didn't send, so we just log the extracted draft to the DB)
          const serviceNames = (data.recommended_services || []).map((s: any) => (typeof s === 'string' ? s : s.service_name || '')).filter(Boolean).join(", ");
          
          const sendRes = await fetch(`${API_BASE_URL}/send-manual`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to_email: emailToSend,
              company_name: data.company_info?.company_name || derivedName,
              subject: data.draft?.subject || "",
              english_body: data.draft?.english_body || data.draft?.body || "",
              spanish_body: data.draft?.spanish_body || "",
              recommended_services: serviceNames,
              contact_name: data.contact?.name || null,
              contact_role: data.contact?.role || null,
              website_url: data.company_url || data.company_info?.website || url || null,
              phone_number: data.contact?.phone_number || null,
              manual: false,
              skip_send: true,
              action_type: "System Auto Bulk",
              email_agent_data: JSON.stringify(data),
            }),
          });

          if (!sendRes.ok) throw new Error("Email send failed");
          
          setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, status: "success", details: `Sent to ${emailToSend}` } : t));
        }
      } catch (err: any) {
        setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, status: "error", details: err.message || "Unknown error" } : t));
      }

      setProcessedCount(prev => prev + 1);
    }

    setIsProcessing(false);
  };

  const stopLoop = () => {
    setIsStopped(true);
    isStoppedRef.current = true;
    setIsProcessing(false);
  };

  const clearTasks = () => {
    setTasks([]);
    setProcessedCount(0);
    setIsStopped(false);
    isStoppedRef.current = false;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="w-4 h-4 text-slate-400" />;
      case "processing": return <Clock className="w-4 h-4 text-indigo-500 animate-spin" />;
      case "success": return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case "no_email": return <FileText className="w-4 h-4 text-orange-500" />;
      case "error": return <XCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase">Pending</span>;
      case "processing": return <span className="px-2 py-1 bg-indigo-100 text-indigo-600 rounded-md text-[10px] font-bold uppercase">Processing...</span>;
      case "success": return <span className="px-2 py-1 bg-emerald-100 text-emerald-600 rounded-md text-[10px] font-bold uppercase">Sent</span>;
      case "no_email": return <span className="px-2 py-1 bg-orange-100 text-orange-600 rounded-md text-[10px] font-bold uppercase">No Email</span>;
      case "error": return <span className="px-2 py-1 bg-red-100 text-red-600 rounded-md text-[10px] font-bold uppercase">Error</span>;
      default: return null;
    }
  };

  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-6 md:p-8 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-zinc-100">Bulk Agent Loop</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">Upload a PDF, DOCX, or Excel file to extract URLs and automate outreach.</p>
        </div>
        {tasks.length > 0 && (
          <div className="flex gap-2">
            {!isProcessing ? (
              <button onClick={startLoop} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-all">
                <Play className="w-4 h-4" /> {processedCount > 0 ? "Resume" : "Start"} Loop
              </button>
            ) : (
              <button onClick={stopLoop} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-all">
                <StopCircle className="w-4 h-4" /> Stop
              </button>
            )}
            <button onClick={clearTasks} disabled={isProcessing} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all disabled:opacity-50">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 dark:border-zinc-700 rounded-2xl p-12 flex flex-col items-center justify-center text-center bg-slate-50 dark:bg-zinc-950/50">
          <div className="p-4 bg-white dark:bg-zinc-900 shadow-sm rounded-full mb-4">
            <Upload className="w-8 h-8 text-indigo-500" />
          </div>
          <h3 className="font-bold text-slate-800 dark:text-zinc-100 mb-1">Upload File</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4 max-w-xs">Supports PDF, DOCX, XLSX, TXT. We will extract all company URLs inside.</p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.docx,.xlsx,.xls,.txt,.csv"
            className="block w-full max-w-xs text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer"
          />
        </div>
      ) : (
        <div className="space-y-4">
            <div className="flex gap-4 text-sm font-bold text-slate-800 dark:text-zinc-100 mb-2">
              <span className="text-indigo-600">Total: {tasks.length}</span>
              <span className="text-emerald-600">Sent: {tasks.filter(t => t.status === "success").length}</span>
              <span className="text-orange-600">No Email: {tasks.filter(t => t.status === "no_email").length}</span>
              <span className="text-red-600">Error: {tasks.filter(t => t.status === "error").length}</span>
            </div>
            
            <div className="w-full bg-slate-200 dark:bg-zinc-800 rounded-full h-2 mb-2 overflow-hidden flex">
              <motion.div 
                className="bg-emerald-500 h-2" 
                initial={{ width: 0 }}
                animate={{ width: `${(tasks.filter(t => t.status === "success").length / tasks.length) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
              <motion.div 
                className="bg-orange-500 h-2" 
                initial={{ width: 0 }}
                animate={{ width: `${(tasks.filter(t => t.status === "no_email").length / tasks.length) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
              <motion.div 
                className="bg-red-500 h-2" 
                initial={{ width: 0 }}
                animate={{ width: `${(tasks.filter(t => t.status === "error").length / tasks.length) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>

            <div className="flex justify-between items-center w-full">
              {isProcessing ? (
                <div className="text-xs font-bold text-indigo-500 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                  Processing {processedCount + 1} of {tasks.length}...
                </div>
              ) : (
                <div className="text-xs font-bold text-slate-500">
                  {processedCount > 0 ? (processedCount >= tasks.length ? "Processing Complete" : "Processing Paused") : "Ready to Start"}
                </div>
              )}
              <span className="text-xs font-bold text-slate-500">{Math.round((processedCount / tasks.length) * 100)}%</span>
            </div>

          <div className="max-h-[400px] overflow-y-auto custom-scrollbar border border-slate-200 dark:border-zinc-700 rounded-xl">
            <table className="w-full text-left border-collapse font-sans text-sm">
              <thead className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700 shadow-sm z-10">
                <tr className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-widest bg-slate-50 dark:bg-zinc-900/50">
                  <th className="py-3 px-4 font-black w-8">#</th>
                  <th className="py-3 px-4 font-black">URL</th>
                  <th className="py-3 px-4 font-black w-24">Status</th>
                  <th className="py-3 px-4 font-black">Details</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, i) => (
                  <tr key={task.id} className="border-b border-slate-100 dark:border-zinc-800 last:border-0 hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="py-3 px-4 text-slate-400 font-mono text-xs">{i + 1}</td>
                    <td className="py-3 px-4 font-medium text-slate-700 dark:text-zinc-200 truncate max-w-[200px]">
                      <a href={task.url} target="_blank" rel="noreferrer" className="hover:text-indigo-500 hover:underline">{task.url}</a>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(task.status)}
                        {getStatusBadge(task.status)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 dark:text-zinc-400 truncate max-w-[200px]">
                      {task.details || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
