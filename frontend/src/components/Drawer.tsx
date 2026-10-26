"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  /** Shown left of the title (a logo, an icon). */
  leading?: ReactNode;
  /** Tailwind max-width class for the panel. */
  width?: string;
  /** Pinned under the content (primary buttons). */
  footer?: ReactNode;
  /** Pinned between the header and the content (tabs). */
  tabs?: ReactNode;
  children: ReactNode;
}

/** A slide-over panel from the right. Esc and a click outside close it; the page behind does not scroll. */
export default function Drawer({ open, onClose, title, subtitle, leading, width = "max-w-2xl", footer, tabs, children }: DrawerProps) {
  // Rendered into <body>: inside the page, a transformed ancestor would trap it below the app's fixed footer and chat button.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className={`absolute right-0 top-0 flex h-full w-full ${width} flex-col bg-white dark:bg-zinc-950 shadow-2xl border-l border-slate-200 dark:border-zinc-800`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
          >
            <header className="flex items-start gap-3 border-b border-slate-200 dark:border-zinc-800 px-6 py-5">
              {leading}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
                {subtitle && <div className="mt-0.5 text-sm text-slate-500 dark:text-zinc-400">{subtitle}</div>}
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
                <X className="w-5 h-5" />
              </button>
            </header>
            {tabs && <div className="border-b border-slate-200 dark:border-zinc-800 px-6">{tabs}</div>}
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <footer className="border-t border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/60 px-6 py-4">{footer}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
