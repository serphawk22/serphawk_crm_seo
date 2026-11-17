'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '@/config';
import { useRole } from '@/context/RoleContext';
import { useLanguage } from '@/context/LanguageContext';
import LocalizedText from '@/components/LocalizedText';
import {
  Archive,
  Search,
  RotateCcw,
  CheckCircle2,
  Users,
  Radar,
  Building2,
  UserX,
  Clock,
  ArrowRight,
  Filter,
  Sparkles,
  AlertCircle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

interface DeletedRecord {
  id: number;
  tenant_id: number;
  record_type: 'salesperson' | 'lead' | 'client' | 'user' | string;
  record_id: number;
  record_name: string;
  details: Record<string, any>;
  deleted_by_id?: number | null;
  deleted_by_name?: string | null;
  deleted_at: string;
  is_restored: boolean;
  restored_at?: string | null;
  transfer_summary?: Record<string, number> | null;
}

export default function DeletedRecordsPage() {
  const { role } = useRole();
  const { t, language } = useLanguage();
  const [records, setRecords] = useState<DeletedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [includeRestored, setIncludeRestored] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (typeFilter !== 'all') q.set('record_type', typeFilter);
      if (search.trim()) q.set('search', search.trim());
      if (includeRestored) q.set('include_restored', 'true');

      const res = await fetch(`${API_BASE_URL}/deleted-records?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      } else {
        setErrorMessage('Failed to load deleted records.');
      }
    } catch (err) {
      console.error('Failed to fetch deleted records', err);
      setErrorMessage('Could not connect to CRM backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [typeFilter, includeRestored]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRecords();
  };

  const handleRestore = async (rec: DeletedRecord) => {
    if (!confirm(`Restore "${rec.record_name}" back to active CRM records?`)) return;
    setRestoringId(rec.id);
    try {
      const res = await fetch(`${API_BASE_URL}/deleted-records/${rec.id}/restore`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setToastMessage(data.message || `Successfully restored ${rec.record_name}!`);
        setTimeout(() => setToastMessage(null), 4000);
        fetchRecords();
      } else {
        alert(data.detail || 'Failed to restore record.');
      }
    } catch (err) {
      alert('Error connecting to backend.');
    } finally {
      setRestoringId(null);
    }
  };

  // KPI stats
  const totalDeleted = records.length;
  const salespersonCount = records.filter(r => r.record_type === 'salesperson').length;
  const leadCount = records.filter(r => r.record_type === 'lead').length;
  const clientCount = records.filter(r => r.record_type === 'client').length;
  const totalTransferredLeads = records.reduce((acc, r) => {
    return acc + (Number(r.details?.transferred_leads_count) || 0);
  }, 0);

  const getTypeBadge = (type: string) => {
    switch (type.toLowerCase()) {
      case 'salesperson':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <Users className="w-3 h-3" /> Salesperson
          </span>
        );
      case 'lead':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            <Radar className="w-3 h-3" /> Lead
          </span>
        );
      case 'client':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <Building2 className="w-3 h-3" /> Client
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <UserX className="w-3 h-3" /> User
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-lg border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-semibold backdrop-blur-md">
              <Archive className="w-3.5 h-3.5 text-indigo-400" />
              <span>CRM Recycle Bin & Fair Lead Offboarding Audit</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Deleted Records & Lead Transfer Log
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              When salespersons are removed, their assigned leads are automatically distributed{' '}
              <strong className="text-indigo-300 font-semibold">fairly and balanced</strong> among active salespersons. 
              Full deletion history, lead transfer summaries, and one-click restoration are preserved below.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchRecords()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/20 transition-all text-white backdrop-blur-md shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Refresh Records
            </button>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-3 shadow-md"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <p className="text-sm font-semibold">{toastMessage}</p>
        </motion.div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111111] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">Total Deleted</span>
            <Archive className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">{totalDeleted}</p>
          <span className="text-[11px] text-slate-400">Preserved in recycle bin</span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111111] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Offboarded Sales</span>
            <Users className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-900 dark:text-amber-100 mt-2">{salespersonCount}</p>
          <span className="text-[11px] text-slate-400">Salespersons removed</span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111111] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Leads Reassigned</span>
            <Sparkles className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-black text-indigo-900 dark:text-indigo-100 mt-2">{totalTransferredLeads}</p>
          <span className="text-[11px] text-slate-400">Fairly distributed to team</span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111111] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Deleted Leads & Clients</span>
            <Radar className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-blue-900 dark:text-blue-100 mt-2">{leadCount + clientCount}</p>
          <span className="text-[11px] text-slate-400">Archived CRM entries</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#111111] p-3 rounded-2xl border border-slate-200 dark:border-white/10 shadow-xs">
        {/* Type filter tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200/80 dark:border-white/5">
          {[
            { id: 'all', label: 'All Records' },
            { id: 'salesperson', label: 'Salespersons' },
            { id: 'lead', label: 'Leads' },
            { id: 'client', label: 'Clients' },
            { id: 'user', label: 'Other Users' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setTypeFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                typeFilter === tab.id
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Include Restored toggle */}
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search deleted records..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </form>

          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-400 font-medium cursor-pointer select-none px-2 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800">
            <input
              type="checkbox"
              checked={includeRestored}
              onChange={e => setIncludeRestored(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <span>Show Restored</span>
          </label>
        </div>
      </div>

      {/* Main Records List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-16 bg-white dark:bg-[#111111] rounded-2xl border border-slate-200 dark:border-white/10 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
            <p className="text-sm font-semibold">Loading deleted records...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 bg-white dark:bg-[#111111] rounded-2xl border border-dashed border-slate-300 dark:border-white/10 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-zinc-900 flex items-center justify-center text-slate-400 mb-3">
              <Archive className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-white">No deleted records found</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mt-1">
              {typeFilter !== 'all'
                ? `No deleted records under the "${typeFilter}" category.`
                : 'Deleted salespersons, leads, and clients will appear here with complete audit trail and restore capability.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map(rec => {
              const isRestored = rec.is_restored;
              const transfers = rec.transfer_summary || {};
              const transferEntries = Object.entries(transfers);

              return (
                <motion.div
                  key={rec.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#111111] border transition-all ${
                    isRestored
                      ? 'border-emerald-200 dark:border-emerald-900/40 opacity-75'
                      : 'border-slate-200 dark:border-white/10 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-800'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {getTypeBadge(rec.record_type)}
                        <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                          {rec.record_name}
                        </h3>
                        {isRestored && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" /> Restored
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-zinc-400">
                        {rec.details?.email && (
                          <span>
                            <strong>Email:</strong> {rec.details.email}
                          </span>
                        )}
                        {rec.details?.role && (
                          <span>
                            <strong>Role:</strong> {rec.details.role}
                          </span>
                        )}
                        {rec.details?.snapshot?.status && (
                          <span>
                            <strong>Original Stage:</strong> {rec.details.snapshot.status}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Deleted {new Date(rec.deleted_at).toLocaleString()} by{' '}
                            <strong>{rec.deleted_by_name || 'Admin'}</strong>
                          </span>
                        </span>
                      </div>

                      {/* Lead Transfer Breakdown (Crucial Feature requested by user) */}
                      {transferEntries.length > 0 && (
                        <div className="mt-3 p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 dark:text-indigo-200">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span>Fair Lead Distribution Applied ({rec.details?.transferred_leads_count || 0} Leads Transferred)</span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {transferEntries.map(([recipient, count]) => (
                              <span
                                key={recipient}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-indigo-200/70 dark:border-indigo-800 text-indigo-950 dark:text-indigo-100 font-medium"
                              >
                                <span className="font-bold text-indigo-600 dark:text-indigo-400">{count}</span>
                                <ArrowRight className="w-3 h-3 text-indigo-400" />
                                <span>{recipient}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Restore Action */}
                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      {!isRestored ? (
                        <button
                          onClick={() => handleRestore(rec)}
                          disabled={restoringId === rec.id}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all disabled:opacity-50"
                        >
                          {restoringId === rec.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Restoring...</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Restore Record</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          Restored on {new Date(rec.restored_at || '').toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

