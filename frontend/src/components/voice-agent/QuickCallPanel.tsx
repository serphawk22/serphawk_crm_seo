"use client";
import { createVisiblePoll } from "@/lib/visiblePoll";
import LocalizedText from "@/components/LocalizedText";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Bot, Brain, CalendarClock, Clock, Headphones, Loader2, MessageSquare, Mic, PhoneCall, PhoneOff, RotateCcw, User, Volume2,
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { cn } from "@/lib/utils";
import { voiceAgentApi, errorText, voiceChoices, AICall, EntityType, VoiceAgentOptions } from "@/lib/voiceAgentApi";
import { CallStatusBadge, IntentBadge, SentimentBadge, formatDuration, inputCls, labelCls } from "./shared";

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
  /** Attach directly to an already-started (e.g. automatic) call to stream its live conversation. */
  initialCallId?: number | null;
  /** Wait for an automatic lead call to initialize (after 2s) and attach directly into this same UI. */
  autoCallLeadId?: number | null;
  /** Called when an attached automatic call provides its generated pitch text. */
  onPitchLoaded?: (pitch: string) => void;
}

const PREFS_KEY = "voice_call_prefs";
// Explicit colours so native dropdown options stay readable in light and dark mode.
const optionCls = "bg-white text-slate-800 dark:bg-zinc-800 dark:text-zinc-100";

function formatTurnTime(ts?: string) {
  if (!ts) return "";
  try {
    const normalized = ts.endsWith("Z") || ts.includes("+") ? ts : `${ts}Z`;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

function parseFollowUpDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const normalized = raw.endsWith("Z") || raw.includes("+") || /[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function SpeakingWave() {
  return (
    <span className="inline-flex items-end gap-0.5 h-3" aria-hidden="true">
      <span className="w-0.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
      <span className="w-0.5 h-3 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse [animation-delay:150ms]" />
      <span className="w-0.5 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse [animation-delay:300ms]" />
    </span>
  );
}

/**
 * Two-way AI call: dials the prospect via Twilio, speaks the generated pitch, then listens to the
 * client's voice and answers each reply live until the call ends.
 */
export default function QuickCallPanel({ entityType, entityId, entityName, defaultPhone, pitchText, notify, onCallStarted, initialCallId, autoCallLeadId, onPitchLoaded }: Props) {
  const [options, setOptions] = useState<VoiceAgentOptions | null>(null);
  const [voice, setVoice] = useState("nova");
  const [accent, setAccent] = useState("american");
  const [language, setLanguage] = useState("en");
  const [phone, setPhone] = useState(defaultPhone || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [call, setCall] = useState<AICall | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(!!initialCallId);
  const [waitingAutoCall, setWaitingAutoCall] = useState(!!autoCallLeadId && !initialCallId);
  const [autoCallNotice, setAutoCallNotice] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef(false);
  const onPitchLoadedRef = useRef(onPitchLoaded);
  onPitchLoadedRef.current = onPitchLoaded;
  const onCallStartedRef = useRef(onCallStarted);
  onCallStartedRef.current = onCallStarted;

  // Dropdowns use the built-in lists immediately; server lists replace them once loaded.
  const { voices, accents } = useMemo(() => voiceChoices(options, language), [options, language]);

  // Restore the last voice/accent the user picked, then load server options (Twilio status etc.).
  useEffect(() => {
    let prefs: { voice?: string; accent?: string } = {};
    try {
      prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      if (prefs.voice) setVoice(prefs.voice);
      if (prefs.accent) setAccent(prefs.accent);
    } catch { /* ignore */ }
    voiceAgentApi.options().then((o) => {
      const profile = o.tenant_voice_profile;
      if (profile) {
        // Tenant settings are the default; an explicit user choice still wins.
        if (!prefs.voice) setVoice(profile.voice);
        if (!prefs.accent) setAccent(profile.accent);
        setLanguage(profile.language);
      }
      setOptions(o);
    }).catch((e) => console.error("voice options failed:", e));
  }, []);
  // While the TwiML webhook check is failing (e.g. the tunnel restarted), keep re-checking so the
  // warning clears itself — the backend also re-checks before every dial.
  const webhookProblem = !!options?.twilio?.webhook_problem;
  useEffect(() => {
    if (!webhookProblem) return;
    const poll = createVisiblePoll(async () => { await voiceAgentApi.options(true).then(setOptions).catch(() => {}); }, 8000, false);
    return () => poll.dispose();
  }, [webhookProblem]);
  useEffect(() => { setPhone(defaultPhone || ""); }, [defaultPhone]);

  // Keep the selection valid if the available lists change.
  useEffect(() => {
    if (!voices.some((v) => v.id === voice)) setVoice(voices.find((v) => v.id === "nova")?.id || voices[0].id);
    if (!accents.some((a) => a.id === accent)) setAccent(accents[0].id);
  }, [voices, accents, voice, accent]);

  const syncPitchFromCall = useCallback((c: AICall | null | undefined) => {
    if (!c) return;
    const text = c.pitch_text
      || (c.transcript || []).find((t) => t.role === "ai" && t.kind === "pitch")?.text
      || (c.transcript || []).find((t) => t.role === "ai")?.text;
    if (text) onPitchLoadedRef.current?.(text);
  }, []);

  const refresh = useCallback(async (id: number) => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const res = await voiceAgentApi.call(id);
      if (res?.call) {
        setCall(res.call);
        syncPitchFromCall(res.call);
        setReconnecting(false);
      }
    } catch {
      setReconnecting(true);
    } finally {
      pollingRef.current = false;
    }
  }, [syncPitchFromCall]);

  // Attach directly to an already-started call (e.g. automatic lead call) when initialCallId is given.
  useEffect(() => {
    if (!initialCallId) {
      setLoadingInitial(false);
      return;
    }
    let active = true;
    setLoadingInitial(true);
    voiceAgentApi.call(initialCallId)
      .then((res) => {
        if (active && res?.call) {
          setCall(res.call);
          syncPitchFromCall(res.call);
        }
      })
      .catch(() => { /* fallback to setup view if call cannot be fetched */ })
      .finally(() => { if (active) setLoadingInitial(false); });
    return () => { active = false; };
  }, [initialCallId, syncPitchFromCall]);

  // Wait for an automatic lead call triggered 2s after lead creation and attach straight into this same UI.
  // Never dump the user onto the manual setup form just because prep took a few extra seconds — only
  // surface a failure if the backend explicitly marked auto_call_status as "failed" or "skipped".
  useEffect(() => {
    if (!autoCallLeadId || initialCallId || call) return;
    let active = true;
    let attempts = 0;
    setWaitingAutoCall(true);
    setAutoCallNotice(null);
    const checkForAutoCall = async () => {
      attempts += 1;
      try {
        const res = await voiceAgentApi.calls(undefined, autoCallLeadId);
        if (!active) return;
        const latest = res?.calls?.[0];
        if (latest?.id) {
          const detail = await voiceAgentApi.call(latest.id);
          if (!active) return;
          if (detail?.call) {
            setCall(detail.call);
            syncPitchFromCall(detail.call);
            setWaitingAutoCall(false);
            onCallStartedRef.current?.();
            return;
          }
        }
        // Periodically inspect the lead's auto_call_status so we only exit waiting on a real skip/failure.
        if (attempts >= 6 && attempts % 4 === 0) {
          const leadRes = await fetch(`${API_BASE_URL}/leads/${autoCallLeadId}`);
          if (leadRes.ok && active) {
            const leadData = await leadRes.json().catch(() => null);
            const st = leadData?.auto_call_status;
            if (st === "failed" || st === "skipped") {
              setWaitingAutoCall(false);
              setAutoCallNotice(
                leadData?.auto_call_reason
                  ? `Automatic call ${st}: ${leadData.auto_call_reason}`
                  : `Automatic call was ${st}.`
              );
              return;
            }
          }
        }
        if (attempts >= 90 && active) {
          setWaitingAutoCall(false);
          setAutoCallNotice("Automatic call timed out waiting to start. Check backend logs or retry below.");
        }
      } catch {
        /* keep waiting gracefully across transient errors */
      }
    };
    const initialTimer = setTimeout(() => { void checkForAutoCall(); }, 600);
    const interval = setInterval(() => { void checkForAutoCall(); }, 600);
    return () => {
      active = false;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [autoCallLeadId, initialCallId, call, syncPitchFromCall]);

  // Poll continuously while a call is live (never pauses on mouse inactivity while user is on the phone).
  useEffect(() => {
    if (!call?.id || !call.is_active) return;
    void refresh(call.id);
    const id = call.id;
    const timer = setInterval(() => { void refresh(id); }, 1500);
    return () => clearInterval(timer);
  }, [call?.id, call?.is_active, refresh]);

  // After a call ends, run a few short follow-up checks so background finalization (summary/follow-up date/duration) arrives.
  useEffect(() => {
    if (!call?.id || call.is_active || call.summary) return;
    let remaining = 5;
    const id = call.id;
    const timer = setInterval(() => {
      remaining -= 1;
      void refresh(id);
      if (remaining <= 0) clearInterval(timer);
    }, 2000);
    return () => clearInterval(timer);
  }, [call?.id, call?.is_active, call?.summary, refresh]);

  // Refresh the parent lead list once finalization writes summary/follow-up date so the lead badge updates immediately.
  useEffect(() => {
    if (call && !call.is_active && (call.summary || call.follow_up_at)) {
      onCallStartedRef.current?.();
    }
  }, [call?.id, call?.is_active, call?.summary, call?.follow_up_at]);

  // 1s clock tick while call is active for elapsed duration and smooth AI-speaking → listening transition.
  useEffect(() => {
    if (!call?.is_active) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [call?.is_active]);

  const transcript = call?.transcript || [];
  const lastTurn = [...transcript].reverse().find((t) => t.role !== "system");
  const lastTurnText = transcript[transcript.length - 1]?.text || "";

  const liveStatus: "initiating" | "ringing" | "speaking" | "thinking" | "listening" | "connected" | "ended" = !call || !call.is_active
    ? "ended"
    : !call.answered_at
      ? (call.status === "ringing" ? "ringing" : "initiating")
      : call.live_state === "thinking" || (lastTurn?.role === "client" && call.mode === "ai")
        ? "thinking"
        : call.live_state === "speaking" || (call.ai_speaking_until != null && nowMs / 1000 < call.ai_speaking_until && lastTurn?.role !== "client")
          ? "speaking"
          : call.mode === "ai"
            ? "listening"
            : "connected";

  const turns = transcript.length;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, lastTurnText, liveStatus, call?.summary]);

  const startCall = async () => {
    if (!pitchText.trim()) return;
    setBusy("call");
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ voice, accent })); } catch { /* ignore */ }
    try {
      const r = await voiceAgentApi.quickCall({
        entity_type: entityType, entity_id: Number(entityId), to_number: phone.trim() || undefined,
        voice, accent, language, pitch_text: pitchText,
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

  const markFollowUpDone = async () => {
    const leadId = Number(call?.lead_id || (entityType === "lead" ? (call?.entity_id || entityId) : 0)) || null;
    if (!call || !leadId || busy === "followup") return;
    setBusy("followup");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_BASE_URL}/leads/${leadId}/followup`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ completed: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.detail === "string" ? data.detail : `Request failed (${res.status}).`);
      }
      setCall((prev) => prev ? { ...prev, follow_up_needed: false, follow_up_at: null, follow_up_reason: null } : prev);
      notify("Follow-up marked done.", "success");
      onCallStartedRef.current?.();
    } catch (e) {
      notify(errorText(e, "Could not mark follow-up done"), "error");
    } finally {
      setBusy(null);
    }
  };

  if (waitingAutoCall && !call) {
    return (
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/25 bg-white dark:bg-zinc-900/95 overflow-hidden shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-emerald-50/90 dark:bg-emerald-950/30 border-b border-emerald-200/70 dark:border-emerald-500/20">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <PhoneCall className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
            </div>
            <span className="font-black text-sm text-slate-800 dark:text-white">{entityName || defaultPhone || "New Lead"}</span>
            <CallStatusBadge status="initiated" />
            {defaultPhone && <span className="text-[11px] text-slate-500 dark:text-zinc-400">{defaultPhone}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50/90 dark:bg-zinc-950/70 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.75)]" />
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-zinc-200">
              Live Conversation
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
            <Loader2 className="w-3 h-3 animate-spin" /> Initiating Call…
          </span>
        </div>
        <div className="min-h-[200px] p-6 flex flex-col items-center justify-center text-center gap-2 bg-slate-50/40 dark:bg-zinc-950/40">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
          <p className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
            Initiating automatic AI call to {defaultPhone || entityName}…
          </p>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500">
            The generated pitch and live conversation will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  if (loadingInitial && !call) {
    return (
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/25 p-8 flex items-center justify-center gap-2 text-xs font-bold text-slate-500 dark:text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
        Loading live call conversation…
      </div>
    );
  }

  // ── Setup: voice / accent / number → call ───────────────────────────────────
  if (!call) {
    const twilioMissing = options && !options.twilio.ready;
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 dark:border-zinc-700 p-4">
        {autoCallNotice && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {autoCallNotice}
          </div>
        )}
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
          <div className="sm:col-span-2">
            <label className={labelCls}>Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls}>
              {(options?.languages || [{ id: "en", label: "English" }, { id: "es", label: "Español" }]).map((l) => (
                <option key={l.id} value={l.id} className={optionCls}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}><LocalizedText text={"Phone number"} /></label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+14155550123" className={inputCls} />
          {!phone && <p className="text-[11px] text-slate-500 mt-1">Leave blank to use the number saved on the {entityType}.</p>}
        </div>
        {twilioMissing && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Calling is not configured on the server. Missing: {options.twilio.missing.join(", ")}
          </div>
        )}
        {!twilioMissing && !!options?.twilio.webhook_problem && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Pre-call check failed — dialing is paused so the call doesn&apos;t drop right after answer. {options.twilio.webhook_problem}</span>
          </div>
        )}
        <button type="button" onClick={startCall} disabled={busy === "call" || !!twilioMissing || !!options?.twilio.webhook_problem || !pitchText.trim()}
          className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl font-bold shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-2">
          {busy === "call" ? <Loader2 className="w-5 h-5 animate-spin" /> : <PhoneCall className="w-5 h-5" />}
          {busy === "call" ? "Preparing voice & dialing…" : `Call ${entityName || entityType} with AI`}
        </button>
      </div>
    );
  }

  // ── Live & Post-Call Conversation ──────────────────────────────────────────
  const accentLabel = accents.find((a) => a.id === call.accent)?.label || call.accent;
  const spokenCount = transcript.filter((t) => t.role !== "system").length;
  const elapsedSeconds = call.answered_at
    ? Math.max(0, Math.floor((nowMs - new Date(call.answered_at.endsWith("Z") || call.answered_at.includes("+") ? call.answered_at : `${call.answered_at}Z`).getTime()) / 1000))
    : null;

  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/25 bg-white dark:bg-zinc-900/95 overflow-hidden shadow-sm">
      {/* Call status bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-emerald-50/90 dark:bg-emerald-950/30 border-b border-emerald-200/70 dark:border-emerald-500/20">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <PhoneCall className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="font-black text-sm text-slate-800 dark:text-white">{call.entity_name || call.to_number}</span>
          <CallStatusBadge status={call.status} />
          <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {call.is_active ? formatDuration(elapsedSeconds) : formatDuration(call.duration_seconds ?? elapsedSeconds)}
          </span>
          <IntentBadge intent={call.current_intent} />
          <SentimentBadge sentiment={call.sentiment} />
          {call.interest_score != null && (
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Interest {call.interest_score}%</span>
          )}
          <span className="text-[11px] text-slate-500 dark:text-zinc-400">{call.to_number} · {call.voice} · {accentLabel}</span>
        </div>
        {call.is_active ? (
          <button type="button" onClick={hangup} disabled={!!busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50">
            <PhoneOff className="w-3.5 h-3.5" /> Hang up
          </button>
        ) : (
          <button type="button" onClick={() => setCall(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-emerald-300 dark:border-emerald-500/30 bg-white dark:bg-zinc-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> New Call
          </button>
        )}
      </div>

      {/* Live Conversation sub-header + real-time speaking/listening indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50/90 dark:bg-zinc-950/70 border-b border-slate-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className={cn(
            "w-2 h-2 rounded-full",
            call.is_active ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.75)]" : "bg-slate-400 dark:bg-zinc-500"
          )} />
          <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-zinc-200">
            {call.is_active ? "Live Conversation" : "Conversation Transcript"}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
            {spokenCount} {spokenCount === 1 ? "message" : "messages"}
          </span>
        </div>

        {/* Visual speaking / listening / thinking status pill */}
        <div className="flex items-center gap-2">
          {reconnecting && call.is_active && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
              Reconnecting…
            </span>
          )}
          {liveStatus === "initiating" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
              <Loader2 className="w-3 h-3 animate-spin" /> Initiating Call…
            </span>
          )}
          {liveStatus === "ringing" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 border border-sky-200 dark:border-sky-500/25">
              <Loader2 className="w-3 h-3 animate-spin" /> Ringing…
            </span>
          )}
          {liveStatus === "connected" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
              <PhoneCall className="w-3 h-3" /> Connected
            </span>
          )}
          {liveStatus === "speaking" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
              <Volume2 className="w-3.5 h-3.5" /> AI Speaking <SpeakingWave />
            </span>
          )}
          {liveStatus === "thinking" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300 border border-teal-200 dark:border-teal-500/30">
              <Loader2 className="w-3 h-3 animate-spin" /> AI Responding…
            </span>
          )}
          {liveStatus === "listening" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
              <Mic className="w-3 h-3 animate-pulse" /> Listening to Client
            </span>
          )}
          {liveStatus === "ended" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
              Call Ended
            </span>
          )}
        </div>
      </div>

      {/* Scrollable conversation thread */}
      <div ref={scrollRef} className="min-h-[200px] max-h-96 overflow-y-auto p-4 space-y-3 bg-slate-50/40 dark:bg-zinc-950/40">
        {transcript.length === 0 && call.is_active && (
          <div className="py-10 text-center text-xs text-slate-400 dark:text-zinc-500 flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
            <span>Connecting call — live conversation will appear here as soon as the client answers…</span>
          </div>
        )}
        {transcript.length === 0 && !call.is_active && !call.error && (
          <div className="py-8 text-center text-xs text-slate-400 dark:text-zinc-500">
            No conversation messages were recorded for this call.
          </div>
        )}

        {transcript.map((t, i) => {
          if (t.role === "system") {
            return (
              <div key={i} className="text-center py-0.5">
                <span className="inline-block text-[11px] font-semibold text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800/80 border border-slate-200/70 dark:border-zinc-700/60 px-3 py-1 rounded-full">
                  {t.text}
                </span>
              </div>
            );
          }
          const isClient = t.role === "client";
          const isAgent = t.role === "agent";
          const timeStr = formatTurnTime(t.ts);
          return (
            <div key={i} className={cn("flex items-end gap-2.5", isClient ? "justify-start" : "justify-end")}>
              {isClient && (
                <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-zinc-800 border border-slate-300/70 dark:border-zinc-700 flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-300" />
                </div>
              )}
              <div className={cn(
                "max-w-[85%] sm:max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-xs",
                isClient
                  ? "rounded-bl-md bg-white dark:bg-zinc-800/90 border border-slate-200 dark:border-zinc-700/80 text-slate-800 dark:text-zinc-100"
                  : isAgent
                    ? "rounded-br-md bg-amber-500 text-white"
                    : "rounded-br-md bg-emerald-600 text-white dark:bg-emerald-500/20 dark:text-emerald-50 dark:border dark:border-emerald-500/35"
              )}>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest",
                    isClient ? "text-slate-500 dark:text-zinc-400" : isAgent ? "text-amber-100" : "text-emerald-100 dark:text-emerald-300"
                  )}>
                    {isClient ? "Client" : isAgent ? "Agent" : t.kind === "pitch" ? "AI · Opening Pitch" : "AI"}
                    {t.interrupted ? " · interrupted" : ""}
                  </span>
                  {timeStr && (
                    <span className={cn(
                      "text-[10px] tabular-nums",
                      isClient ? "text-slate-400 dark:text-zinc-500" : isAgent ? "text-amber-100/80" : "text-emerald-100/80 dark:text-emerald-300/70"
                    )}>
                      {timeStr}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{t.text}</p>
                {isClient && (t.intent || t.sentiment) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <IntentBadge intent={t.intent} />
                    <SentimentBadge sentiment={t.sentiment} />
                  </div>
                )}
              </div>
              {!isClient && (
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center shrink-0 border",
                  isAgent
                    ? "bg-amber-100 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30"
                    : "bg-emerald-100 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30"
                )}>
                  {isAgent
                    ? <Headphones className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    : <Bot className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                </div>
              )}
            </div>
          );
        })}

        {/* Live activity indicator row at the bottom of the conversation */}
        {liveStatus === "initiating" && transcript.length > 0 && (
          <div className="flex items-center justify-center gap-2 pt-1 text-xs text-slate-500 dark:text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
            <span>Initiating call — connecting to {call.to_number}…</span>
          </div>
        )}
        {liveStatus === "ringing" && transcript.length > 0 && (
          <div className="flex items-center justify-center gap-2 pt-1 text-xs text-slate-500 dark:text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
            <span>Ringing — the opening pitch will play as soon as the client answers…</span>
          </div>
        )}
        {liveStatus === "connected" && (
          <div className="flex items-center justify-center gap-2 pt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Connected</span>
          </div>
        )}
        {liveStatus === "speaking" && (
          <div className="flex items-center justify-end gap-2 pt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <SpeakingWave />
            <span>AI is speaking…</span>
          </div>
        )}
        {liveStatus === "thinking" && (
          <div className="flex items-center justify-end gap-2 pt-1 text-xs font-semibold text-teal-600 dark:text-teal-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>AI is preparing an answer…</span>
          </div>
        )}
        {liveStatus === "listening" && (
          <div className="flex items-center justify-start gap-2 pt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <Mic className="w-3.5 h-3.5" />
            <span>Listening to client…</span>
          </div>
        )}
        {call.error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 font-medium">
            {call.error}
          </div>
        )}
      </div>

      {/* Retained post-call summary & marked follow-up date */}
      {!call.is_active && (call.summary || call.follow_up_at || call.follow_up_needed) && (
        <div className="p-4 border-t border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2.5 text-sm">
          {(call.follow_up_at || call.follow_up_needed) && (() => {
            const dueDate = parseFollowUpDate(call.follow_up_at);
            const isOverdue = !!dueDate && dueDate.getTime() < Date.now();
            const leadId = Number(call.lead_id || (entityType === "lead" ? (call.entity_id || entityId) : 0)) || null;
            const formattedDue = dueDate
              ? dueDate.toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : null;
            const summaryParts = [
              "Follow-up needed",
              formattedDue,
            ].filter(Boolean);
            return (
              <div
                className={cn(
                  "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border px-4 py-3",
                  isOverdue
                    ? "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/45 dark:border-red-900/70 dark:text-rose-100"
                    : "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-100"
                )}
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                      isOverdue
                        ? "bg-red-100 text-red-600 dark:bg-rose-100/95 dark:text-red-600"
                        : "bg-amber-100 text-amber-600 dark:bg-amber-100/95 dark:text-amber-700"
                    )}
                  >
                    <CalendarClock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-[13px] font-bold leading-snug break-words">
                      {summaryParts.join(" · ")}
                    </p>
                    {isOverdue && (
                      <p className="text-xs font-medium text-red-600 dark:text-red-400 mt-0.5">
                        This follow-up is overdue.
                      </p>
                    )}
                  </div>
                </div>
                {!!leadId && (
                  <button
                    type="button"
                    onClick={markFollowUpDone}
                    disabled={busy === "followup"}
                    className="self-start sm:self-center shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900 px-3.5 py-2 text-xs font-bold text-amber-300 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs"
                  >
                    {busy === "followup" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Mark follow-up done
                  </button>
                )}
              </div>
            );
          })()}
          {call.summary && (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" /> Call Summary
              </p>
              <p className="text-slate-700 dark:text-zinc-200 leading-relaxed">{call.summary}</p>
            </>
          )}
          {call.next_steps && (
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              <span className="font-bold text-slate-700 dark:text-zinc-300">Next steps:</span> {call.next_steps}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
