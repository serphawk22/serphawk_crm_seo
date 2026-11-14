"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { jsPDF } from "jspdf";
import { API_BASE_URL } from "@/config";
import { useTenantConfig } from "@/context/TenantConfigContext";
import LocalizedText from "@/components/LocalizedText";

interface AiReport {
  title: string;
  summary: string;
  kpis: { label: string; value: string }[];
  comparison_table: { headers: string[]; rows: string[][] };
  detailed_markdown: string;
  ai_engine: string;
}
interface QuickPrompt { category: string; prompt: string }
interface Props { startDate: string; endDate: string; allTime: boolean; repId: string; courseId: string }

async function responseJson(response: Response) {
  const payload = await response.json();
  if (!response.ok) {
    const detail = payload.detail;
    throw new Error(typeof detail === "string" ? detail : detail?.message || "Unable to generate AI report");
  }
  return payload;
}

export default function InstituteAiReports({ startDate, endDate, allTime, repId, courseId }: Props) {
  const { isOn, settings } = useTenantConfig();
  const enabled = isOn("ai_reports");
  const [prompt, setPrompt] = useState("Compare admissions, lead conversions and collections across the sales team");
  const [quickPrompts, setQuickPrompts] = useState<QuickPrompt[]>([]);
  const [report, setReport] = useState<AiReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/reports/ai/quick-prompts`, { signal: controller.signal })
      .then(responseJson).then(data => setQuickPrompts(data.prompts || []))
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load AI reports"); });
    return () => controller.abort();
  }, [enabled]);

  useEffect(() => {
    setReport(null); setBusy(false);
    return () => { request.current?.abort(); request.current = null; };
  }, [enabled, startDate, endDate, allTime, repId, courseId]);

  if (!enabled) return null;

  const downloadMarkdown = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([report.detailed_markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "institute-ai-report.md"; link.click();
    URL.revokeObjectURL(url);
  };
  const downloadPdf = () => {
    if (!report) return;
    const pdf = new jsPDF();
    pdf.setFontSize(10);
    const lines: string[] = pdf.splitTextToSize(report.detailed_markdown, 180);
    let y = 18;
    for (const line of lines) {
      if (y > 280) { pdf.addPage(); y = 18; }
      pdf.text(line, 15, y); y += 5;
    }
    pdf.save("institute-ai-report.pdf");
  };

  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
    <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="h-5 w-5 text-indigo-500" /><LocalizedText text="AI Reports" /></h2>
    <p className="text-sm text-slate-500"><LocalizedText text="Ask about admissions, course enrollments and fee collections. The selected dates, salesperson and course apply to this report." /></p>
    <div className="flex flex-wrap gap-2">{quickPrompts.map(item => <button key={item.prompt} type="button" onClick={() => setPrompt(item.prompt)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-zinc-700">{item.category}</button>)}</div>
    <form onSubmit={async event => {
      event.preventDefault(); if (request.current || !prompt.trim()) return;
      const controller = new AbortController(); request.current = controller;
      setBusy(true); setError(""); setReport(null);
      try {
        const data = await fetch(`${API_BASE_URL}/reports/ai/generate`, {
          method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt.trim(), time_range: allTime ? "all" : "custom",
            start_date: allTime ? null : startDate, end_date: allTime ? null : endDate,
            rep_id: repId === "all" ? null : Number(repId), course_id: courseId === "all" ? null : Number(courseId),
            currency: settings.default_currency || "USD" }),
        }).then(responseJson);
        if (!controller.signal.aborted) setReport(data);
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to generate AI report"); }
      finally { if (request.current === controller) { request.current = null; setBusy(false); } }
    }} className="space-y-3">
      <label htmlFor="institute-ai-prompt" className="block text-sm font-semibold"><LocalizedText text="Report question" /></label>
      <textarea id="institute-ai-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} required rows={3} disabled={busy} className="w-full rounded-xl border border-slate-200 bg-transparent p-3 text-sm dark:border-zinc-700" />
      <button type="submit" disabled={busy || !prompt.trim()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}<LocalizedText text={busy ? "Generating report..." : "Generate AI report"} /></button>
    </form>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {report && <div className="space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">{report.title}</h3><div className="flex gap-2"><button type="button" onClick={downloadMarkdown} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"><Download className="h-3 w-3" />Markdown</button><button type="button" onClick={downloadPdf} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"><Download className="h-3 w-3" />PDF</button></div></div>
      <p className="text-sm text-slate-600 dark:text-zinc-300">{report.summary}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{report.kpis.map(item => <div key={item.label} className="rounded-xl bg-slate-50 p-3 dark:bg-zinc-800"><p className="text-xs text-slate-500">{item.label}</p><p className="mt-1 font-bold">{item.value}</p></div>)}</div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{report.comparison_table.headers.map(label => <th key={label} className="whitespace-nowrap p-2">{label}</th>)}</tr></thead><tbody>{report.comparison_table.rows.map((row, index) => <tr key={index}>{row.map((value, cell) => <td key={cell} className="whitespace-nowrap border-t border-slate-100 p-2 dark:border-zinc-800">{value}</td>)}</tr>)}</tbody></table></div>
      <div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]}>{report.detailed_markdown}</ReactMarkdown></div>
      <p className="text-xs text-slate-400">{report.ai_engine}</p>
    </div>}
  </section>;
}
