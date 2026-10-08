"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, BookPlus, RotateCcw, Calendar, MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { voiceAgentApi, errorText, CallQuestion } from "@/lib/voiceAgentApi";
import { Badge, Modal, Notify, QuestionStatusBadge, cardCls, inputCls, labelCls, primaryBtn, ghostBtn } from "./shared";

const FILTERS = [
  { id: "open,escalated", label: "Needs follow-up" },
  { id: "escalated", label: "Escalated" },
  { id: "resolved", label: "Resolved" },
  { id: "answered", label: "Answered by AI" },
  { id: "", label: "All" },
];

const CATEGORY_CLS: Record<string, string> = {
  question: "bg-indigo-100 text-indigo-700",
  doubt: "bg-amber-100 text-amber-700",
  objection: "bg-red-100 text-red-700",
  info_request: "bg-sky-100 text-sky-700",
};

export default function FollowUps({ notify, onChanged }: { notify: Notify; onChanged?: () => void }) {
  const [filter, setFilter] = useState("open,escalated");
  const [items, setItems] = useState<CallQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<CallQuestion | null>(null);
  const [resolution, setResolution] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await voiceAgentApi.questions(filter)).questions); }
    catch (e) { notify(errorText(e, "Failed to load follow-ups"), "error"); }
    finally { setLoading(false); }
  }, [filter, notify]);
  useEffect(() => { load(); }, [load]);

  const open = (q: CallQuestion) => { setActive(q); setResolution(q.resolution || ""); setFollowUp(q.follow_up_date || ""); };

  const save = async (status?: CallQuestion["status"]) => {
    if (!active) return;
    setBusy(status || "save");
    try {
      await voiceAgentApi.updateQuestion(active.id, { resolution, follow_up_date: followUp, ...(status ? { status } : {}) });
      notify(status === "resolved" ? "Marked resolved" : "Saved", "success");
      setActive(null); load(); onChanged?.();
    } catch (e) { notify(errorText(e, "Save failed"), "error"); }
    finally { setBusy(null); }
  };

  const toKnowledge = async () => {
    if (!active || !resolution.trim()) { notify("Write the answer first", "warning"); return; }
    setBusy("kb");
    try {
      await voiceAgentApi.questionToKnowledge(active.id, resolution);
      notify("Added to knowledge base — the AI will answer this next time", "success");
      setActive(null); load(); onChanged?.();
    } catch (e) { notify(errorText(e, "Failed"), "error"); }
    finally { setBusy(null); }
  };

  return (
    <div className={cn(cardCls, "p-6")}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
          <MessageCircleQuestion className="w-5 h-5 text-indigo-500" /> Client questions & follow-ups
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={cn("px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                filter === f.id ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300")}>{f.label}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
        : items.length === 0 ? <p className="text-sm text-slate-500 py-6 text-center">Nothing here 🎉</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-zinc-800">
                  <th className="py-2 pr-3">Question / concern</th><th className="py-2 pr-3">Prospect</th><th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Follow-up</th><th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((q) => (
                  <tr key={q.id} className="border-b border-slate-50 dark:border-zinc-800/60 hover:bg-slate-50/60 dark:hover:bg-zinc-800/30">
                    <td className="py-3 pr-3 max-w-md">
                      <p className="font-medium text-slate-700 dark:text-zinc-200">{q.question}</p>
                      {q.escalation_reason && <p className="text-xs text-red-500 mt-0.5">{q.escalation_reason}</p>}
                      {q.resolution && <p className="text-xs text-emerald-600 mt-0.5">✓ {q.resolution}</p>}
                    </td>
                    <td className="py-3 pr-3 text-slate-600 dark:text-zinc-300">{q.entity_name || "—"}</td>
                    <td className="py-3 pr-3"><Badge className={CATEGORY_CLS[q.category] || "bg-slate-100 text-slate-600"}>{q.category}</Badge></td>
                    <td className="py-3 pr-3"><QuestionStatusBadge status={q.status} /></td>
                    <td className="py-3 pr-3 text-xs text-slate-500">{q.follow_up_date || "—"}</td>
                    <td className="py-3 text-right"><button onClick={() => open(q)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-600 dark:text-zinc-300">Handle</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <Modal open={!!active} onClose={() => setActive(null)} title="Handle follow-up" wide
        icon={<div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><MessageCircleQuestion className="w-5 h-5" /></div>}>
        {active && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/60">
              <div className="flex gap-2 mb-2"><QuestionStatusBadge status={active.status} /><Badge className={CATEGORY_CLS[active.category]}>{active.category}</Badge></div>
              <p className="font-bold text-slate-800 dark:text-white">{active.question}</p>
              {active.ai_answer && <p className="text-sm text-slate-500 mt-2"><span className="font-bold">AI said:</span> {active.ai_answer}</p>}
            </div>
            <div>
              <label className={labelCls}>Answer / resolution</label>
              <textarea rows={4} value={resolution} onChange={(e) => setResolution(e.target.value)} className={cn(inputCls, "resize-y")}
                placeholder="The correct answer to give the client (also used if you add it to the knowledge base)" />
            </div>
            <div>
              <label className={labelCls}><Calendar className="w-3 h-3 inline mr-1" />Follow-up date</label>
              <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              {active.status === "resolved" ? (
                <button onClick={() => save("open")} disabled={!!busy} className={ghostBtn}><RotateCcw className="w-4 h-4" /> Reopen</button>
              ) : (
                <button onClick={() => save()} disabled={!!busy} className={ghostBtn}>{busy === "save" && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
              )}
              <button onClick={toKnowledge} disabled={!!busy || !resolution.trim()} className={ghostBtn}>
                {busy === "kb" ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookPlus className="w-4 h-4" />} Resolve & add to knowledge base
              </button>
              {active.status !== "resolved" && (
                <button onClick={() => save("resolved")} disabled={!!busy} className={primaryBtn}>
                  {busy === "resolved" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Mark resolved
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
