"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { voiceAgentApi, errorText, KnowledgeItem, KnowledgeKind } from "@/lib/voiceAgentApi";
import { Badge, Modal, Notify, cardCls, inputCls, labelCls, primaryBtn } from "./shared";

const KINDS: { id: KnowledgeKind; label: string; hint: string; cls: string }[] = [
  { id: "faq", label: "FAQ", hint: "Common question → answer", cls: "bg-indigo-100 text-indigo-700" },
  { id: "objection", label: "Objection", hint: "Objection → how to handle it", cls: "bg-red-100 text-red-700" },
  { id: "product", label: "Product / service", hint: "Name → description, pricing, benefits", cls: "bg-emerald-100 text-emerald-700" },
];

const EMPTY = { id: 0, kind: "faq" as KnowledgeKind, title: "", answer: "", tags: "", is_active: true };

export default function KnowledgeBase({ notify }: { notify: Notify }) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [kind, setKind] = useState<KnowledgeKind | "">("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await voiceAgentApi.knowledge()).items); }
    catch (e) { notify(errorText(e, "Failed to load knowledge base"), "error"); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form || !form.title.trim() || !form.answer.trim()) { notify("Title and answer are required", "warning"); return; }
    setSaving(true);
    const body = { kind: form.kind, title: form.title, answer: form.answer, is_active: form.is_active,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) };
    try {
      if (form.id) await voiceAgentApi.updateKnowledge(form.id, body); else await voiceAgentApi.createKnowledge(body);
      notify("Saved", "success"); setForm(null); load();
    } catch (e) { notify(errorText(e, "Save failed"), "error"); }
    finally { setSaving(false); }
  };

  const toggleActive = async (k: KnowledgeItem) => {
    try { await voiceAgentApi.updateKnowledge(k.id, { is_active: !k.is_active }); load(); }
    catch (e) { notify(errorText(e, "Update failed"), "error"); }
  };

  const remove = async (k: KnowledgeItem) => {
    if (!confirm("Delete this entry?")) return;
    try { await voiceAgentApi.deleteKnowledge(k.id); load(); } catch (e) { notify(errorText(e, "Delete failed"), "error"); }
  };

  const shown = kind ? items.filter((i) => i.kind === kind) : items;

  return (
    <div className={cn(cardCls, "p-6")}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2"><BookOpen className="w-5 h-5 text-emerald-500" /> Call knowledge base</h2>
        <button onClick={() => setForm({ ...EMPTY })} className={primaryBtn}><Plus className="w-4 h-4" /> Add entry</button>
      </div>
      <p className="text-sm text-slate-500 mb-5">The AI uses these entries (plus active Products and published Solutions) to answer questions, handle objections and give product info. It never invents answers — anything missing becomes a follow-up.</p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {[{ id: "", label: "All" }, ...KINDS].map((k) => (
          <button key={k.id} onClick={() => setKind(k.id as KnowledgeKind | "")}
            className={cn("px-3 py-1.5 rounded-xl text-xs font-bold", kind === k.id ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300")}>{k.label}</button>
        ))}
      </div>

      {loading ? <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
        : shown.length === 0 ? <p className="text-sm text-slate-500 py-6 text-center">No entries yet. Add your pricing FAQs, common objections and service descriptions.</p> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {shown.map((k) => {
              const meta = KINDS.find((x) => x.id === k.kind);
              return (
                <div key={k.id} className={cn("rounded-2xl border p-4", k.is_active ? "border-slate-200 dark:border-zinc-800" : "border-dashed border-slate-300 opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex gap-2 flex-wrap"><Badge className={meta?.cls}>{meta?.label}</Badge>
                      {k.usage_count > 0 && <Badge className="bg-slate-100 text-slate-500">used {k.usage_count}×</Badge>}</div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => toggleActive(k)} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-500">{k.is_active ? "Active" : "Disabled"}</button>
                      <button onClick={() => setForm({ id: k.id, kind: k.kind, title: k.title, answer: k.answer, tags: k.tags.join(", "), is_active: k.is_active })}
                        className="p-1.5 text-slate-400 hover:text-violet-600"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(k)} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <p className="font-bold text-sm text-slate-800 dark:text-white mt-2">{k.title}</p>
                  <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1 whitespace-pre-wrap">{k.answer}</p>
                  {k.tags.length > 0 && <p className="text-[11px] text-slate-400 mt-2">#{k.tags.join(" #")}</p>}
                </div>
              );
            })}
          </div>
        )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit entry" : "New entry"} wide>
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map((k) => (
                <button key={k.id} onClick={() => setForm({ ...form, kind: k.id })}
                  className={cn("p-3 rounded-2xl border text-left", form.kind === k.id ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "border-slate-200 dark:border-zinc-700")}>
                  <p className="font-black text-sm text-slate-800 dark:text-white">{k.label}</p><p className="text-[11px] text-slate-500">{k.hint}</p>
                </button>
              ))}
            </div>
            <div>
              <label className={labelCls}>{form.kind === "objection" ? "Objection" : form.kind === "product" ? "Product / service name" : "Question"}</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls}
                placeholder={form.kind === "objection" ? "It's too expensive" : form.kind === "product" ? "Local SEO package" : "How long until we see results?"} />
            </div>
            <div>
              <label className={labelCls}>{form.kind === "objection" ? "How to handle it" : form.kind === "product" ? "Description, pricing, benefits" : "Answer"}</label>
              <textarea rows={5} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} className={cn(inputCls, "resize-y")} />
            </div>
            <div>
              <label className={labelCls}>Tags / keywords (comma separated)</label>
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="price, cost, budget" className={inputCls} />
            </div>
            <button onClick={save} disabled={saving} className={cn(primaryBtn, "w-full")}>{saving && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
