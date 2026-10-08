"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bot, Brain, Ear, Headphones, Loader2, PhoneCall, PhoneOff, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { voiceAgentApi, errorText, voiceChoices, AICall, EntityType, VoiceAgentOptions } from "@/lib/voiceAgentApi";
import { CallStatusBadge, IntentBadge, SentimentBadge, inputCls, labelCls } from "./shared";

type Notify = (message: string, type?: "info" | "success" | "error" | "warning") => void;

interface Props {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  defaultPhone: string | null;
  /** The pitch already generated on the Calls page — spoken as-is as the call opener. */
  pitchText: string;
  notify: Notify;
  onCallStarted?: () => void;
}

const PREFS_KEY = "voice_call_prefs";
// Explicit colours so native dropdown options stay readable in light and dark mode.
const optionCls = "bg-white text-slate-800 dark:bg-zinc-800 dark:text-zinc-100";

/**
 * Two-way AI call: dials the prospect via Twilio, speaks the generated pitch, then listens to the
 * client's voice and answers each reply live until the call ends.
 */
export default function QuickCallPanel({ entityType, entityId, entityName, defaultPhone, pitchText, notify, onCallStarted }: Props) {
  const [options, setOptions] = useState<VoiceAgentOptions | null>(null);
  const [voice, setVoice] = useState("nova");
  const [accent, setAccent] = useState("american");
  const [phone, setPhone] = useState(defaultPhone || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [call, setCall] = useState<AICall | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Dropdowns use the built-in lists immediately; server lists replace them once loaded.
  const { voices, accents } = useMemo(() => voiceChoices(options), [options]);

  // Restore the last voice/accent the user picked, then load server options (Twilio status etc.).
  useEffect(() => {
    try {
      const prefs: { voice?: string; accent?: string } = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      if (prefs.voice) setVoice(prefs.voice);
      if (prefs.accent) setAccent(prefs.accent);
    } catch { /* ignore */ }
    voiceAgentApi.options().then(setOptions).catch((e) => console.error("voice options failed:", e));
  }, []);
  useEffect(() => { setPhone(defaultPhone || ""); }, [defaultPhone]);

  // Keep the selection valid if the available lists change.
  useEffect(() => {
    if (!voices.some((v) => v.id === voice)) setVoice(voices.find((v) => v.id === "nova")?.id || voices[0].id);
    if (!accents.some((a) => a.id === accent)) setAccent(accents[0].id);
  }, [voices, accents, voice, accent]);

  const refresh = useCallback(async (id: number) => {
    try { setCall((await voiceAgentApi.call(id)).call); } catch { /* keep last state */ }
  }, []);
  useEffect(() => {
    if (!call?.is_active) return;
    const t = setInterval(() => refresh(call.id), 2000);
    return () => clearInterval(t);
  }, [call?.id, call?.is_active, refresh]);
  const turns = call?.transcript?.length || 0;
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [turns]);

  const startCall = async () => {
    if (!pitchText.trim()) return;
    setBusy("call");
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ voice, accent })); } catch { /* ignore */ }
    try {
      const r = await voiceAgentApi.quickCall({
        entity_type: entityType, entity_id: Number(entityId), to_number: phone.trim() || undefined,
        voice, accent, language: "en", pitch_text: pitchText,
      });
      setCall(r.call);
      notify(`Calling ${r.call.to_number}…`, "success");
      onCallStarted?.();
    } catch (e) { notify(errorText(e, "Could not start the call"), "error"); }
    finally { setBusy(null); }
  };

  const hangup = async () => {
    if (!call) return;
    setBusy("hangup");
    try {
      const r = (await voiceAgentApi.hangup(call.id)) as { call?: AICall };
      if (r?.call) setCall(r.call); else refresh(call.id);
    } catch (e) { notify(errorText(e, "Action failed"), "error"); }
    finally { setBusy(null); }
  };

  // ── Setup: voice / accent / number → call ───────────────────────────────────
  if (!call) {
    const twilioMissing = options && !options.twilio.ready;
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 dark:border-zinc-700 p-4">
        <p className="text-xs font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
          <PhoneCall className="w-3.5 h-3.5" /> Two-way AI call
        </p>
        <p className="text-xs text-slate-500">The AI speaks the pitch above, then listens to the client and answers them live.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Voice</label>
            <select value={voice} onChange={(e) => setVoice(e.target.value)} className={inputCls}>
              {voices.map((v) => <option key={v.id} value={v.id} className={optionCls}>{v.label} ({v.gender})</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Accent</label>
            <select value={accent} onChange={(e) => setAccent(e.target.value)} className={inputCls}>
              {accents.map((a) => <option key={a.id} value={a.id} className={optionCls}>{a.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Phone number</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+14155550123" className={inputCls} />
          {!phone && <p className="text-[11px] text-slate-500 mt-1">Leave blank to use the number saved on the {entityType}.</p>}
        </div>
        {twilioMissing && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Calling is not configured on the server. Missing: {options.twilio.missing.join(", ")}
          </div>
        )}
        <button type="button" onClick={startCall} disabled={busy === "call" || !!twilioMissing || !pitchText.trim()}
          className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl font-bold shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-2">
          {busy === "call" ? <Loader2 className="w-5 h-5 animate-spin" /> : <PhoneCall className="w-5 h-5" />}
          {busy === "call" ? "Preparing voice & dialing…" : `Call ${entityName || entityType} with AI`}
        </button>
      </div>
    );
  }

  // ── Live call ───────────────────────────────────────────────────────────────
  const accentLabel = accents.find((a) => a.id === call.accent)?.label || call.accent;
  const transcript = call.transcript || [];
  const last = [...transcript].reverse().find((t) => t.role !== "system");
  const thinking = call.is_active && !!call.answered_at && last?.role === "client";
  const listening = call.is_active && !!call.answered_at && !thinking && call.mode === "ai";

  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30">
        <div className="flex items-center gap-2 flex-wrap">
          <PhoneCall className="w-4 h-4 text-emerald-600" />
          <span className="font-black text-sm text-slate-800 dark:text-white">{call.entity_name || call.to_number}</span>
          <CallStatusBadge status={call.status} />
          <IntentBadge intent={call.current_intent} />
          <SentimentBadge sentiment={call.sentiment} />
          {call.interest_score != null && <span className="text-[11px] font-bold text-slate-500">Interest {call.interest_score}%</span>}
          <span className="text-[11px] text-slate-500">{call.to_number} · {call.voice} · {accentLabel}</span>
        </div>
        {call.is_active && (
          <button type="button" onClick={hangup} disabled={!!busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-500 text-white"><PhoneOff className="w-3.5 h-3.5" /> Hang up</button>
        )}
      </div>

      <div ref={scrollRef} className="max-h-80 overflow-y-auto p-4 space-y-2.5 bg-white dark:bg-zinc-900">
        {transcript.map((t, i) => {
          if (t.role === "system") return <p key={i} className="text-center text-[11px] font-bold text-slate-400">{t.text}</p>;
          const isClient = t.role === "client";
          return (
            <div key={i} className={cn("flex gap-2", isClient ? "justify-start" : "justify-end")}>
              {isClient && <User className="w-4 h-4 mt-1 text-slate-400 shrink-0" />}
              <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                isClient ? "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200" : t.role === "agent" ? "bg-amber-500 text-white" : "bg-violet-600 text-white")}>
                <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-0.5">
                  {isClient ? "Client (voice)" : t.role === "agent" ? "Agent" : t.kind === "pitch" ? "AI · opening pitch" : "AI"}{t.interrupted ? " · interrupted" : ""}
                </p>
                <p className="whitespace-pre-wrap leading-relaxed">{t.text}</p>
              </div>
              {!isClient && (t.role === "agent" ? <Headphones className="w-4 h-4 mt-1 text-amber-500 shrink-0" /> : <Bot className="w-4 h-4 mt-1 text-violet-500 shrink-0" />)}
            </div>
          );
        })}
        {call.is_active && !call.answered_at && (
          <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Ringing — the pitch plays as soon as the client answers…</p>
        )}
        {thinking && (
          <p className="text-center text-xs text-violet-500 flex items-center justify-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> AI is preparing an answer…</p>
        )}
        {listening && (
          <p className="text-center text-xs text-emerald-600 flex items-center justify-center gap-1.5"><Ear className="w-3.5 h-3.5 animate-pulse" /> Listening to the client…</p>
        )}
        {call.error && <p className="text-sm text-red-600 font-medium">{call.error}</p>}
      </div>

      {!call.is_active && call.summary && (
        <div className="p-4 border-t border-slate-100 dark:border-zinc-800 space-y-2 text-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><Brain className="w-3 h-3" /> Call summary</p>
          <p className="text-slate-600 dark:text-zinc-300">{call.summary}</p>
          {call.next_steps && <p className="text-slate-500"><span className="font-bold">Next:</span> {call.next_steps}</p>}
        </div>
      )}
    </div>
  );
}
