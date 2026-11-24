"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";
import { useRole } from "@/context/RoleContext";
import { CopyButton } from "@/components/email-agent/CopyButton";

type Draft = { to_email: string; subject: string; body: string };
type SavedDraft = Draft & { id: number };
type Plan = {
  summary: string;
  steps: string[];
  discovery: { question: string; suggested_answer: string }[];
  draft: Pick<Draft, "subject" | "body">;
};

const inputStyle = "w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";
const buttonStyle = "rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50";

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : data.detail?.message || "The request could not be completed.");
  }
  return data;
}

export default function SalesNextSteps({ kind, id, email = "" }: { kind: "leads" | "clients"; id: number; email?: string }) {
  const { role } = useRole();
  const { language } = useLanguage();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState<SavedDraft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!["Admin", "Demo", "SalesManager", "Sales", "Employee"].includes(role)) return null;
  const endpoint = `${API_BASE_URL}/${kind}/${id}/sales-next-steps`;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <Sparkles aria-hidden="true" size={16} className="text-indigo-500" /> Sales Next Steps
      </h2>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${buttonStyle} bg-indigo-600 text-white`} disabled={busy} onClick={() => run(async () => {
          const next = await readResponse<Plan>(await fetch(`${endpoint}?lang=${language === "es" ? "es" : "en"}`, { method: "POST" }));
          setPlan(next);
          setDraft(next.draft.body ? { to_email: email ?? "", ...next.draft } : null);
        })}>
          {plan ? "Refresh plan" : "Prepare a sales plan"}
        </button>
        <button type="button" className={`${buttonStyle} border border-slate-200 dark:border-zinc-700`} disabled={busy} onClick={() => run(async () => {
          const data = await readResponse<{ drafts: SavedDraft[] }>(await fetch(`${endpoint}/draft`, { cache: "no-store" }));
          setHistory(data.drafts);
        })}>Saved drafts</button>
      </div>
      {busy && <p role="status" className="text-sm text-slate-500">Working…</p>}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {plan && (
        <div className="space-y-3 text-sm leading-relaxed">
          {plan.summary && <p>{plan.summary}</p>}
          <ol className="list-decimal space-y-1 pl-5">{plan.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
          {plan.discovery.length > 0 && (
            <details className="rounded-lg border border-slate-200 p-3 dark:border-zinc-700">
              <summary className="cursor-pointer font-semibold">Discovery questions and suggested answers</summary>
              <dl className="mt-2 space-y-3">
                {plan.discovery.map(({ question, suggested_answer }, index) => (
                  <div key={index}><dt className="font-medium">{question}</dt><dd>{suggested_answer}</dd></div>
                ))}
              </dl>
            </details>
          )}
        </div>
      )}
      {history && (
        <ul className="space-y-1 text-sm">
          {history.length === 0 && <li>No saved sales drafts for this record.</li>}
          {history.map((saved) => (
            <li key={saved.id}>
              <button type="button" className="text-left font-semibold text-indigo-600 underline dark:text-indigo-400" onClick={() => setDraft(saved)}>
                {saved.subject}
              </button>
            </li>
          ))}
        </ul>
      )}
      {draft && (
        <form className="space-y-2 border-t border-slate-200 pt-3 text-sm dark:border-zinc-700" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const saved = await readResponse<{ draft_id: number }>(await fetch(`${endpoint}/draft`, {
              method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
                to_email: draft.to_email, subject: draft.subject, body: draft.body,
              }),
            }));
            setHistory((previous) => previous && [{ ...draft, id: saved.draft_id }, ...previous.filter(({ id }) => id !== saved.draft_id)].slice(0, 10));
            setMessage("Draft saved to this record.");
          });
        }}>
          <h3 className="font-semibold">Review email draft</h3>
          <label className="block">To
            <input type="email" className={inputStyle} required maxLength={255} value={draft.to_email}
              onChange={(event) => setDraft({ ...draft, to_email: event.target.value })} />
          </label>
          <label className="block">Subject
            <input className={inputStyle} required maxLength={500} value={draft.subject}
              onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />
          </label>
          <label className="block">Message
            <textarea rows={7} className={inputStyle} required maxLength={8000} value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" className={`${buttonStyle} border border-slate-200 dark:border-zinc-700`} disabled={busy}>Save draft</button>
            <CopyButton text={draft.body} />
            {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
          </div>
        </form>
      )}
    </section>
  );
}
