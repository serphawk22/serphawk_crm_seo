"use client";
import { API_BASE_URL } from "@/config";

import React, { useState } from "react";
import { Upload, ArrowRight, CheckCircle, AlertTriangle, FileText, X } from "lucide-react";
import { useRouter } from "next/navigation";

const MODULES = [
  { id: "leads", label: "Leads" },
  { id: "accounts", label: "Accounts" },
  { id: "contacts", label: "Contacts" },
  { id: "clients", label: "Clients" },
];

export default function ImportPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [module, setModule] = useState("leads");
  const [file, setFile] = useState<File | null>(null);
  const [duplicateAction, setDuplicateAction] = useState("skip"); // "skip" or "update"
  
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [fileColumns, setFileColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    
    // Auto-proceed to map columns by calling preview API
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("module", module);

    try {
      const res = await fetch(`${API_BASE_URL}/api/import/preview`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to read file");
      const data = await res.json();
      setFileColumns(data.columns);
      setPreviewData(data.preview_data);
      
      // Auto-map where possible
      const autoMap: Record<string, string> = {};
      data.columns.forEach((col: string) => {
        const lower = col.toLowerCase();
        if (lower.includes("company") || lower.includes("account")) autoMap[col] = "company_name";
        else if (lower.includes("first")) autoMap[col] = "first_name";
        else if (lower.includes("last")) autoMap[col] = "last_name";
        else if (lower.includes("email")) autoMap[col] = "email";
        else if (lower.includes("phone")) autoMap[col] = "phone";
        else if (lower.includes("website")) autoMap[col] = "website";
        else if (lower.includes("industry")) autoMap[col] = "industry";
        else autoMap[col] = "";
      });
      setMapping(autoMap);
      setStep(2);
    } catch (err: any) {
      alert(err.message || "Error reading file");
    }
  };

  const handleExecuteImport = async () => {
    if (!file) return;
    
    try {
      setImporting(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("module", module);
      formData.append("mapping", JSON.stringify(mapping));
      formData.append("skip_duplicates", duplicateAction === "skip" ? "true" : "false");
      formData.append("update_existing", duplicateAction === "update" ? "true" : "false");

      const res = await fetch(`${API_BASE_URL}/api/import/execute`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || "Import failed");
      }

      const data = await res.json();
      setResult(data);
      setStep(3);
      alert(`Successfully imported ${data.imported} records`);
    } catch (err: any) {
      alert(err.message || "Error during import");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 h-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Data Import Wizard</h1>
        <p className="text-slate-500 mt-1">Import your existing records into the CRM</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
              step >= i 
                ? "bg-blue-600 text-white" 
                : "bg-slate-200 text-slate-500 dark:bg-slate-800"
            }`}>
              {step > i ? <CheckCircle className="w-5 h-5" /> : i}
            </div>
            {i < 3 && (
              <div className={`w-16 h-1 mx-2 rounded-full ${
                step > i ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-800"
              }`}></div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
        
        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="max-w-xl mx-auto text-center space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                1. Select Module to Import Into
              </label>
              <select 
                value={module}
                onChange={(e) => setModule(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white"
              >
                {MODULES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                2. Duplicate Handling
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setDuplicateAction("skip")}
                  className={`p-4 border rounded-xl flex flex-col items-center gap-2 transition-all ${
                    duplicateAction === "skip" ? "border-blue-600 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400" : "border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <ArrowRight className="w-6 h-6" />
                  <span className="font-medium text-sm">Skip Duplicates</span>
                </button>
                <button
                  onClick={() => setDuplicateAction("update")}
                  className={`p-4 border rounded-xl flex flex-col items-center gap-2 transition-all ${
                    duplicateAction === "update" ? "border-blue-600 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400" : "border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <AlertTriangle className="w-6 h-6" />
                  <span className="font-medium text-sm">Update Existing</span>
                </button>
              </div>
            </div>

            <div className="pt-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                3. Upload CSV or Excel File
              </label>
              <div className="relative group flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-blue-500 transition-all cursor-pointer overflow-hidden">
                <input 
                  type="file" 
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <Upload className="w-10 h-10 text-slate-400 mb-3 group-hover:text-blue-500 transition-colors" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Click to upload or drag and drop</p>
                <p className="text-xs text-slate-500 mt-1">CSV, XLSX up to 10MB</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Mapping */}
        {step === 2 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Map Columns</h2>
              <button 
                onClick={() => setStep(1)}
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 mb-6 border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Data Preview</p>
              <div className="flex gap-4">
                {fileColumns.map(col => (
                  <div key={col} className="min-w-[150px] space-y-2">
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 truncate" title={col}>
                      {col}
                    </div>
                    {previewData.map((row, i) => (
                      <div key={i} className="text-xs text-slate-500 bg-white dark:bg-slate-800/50 px-3 py-2 rounded border border-transparent truncate">
                        {row[col] || "—"}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              {fileColumns.map(col => (
                <div key={col} className="flex items-center gap-4">
                  <div className="w-1/2 text-sm font-medium text-slate-700 dark:text-slate-300 truncate" title={col}>
                    {col}
                  </div>
                  <div className="w-1/2">
                    <select
                      value={mapping[col] || ""}
                      onChange={(e) => setMapping({...mapping, [col]: e.target.value})}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">-- Ignore --</option>
                      {module === 'leads' || module === 'accounts' ? (
                        <>
                          <option value="company_name">Company Name</option>
                          <option value="website">Website</option>
                          <option value="industry">Industry</option>
                          <option value="email">Email</option>
                          <option value="phone">Phone</option>
                        </>
                      ) : (
                        <>
                          <option value="first_name">First Name</option>
                          <option value="last_name">Last Name</option>
                          <option value="email">Email</option>
                          <option value="mobile_number">Mobile Number</option>
                          <option value="linkedin_url">LinkedIn URL</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-end">
              <button 
                onClick={handleExecuteImport}
                disabled={importing}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {importing && <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>}
                {importing ? "Importing..." : "Start Import"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === 3 && result && (
          <div className="text-center py-8">
            <div className="w-20 h-20 bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Import Complete!</h2>
            
            <div className="max-w-md mx-auto bg-slate-50 dark:bg-slate-900 rounded-xl p-6 mt-8 grid grid-cols-3 gap-4 divide-x divide-slate-200 dark:divide-slate-700">
              <div>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{result.imported}</p>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">Imported</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-orange-600">{result.updated}</p>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">Updated</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-400">{result.skipped}</p>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">Skipped</p>
              </div>
            </div>

            <div className="mt-10">
              <button 
                onClick={() => router.push(`/${module}`)}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold shadow-sm hover:bg-blue-700 transition-colors"
              >
                View {MODULES.find(m => m.id === module)?.label}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
