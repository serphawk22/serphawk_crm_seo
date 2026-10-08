"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PhoneCall, PhoneOff, Loader2, Bot, User, Headphones, Send, Undo2, Smartphone, Keyboard, AlertTriangle,
  Brain, Target, MessageCircleQuestion, ShieldAlert, Lightbulb, Volume2, Trash2, Phone, Clock, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  voiceAgentApi, errorText, AICall, Entity, EntityType, VoiceAgentOptions, VoicePitch,
} from "@/lib/voiceAgentApi";
import {
  Badge, CallStatusBadge, IntentBadge, Modal, Notify, QuestionStatusBadge, SentimentBadge, cardCls, formatDuration,
  ghostBtn, inputCls, labelCls, primaryBtn,
} from "./shared";

interface Props {
  options: VoiceAgentOptions;
  notify: Notify;
  requestedPitch: VoicePitch | null;
  onRequestHandled: () => void;
}

const MODE_LABEL: Record<string, { label: string; cls: string }> = {
  ai: { label: "AI talking", cls: "bg-violet-100 text-violet-700" },
  agent_typed: { label: "Agent (typed)", cls: "bg-amber-100 text-amber-700" },
  agent_phone: { label: "Agent on phone", cls: "bg-emerald-100 text-emerald-700" },
};

function useElapsed(start: string | null, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  if (!start) return null;
  return Math.max(0, Math.floor((now - new Date(start.endsWith("Z") || start.includes("+") ? start : start + "Z").getTime()) / 1000));
}

export default function CallConsole({ options, notify, requestedPitch, onRequestHandled }: Props) {
  const [calls, setCalls] = useState<AICall[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AICall | null>(null);
  const [pitches, setPitches] = useState<VoicePitch[]>([]);
  const [showStart, setShowStart] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // start-call form
  const [pitchId, setPitchId] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("lead");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityId, setEntityId] = useState("");
  const [toNumber, setToNumber] = useState("");
  const [agentPhone, setAgentPhone] = useState(options.default_agent_phone || "");

  const loadCalls = useCallback(async () => {
    try { setCalls((await voiceAgentApi.calls()).calls); } catch { /* polling; ignore */ }
  }, []);
  const loadDetail = useCallback(async (id: number) => {
    try { setDetail((await voiceAgentApi.call(id)).call); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadCalls(); }, [loadCalls]);
  useEffect(() => { voiceAgentApi.pitches().then((r) => setPitches(r.pitches)).catch(() => {}); }, [showStart]);
  useEffect(() => { voiceAgentApi.entities(entityType).then((r) => setEntities(r.entities)).catch(() => setEntities([])); }, [entityType]);

  // Pitch handed over from the studio → open the start dialog prefilled.
  useEffect(() => {
    if (!requestedPitch) return;
    setPitchId(String(requestedPitch.id));
    if (requestedPitch.entity_type) {
      setEntityType(requestedPitch.entity_type);
      setEntityId(requestedPitch.entity_id ? String(requestedPitch.entity_id) : "");
    }
    setToNumber("");
    setShowStart(true);
    onRequestHandled();
  }, [requestedPitch, onRequestHandled]);

  // Autofill phone from the chosen prospect.
  useEffect(() => {
    const e = entities.find((x) => String(x.id) === entityId);
    if (e?.phone) setToNumber(e.phone);
  }, [entityId, entities]);

  const anyActive = calls.some((c) => c.is_active);
  useEffect(() => {
    const t = setInterval(loadCalls, anyActive ? 4000 : 20000);
    return () => clearInterval(t);
  }, [anyActive, loadCalls]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);
  useEffect(() => {
    if (!selectedId || !detail?.is_active) return;
    const t = setInterval(() => loadDetail(selectedId), 2000);
    return () => clearInterval(t);
  }, [selectedId, detail?.is_active, loadDetail]);

  // Auto-scroll transcript
  const scrollRef = useRef<HTMLDivElement>(null);
  const turns = detail?.transcript?.length || 0;
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [turns]);

  const elapsed = useElapsed(detail?.answered_at || null, !!detail?.is_active);

  const startCall = async () => {
    if (!pitchId) { notify("Choose a pitch", "warning"); return; }
    setBusy("start");
    try {
      const r = await voiceAgentApi.startCall({
        pitch_id: Number(pitchId), to_number: toNumber || undefined,
        entity_type: entityId ? entityType : undefined, entity_id: entityId ? Number(entityId) : undefined,
        agent_phone: agentPhone || undefined,
      });
      notify(`Calling ${r.call.to_number}…`, "info");
      setShowStart(false);
      setSelectedId(r.call.id);
      setDetail(r.call);
      loadCalls();
    } catch (e) { notify(errorText(e, "Could not start the call"), "error"); }
    finally { setBusy(null); }
  };

  const act = async (name: string, fn: () => Promise<{ call?: AICall } | unknown>, success?: string) => {
    if (!detail) return;
    setBusy(name);
    try {
      const r = (await fn()) as { call?: AICall };
      if (r?.call) setDetail(r.call); else loadDetail(detail.id);
      if (success) notify(success, "success");
      loadCalls();
    } catch (e) { notify(errorText(e, "Action failed"), "error"); }
    finally { setBusy(null); }
  };

  const sendMessage = async () => {
    if (!detail || !message.trim()) return;
    const text = message.trim();
    setMessage("");
    await act("say", () => voiceAgentApi.say(detail.id, text));
  };

  const removeCall = async (c: AICall) => {
    if (!confirm("Delete this call record?")) return;
    try {
      await voiceAgentApi.deleteCall(c.id);
      if (selectedId === c.id) setSelectedId(null);
      loadCalls();
    } catch (e) { notify(errorText(e, "Delete failed"), "error"); }
  };

  const openQuestions = useMemo(() => (detail?.questions || []).filter((q) => q.status !== "answered"), [detail]);
  const answeredQuestions = useMemo(() => (detail?.questions || []).filter((q) => q.status === "answered"), [detail]);

  return (
    <div className="space-y-6">
      {!options.twilio.ready && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-black">Twilio voice calling is not configured.</p>
            <p>Add these to the backend <code>.env</code>: {options.twilio.missing.join(", ")}. <code>PUBLIC_BASE_URL</code> must be a public HTTPS URL Twilio can reach (e.g. an ngrok tunnel in development).</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* ── Call list ─────────────────────────────────────────── */}
        <div className={cn(cardCls, "xl:col-span-3 p-5")}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-slate-800 dark:text-white">Calls</h2>
            <button onClick={() => setShowStart(true)} className={cn(primaryBtn, "px-3 py-2 text-xs")}>
              <PhoneCall className="w-3.5 h-3.5" /> New call
            </button>
          </div>
          {calls.length === 0 ? <p className="text-sm text-slate-500">No AI calls yet.</p> : (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {calls.map((c) => (
                <div key={c.id} onClick={() => setSelectedId(c.id)}
                  className={cn("group cursor-pointer rounded-2xl border p-3 transition-all",
                    selectedId === c.id ? "border-violet-500 bg-violet-50/60 dark:bg-violet-950/20" : "border-slate-200 dark:border-zinc-800 hover:border-violet-300")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-slate-800 dark:text-white truncate">{c.entity_name || c.to_number}</span>
                    <CallStatusBadge status={c.status} />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.to_number}</span>
                    <span suppressHydrationWarning>{c.created_at ? new Date(c.created_at + (c.created_at.includes("+") || c.created_at.endsWith("Z") ? "" : "Z")).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : ""}</span>
                  </div>
                  {c.outcome && <div className="mt-1.5 flex items-center justify-between"><Badge className="bg-slate-100 text-slate-600">{c.outcome.replace(/_/g, " ")}</Badge>
                    {!c.is_active && <button onClick={(e) => { e.stopPropagation(); removeCall(c); }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Live transcript ───────────────────────────────────── */}
        <div className={cn(cardCls, "xl:col-span-6 flex flex-col min-h-[70vh]")}>
          {!detail ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center mb-4"><Headphones className="w-6 h-6 text-violet-600" /></div>
              <h3 className="font-black text-slate-700 dark:text-zinc-200">Select a call or start a new one</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-1">You’ll see the live conversation, the client’s intent and doubts, and can take over at any time.</p>
            </div>
          ) : (
            <>
              <div className="p-5 border-b border-slate-100 dark:border-zinc-800 flex flex-wrap items-center gap-3 justify-between">
                <div>
                  <h3 className="font-black text-slate-800 dark:text-white">{detail.entity_name || detail.to_number}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <CallStatusBadge status={detail.status} />
                    {detail.is_active && <Badge className={MODE_LABEL[detail.mode]?.cls}>{MODE_LABEL[detail.mode]?.label}</Badge>}
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />
                      {detail.is_active ? formatDuration(elapsed) : formatDuration(detail.duration_seconds)}</span>
                    <span className="text-xs text-slate-500">{detail.to_number}</span>
                  </div>
                </div>
                {detail.is_active && (
                  <div className="flex flex-wrap gap-2">
                    {detail.mode === "ai" && (<>
                      <button onClick={() => act("typed", () => voiceAgentApi.takeover(detail.id, "typed"), "You’ve taken over — type what to say")}
                        disabled={!!busy} className={ghostBtn}>{busy === "typed" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Keyboard className="w-4 h-4" />} Take over (type)</button>
                      <button onClick={() => act("phone", () => voiceAgentApi.takeover(detail.id, "phone", agentPhone || undefined), "Connecting your phone…")}
                        disabled={!!busy} className={ghostBtn}>{busy === "phone" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />} Take over (phone)</button>
                    </>)}
                    {detail.mode === "agent_typed" && (
                      <button onClick={() => act("handback", () => voiceAgentApi.handback(detail.id), "AI is back in control")}
                        disabled={!!busy} className={ghostBtn}>{busy === "handback" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />} Hand back to AI</button>
                    )}
                    <button onClick={() => act("hangup", () => voiceAgentApi.hangup(detail.id), "Call ended")} disabled={!!busy}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm bg-red-500 hover:bg-red-600 text-white disabled:opacity-40">
                      <PhoneOff className="w-4 h-4" /> Hang up
                    </button>
                  </div>
                )}
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/50 dark:bg-zinc-950/30">
                {(detail.transcript || []).map((t, i) => {
                  if (t.role === "system") return (
                    <div key={i} className="text-center"><span className="text-[11px] font-bold text-slate-400 bg-slate-100 dark:bg-zinc-800 px-3 py-1 rounded-full">{t.text}</span></div>
                  );
                  const isClient = t.role === "client";
                  return (
                    <div key={i} className={cn("flex gap-2.5", isClient ? "justify-start" : "justify-end")}>
                      {isClient && <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-zinc-700 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-slate-600" /></div>}
                      <div className={cn("max-w-[78%] rounded-2xl px-4 py-2.5 text-sm",
                        isClient ? "bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200"
                          : t.role === "agent" ? "bg-amber-500 text-white" : "bg-violet-600 text-white")}>
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-black uppercase tracking-widest opacity-70">
                          {isClient ? "Client" : t.role === "agent" ? "Agent" : t.kind === "pitch" ? "AI · pitch" : "AI"}
                          {t.interrupted && <span className="normal-case tracking-normal font-bold">· interrupted</span>}
                        </div>
                        <p className="leading-relaxed whitespace-pre-wrap">{t.text}</p>
                        {isClient && (t.intent || t.sentiment) && (
                          <div className="flex gap-1.5 mt-2"><IntentBadge intent={t.intent} /><SentimentBadge sentiment={t.sentiment} />
                            {t.interrupted_ai && <Badge className="bg-orange-100 text-orange-700">barged in</Badge>}</div>
                        )}
                      </div>
                      {!isClient && <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", t.role === "agent" ? "bg-amber-100" : "bg-violet-100")}>
                        {t.role === "agent" ? <Headphones className="w-4 h-4 text-amber-600" /> : <Bot className="w-4 h-4 text-violet-600" />}</div>}
                    </div>
                  );
                })}
                {detail.pending_agent_message && (
                  <div className="text-right text-xs text-amber-600 font-bold flex items-center justify-end gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Speaking: “{detail.pending_agent_message}”</div>
                )}
                {detail.status === "failed" && detail.error && (
                  <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm font-medium">{detail.error}</div>
                )}
              </div>

              {detail.is_active && detail.mode !== "agent_phone" && (
                <div className="p-4 border-t border-slate-100 dark:border-zinc-800">
                  <div className="flex gap-2">
                    <input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                      placeholder={detail.mode === "ai" ? "Type to take over and speak to the client in the AI voice…" : "Type what the AI voice should say…"}
                      className={inputCls} />
                    <button onClick={sendMessage} disabled={!message.trim() || busy === "say"} className={cn(primaryBtn, "shrink-0")}>
                      {busy === "say" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
              {detail.is_active && detail.mode === "agent_phone" && (
                <div className="p-4 border-t border-slate-100 dark:border-zinc-800 text-sm font-bold text-emerald-700 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" /> Your phone ({detail.agent_phone}) is connected. The AI resumes when you hang up.
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Insights ──────────────────────────────────────────── */}
        <div className="xl:col-span-3 space-y-4">
          {detail ? (<>
            <div className={cn(cardCls, "p-5 space-y-4")}>
              <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2"><Brain className="w-4 h-4 text-violet-500" /> Client understanding</h3>
              <div className="flex flex-wrap gap-2"><IntentBadge intent={detail.current_intent} /><SentimentBadge sentiment={detail.sentiment} />
                {detail.stage && <Badge className="bg-sky-100 text-sky-700">{detail.stage.replace(/_/g, " ")}</Badge>}</div>
              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5"><span className="flex items-center gap-1"><Target className="w-3 h-3" /> Interest</span><span>{detail.interest_score ?? "—"}%</span></div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", (detail.interest_score ?? 0) >= 60 ? "bg-emerald-500" : (detail.interest_score ?? 0) >= 30 ? "bg-amber-500" : "bg-red-500")}
                    style={{ width: `${detail.interest_score ?? 0}%` }} />
                </div>
              </div>
              {detail.adaptation && (
                <div><p className={labelCls}><Lightbulb className="w-3 h-3 inline mr-1" />Pitch adaptation</p><p className="text-sm text-slate-600 dark:text-zinc-300">{detail.adaptation}</p></div>
              )}
            </div>

            <div className={cn(cardCls, "p-5 space-y-3")}>
              <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-500" /> Doubts & objections</h3>
              {detail.doubts.length === 0 && detail.objections.length === 0 && <p className="text-sm text-slate-500">None detected yet.</p>}
              {detail.objections.map((o, i) => <div key={`o${i}`} className="text-sm p-2.5 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 font-medium">⚑ {o}</div>)}
              {detail.doubts.map((d, i) => <div key={`d${i}`} className="text-sm p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 font-medium">? {d}</div>)}
            </div>

            <div className={cn(cardCls, "p-5 space-y-3")}>
              <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2"><MessageCircleQuestion className="w-4 h-4 text-indigo-500" /> Questions</h3>
              {(detail.questions || []).length === 0 && <p className="text-sm text-slate-500">No questions yet.</p>}
              {openQuestions.map((q) => (
                <div key={q.id} className="p-2.5 rounded-xl border border-red-200 dark:border-red-900/40">
                  <div className="flex items-center gap-2 mb-1"><QuestionStatusBadge status={q.status} /><span className="text-[10px] text-slate-400 uppercase font-bold">follow-up</span></div>
                  <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">{q.question}</p>
                </div>
              ))}
              {answeredQuestions.filter((q) => q.category === "question").map((q) => (
                <div key={q.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/50">
                  <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">{q.question}</p>
                  {q.ai_answer && <p className="text-xs text-slate-500 mt-1">↳ {q.ai_answer}</p>}
                </div>
              ))}
            </div>

            {!detail.is_active && (detail.summary || detail.recording_url) && (
              <div className={cn(cardCls, "p-5 space-y-3")}>
                <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2"><Zap className="w-4 h-4 text-emerald-500" /> Call summary</h3>
                {detail.outcome && <Badge className="bg-emerald-100 text-emerald-700">{detail.outcome.replace(/_/g, " ")}</Badge>}
                {detail.summary && <p className="text-sm text-slate-600 dark:text-zinc-300">{detail.summary}</p>}
                {detail.next_steps && <div><p className={labelCls}>Next steps</p><p className="text-sm text-slate-600 dark:text-zinc-300">{detail.next_steps}</p></div>}
                {detail.recording_url && <div><p className={labelCls}><Volume2 className="w-3 h-3 inline mr-1" />Recording</p><audio controls src={detail.recording_url} className="w-full h-10" /></div>}
                {detail.call_log_id && <p className="text-xs text-slate-400">Logged to Calls (#{detail.call_log_id}).</p>}
              </div>
            )}
          </>) : (
            <div className={cn(cardCls, "p-5 text-sm text-slate-500")}>Call insights appear here.</div>
          )}
        </div>
      </div>

      {/* ── Start call dialog ───────────────────────────────────── */}
      <Modal open={showStart} onClose={() => setShowStart(false)} title="Start AI call"
        icon={<div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><PhoneCall className="w-5 h-5" /></div>}>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Pitch</label>
            <select value={pitchId} onChange={(e) => {
              setPitchId(e.target.value);
              const p = pitches.find((x) => String(x.id) === e.target.value);
              if (p?.entity_type) { setEntityType(p.entity_type); setEntityId(p.entity_id ? String(p.entity_id) : ""); }
            }} className={inputCls}>
              <option value="">Select a saved pitch…</option>
              {pitches.map((p) => <option key={p.id} value={p.id}>{p.title} · {p.voice}</option>)}
            </select>
            {pitches.length === 0 && <p className="text-xs text-amber-600 font-bold mt-1">Create a pitch in the Pitch Studio first.</p>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select value={entityType} onChange={(e) => { setEntityType(e.target.value as EntityType); setEntityId(""); }} className={inputCls}>
                <option value="lead">Lead</option><option value="client">Client</option><option value="contact">Contact</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Prospect</label>
              <select value={entityId} onChange={(e) => setEntityId(e.target.value)} className={inputCls}>
                <option value="">— None —</option>
                {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Client phone (E.164)</label>
            <input value={toNumber} onChange={(e) => setToNumber(e.target.value)} placeholder="+14155550123" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Your phone for live takeover (optional)</label>
            <input value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} placeholder="+14155550199" className={inputCls} />
            <p className="text-[11px] text-slate-500 mt-1">If the client asks for a person, the AI transfers the call to this number.</p>
          </div>
          <button onClick={startCall} disabled={busy === "start" || !pitchId || !options.twilio.ready} className={cn(primaryBtn, "w-full")}>
            {busy === "start" ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />} Start call
          </button>
        </div>
      </Modal>
    </div>
  );
}
