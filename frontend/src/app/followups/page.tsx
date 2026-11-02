'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CalendarCheck, CalendarClock, CheckCircle2, Clock, Loader2, Plus, RefreshCw, Search, XCircle, type LucideIcon,
} from 'lucide-react';
import { errorText } from '@/lib/inboxApi';
import { followupsApi, type FollowUp, type FollowUpCounts, type FollowUpView } from '@/lib/followupsApi';
import FollowUpList from '@/components/followups/FollowUpList';
import { FollowUpFormDialog } from '@/components/followups/FollowUpDialogs';
import { btn } from '@/components/followups/followupUi';
import { cn } from '@/lib/utils';

const TABS: { key: FollowUpView; label: string; count?: keyof FollowUpCounts }[] = [
  { key: 'overdue', label: 'Overdue', count: 'overdue' },
  { key: 'today', label: 'Due today', count: 'today' },
  { key: 'upcoming', label: 'Upcoming', count: 'upcoming' },
  { key: 'pending', label: 'All pending', count: 'pending' },
  { key: 'completed', label: 'Completed', count: 'completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const PAGE = 50;

function StatCard({ label, value, hint, icon: Icon, tone, active, onClick }: {
  label: string; value: number | string; hint: string; icon: LucideIcon; tone: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={cn(
        "flex items-center justify-between rounded-xl border bg-white dark:bg-[#111111]/90 p-2.5 sm:px-3 text-left shadow-xs transition-all",
        active ? "border-amber-500 ring-1 ring-amber-500/40" : "border-slate-200/90 dark:border-white/10 hover:border-amber-500/60"
      )}>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-zinc-400">{label}</p>
        <p className="text-base sm:text-lg font-bold leading-tight text-slate-900 dark:text-white mt-0.5">{value}</p>
        <p className="truncate text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">{hint}</p>
      </div>
      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", tone)}>
        <Icon size={14} />
      </div>
    </button>
  );
}

export default function FollowUpsPage() {
  const [view, setView] = useState<FollowUpView>('overdue');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<FollowUp[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<FollowUpCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [initialised, setInitialised] = useState(false);

  // Deep link (/followups?view=today); otherwise open on the most urgent non-empty tab.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view') as FollowUpView | null;
    if (v && TABS.some((t) => t.key === v)) setView(v);
    followupsApi.summary().then((s) => {
      setCounts(s.counts);
      if (!v) setView(s.counts.overdue ? 'overdue' : s.counts.today ? 'today' : s.counts.upcoming ? 'upcoming' : 'pending');
    }).catch(() => undefined).finally(() => setInitialised(true));
  }, []);

  const load = useCallback(async (append = false) => {
    setLoading(true);
    setError('');
    try {
      const [list, summary] = await Promise.all([
        followupsApi.list({ view, mine, q: search || undefined, limit: PAGE, offset: append ? items.length : 0 }),
        followupsApi.summary(mine),
      ]);
      setItems((prev) => (append ? [...prev, ...list.items] : list.items));
      setTotal(list.total);
      setCounts(summary.counts);
    } catch (e) {
      setError(errorText(e, 'Could not load follow-ups.'));
    } finally {
      setLoading(false);
    }
  }, [view, mine, search]);

  useEffect(() => {
    if (initialised) load();
  }, [load, initialised]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-4">
      {/* Compact Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#111111]/90 p-3 sm:px-4 sm:py-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
            <CalendarClock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none">Follow-ups</h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                {total} tasks
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Next steps with leads and clients — reminders, AI email preparation &amp; history
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-zinc-300 cursor-pointer">
            <input type="checkbox" className="h-3.5 w-3.5 accent-amber-500 rounded" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            Only mine
          </label>
          <button className="p-1.5 rounded-lg border border-slate-200/90 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300 transition-colors" onClick={() => load()} disabled={loading} title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin text-amber-500' : ''} />
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold text-xs shadow-xs transition" onClick={() => setCreating(true)}>
            <Plus size={14} /> New follow-up
          </button>
        </div>
      </div>

      {/* 4-KPI Metric Strip */}
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
        <StatCard label="Overdue" value={counts?.overdue ?? '–'} hint="Past their follow-up date" icon={AlertTriangle}
          tone="bg-red-500/10 text-red-600 dark:text-red-400" active={view === 'overdue'} onClick={() => setView('overdue')} />
        <StatCard label="Due today" value={counts?.today ?? '–'} hint="Follow up before day ends" icon={Clock}
          tone="bg-amber-500/10 text-amber-600 dark:text-amber-400" active={view === 'today'} onClick={() => setView('today')} />
        <StatCard label="Upcoming" value={counts?.upcoming ?? '–'} hint={counts ? `${counts.upcoming_7d} in next 7 days` : 'Scheduled later'} icon={CalendarClock}
          tone="bg-sky-500/10 text-sky-600 dark:text-sky-400" active={view === 'upcoming'} onClick={() => setView('upcoming')} />
        <StatCard label="Completed" value={counts?.completed ?? '–'} hint={counts ? `${counts.completed_7d} this week` : 'Tasks finished'} icon={CheckCircle2}
          tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" active={view === 'completed'} onClick={() => setView('completed')} />
      </div>

      {/* Tabs and Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-white dark:bg-[#111111]/90 p-2 sm:px-3 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex flex-wrap gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-white/5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setView(t.key)}
              className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all",
                view === t.key
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-white/10 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400')}>
              {t.label}
              {t.count && counts && counts[t.count] > 0 && (
                <span className={cn("rounded-full px-1.5 text-[10px] font-bold",
                  t.key === 'overdue' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-slate-200 text-slate-600 dark:bg-zinc-700 dark:text-zinc-300')}>
                  {counts[t.count]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, contact, company…"
            className="w-full rounded-lg border border-slate-200/80 bg-slate-50 py-1 pl-8 pr-3 text-xs outline-none focus:border-amber-400 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100" />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <XCircle size={16} /> {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : (
        <FollowUpList
          items={items}
          onChanged={() => load()}
          empty={!error && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-14 text-center dark:border-white/10">
              <CalendarCheck className="text-slate-300 dark:text-zinc-600" size={36} />
              <p className="text-sm font-bold text-slate-500 dark:text-zinc-400">
                {view === 'overdue' ? 'Nothing overdue — nice work.' : view === 'today' ? 'No follow-ups due today.' : 'No follow-ups here.'}
              </p>
              <p className="max-w-md text-xs text-slate-400">
                Follow-ups are created from a lead or client page, from the Email Agent’s Excel campaigns, or automatically when AI finds a promised next step in your notes.
              </p>
            </div>
          )}
        />
      )}
      {items.length < total && (
        <div className="flex justify-center">
          <button className={btn.secondary} onClick={() => load(true)} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : null} Load more ({total - items.length})
          </button>
        </div>
      )}

      {creating && <FollowUpFormDialog onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
}
