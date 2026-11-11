"use client";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/config";

export default function HelpdeskPage() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE_URL}/support/helpdesk`).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not open the support portal");
      const target = new URL(data.url);
      if (!["https:", "http:"].includes(target.protocol)) throw new Error("The support portal address is invalid");
      if (alive) setUrl(target.href);
    }).catch(error => { if (alive) setError(error.message); });
    return () => { alive = false; };
  }, []);
  return <section className="flex min-h-[80vh] flex-col gap-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">Support @SH</h1>
      {url && <a className="text-sm font-semibold text-indigo-600 underline" href={url} target="_blank" rel="noopener noreferrer">Open support in a new tab</a>}
    </header>
    {error ? <p role="alert">{error}</p> : !url ? <p role="status">Loading support portal…</p> : <>
      <p className="text-xs text-slate-500">If the portal blocks embedding or sign-in, use the new-tab link above.</p>
      <iframe title="Support ticketing portal" src={url} className="min-h-[70vh] w-full flex-1 rounded-xl border border-slate-200 bg-white" referrerPolicy="strict-origin-when-cross-origin" allow="clipboard-write" />
    </>}
  </section>;
}
