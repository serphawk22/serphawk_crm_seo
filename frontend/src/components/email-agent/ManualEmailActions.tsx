'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Loader2, RefreshCw } from 'lucide-react';
import LocalizedText from '@/components/LocalizedText';
import { campaignsApi, wasCancelled, type Campaign } from '@/lib/followupsApi';
import { errorText } from '@/lib/inboxApi';
import { useTenantConfig } from '@/context/TenantConfigContext';

export default function ManualEmailActions() {
  const { hasFeature } = useTenantConfig();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState<number | 'load' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = async () => {
    const result = await campaignsApi.list(true);
    setItems(result.items.filter(c => ['Queued', 'Sending'].includes(c.status) || c.pending > 0 || c.failed > 0));
  };
  const inspect = async () => {
    setOpen(true);
    setBusy('load');
    setError('');
    try { await load(); }
    catch (e) { setError(errorText(e, 'Could not load campaigns.')); }
    finally { setBusy(null); }
  };
  const recover = async (campaign: Campaign) => {
    setBusy(campaign.id);
    setError('');
    setNotice('');
    try {
      const active = ['Queued', 'Sending'].includes(campaign.status);
      const result = await (active ? campaignsApi.resume(campaign.id) : campaignsApi.retry(campaign.id));
      if (wasCancelled(result)) return;
      setNotice('Campaign processing requested. Open its details or refresh to check progress.');
      await load();
    } catch (e) { setError(errorText(e, 'Could not resume the campaign.')); }
    finally { setBusy(null); }
  };
  return <section className="space-y-3 rounded-xl border border-indigo-200 bg-white p-4 dark:border-indigo-500/30 dark:bg-zinc-900">
    <div className="flex flex-wrap items-center gap-2">
      <div className="mr-auto">
        <p className="text-sm font-bold text-slate-900 dark:text-white"><LocalizedText text="Manual actions" /></p>
        <p className="text-xs text-slate-500 dark:text-zinc-400"><LocalizedText text="Run follow-ups or recover email campaigns when needed." /></p>
      </div>
      {hasFeature('followups') && <Link href="/followups" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 dark:border-zinc-700 dark:text-zinc-200">
        <CalendarClock size={14} /><LocalizedText text="Follow-up actions" />
      </Link>}
      <button type="button" aria-expanded={open} aria-controls="manual-campaign-recovery" onClick={inspect} disabled={busy !== null}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
        {busy === 'load' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        <LocalizedText text={open ? 'Refresh campaigns' : 'Campaign recovery'} />
      </button>
    </div>
    {open && <div id="manual-campaign-recovery" className="space-y-2">
      <p className="text-xs text-slate-500 dark:text-zinc-400"><LocalizedText text="Only your accessible campaigns are listed. Recovery runs once and requires email confirmation." /></p>
      {busy === null && items.length === 0 && !error && <p className="text-xs text-slate-600 dark:text-zinc-300"><LocalizedText text="No campaigns need recovery." /></p>}
      {items.map(c => <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3 text-xs dark:border-zinc-700">
        <span className="mr-auto font-bold text-slate-700 dark:text-zinc-200">{c.name} · {c.status}</span>
        <a href={`/email-agent?mode=excel&campaign=${c.id}`} className="font-semibold text-indigo-600 dark:text-indigo-400"><LocalizedText text="View details" /></a>
        <button type="button" disabled={busy !== null} onClick={() => recover(c)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200">
          {busy === c.id && <Loader2 size={12} className="mr-1 inline animate-spin" />}
          <LocalizedText text={['Queued', 'Sending'].includes(c.status) ? 'Resume pending' : 'Retry failed / unsent'} />
        </button>
      </div>)}
    </div>}
    {notice && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400"><LocalizedText text={notice} /></p>}
    {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
  </section>;
}
