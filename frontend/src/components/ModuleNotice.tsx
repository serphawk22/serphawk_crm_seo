"use client";

import { useEffect, useRef } from "react";
import { ToastStack, useToasts } from "@/components/Toasts";

/** Shows one clear message when a request is refused because the company does not have that module
 *  (the API answers 403 with a `feature` key; RoleContext announces it as a "module-not-enabled" event). */
export default function ModuleNotice() {
  const { toasts, dismiss, info } = useToasts();
  const lastShown = useRef<Record<string, number>>({});

  useEffect(() => {
    const onBlocked = (e: Event) => {
      const { feature, message } = (e as CustomEvent<{ feature: string; message?: string }>).detail || ({} as { feature: string; message?: string });
      if (!feature) return;
      const now = Date.now();
      if (now - (lastShown.current[feature] || 0) < 8000) return;      // one message per module, not one per request
      lastShown.current[feature] = now;
      info("Module not enabled", message || "This feature is not part of your plan. Ask your administrator to switch it on.");
    };
    window.addEventListener("module-not-enabled", onBlocked);
    return () => window.removeEventListener("module-not-enabled", onBlocked);
  }, [info]);

  return <ToastStack toasts={toasts} dismiss={dismiss} />;
}
