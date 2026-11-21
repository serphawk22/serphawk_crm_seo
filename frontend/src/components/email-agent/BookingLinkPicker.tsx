"use client";

import { useState } from "react";

const PROVIDERS = [
  { label: "Calendly", domains: ["calendly.com"] },
  { label: "Google Calendar", domains: ["calendar.google.com", "calendar.app.google"] },
  { label: "Microsoft Bookings", domains: ["outlook.office.com", "outlook.office365.com", "outlook.live.com", "bookings.microsoft.com"] },
  { label: "Other booking link", domains: [] },
];

export default function BookingLinkPicker({ onInsert }: { onInsert: (url: string) => void }) {
  const [provider, setProvider] = useState(PROVIDERS[0].label);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  function insert() {
    try {
      const link = new URL(url.trim());
      const domains = PROVIDERS.find(({ label }) => label === provider)?.domains ?? [];
      const host = link.hostname.replace(/^www\./, "");
      if (link.protocol !== "https:" || link.username || link.password || (domains.length && !domains.includes(host))) {
        throw new Error("Invalid booking link");
      }
      onInsert(link.href);
      setError("");
    } catch {
      setError(`Enter a valid HTTPS booking link for ${provider}.`);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <select aria-label="Calendar provider" value={provider} onChange={(event) => {
          setProvider(event.target.value);
          setError("");
        }} className="rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          {PROVIDERS.map(({ label }) => <option key={label}>{label}</option>)}
        </select>
        <input aria-label="Your calendar booking link" type="url" value={url} maxLength={1000}
          onChange={(event) => { setUrl(event.target.value); setError(""); }}
          placeholder="Paste your booking link"
          className="min-w-44 flex-1 rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button type="button" disabled={!url.trim()} onClick={insert}
          className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-600 disabled:opacity-40 dark:border-indigo-800 dark:text-indigo-300">
          Insert booking link
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
