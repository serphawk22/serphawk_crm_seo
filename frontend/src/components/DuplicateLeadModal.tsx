"use client";

import React, { useState } from "react";
import { 
  AlertTriangle, Check, ArrowRight, UserCheck, RefreshCw, 
  Trash2, Plus, X, Globe, Mail, Phone, MapPin, Building2,
  Calendar, Sparkles, UserPlus, FileText, Loader2
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export interface DuplicateLeadInfo {
  id: number;
  company_name: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  status: string;
  owner_name?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  created_at?: string | null;
  match_reason: "email" | "phone" | "both";
}

export interface DuplicateDiff {
  additions: Array<{ field: string; label: string; new_value: any }>;
  differences: Array<{ field: string; label: string; old_value: any; new_value: any }>;
  contact_addition?: { name: string; designation?: string; email?: string; phone?: string } | null;
  notes_addition?: string | null;
}

interface DuplicateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingLead: DuplicateLeadInfo;
  incomingLead: any;
  diff?: DuplicateDiff | null;
  onMerge: () => Promise<void>;
  onReplace: () => Promise<void>;
  onCreateAnyway: () => Promise<void>;
}

export default function DuplicateLeadModal({
  isOpen,
  onClose,
  existingLead,
  incomingLead,
  diff,
  onMerge,
  onReplace,
  onCreateAnyway,
}: DuplicateLeadModalProps) {
  const { t } = useLanguage();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAction = async (action: string, fn: () => Promise<void>) => {
    try {
      setLoadingAction(action);
      await fn();
    } catch (err: any) {
      alert(err.message || "Failed to process lead duplicate action");
    } finally {
      setLoadingAction(null);
    }
  };

  const matchLabel = 
    existingLead.match_reason === "both" 
      ? "Matching Email and Phone Number"
      : existingLead.match_reason === "email"
      ? `Matching Email: ${existingLead.email || incomingLead.email}`
      : `Matching Phone: ${existingLead.phone || incomingLead.phone}`;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-300">
                  Duplicate Lead Detected
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/60">
                  {matchLabel}
                </span>
              </div>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-400/80">
                A lead with this contact information already exists in your CRM pipeline.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Side-by-Side Comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Existing Lead Card */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-800/40 space-y-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Existing Record #{existingLead.id}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  {existingLead.status}
                </span>
              </div>

              <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                {existingLead.company_name}
              </div>

              <div className="space-y-1 text-[11px] text-slate-600 dark:text-zinc-300">
                {existingLead.email && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{existingLead.email}</span>
                  </div>
                )}
                {existingLead.phone && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{existingLead.phone}</span>
                  </div>
                )}
                {existingLead.website && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{existingLead.website}</span>
                  </div>
                )}
                {existingLead.address && (
                  <div className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{existingLead.address}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                <span>Rep: {existingLead.owner_name || "Unassigned"}</span>
                {existingLead.created_at && (
                  <span>Created {new Date(existingLead.created_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>

            {/* Incoming Submission Card */}
            <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Incoming New Submission
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                  {incomingLead.status || "New"}
                </span>
              </div>

              <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                {incomingLead.company_name}
              </div>

              <div className="space-y-1 text-[11px] text-slate-600 dark:text-zinc-300">
                {incomingLead.email && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3 h-3 text-indigo-500 shrink-0" />
                    <span className="truncate font-medium">{incomingLead.email}</span>
                  </div>
                )}
                {incomingLead.phone && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Phone className="w-3 h-3 text-indigo-500 shrink-0" />
                    <span className="truncate font-medium">{incomingLead.phone}</span>
                  </div>
                )}
                {incomingLead.website && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Globe className="w-3 h-3 text-indigo-500 shrink-0" />
                    <span className="truncate font-medium">{incomingLead.website}</span>
                  </div>
                )}
                {incomingLead.address && (
                  <div className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3 h-3 text-indigo-500 shrink-0" />
                    <span className="truncate font-medium">{incomingLead.address}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-indigo-200/60 dark:border-indigo-800/30 text-[10px] text-indigo-600 dark:text-indigo-400">
                <span>Source: {incomingLead.source || "Website"}</span>
              </div>
            </div>
          </div>

          {/* What is New / Diff Highlights */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/30 space-y-2">
            <h4 className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>What New Information is Available:</span>
            </h4>

            <div className="space-y-1.5 text-xs">
              {/* Additions */}
              {diff?.additions && diff.additions.length > 0 ? (
                diff.additions.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-lg border border-emerald-200/60 dark:border-emerald-800/40">
                    <Plus className="w-3 h-3 shrink-0" />
                    <span><strong>Add {item.label}:</strong> {String(item.new_value)}</span>
                  </div>
                ))
              ) : null}

              {/* Contact Person Addition */}
              {diff?.contact_addition && (
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 px-2.5 py-1 rounded-lg border border-indigo-200/60 dark:border-indigo-800/40">
                  <UserPlus className="w-3 h-3 shrink-0" />
                  <span><strong>New Direct Contact:</strong> {diff.contact_addition.name} ({diff.contact_addition.designation || "Executive"})</span>
                </div>
              )}

              {/* Notes Addition */}
              {diff?.notes_addition && (
                <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 rounded-lg border border-amber-200/60 dark:border-amber-800/40">
                  <FileText className="w-3 h-3 shrink-0 mt-0.5" />
                  <span className="line-clamp-2"><strong>Additional Notes:</strong> {diff.notes_addition}</span>
                </div>
              )}

              {/* Differences */}
              {diff?.differences && diff.differences.map((diffItem, idx) => (
                <div key={idx} className="flex items-center gap-2 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1 rounded-lg border border-blue-200/60 dark:border-blue-800/40">
                  <ArrowRight className="w-3 h-3 shrink-0" />
                  <span><strong>Update {diffItem.label}:</strong> {diffItem.old_value} → {diffItem.new_value}</span>
                </div>
              ))}

              {(!diff?.additions?.length && !diff?.contact_addition && !diff?.notes_addition && !diff?.differences?.length) && (
                <p className="text-slate-500 italic">No conflicting fields detected. Incoming submission matches existing record details.</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer Resolution Options */}
        <div className="p-4 bg-slate-50 dark:bg-zinc-800/50 border-t border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={!!loadingAction}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors text-center"
          >
            Cancel
          </button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Create Anyway */}
            <button
              onClick={() => handleAction("create_anyway", onCreateAnyway)}
              disabled={!!loadingAction}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              {loadingAction === "create_anyway" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Create as Separate Lead</span>
            </button>

            {/* Replace Old */}
            <button
              onClick={() => handleAction("replace", onReplace)}
              disabled={!!loadingAction}
              title="Delete old duplicate lead and create fresh record"
              className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              {loadingAction === "replace" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>Replace Existing Record</span>
            </button>

            {/* Merge & Update (Recommended Primary) */}
            <button
              onClick={() => handleAction("merge", onMerge)}
              disabled={!!loadingAction}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-1.5"
            >
              {loadingAction === "merge" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Merge &amp; Update Existing</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

