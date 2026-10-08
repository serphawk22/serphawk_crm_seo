"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Bell, Bot, CheckCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { audioSrc } from "@/lib/voiceAgentApi";

// ─── Styling tokens (match the rest of the CRM) ─────────────────────────────
export const labelCls = "text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2";
export const inputCls =
  "w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400";
export const cardCls = "bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm";
export const primaryBtn =
  "flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-black text-sm text-white bg-gradient-to-r from-violet-500 to-indigo-600 hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed";
export const ghostBtn =
  "flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed";

// ─── Toasts ─────────────────────────────────────────────────────────────────
export type ToastType = "info" | "success" | "error" | "warning";
interface Toast { id: number; message: string; type: ToastType }
let toastId = 0;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: number) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  const notify = useCallback((message: string, type: ToastType = "info") => {
    const id = ++toastId;
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => remove(id), 4500);
  }, [remove]);
  return { toasts, notify, remove };
}

export type Notify = (message: string, type?: ToastType) => void;

export function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60 }}
            className={cn(
              "pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border font-bold text-sm max-w-xs",
              t.type === "success" && "bg-emerald-500/90 text-white border-emerald-400/50",
              t.type === "error" && "bg-red-500/90 text-white border-red-400/50",
              t.type === "warning" && "bg-amber-500/90 text-white border-amber-400/50",
              t.type === "info" && "bg-indigo-500/90 text-white border-indigo-400/50",
            )}>
            {t.type === "info" && <Bot className="w-4 h-4 shrink-0" />}
            {t.type === "success" && <CheckCircle className="w-4 h-4 shrink-0" />}
            {t.type === "error" && <AlertCircle className="w-4 h-4 shrink-0" />}
            {t.type === "warning" && <Bell className="w-4 h-4 shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => onRemove(t.id)} className="opacity-70 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── One shared <audio> so only one clip plays at a time ────────────────────
export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
  }, []);

  const toggle = useCallback(async (url: string | null | undefined, key?: string) => {
    const id = key || url || "";
    if (!url) return;
    if (playing === id) { stop(); return; }
    stop();
    const audio = new Audio(audioSrc(url));
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    setPlaying(id);
    try { await audio.play(); } catch { setPlaying(null); }
  }, [playing, stop]);

  useEffect(() => stop, [stop]);
  return { playing, toggle, stop };
}

// ─── Badges ─────────────────────────────────────────────────────────────────
export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider whitespace-nowrap", className)}>{children}</span>;
}

const STATUS_CLS: Record<string, string> = {
  queued: "bg-slate-100 text-slate-600",
  initiated: "bg-sky-100 text-sky-700",
  ringing: "bg-sky-100 text-sky-700 animate-pulse",
  "in-progress": "bg-emerald-100 text-emerald-700 animate-pulse",
  completed: "bg-indigo-100 text-indigo-700",
  failed: "bg-red-100 text-red-700",
  busy: "bg-amber-100 text-amber-700",
  "no-answer": "bg-amber-100 text-amber-700",
  canceled: "bg-slate-100 text-slate-500",
};
export const CallStatusBadge = ({ status }: { status: string }) =>
  <Badge className={STATUS_CLS[status] || "bg-slate-100 text-slate-600"}>{status === "in-progress" ? "live" : status}</Badge>;

const SENTIMENT_CLS: Record<string, string> = {
  positive: "bg-emerald-100 text-emerald-700",
  neutral: "bg-slate-100 text-slate-600",
  negative: "bg-red-100 text-red-700",
};
export const SentimentBadge = ({ sentiment }: { sentiment: string | null | undefined }) =>
  sentiment ? <Badge className={SENTIMENT_CLS[sentiment] || SENTIMENT_CLS.neutral}>{sentiment}</Badge> : null;

export const IntentBadge = ({ intent }: { intent: string | null | undefined }) =>
  intent ? <Badge className="bg-violet-100 text-violet-700">{intent.replace(/_/g, " ")}</Badge> : null;

const QSTATUS_CLS: Record<string, string> = {
  answered: "bg-emerald-100 text-emerald-700",
  open: "bg-amber-100 text-amber-700",
  escalated: "bg-red-100 text-red-700",
  resolved: "bg-indigo-100 text-indigo-700",
};
export const QuestionStatusBadge = ({ status }: { status: string }) =>
  <Badge className={QSTATUS_CLS[status] || "bg-slate-100 text-slate-600"}>{status}</Badge>;

export function formatDuration(s: number | null | undefined) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export function Modal({ open, onClose, title, icon, children, wide }: {
  open: boolean; onClose: () => void; title: string; icon?: React.ReactNode; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
          <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(cardCls, "w-full max-h-[90vh] overflow-y-auto p-7", wide ? "max-w-2xl" : "max-w-lg")}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-3">{icon}{title}</h2>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
