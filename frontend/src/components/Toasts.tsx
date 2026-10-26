"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

/** Small page-level toast queue: `const { toasts, dismiss, success, error } = useToasts()` and render <ToastStack />. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = next.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, title, message }]);
      timers.current.set(id, setTimeout(() => dismiss(id), kind === "error" ? 9000 : 5000));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  return {
    toasts,
    dismiss,
    success: (title: string, message?: string) => push("success", title, message),
    error: (title: string, message?: string) => push("error", title, message),
    info: (title: string, message?: string) => push("info", title, message),
  };
}

const STYLE: Record<ToastKind, { ring: string; icon: React.ReactNode }> = {
  success: { ring: "border-emerald-200 dark:border-emerald-900/60", icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" /> },
  error: { ring: "border-red-200 dark:border-red-900/60", icon: <AlertCircle className="w-5 h-5 text-red-500" /> },
  info: { ring: "border-blue-200 dark:border-blue-900/60", icon: <Info className="w-5 h-5 text-blue-500" /> },
};

export function ToastStack({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed bottom-28 right-6 z-[10010] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            role={t.kind === "error" ? "alert" : "status"}
            className={`flex items-start gap-3 rounded-xl border bg-white dark:bg-zinc-900 px-4 py-3 shadow-xl shadow-black/10 ${STYLE[t.kind].ring}`}
          >
            <div className="mt-0.5 shrink-0">{STYLE[t.kind].icon}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{t.title}</p>
              {t.message && <p className="mt-0.5 text-sm text-slate-600 dark:text-zinc-400 break-words">{t.message}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
