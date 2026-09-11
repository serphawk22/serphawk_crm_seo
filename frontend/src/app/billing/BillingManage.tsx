"use client";
import { useRef, useState } from "react";
import { FileText, Plus, Download, FileSpreadsheet, FileType2, FileDown } from "lucide-react";
import Quotes, { QuotesHandle } from "./Quotes";

export default function BillingManage() {
  const quotesRef = useRef<QuotesHandle>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const runExport = (fn: () => void) => {
    setExportOpen(false);
    fn();
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-zinc-950 p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100">Billing</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400">Manage quotes</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Export dropdown */}
          <div className="relative">
            <button onClick={() => setExportOpen(v => !v)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-sm font-semibold hover:border-amber-400 transition-all active:scale-95 shadow-sm">
              <Download className="w-4 h-4 text-amber-500" /> Export
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 mt-2 w-52 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 shadow-xl z-20 overflow-hidden p-1.5">
                  <button onClick={() => runExport(() => quotesRef.current?.exportPDF())}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 dark:text-zinc-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all text-left">
                    <FileDown className="w-4 h-4 text-red-500" /> Export PDF
                  </button>
                  <button onClick={() => runExport(() => quotesRef.current?.exportCSV())}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 dark:text-zinc-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all text-left">
                    <FileType2 className="w-4 h-4 text-emerald-600" /> Export CSV
                  </button>
                  <button onClick={() => runExport(() => quotesRef.current?.exportExcel())}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 dark:text-zinc-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all text-left">
                    <FileSpreadsheet className="w-4 h-4 text-green-600" /> Export Excel
                  </button>
                </div>
              </>
            )}
          </div>
          <button onClick={() => quotesRef.current?.openCreate()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold hover:opacity-90 shadow-md transition-all active:scale-95">
            <Plus className="w-4 h-4" /> New Quote
          </button>
        </div>
      </div>

      {/* Content */}
      <Quotes embedded ref={quotesRef} />
    </div>
  );
}