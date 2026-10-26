"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, Webhook } from "lucide-react";
import { API_BASE_URL } from "@/config";

interface Props {
  /** The key saved for this company, if any. */
  currentKey?: string | null;
  onChanged?: () => void;
}

/** A company's website form key: generate it, copy it, and see exactly what the form has to send. */
export default function LeadWebhookCard({ currentKey, onChanged }: Props) {
  const [key, setKey] = useState<string | null>(currentKey || null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  const generate = async () => {
    if (key && !window.confirm("A new key replaces the current one. The form on your website stops working until it uses the new key. Continue?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/tenant/lead-intake-key`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not create a key");
      setKey(data.api_key);
      onChanged?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const endpoint = `${API_BASE_URL}/leads/webhook`;
  const curl = `curl -X POST ${endpoint} \\\n  -H "X-API-Key: ${key || "YOUR_KEY"}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"Jo Prospect","email":"jo@example.com","phone":"+91 98765 43210","form_name":"Contact us","message":"Hello"}'`;

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      /* clipboard blocked: the text stays selectable */
    }
  };

  const CopyBtn = ({ what, text }: { what: string; text: string }) => (
    <button type="button" onClick={() => copy(what, text)} className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
      {copied === what ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />} {copied === what ? "Copied" : "Copy"}
    </button>
  );

  return (
    <section id="website-leads" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2"><Webhook className="w-5 h-5 text-blue-600" /> Website lead form</h2>
      <p className="text-xs text-gray-500">
        Let the contact form on your website create leads here. Each submission becomes a lead with its message, a contact and a note,
        and is handed to a salesperson by your assignment rule. The form sends this key with every submission; keep it private.
      </p>
      {key ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs break-all">{key}</code>
          <CopyBtn what="key" text={key} />
        </div>
      ) : (
        <p className="text-sm text-gray-500">No key yet, so the form is switched off.</p>
      )}
      <button type="button" onClick={generate} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} {key ? "Create a new key" : "Create a key"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {key && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300">What the form has to send</summary>
          <div className="mt-2 space-y-2">
            <p>Post JSON or a normal form to <code>{endpoint}</code> with the header <code>X-API-Key</code>. Useful fields: name, email, phone, company_name, form_name, page_url, service, message. Any other field is kept on the lead.</p>
            <div className="flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded-md bg-gray-100 dark:bg-gray-800 p-2 text-[11px] leading-snug">{curl}</pre>
              <CopyBtn what="curl" text={curl} />
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
