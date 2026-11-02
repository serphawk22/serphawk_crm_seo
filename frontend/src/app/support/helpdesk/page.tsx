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
      if (alive) { setUrl(target.href); window.location.assign(target.href); }
    }).catch(error => { if (alive) setError(error.message); });
    return () => { alive = false; };
  }, []);
  return <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"><h1 className="text-2xl font-bold">Support @SH</h1><p role="status" className="text-sm text-slate-500">{error || "Opening the support ticketing portal…"}</p>{url && <a className="font-semibold text-indigo-600 underline" href={url}>Continue to the support portal</a>}</div>;
}
