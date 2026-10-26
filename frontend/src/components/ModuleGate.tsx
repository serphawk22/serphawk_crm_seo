"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { moduleForPath, moduleLabel } from "@/lib/moduleRoutes";

/** Closes a page whose module the company does not have. The menu already hides such entries; this makes the address
 *  itself (typed, bookmarked, linked from elsewhere) lead to a clear message instead of the working page. */
export default function ModuleGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { role, isAuthenticated } = useRole();
  const { loaded, features, refresh } = useTenantConfig();
  const key = moduleForPath(pathname);

  // If the company's settings cannot be read, fail open (as the menu does) instead of waiting forever.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    setGaveUp(false);
    if (!key || loaded || !isAuthenticated) return;
    const t = setTimeout(() => setGaveUp(true), 3000);
    return () => clearTimeout(t);
  }, [key, loaded, isAuthenticated, pathname]);

  const blocked = !!key && isAuthenticated && role !== "SuperAdmin" && loaded && features[key as string] === false;

  // Someone who lands on a closed page may have been given the module a moment ago: check once before telling them no.
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!blocked) {
      asked.current = null;
    } else if (asked.current !== key) {
      asked.current = key;      // once per closed page, never in a loop
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, key]);

  if (!key || !isAuthenticated || role === "SuperAdmin") return <>{children}</>;

  if (!loaded) {
    return gaveUp ? <>{children}</> : (
      <div className="flex justify-center py-24"><Loader2 className="animate-spin text-slate-400" /></div>
    );
  }
  if (features[key] !== false) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-800">
          <Lock className="h-5 w-5 text-slate-500" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">{moduleLabel(key)} is not part of your plan</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
          This module is not switched on for your company. Ask your administrator to add it.
        </p>
        <Link href="/" className="mt-5 inline-block rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}
