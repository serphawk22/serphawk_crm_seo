"use client";

import React, { useEffect, useState } from "react";
import {
  DollarSign, Activity, Zap, Clock, ShieldCheck, AlertCircle,
  Building2, Cpu, CheckCircle2, ChevronRight, Loader2, RefreshCw
} from "lucide-react";
import { API_BASE_URL } from "@/config";

interface ApiUsageData {
  tenant_id: number;
  total_calls: number;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_response_time_ms: number;
  by_provider: Record<string, { calls: number; cost: number; tokens: number }>;
  by_model: Record<string, { calls: number; cost: number }>;
  by_endpoint: Record<string, { calls: number; cost: number }>;
  by_client: Array<{ client_id: number; name?: string; calls: number; cost: number }>;
  recent_calls: Array<{
    id: number;
    endpoint: string;
    model: string;
    provider: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    total_cost: number;
    response_time_ms: number;
    status_code: number;
    success: boolean;
    timestamp: string;
  }>;
}

export default function TenantApiUsageTab({ tenantId }: { tenantId: number }) {
  const [data, setData] = useState<ApiUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/superadmin/tenants/${tenantId}/api-usage`, {
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to load API usage");
      }

      const resData = await res.json();
      setData(resData);
    } catch (e: any) {
      setError(e.message || "Failed to fetch usage metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) loadData();
  }, [tenantId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-zinc-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
        <p className="text-xs font-semibold">Loading API usage & call logs...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
        <p className="text-sm font-bold text-slate-800 dark:text-zinc-200">Could not load API metrics</p>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 mb-4">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/90 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500">Total API Cost</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <DollarSign size={13} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">
            ${data.total_cost.toFixed(3)}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">Calculated in real-time</p>
        </div>

        <div className="bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/90 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500">Total API Calls</span>
            <div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <Activity size={13} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">
            {data.total_calls.toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">Requests processed</p>
        </div>

        <div className="bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/90 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500">Total Tokens</span>
            <div className="w-6 h-6 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Cpu size={13} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">
            {((data.total_input_tokens + data.total_output_tokens) / 1000).toFixed(1)}k
          </p>
          <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
            In: {(data.total_input_tokens / 1000).toFixed(1)}k · Out: {(data.total_output_tokens / 1000).toFixed(1)}k
          </p>
        </div>

        <div className="bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/90 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500">Avg Response Time</span>
            <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Clock size={13} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">
            {Math.round(data.avg_response_time_ms)}ms
          </p>
          <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">Avg latency</p>
        </div>
      </div>

      {/* Provider & Feature Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* By Provider */}
        <div className="bg-slate-50 dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-3 flex items-center justify-between">
            <span>By Provider</span>
            <span className="text-[10px] font-normal lowercase">{Object.keys(data.by_provider).length} providers</span>
          </h4>
          <div className="space-y-2.5">
            {Object.entries(data.by_provider).map(([prov, item]) => (
              <div key={prov} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-zinc-800/80 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="font-semibold text-slate-800 dark:text-zinc-200 capitalize">{prov.replace('_', ' ')}</span>
                  <span className="text-[10px] text-slate-400">({item.calls} calls)</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white">${item.cost.toFixed(3)}</span>
              </div>
            ))}
            {Object.keys(data.by_provider).length === 0 && (
              <p className="text-xs text-slate-400 italic">No provider calls recorded yet.</p>
            )}
          </div>
        </div>

        {/* By Endpoint / Feature */}
        <div className="bg-slate-50 dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-3 flex items-center justify-between">
            <span>By Platform Feature</span>
            <span className="text-[10px] font-normal lowercase">{Object.keys(data.by_endpoint).length} features</span>
          </h4>
          <div className="space-y-2.5">
            {Object.entries(data.by_endpoint).map(([ep, item]) => (
              <div key={ep} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-zinc-800/80 last:border-0">
                <div className="flex items-center gap-2 truncate max-w-[200px]">
                  <span className="w-2 h-2 rounded-full bg-violet-500" />
                  <span className="font-semibold text-slate-800 dark:text-zinc-200 truncate capitalize">{ep.replace(/_/g, ' ')}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">({item.calls})</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white shrink-0">${item.cost.toFixed(3)}</span>
              </div>
            ))}
            {Object.keys(data.by_endpoint).length === 0 && (
              <p className="text-xs text-slate-400 italic">No feature calls recorded yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Client Accounts Breakdown (if applicable) */}
      {data.by_client && data.by_client.length > 0 && (
        <div className="bg-slate-50 dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-3 flex items-center justify-between">
            <span>Client & Account Usage Breakdown</span>
            <span className="text-[10px] font-normal lowercase">{data.by_client.length} clients</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.by_client.map((cl) => (
              <div key={cl.client_id} className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <Building2 size={13} className="text-indigo-500 shrink-0" />
                  <span className="font-semibold text-slate-800 dark:text-zinc-200 truncate">{cl.name || `Client #${cl.client_id}`}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">({cl.calls} calls)</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white shrink-0">${cl.cost.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent API Requests Log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-300 flex items-center gap-2">
            <Activity size={14} className="text-indigo-600" />
            Recent API Calls ({data.recent_calls.length})
          </h4>
          <button
            onClick={loadData}
            className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>

        <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 dark:bg-zinc-800/60 text-slate-500 dark:text-zinc-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200 dark:border-zinc-800 sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Endpoint</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3 text-right">Tokens</th>
                  <th className="py-2.5 px-3 text-right">Cost</th>
                  <th className="py-2.5 px-3 text-right">Latency</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80 text-slate-700 dark:text-zinc-300">
                {data.recent_calls.map((call) => (
                  <tr key={call.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="py-2 px-3 text-[11px] text-slate-400 font-mono whitespace-nowrap">
                      {call.timestamp ? new Date(call.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-800 dark:text-zinc-200 truncate max-w-[140px]" title={call.endpoint}>
                      {call.endpoint}
                    </td>
                    <td className="py-2 px-3 text-[11px] text-slate-500 font-mono">
                      {call.model}
                    </td>
                    <td className="py-2 px-3 text-right text-[11px] font-mono">
                      {call.total_tokens ? call.total_tokens.toLocaleString() : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900 dark:text-white font-mono">
                      ${call.total_cost.toFixed(4)}
                    </td>
                    <td className="py-2 px-3 text-right text-[11px] text-slate-400 font-mono">
                      {call.response_time_ms}ms
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        call.status_code >= 200 && call.status_code < 300
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                      }`}>
                        {call.status_code}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.recent_calls.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                      No API calls tracked yet for this tenant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

