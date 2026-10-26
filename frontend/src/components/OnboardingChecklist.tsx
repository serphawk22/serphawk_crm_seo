"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Rocket } from "lucide-react";
import { API_BASE_URL } from "@/config";

export interface ChecklistItem {
  key: string;
  title: string;
  done: boolean;
  optional: boolean;
  link: string;
}

interface Checklist {
  items: ChecklistItem[];
  completed: number;
  total: number;
  percent: number;
}

interface Props {
  /** Hide the card once every required step is done (used on the dashboard). */
  hideWhenDone?: boolean;
  /** Called when the data (re)loads, so a page can reuse the profile / options the endpoint returns. */
  onLoaded?: (data: any) => void;
  refreshKey?: number;
}

/** "What is left to set up" for a company Admin; computed on the server from live data. */
export default function OnboardingChecklist({ hideWhenDone, onLoaded, refreshKey = 0 }: Props) {
  const [data, setData] = useState<Checklist | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/tenant/onboarding`);
      if (!res.ok) return;
      const body = await res.json();
      setData(body);
      onLoaded?.(body);
    } catch {
      /* the card is a convenience: stay hidden if it cannot load */
    }
  }, [onLoaded]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!data) return null;
  if (hideWhenDone && data.percent >= 100) return null;

  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="text-lg font-bold flex items-center gap-2"><Rocket className="w-5 h-5 text-indigo-600" /> Get your workspace ready</h2>
        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">{data.completed} of {data.total} done</span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden mb-4" role="progressbar" aria-valuenow={data.percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-indigo-600 transition-all" style={{ width: `${data.percent}%` }} />
      </div>
      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
        {data.items.map((i) => (
          <li key={i.key} className="flex items-center gap-2 text-sm">
            {i.done ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <Circle className="w-4 h-4 text-gray-300 shrink-0" />}
            {i.done ? (
              <span className="text-gray-500 line-through">{i.title}</span>
            ) : (
              <Link href={i.link} className="text-gray-800 dark:text-gray-100 hover:text-indigo-600">
                {i.title}{i.optional ? <span className="text-gray-400"> (optional)</span> : null}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
