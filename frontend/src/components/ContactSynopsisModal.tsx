"use client";

import React, { useState } from "react";
import { Phone, Mail, Calendar, MessageSquare, Zap, FileText, X, Check, Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/config";

interface ContactSynopsisModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: number;
  companyName: string;
  onSuccess: () => void;
}

const CHANNELS = [
  { key: "call", label: "Call", icon: Phone, color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  { key: "email", label: "Email", icon: Mail, color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  { key: "meeting", label: "Meeting", icon: Calendar, color: "text-purple-500 bg-purple-500/10 border-purple-500/20" },
  { key: "chat", label: "Chat", icon: Zap, color: "text-sky-500 bg-sky-500/10 border-sky-500/20" },
  { key: "other", label: "Other", icon: FileText, color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
];

export default function ContactSynopsisModal({
  isOpen,
  onClose,
  leadId,
  companyName,
  onSuccess,
}: ContactSynopsisModalProps) {
  const [channel, setChannel] = useState("call");
  const [synopsis, setSynopsis] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!synopsis.trim()) {
      setError("Please provide a brief synopsis of the conversation.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const selectedChan = CHANNELS.find((c) => c.key === channel)?.label || "Contact";
      const fullDescription = nextStep.trim()
        ? `${synopsis.trim()}\n\nNext Steps: ${nextStep.trim()}`
        : synopsis.trim();

      // 1. Save conversation log
      await fetch(`${API_BASE_URL}/leads/${leadId}/conversations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: `Contacted via ${selectedChan}`,
          type: channel,
          description: fullDescription,
          author_name: "Staff",
        }),
      });

      // 2. Update lead status to Contacted
      const statusRes = await fetch(`${API_BASE_URL}/leads/${leadId}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "Contacted" }),
      });

      if (!statusRes.ok) {
        const d = await statusRes.json().catch(() => ({}));
        throw new Error(d.detail || "Failed to update lead status");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save contact synopsis");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-900/50">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse" />
              Log Contact Synopsis
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Moving <span className="font-semibold text-slate-700 dark:text-zinc-200">{companyName}</span> to Contacted
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl">
              {error}
            </div>
          )}

          {/* Channel Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider mb-2">
              Contact Channel
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CHANNELS.map((ch) => {
                const Icon = ch.icon;
                const active = channel === ch.key;
                return (
                  <button
                    key={ch.key}
                    type="button"
                    onClick={() => setChannel(ch.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      active
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/20"
                        : "bg-slate-50 dark:bg-zinc-800/60 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700/80 hover:bg-slate-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <Icon size={14} className={active ? "text-white" : ""} />
                    {ch.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Discussion Synopsis */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
              Conversation Synopsis *
            </label>
            <textarea
              rows={4}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="What was discussed? What was their reaction, interest level, or objection?"
              className="w-full text-xs bg-slate-50 dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-sans"
              required
            />
          </div>

          {/* Next Steps / Follow up (optional) */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
              Next Steps / Action Items (Optional)
            </label>
            <input
              type="text"
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="e.g. Send proposal by Friday, Schedule demo call next Tuesday"
              className="w-full text-xs bg-slate-50 dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-500/25 transition-all disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Check size={14} /> Save to Conversations & Mark Contacted
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

