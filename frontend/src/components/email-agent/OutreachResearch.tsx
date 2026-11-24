"use client";

import { CopyButton } from "./CopyButton";

export type OutreachResearchData = {
  summary: string;
  business_model: string;
  products: string[];
  recent_news: string[];
  source_url: string;
  people: {
    name: string;
    role: string;
    profile: string;
    recent_updates?: string[];
    email: string;
    phone: string;
    linkedin: string;
    linkedin_intro: string;
    whatsapp_intro: string;
  }[];
};

export function readOutreachResearch(value: string | undefined): OutreachResearchData | undefined {
  try {
    const research = value ? JSON.parse(value)?.outreach_research : undefined;
    if (research?.summary && Array.isArray(research.people) && Array.isArray(research.products) && Array.isArray(research.recent_news)) {
      return research;
    }
  } catch {
    return undefined;
  }
}

function publicLink(value: string) {
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch {
    return undefined;
  }
}

export function OutreachResearch({ research, showSummary = true }: { research: OutreachResearchData; showSummary?: boolean }) {
  const source = publicLink(research.source_url);
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <summary className="cursor-pointer font-bold">Company research and outreach</summary>
      <div className="mt-4 space-y-4">
        {source
          ? <a href={source} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 underline dark:text-indigo-400">Company website</a>
          : <p className="text-slate-500 dark:text-zinc-400">The company website was unavailable. Verify the research before using it.</p>}
        {showSummary && <p className="whitespace-pre-wrap break-words leading-relaxed">{research.summary}</p>}
        {research.business_model && <p><strong>Business model</strong> · {research.business_model}</p>}
        {research.products.length > 0 && <p><strong>Products and services</strong> · {research.products.join(", ")}</p>}
        {research.recent_news.length > 0 && (
          <div>
            <h3 className="font-bold">Recent updates</h3>
            <ul className="list-disc space-y-1 pl-5">{research.recent_news.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        )}
        <div className="space-y-2">
          <h3 className="font-bold">Decision-makers</h3>
          {research.people.length === 0 && <p>No decision-makers found on the pages reviewed.</p>}
          {research.people.map((person) => {
            const linkedin = publicLink(person.linkedin);
            const internationalPhone = person.phone.startsWith("+") ? person.phone.replace(/\D/g, "") : "";
            const whatsapp = /^\d{8,15}$/.test(internationalPhone)
              ? `https://wa.me/${internationalPhone}?text=${encodeURIComponent(person.whatsapp_intro)}`
              : "";
            return (
              <div key={person.name} className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-zinc-700">
                <p><strong>{person.name}</strong>{person.role && ` · ${person.role}`}</p>
                {person.profile && <p>{person.profile}</p>}
                {person.recent_updates && person.recent_updates.length > 0 && (
                  <ul className="list-disc pl-5">{person.recent_updates.map((item) => <li key={item}>{item}</li>)}</ul>
                )}
                {person.email && <p className="break-all">{person.email}</p>}
                {person.phone && <p>{person.phone}</p>}
                {person.linkedin_intro && <div className="flex items-start gap-2"><p className="flex-1"><strong>LinkedIn draft</strong> · {person.linkedin_intro}</p><CopyButton text={person.linkedin_intro} /></div>}
                {person.whatsapp_intro && <div className="flex items-start gap-2"><p className="flex-1"><strong>WhatsApp draft</strong> · {person.whatsapp_intro}</p><CopyButton text={person.whatsapp_intro} /></div>}
                <div className="flex flex-wrap gap-3 font-semibold text-indigo-600 dark:text-indigo-400">
                  {linkedin && <a href={linkedin} target="_blank" rel="noreferrer" className="underline">Open LinkedIn</a>}
                  {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="underline">Open WhatsApp</a>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}
