"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import FeatureAccessNotice from "@/components/FeatureAccessNotice";
import { useRole } from "@/context/RoleContext";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { isPlatformManagementPage, moduleForPath, moduleLabel } from "@/lib/moduleRoutes";

/** Closes a page whose module the company does not have. The menu already hides such entries; this makes the address
 *  itself (typed, bookmarked, linked from elsewhere) lead to a clear message instead of the working page. */
export default function ModuleGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { role, isAuthenticated } = useRole();
  const { loaded, features, refresh } = useTenantConfig();
  const key = moduleForPath(pathname);
  const platformManagement = role === 'SuperAdmin' && isPlatformManagementPage(pathname);

  // If the company's settings cannot be read, fail open (as the menu does) instead of waiting forever.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    setGaveUp(false);
    if (!key || loaded || !isAuthenticated) return;
    const t = setTimeout(() => setGaveUp(true), 3000);
    return () => clearTimeout(t);
  }, [key, loaded, isAuthenticated, pathname]);

  const blocked = !platformManagement && !!key && isAuthenticated && loaded && features[key as string] === false;

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

  if (platformManagement && isAuthenticated) return <>{children}</>;
  if (key && isAuthenticated && role === 'SuperAdmin') return (
    <FeatureAccessNotice key={`superadmin:${key}`} kind="superadmin" feature={moduleLabel(key)} />
  );
  if (!key || !isAuthenticated) return <>{children}</>;

  if (!loaded) {
    return gaveUp ? <>{children}</> : (
      <div className="flex justify-center py-24"><Loader2 className="animate-spin text-slate-400" /></div>
    );
  }
  if (features[key] !== false) return <>{children}</>;

  return <FeatureAccessNotice key={`module:${key}`} kind="module" feature={moduleLabel(key)} />;
}
