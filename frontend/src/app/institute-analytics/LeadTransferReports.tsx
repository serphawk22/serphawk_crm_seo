"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertCircle, ArrowRightLeft, Loader2, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "@/config";

interface TransferReportRow {
  id: number;
  lead_id: number;
  lead_name: string;
  lead_stage: string;
  from_name: string;
  to_name: string;
  transferred_by_name: string;
  reason: string;
  transferred_at: string;
}

interface ContributionRow {
  user_id: number;
  name: string;
  total_activities: number;
  contribution_percentage: number;
  communications: number;
  follow_ups: number;
  meetings: number;
  walk_ins: number;
  webinars: number;
  demos: number;
}

interface ReportProps {
  getAuthHeaders: () => Record<string, string>;
}

export default function LeadTransferReports({ getAuthHeaders }: ReportProps) {
  const [allTime, setAllTime] = useState(true);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [transfers, setTransfers] = useState<TransferReportRow[]>([]);
  const [transferTotal, setTransferTotal] = useState(0);
  const [contributions, setContributions] = useState<ContributionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (allTime) params.set("all_time", "true");
    else {
      params.set("start_date", startDate);
      params.set("end_date", endDate);
    }
    try {
      const [transferResponse, contributionResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/reports/lead-transfers?${params}`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/reports/sales-contribution?${params}`, { headers: getAuthHeaders() }),
      ]);
      const [transferData, contributionData] = await Promise.all([
        transferResponse.json(),
        contributionResponse.json(),
      ]);
      if (!transferResponse.ok) throw new Error(transferData.detail || "Could not load lead transfers.");
      if (!contributionResponse.ok) throw new Error(contributionData.detail || "Could not load sales contribution.");
      setTransfers(transferData.transfers || []);
      setTransferTotal(transferData.total || 0);
      setContributions(contributionData.salespeople || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load transfer reports.");
    } finally {
      setLoading(false);
    }
  }, [allTime, endDate, getAuthHeaders, startDate]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <ArrowRightLeft className="h-5 w-5 text-indigo-500" /> Lead transfers & activity contribution
          </h2>
          <p className="mt-1 text-xs text-slate-500">Review transfer history and each salesperson’s share of recorded interactions.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setAllTime(true)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${allTime ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-300"}`}>All time</button>
          <button type="button" onClick={() => setAllTime(false)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${!allTime ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-300"}`}>Date range</button>
          {!allTime && (
            <>
              <input aria-label="Report start date" type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
              <input aria-label="Report end date" type="date" value={endDate} onChange={event => setEndDate(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
            </>
          )}
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh transfer reports" className="rounded-lg bg-slate-100 p-2 text-slate-500 hover:text-indigo-600 disabled:opacity-50 dark:bg-zinc-800"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
        </div>
      </header>

      {error && <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="h-4 w-4" />{error}</p>}

      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="glass-card rounded-2xl border border-white/10 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-white">Activity contribution</h3>
                <span className="text-xs text-slate-500">Equal weight per activity</span>
              </div>
              <p className="mb-4 text-xs text-slate-500">Based on recorded communications and completed follow-ups, meetings, walk-ins, webinars, and demos.</p>
              <div className="space-y-3">
                {contributions.map(person => (
                  <div key={person.user_id} className="rounded-xl bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{person.name}</span>
                      <span className="shrink-0 text-sm font-bold text-indigo-600 dark:text-indigo-300">{person.contribution_percentage}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${person.contribution_percentage}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {person.total_activities} total · {person.communications} communications · {person.follow_ups} follow-ups · {person.meetings} meetings · {person.walk_ins} walk-ins · {person.webinars} webinars · {person.demos} demos
                    </p>
                  </div>
                ))}
                {contributions.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No sales activity recorded in this period.</p>}
              </div>
            </div>

            <div className="glass-card rounded-2xl border border-white/10 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-white">Transfer summary</h3>
                <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-bold text-indigo-600">{transferTotal} transfers</span>
              </div>
              <div className="max-h-[390px] overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-zinc-900">
                    <tr><th className="p-2">Lead / stage</th><th className="p-2">From → To</th><th className="p-2">Reason</th></tr>
                  </thead>
                  <tbody>
                    {transfers.map(transfer => (
                      <tr key={transfer.id} className="border-t border-slate-100 align-top dark:border-zinc-800">
                        <td className="p-2">
                          <a className="font-semibold text-indigo-600 hover:underline" href={`/leads/${transfer.lead_id}`}>{transfer.lead_name}</a>
                          <p className="mt-1 text-slate-500">{transfer.lead_stage}</p>
                          <p className="mt-1 text-[10px] text-slate-400">{new Date(transfer.transferred_at).toLocaleString()}</p>
                        </td>
                        <td className="whitespace-nowrap p-2 text-slate-600 dark:text-slate-300">{transfer.from_name} → {transfer.to_name}<p className="mt-1 text-[10px] text-slate-400">by {transfer.transferred_by_name}</p></td>
                        <td className="min-w-36 p-2 text-slate-600 dark:text-slate-300">{transfer.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {transfers.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No lead transfers in this period.</p>}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400"><Activity className="mr-1 inline h-3 w-3" />Contribution percentages are each salesperson’s counted activities divided by all counted activities for the selected period.</p>
        </>
      )}
    </section>
  );
}
