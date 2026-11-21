"use client";
import LocalizedText from "@/components/LocalizedText";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, PhoneCall, X } from "lucide-react";
import { voiceAgentApi, errorText } from "@/lib/voiceAgentApi";
import QuickCallPanel from "./QuickCallPanel";

export interface LeadCallTarget {
  id: number;
  company_name: string;
  phone?: string | null;
  /** When set, attaches directly to an existing live/completed AI call instead of creating a new pitch. */
  activeCallId?: number | null;
  /** When true, opens immediately in automatic-call live mode and attaches as soon as the 2s call starts. */
  waitingForAutoCall?: boolean;
}

interface Props {
  open: boolean;
  target: LeadCallTarget | null;
  onClose: () => void;
  notify: (message: string, type?: "info" | "success" | "error" | "warning") => void;
  onCallStarted?: () => void;
}

/**
 * Shared "Call with AI" / "Call again" surface for leads. It opens the existing call panel with
 * a freshly generated tenant-specific pitch; the user can edit the pitch, voice, accent and number
 * before dialing.
 */
export default function LeadCallModal({ open, target, onClose, notify, onCallStarted }: Props) {
  const [pitch, setPitch] = useState("");
  const [loading, setLoading] = useState(false);
  const [generation, setGeneration] = useState(0);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    if (!open || !target) return;
    let active = true;
    setPitch("");
    if (target.waitingForAutoCall) {
      setLoading(false);
      setGeneration((n) => n + 1);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        if (target.activeCallId) {
          const res = await voiceAgentApi.call(target.activeCallId);
          const pitchText = res?.call?.pitch_text
            || (res?.call?.transcript || []).find((t) => t.role === "ai" && t.kind === "pitch")?.text
            || (res?.call?.transcript || []).find((t) => t.role === "ai")?.text;
          if (active && pitchText) setPitch(pitchText);
        } else {
          const options = await voiceAgentApi.options();
          const language = options.tenant_voice_profile?.language || "en";
          const result = await voiceAgentApi.generatePitchText({
            entity_type: "lead", entity_id: target.id, language,
          });
          if (active) setPitch(result.pitch_text || "");
        }
      } catch (e) {
        if (active) notifyRef.current(errorText(e, "Could not prepare the AI call pitch"), "error");
      } finally {
        if (active) {
          setLoading(false);
          setGeneration((n) => n + 1);
        }
      }
    })();
    return () => { active = false; };
  }, [open, target?.id, target?.activeCallId, target?.waitingForAutoCall]);

  return (
    <AnimatePresence>
      {open && target && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900"
            role="dialog" aria-modal="true"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <PhoneCall className="h-4 w-4 text-emerald-600" />
                  <LocalizedText text={"Call with AI"} /> · {target.company_name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                  <LocalizedText text={"The pitch uses your company's branding and knowledge base. Edit it before dialing."} />
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> <LocalizedText text={"Preparing pitch..."} />
              </div>
            ) : (
              <div className="space-y-4">
                {((!target.activeCallId && !target.waitingForAutoCall) || pitch) && (
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-zinc-300">
                      <LocalizedText text={"Opening pitch"} />
                    </label>
                    <textarea
                      value={pitch}
                      onChange={(e) => setPitch(e.target.value)}
                      readOnly={!!target.activeCallId || !!target.waitingForAutoCall}
                      rows={4}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                )}
                <QuickCallPanel
                  key={`${target.id}-${target.activeCallId || (target.waitingForAutoCall ? "auto" : "new")}-${generation}`}
                  entityType="lead"
                  entityId={String(target.id)}
                  entityName={target.company_name}
                  defaultPhone={target.phone || null}
                  pitchText={pitch}
                  notify={notify}
                  onCallStarted={onCallStarted}
                  initialCallId={target.activeCallId || null}
                  autoCallLeadId={target.waitingForAutoCall ? target.id : null}
                  onPitchLoaded={(p) => setPitch((prev) => prev || p)}
                />
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
