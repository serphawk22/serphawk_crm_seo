"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wand2, Loader2, Play, Pause, Save, RefreshCw, Trash2, PhoneCall, Pencil, Mic, Volume2, X, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  voiceAgentApi, errorText, audioSrc, voiceChoices, Entity, EntityType, VoiceAgentOptions, VoicePitch,
} from "@/lib/voiceAgentApi";
import { Badge, cardCls, ghostBtn, inputCls, labelCls, Notify, primaryBtn, useAudioPlayer } from "./shared";

interface Props {
  options: VoiceAgentOptions;
  notify: Notify;
  onStartCall: (pitch: VoicePitch) => void;
  onPitchesChanged?: () => void;
}

const EMPTY = { title: "", pitch_text: "", context: "" };

export default function PitchStudio({ options, notify, onStartCall, onPitchesChanged }: Props) {
  const { playing, toggle, stop } = useAudioPlayer();

  const [entityType, setEntityType] = useState<EntityType>("lead");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityId, setEntityId] = useState<string>("");
  const [form, setForm] = useState(EMPTY);
  const [voice, setVoice] = useState(options.default_voice);
  const language = "en";
  const { accents } = useMemo(() => voiceChoices(options), [options]);
  const [accent, setAccent] = useState(accents[0]?.id || "american");
  const [style, setStyle] = useState(options.styles[0]?.id || "friendly");
  const [speed, setSpeed] = useState(1);

  const [previewUrl, setPreviewUrl] = useState("");
  const [previewKey, setPreviewKey] = useState("");
  const [editing, setEditing] = useState<VoicePitch | null>(null);
  const [pitches, setPitches] = useState<VoicePitch[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // which action is running
  const [sampleBusy, setSampleBusy] = useState<string | null>(null);
  const [samples, setSamples] = useState<Record<string, string>>({});

  const settingsKey = `${form.pitch_text}|${voice}|${language}|${accent}|${style}|${speed}`;
  const previewStale = !!previewUrl && previewKey !== settingsKey;

  const loadPitches = useCallback(async () => {
    try { setPitches((await voiceAgentApi.pitches()).pitches); } catch (e) { notify(errorText(e, "Failed to load pitches"), "error"); }
  }, [notify]);

  useEffect(() => { loadPitches(); }, [loadPitches]);
  useEffect(() => {
    voiceAgentApi.entities(entityType).then((r) => setEntities(r.entities)).catch(() => setEntities([]));
  }, [entityType]);

  const selectedEntity = useMemo(() => entities.find((e) => String(e.id) === entityId), [entities, entityId]);

  const resetEditor = () => {
    stop();
    setEditing(null);
    setForm(EMPTY);
    setPreviewUrl("");
    setPreviewKey("");
  };

  const generateText = async () => {
    setBusy("generate");
    try {
      const r = await voiceAgentApi.generatePitchText({
        entity_type: entityId ? entityType : null, entity_id: entityId ? Number(entityId) : null, context: form.context || undefined, language,
      });
      setForm((f) => ({ ...f, pitch_text: r.pitch_text, title: f.title || (r.entity_name ? `Pitch for ${r.entity_name}` : f.title) }));
      notify("Pitch written — review and edit it before generating speech", "success");
    } catch (e) { notify(errorText(e, "Pitch generation failed"), "error"); }
    finally { setBusy(null); }
  };

  const playSample = async (voiceId: string) => {
    const key = `${voiceId}|${language}|${accent}|${style}`;
    if (samples[key]) { toggle(samples[key], `sample-${key}`); return; }
    setSampleBusy(voiceId);
    try {
      const r = await voiceAgentApi.preview({ voice: voiceId, language, accent, style, speed });
      setSamples((s) => ({ ...s, [key]: r.audio_url }));
      toggle(r.audio_url, `sample-${key}`);
    } catch (e) { notify(errorText(e, "Sample failed"), "error"); }
    finally { setSampleBusy(null); }
  };

  const previewSpeech = async () => {
    if (!form.pitch_text.trim()) { notify("Write or generate a pitch first", "warning"); return; }
    setBusy("preview");
    try {
      const r = await voiceAgentApi.preview({ text: form.pitch_text, voice, language, accent, style, speed });
      setPreviewUrl(r.audio_url);
      setPreviewKey(settingsKey);
      toggle(r.audio_url, "preview");
    } catch (e) { notify(errorText(e, "Speech generation failed"), "error"); }
    finally { setBusy(null); }
  };

  const savePitch = async () => {
    if (!form.pitch_text.trim()) { notify("Pitch text is required", "warning"); return; }
    setBusy("save");
    const body = {
      title: form.title, pitch_text: form.pitch_text, language, voice, accent, style, speed,
      entity_type: entityId ? entityType : null, entity_id: entityId ? Number(entityId) : null,
    };
    try {
      if (editing) {
        const r = await voiceAgentApi.updatePitch(editing.id, body);
        setEditing(r.pitch);
        notify(`Pitch updated (v${r.pitch.version})`, "success");
      } else {
        const r = await voiceAgentApi.createPitch(body);
        setEditing(r.pitch);
        notify("Pitch saved with generated speech", "success");
      }
      await loadPitches();
      onPitchesChanged?.();
    } catch (e) { notify(errorText(e, "Save failed"), "error"); }
    finally { setBusy(null); }
  };

  const editPitch = (p: VoicePitch) => {
    stop();
    setEditing(p);
    setForm({ title: p.title, pitch_text: p.pitch_text, context: "" });
    setVoice(p.voice); setAccent(p.accent); setStyle(p.style); setSpeed(p.speed);
    if (p.entity_type) { setEntityType(p.entity_type); setEntityId(p.entity_id ? String(p.entity_id) : ""); }
    setPreviewUrl(p.audio_url || "");
    setPreviewKey(`${p.pitch_text}|${p.voice}|${p.language || "en"}|${p.accent}|${p.style}|${p.speed}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const regenerate = async (p: VoicePitch) => {
    setBusy(`regen-${p.id}`);
    try {
      const r = await voiceAgentApi.regeneratePitch(p.id);
      notify("New take generated", "success");
      if (editing?.id === p.id) { setEditing(r.pitch); setPreviewUrl(r.pitch.audio_url || ""); }
      await loadPitches();
      toggle(r.pitch.audio_url, `pitch-${r.pitch.id}-${r.pitch.version}`);
    } catch (e) { notify(errorText(e, "Regenerate failed"), "error"); }
    finally { setBusy(null); }
  };

  const remove = async (p: VoicePitch) => {
    if (!confirm(`Delete "${p.title}"?`)) return;
    try {
      await voiceAgentApi.deletePitch(p.id);
      if (editing?.id === p.id) resetEditor();
      await loadPitches();
      onPitchesChanged?.();
      notify("Pitch deleted", "success");
    } catch (e) { notify(errorText(e, "Delete failed"), "error"); }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      {/* ── Editor ─────────────────────────────────────────────── */}
      <div className={cn(cardCls, "xl:col-span-3 p-6 space-y-6")}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Mic className="w-5 h-5 text-violet-500" /> {editing ? `Editing: ${editing.title}` : "Create a voice pitch"}
          </h2>
          {editing && (
            <button onClick={resetEditor} className={ghostBtn}><X className="w-4 h-4" /> New pitch</button>
          )}
        </div>

        {/* Prospect + AI writer */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Prospect type</label>
            <select value={entityType} onChange={(e) => { setEntityType(e.target.value as EntityType); setEntityId(""); }} className={inputCls}>
              <option value="lead">Lead</option>
              <option value="client">Client</option>
              <option value="contact">Contact</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Prospect (optional)</label>
            <select value={entityId} onChange={(e) => setEntityId(e.target.value)} className={inputCls}>
              <option value="">— Generic pitch —</option>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}{e.phone ? ` · ${e.phone}` : ""}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })}
            placeholder="Extra instructions for the AI writer (e.g. mention our local SEO offer)" className={inputCls} />
          <button onClick={generateText} disabled={busy === "generate"} className={cn(primaryBtn, "shrink-0")}>
            {busy === "generate" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Write with AI
          </button>
        </div>

        <div>
          <label className={labelCls}>Title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Local SEO intro — dentists" className={inputCls} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className={labelCls}>Pitch script (spoken word-for-word)</label>
            <span className="text-[10px] font-bold text-slate-400">
              {form.pitch_text.trim().split(/\s+/).filter(Boolean).length} words · ~{Math.round(form.pitch_text.trim().split(/\s+/).filter(Boolean).length / (2.5 * speed))}s
            </span>
          </div>
          <textarea rows={8} value={form.pitch_text} onChange={(e) => setForm({ ...form, pitch_text: e.target.value })}
            placeholder="Write your pitch, or click “Write with AI”. Keep it short and end with a question so the client responds."
            className={cn(inputCls, "resize-y leading-relaxed")} />
        </div>

        {/* Voice selection */}
        <div>
          <label className={labelCls}>Voice</label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {options.voices.map((v) => {
              const key = `${v.id}|${language}|${accent}|${style}`;
              const active = voice === v.id;
              return (
                <div key={v.id} onClick={() => setVoice(v.id)}
                  className={cn("cursor-pointer rounded-2xl border p-3 transition-all",
                    active ? "border-violet-500 ring-2 ring-violet-500/20 bg-violet-50 dark:bg-violet-950/30" : "border-slate-200 dark:border-zinc-700 hover:border-violet-300")}>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm text-slate-800 dark:text-white">{v.label}</span>
                    <button type="button" title="Play sample" onClick={(e) => { e.stopPropagation(); playSample(v.id); }}
                      className="p-1.5 rounded-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-violet-600">
                      {sampleBusy === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : playing === `sample-${key}` ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{v.gender}</span>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">{v.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Accent / style / speed */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Accent</label>
            <select value={accent} onChange={(e) => setAccent(e.target.value)} className={inputCls}>
              {accents.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Speaking style</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className={inputCls}>
              {options.styles.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Pace: {speed.toFixed(2)}x</label>
            <input type="range" min={0.75} max={1.25} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-full accent-violet-600 mt-3" />
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-2xl border border-violet-100 dark:border-violet-900/40 bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-600 flex items-center gap-1.5">
              <Volume2 className="w-3 h-3" /> Speech preview
              {previewStale && <Badge className="bg-amber-100 text-amber-700 ml-2">settings changed — regenerate</Badge>}
            </p>
            <div className="flex gap-2">
              <button onClick={previewSpeech} disabled={busy === "preview" || !form.pitch_text.trim()} className={ghostBtn}>
                {busy === "preview" ? <Loader2 className="w-4 h-4 animate-spin" /> : previewUrl ? <RefreshCw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                {previewUrl ? "Regenerate preview" : "Generate preview"}
              </button>
              <button onClick={savePitch} disabled={busy === "save" || !form.pitch_text.trim()} className={primaryBtn}>
                {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing ? "Update pitch" : "Save pitch"}
              </button>
            </div>
          </div>
          {previewUrl ? (
            <audio key={previewUrl} controls src={audioSrc(previewUrl)} className="w-full h-10" />
          ) : (
            <p className="text-sm text-slate-500">Generate a preview to hear exactly how the pitch will sound on the call.</p>
          )}
          {editing && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => onStartCall(editing)} className={ghostBtn}><PhoneCall className="w-4 h-4" /> Call with this pitch</button>
            </div>
          )}
        </div>
        {selectedEntity && !selectedEntity.phone && (
          <p className="text-xs font-bold text-amber-600">This prospect has no phone number on file — you can enter one when starting the call.</p>
        )}
      </div>

      {/* ── Library ────────────────────────────────────────────── */}
      <div className={cn(cardCls, "xl:col-span-2 p-6")}>
        <h2 className="text-lg font-black text-slate-800 dark:text-white mb-4">Pitch library <span className="text-slate-400 text-sm">({pitches.length})</span></h2>
        {pitches.length === 0 ? (
          <p className="text-sm text-slate-500">No saved pitches yet.</p>
        ) : (
          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            {pitches.map((p) => {
              const key = `pitch-${p.id}-${p.version}`;
              return (
                <div key={p.id} className={cn("rounded-2xl border p-4 transition-all",
                  editing?.id === p.id ? "border-violet-500 bg-violet-50/50 dark:bg-violet-950/20" : "border-slate-200 dark:border-zinc-800")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-black text-sm text-slate-800 dark:text-white truncate">{p.title}</p>
                      <p className="text-[11px] text-slate-500 truncate">{p.entity_name || "Generic"} · v{p.version}</p>
                    </div>
                    <button onClick={() => toggle(p.audio_url, key)} disabled={!p.audio_url}
                      className="p-2 rounded-full bg-violet-600 text-white shrink-0 disabled:opacity-40">
                      {playing === key ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge className="bg-violet-100 text-violet-700">{p.voice}</Badge>
                    <Badge className="bg-sky-100 text-sky-700">{accents.find((a) => a.id === p.accent)?.label || p.accent}</Badge>
                    <Badge className="bg-slate-100 text-slate-600">{p.style}</Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-zinc-400 mt-2 line-clamp-3">{p.pitch_text}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={() => onStartCall(p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600">
                      <PhoneCall className="w-3.5 h-3.5" /> Call
                    </button>
                    <button onClick={() => editPitch(p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-600 dark:text-zinc-300">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => regenerate(p)} disabled={busy === `regen-${p.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-600 dark:text-zinc-300">
                      {busy === `regen-${p.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} New take
                    </button>
                    <button onClick={() => remove(p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 ml-auto">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
