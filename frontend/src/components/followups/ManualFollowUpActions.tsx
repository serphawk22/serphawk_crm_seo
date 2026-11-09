'use client';

import { useState } from 'react';
import { Bell, Loader2, Send, Sparkles } from 'lucide-react';
import { useRole } from '@/context/RoleContext';
import { useLanguage } from '@/context/LanguageContext';
import LocalizedText from '@/components/LocalizedText';
import { post, errorText } from '@/lib/inboxApi';
import { btn } from './followupUi';

type Action = 'reminders' | 'send' | 'scan';
type Result = { cancelled?: boolean; reminders?: number; overdue?: number; sent?: number; scanned?: number; created?: number; matched?: number };

export default function ManualFollowUpActions({ onChanged }: { onChanged: () => void }) {
  const { role } = useRole();
  const { t } = useLanguage();
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const run = async (action: Action) => {
    setBusy(action);
    setMessage('');
    setError('');
    try {
      const result = await post<Result>('/followups/run-now', { action });
      if (result.cancelled) return;
      setMessage(action === 'scan'
        ? t('Scanned: {{scanned}}. Created: {{created}}. Updated: {{matched}}.', { scanned: result.scanned ?? 0, created: result.created ?? 0, matched: result.matched ?? 0 })
        : action === 'send' ? t('Emails sent: {{sent}}.', { sent: result.sent ?? 0 })
          : t('Reminders: {{reminders}}. Overdue notices: {{overdue}}.', { reminders: result.reminders ?? 0, overdue: result.overdue ?? 0 }));
      onChanged();
    } catch (e) {
      setError(errorText(e, t('Could not run this action.')));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-slate-500 dark:text-zinc-400"><LocalizedText text="Follow-up processing is manual. Reminders and prepared emails run only when an admin clicks below. Each click processes a limited batch; click again if more remain." /></p>
      {['Admin', 'SuperAdmin'].includes(role) && <div className="flex flex-wrap gap-2">
        {([
          ['reminders', Bell, 'Send due reminders'],
          ['send', Send, 'Send due emails'],
          ['scan', Sparkles, 'Scan recent notes'],
        ] as const).map(([action, Icon, label]) => <button key={action} type="button" className={btn.secondary} disabled={busy !== null} onClick={() => run(action)}>
          {busy === action ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
          <LocalizedText text={label} />
        </button>)}
      </div>}
      {message && <p role="status" className="text-emerald-700 dark:text-emerald-400">{message}</p>}
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
