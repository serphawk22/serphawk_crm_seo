"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function ResponsiveDialog({ title, description, onClose, children }: {
  title: string; description: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  return createPortal(
    <dialog ref={ref} aria-labelledby="team-dialog-title" aria-describedby="team-dialog-description"
      onCancel={event => { event.preventDefault(); onClose(); }}
      className="team-dialog m-auto w-[calc(100%_-_2rem)] max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-white">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-zinc-800">
        <div><h2 id="team-dialog-title" className="text-lg font-bold tracking-tight">{title}</h2><p id="team-dialog-description" className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">{description}</p></div>
        <button type="button" onClick={onClose} aria-label="Close add team member" className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-zinc-800"><X className="h-5 w-5" /></button>
      </header>
      {children}
    </dialog>, document.body,
  );
}
