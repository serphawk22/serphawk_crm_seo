"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Plus, X, Clock, Loader2, Check, PhoneCall, PhoneOff, Zap,
  CalendarClock, ChevronDown, ChevronUp, Trash2, Calendar, User,
  Mail, Mic, FileText, CheckCircle, Bell
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { cn } from "@/lib/utils";

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 120 } },
};

interface CallEntry {
  id: number;
  phone_number: string;
  received_at: string;
  duration_seconds: number | null;
  summary: string | null;
  description: string | null;
  work_done: string | null;
  assigned_to: string | null;
  followup_needed: boolean;
  followup_date: string | null;
  client_id: number | null;
}

interface ScheduledCall {
  id: number;
  title: string;
  scheduled_at: string | null;
  entity_type: string;
  entity_id: number | null;
  entity_name: string | null;
  entity_email: string | null;
  pitch: string | null;
  notes: string | null;
  assigned_to: string | null;
  status: string;
  created_at: string;
}

function formatDuration(s: number | null) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function CallDetailPanel({ call, onSave }: { call: CallEntry; onSave: () => void }) {
  const [form, setForm] = useState({
    summary: call.summary || "",
    description: call.description || "",
    work_done: call.work_done || "",
    assigned_to: call.assigned_to || "",
    followup_needed: call.followup_needed,
    followup_date: call.followup_date || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE_URL}/calls/${call.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800 space-y-4">
      {/* Pitch/Description full view */}
      {call.description && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 rounded-2xl p-5 border border-indigo-100 dark:border-indigo-900/50">
          <p className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-2">📋 Full Pitch / Description</p>
          <p className="text-sm text-slate-700 dark:text-zinc-200 font-medium leading-relaxed whitespace-pre-wrap">{call.description}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">📋 Summary</label>
          <textarea rows={2} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })}
            placeholder="Brief call summary..." className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-700 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 text-slate-700 dark:text-zinc-200 resize-none" />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">✅ Work Done</label>
          <textarea rows={2} value={form.work_done} onChange={(e) => setForm({ ...form, work_done: e.target.value })}
            placeholder="Actions completed..." className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-700 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400 text-slate-700 dark:text-zinc-200 resize-none" />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">👤 Assigned To</label>
          <input type="text" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            placeholder="Team member name..." className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-700 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 text-slate-700 dark:text-zinc-200" />
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <div onClick={() => setForm({ ...form, followup_needed: !form.followup_needed })}
              className={cn("w-11 h-6 rounded-full transition-all relative cursor-pointer", form.followup_needed ? "bg-red-500" : "bg-slate-200 dark:bg-zinc-700")}>
              <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all", form.followup_needed ? "right-1" : "left-1")} />
            </div>
            <span className="text-sm font-bold text-slate-700 dark:text-zinc-200">🔔 Follow-up Needed</span>
          </label>
          {form.followup_needed && (
            <input type="date" value={form.followup_date} onChange={(e) => setForm({ ...form, followup_date: e.target.value })}
              className="mt-2 px-4 py-2 bg-red-50 border border-red-200 rounded-2xl text-sm font-bold text-red-700 outline-none" />
          )}
        </div>
      </div>
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold text-sm transition-all disabled:opacity-40">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {saved ? "Saved!" : "Save Changes"}
      </button>
    </div>
  );
}

export default function CallsPage() {
  const [activeTab, setActiveTab] = useState<"logged" | "scheduled">("logged");
  const [calls, setCalls] = useState<CallEntry[]>([]);
  const [scheduledCalls, setScheduledCalls] = useState<ScheduledCall[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showLogModal, setShowLogModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  // Forms
  const [logForm, setLogForm] = useState({ phone_number: "", duration_seconds: "", description: "", work_done: "", assigned_to: "", followup_needed: false, followup_date: "" });
  const [schedForm, setSchedForm] = useState({ title: "", scheduled_at: "", entity_type: "client", entity_id: "", notes: "", assigned_to: "", generatePitch: false });
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedPitch, setGeneratedPitch] = useState("");

  // Generate pitch
  const [genType, setGenType] = useState<"client" | "lead" | "contact">("client");
  const [genEntityId, setGenEntityId] = useState("");

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedSchedId, setExpandedSchedId] = useState<number | null>(null);

  const fetchAll = async () => {
    try {
      const [callsRes, schedRes, clientsRes, leadsRes, contactsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/calls`),
        fetch(`${API_BASE_URL}/scheduled-calls`),
        fetch(`${API_BASE_URL}/clients?per_page=1000`),
        fetch(`${API_BASE_URL}/leads?per_page=1000`),
        fetch(`${API_BASE_URL}/contacts?per_page=1000`),
      ]);
      setCalls((await callsRes.json()).calls || []);
      setScheduledCalls((await schedRes.json()).scheduled_calls || []);
      setClients((await clientsRes.json()).clients || []);
      setLeads((await leadsRes.json()).leads || []);
      setContacts((await contactsRes.json()).contacts || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const getEntityName = (type: string, id: string) => {
    if (type === "client") return clients.find(c => c.id.toString() === id)?.companyName || clients.find(c => c.id.toString() === id)?.projectName || "Unknown";
    if (type === "lead") return leads.find(l => l.id.toString() === id)?.company_name || "Unknown";
    const c = contacts.find(c => c.id.toString() === id);
    return c ? `${c.first_name} ${c.last_name || ""}`.trim() : "Unknown";
  };

  const getEntityEmail = (type: string, id: string) => {
    if (type === "client") return clients.find(c => c.id.toString() === id)?.email || null;
    if (type === "lead") return leads.find(l => l.id.toString() === id)?.email || null;
    return contacts.find(c => c.id.toString() === id)?.email || null;
  };

  const handleLogCall = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch(`${API_BASE_URL}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: logForm.phone_number, duration_seconds: logForm.duration_seconds ? parseInt(logForm.duration_seconds) : null, description: logForm.description || null, work_done: logForm.work_done || null, assigned_to: logForm.assigned_to || null, followup_needed: logForm.followup_needed, followup_date: logForm.followup_date || null }),
      });
      setLogForm({ phone_number: "", duration_seconds: "", description: "", work_done: "", assigned_to: "", followup_needed: false, followup_date: "" });
      setShowLogModal(false);
      fetchAll();
    } finally { setSubmitting(false); }
  };

  const handleGeneratePitch = async () => {
    if (!schedForm.entity_id) return;
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/${schedForm.entity_type}s/${schedForm.entity_id}/simulate-call`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setGeneratedPitch(data.pitch || "");
        fetchAll();
      }
    } catch (e) { console.error(e); }
    finally { setGenerating(false); }
  };

  const handleScheduleCall = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const entityName = getEntityName(schedForm.entity_type, schedForm.entity_id);
      const entityEmail = getEntityEmail(schedForm.entity_type, schedForm.entity_id);

      let pitch = generatedPitch || null;

      // If generate pitch was requested but not done yet, do it now
      if (schedForm.generatePitch && schedForm.entity_id && !pitch) {
        setGenerating(true);
        try {
          const res = await fetch(`${API_BASE_URL}/${schedForm.entity_type}s/${schedForm.entity_id}/simulate-call`, { method: "POST" });
          if (res.ok) {
            const data = await res.json();
            pitch = data.pitch || null;
          }
        } catch (e) { console.error(e); }
        finally { setGenerating(false); }
      }

      await fetch(`${API_BASE_URL}/scheduled-calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: schedForm.title,
          scheduled_at: schedForm.scheduled_at || null,
          entity_type: schedForm.entity_type,
          entity_id: schedForm.entity_id ? parseInt(schedForm.entity_id) : null,
          entity_name: entityName,
          entity_email: entityEmail,
          pitch,
          notes: schedForm.notes || null,
          assigned_to: schedForm.assigned_to || null,
        }),
      });

      setSchedForm({ title: "", scheduled_at: "", entity_type: "client", entity_id: "", notes: "", assigned_to: "", generatePitch: false });
      setGeneratedPitch("");
      setShowScheduleModal(false);
      setActiveTab("scheduled");
      fetchAll();
    } finally { setSubmitting(false); }
  };

  const handleDeleteScheduled = async (id: number) => {
    if (!confirm("Delete this scheduled call?")) return;
    await fetch(`${API_BASE_URL}/scheduled-calls/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const handleMarkCompleted = async (id: number) => {
    await fetch(`${API_BASE_URL}/scheduled-calls/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Completed" }),
    });
    fetchAll();
  };

  return (
    <motion.div initial="hidden" animate="show" variants={containerVariants} className="max-w-5xl mx-auto space-y-8 p-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-amber-700 to-slate-900 dark:from-white dark:via-amber-400 dark:to-white tracking-tight">
            Calls
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 font-medium mt-1">
            {calls.length} logged · {scheduledCalls.filter(s => s.status === "Scheduled").length} scheduled
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => { setShowGenerateModal(true); }}
            className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 rounded-2xl font-bold shadow-sm hover:bg-slate-50 transition-all text-sm">
            <Zap className="w-4 h-4 text-amber-500" /> Generate Pitch
          </button>
          <button onClick={() => setShowScheduleModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl font-bold shadow-lg hover:-translate-y-0.5 transition-all text-sm">
            <CalendarClock className="w-4 h-4" /> Schedule Call
          </button>
          <button onClick={() => setShowLogModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl font-bold shadow-[0_8px_20px_rgba(245,158,11,0.3)] hover:-translate-y-0.5 transition-all text-sm">
            <Plus className="w-4 h-4" /> Log Call
          </button>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={itemVariants} className="flex bg-slate-100 dark:bg-zinc-900 p-1 rounded-2xl w-fit">
        <button onClick={() => setActiveTab("logged")}
          className={cn("flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all", activeTab === "logged" ? "bg-white dark:bg-zinc-800 text-amber-600 shadow-sm" : "text-slate-500 dark:text-zinc-400 hover:text-slate-700")}>
          <PhoneCall className="w-4 h-4" /> Calls Logged
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-black", activeTab === "logged" ? "bg-amber-100 text-amber-700" : "bg-slate-200 dark:bg-zinc-700 text-slate-500")}>{calls.length}</span>
        </button>
        <button onClick={() => setActiveTab("scheduled")}
          className={cn("flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all", activeTab === "scheduled" ? "bg-white dark:bg-zinc-800 text-indigo-600 shadow-sm" : "text-slate-500 dark:text-zinc-400 hover:text-slate-700")}>
          <CalendarClock className="w-4 h-4" /> Calls Scheduled
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-black", activeTab === "scheduled" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 dark:bg-zinc-700 text-slate-500")}>{scheduledCalls.filter(s => s.status === "Scheduled").length}</span>
        </button>
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === "logged" && (
          <motion.div key="logged" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
            ) : calls.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-28 text-slate-400 gap-4">
                <PhoneOff className="w-14 h-14 opacity-30" />
                <p className="font-bold text-lg">No calls logged yet</p>
                <button onClick={() => setShowLogModal(true)} className="text-amber-600 font-bold hover:underline">Log your first call</button>
              </div>
            ) : (
              calls.map((call) => (
                <motion.div key={call.id} variants={itemVariants}
                  className={cn("bg-white dark:bg-zinc-900/60 backdrop-blur-2xl border rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] p-6 transition-all",
                    call.followup_needed ? "border-red-200 dark:border-red-900/50" : "border-slate-100 dark:border-zinc-800")}>
                  <div className="flex items-start gap-4">
                    <div className={cn("p-3 rounded-2xl shrink-0", call.summary ? "bg-emerald-50 text-emerald-500" : "bg-amber-50 text-amber-500")}>
                      <PhoneCall className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <span className="font-black text-slate-800 dark:text-zinc-100 text-lg">{call.entity_name || call.phone_number}</span>
                        {call.entity_name && <span className="text-sm font-bold text-slate-400">({call.phone_number})</span>}
                        {!call.summary && <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider animate-pulse">Needs Summary</span>}
                        {call.followup_needed && <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">🔔 Follow-up</span>}
                        {call.assigned_to && <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2.5 py-1 rounded-full">👤 {call.assigned_to}</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-zinc-400 font-medium">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(call.duration_seconds)}</span>
                        <span>{new Date(call.received_at).toLocaleString()}</span>
                        {call.followup_date && <span className="text-red-600 font-bold">📅 Due: {call.followup_date}</span>}
                      </div>
                      {call.summary && <p className="text-sm text-slate-600 dark:text-zinc-300 font-medium bg-slate-50 dark:bg-zinc-800 p-3 rounded-2xl border border-slate-100 dark:border-zinc-700 mt-3 line-clamp-2">{call.summary}</p>}
                    </div>
                    <button onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
                      className="shrink-0 p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-slate-500 dark:text-zinc-400">
                      {expandedId === call.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                  <AnimatePresence>
                    {expandedId === call.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }}>
                        <CallDetailPanel call={call} onSave={fetchAll} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))
            )}
          </motion.div>
        )}

        {activeTab === "scheduled" && (
          <motion.div key="scheduled" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
            ) : scheduledCalls.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-28 text-slate-400 gap-4">
                <CalendarClock className="w-14 h-14 opacity-30" />
                <p className="font-bold text-lg">No scheduled calls yet</p>
                <button onClick={() => setShowScheduleModal(true)} className="text-indigo-600 font-bold hover:underline">Schedule your first call</button>
              </div>
            ) : (
              scheduledCalls.map((sc) => (
                <motion.div key={sc.id} variants={itemVariants}
                  className={cn("bg-white dark:bg-zinc-900/60 backdrop-blur-2xl border rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] p-6 transition-all",
                    sc.status === "Completed" ? "border-emerald-100 dark:border-emerald-900/40 opacity-75" : "border-slate-100 dark:border-zinc-800")}>
                  <div className="flex items-start gap-4">
                    <div className={cn("p-3 rounded-2xl shrink-0", sc.status === "Completed" ? "bg-emerald-50 text-emerald-500" : "bg-indigo-50 text-indigo-500")}>
                      {sc.status === "Completed" ? <CheckCircle className="w-5 h-5" /> : <CalendarClock className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <span className="font-black text-slate-800 dark:text-zinc-100 text-lg">{sc.title}</span>
                        <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider", sc.status === "Completed" ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700")}>{sc.status}</span>
                        {sc.pitch && <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-2.5 py-1 rounded-full">🎯 Pitch Ready</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-zinc-400 font-medium flex-wrap">
                        {sc.entity_name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{sc.entity_name} ({sc.entity_type})</span>}
                        {sc.scheduled_at && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(sc.scheduled_at).toLocaleString()}</span>}
                        {sc.entity_email && <span className="flex items-center gap-1 text-indigo-500"><Mail className="w-3 h-3" />{sc.entity_email}</span>}
                        {sc.assigned_to && <span className="flex items-center gap-1"><User className="w-3 h-3" />{sc.assigned_to}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {sc.status !== "Completed" && (
                        <button onClick={() => handleMarkCompleted(sc.id)} title="Mark Completed"
                          className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors text-slate-400 hover:text-emerald-600">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => setExpandedSchedId(expandedSchedId === sc.id ? null : sc.id)}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-slate-500 dark:text-zinc-400">
                        {expandedSchedId === sc.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleDeleteScheduled(sc.id)}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors text-slate-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded pitch view */}
                  <AnimatePresence>
                    {expandedSchedId === sc.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }}>
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800 space-y-4">
                          {sc.pitch && (
                            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/40 rounded-2xl p-5 border border-purple-100 dark:border-purple-900/50">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-black text-purple-600 uppercase tracking-widest">🎯 AI Call Pitch</p>
                                <button onClick={() => navigator.clipboard.writeText(sc.pitch!)}
                                  className="text-xs font-bold text-purple-600 hover:text-purple-800 bg-purple-100 hover:bg-purple-200 px-3 py-1 rounded-lg transition-colors">Copy</button>
                              </div>
                              <p className="text-sm text-slate-700 dark:text-zinc-200 font-medium leading-relaxed whitespace-pre-wrap">{sc.pitch}</p>
                            </div>
                          )}
                          {sc.notes && (
                            <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-2xl p-4">
                              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">📝 Notes</p>
                              <p className="text-sm text-slate-700 dark:text-zinc-300">{sc.notes}</p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Log Call Modal ── */}
      <AnimatePresence>
        {showLogModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900/95 backdrop-blur-2xl rounded-[2rem] border border-slate-200 dark:border-zinc-700 shadow-2xl w-full max-w-lg p-8 relative max-h-[90vh] overflow-y-auto">
              <button onClick={() => setShowLogModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
              <h2 className="text-2xl font-black text-slate-800 dark:text-zinc-100 mb-6 flex items-center gap-3">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><Phone className="w-5 h-5" /></div>
                Log New Call
              </h2>
              <form onSubmit={handleLogCall} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">📞 Phone Number *</label>
                    <input type="text" required placeholder="+1 (555) 000-0000" value={logForm.phone_number} onChange={(e) => setLogForm({ ...logForm, phone_number: e.target.value })}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">⏱ Duration (seconds)</label>
                    <input type="number" placeholder="e.g. 180" min={0} value={logForm.duration_seconds} onChange={(e) => setLogForm({ ...logForm, duration_seconds: e.target.value })}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-amber-400/30" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">👤 Assigned To</label>
                    <input type="text" placeholder="Team member..." value={logForm.assigned_to} onChange={(e) => setLogForm({ ...logForm, assigned_to: e.target.value })}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-400/30" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">📋 Description / What was Discussed</label>
                  <textarea rows={3} placeholder="Brief overview of the call..." value={logForm.description} onChange={(e) => setLogForm({ ...logForm, description: e.target.value })}
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-amber-400/30 resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">✅ Work Done</label>
                  <textarea rows={2} placeholder="Tasks completed, decisions made..." value={logForm.work_done} onChange={(e) => setLogForm({ ...logForm, work_done: e.target.value })}
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-emerald-400/30 resize-none" />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <div onClick={() => setLogForm({ ...logForm, followup_needed: !logForm.followup_needed })}
                      className={cn("w-11 h-6 rounded-full transition-all relative cursor-pointer", logForm.followup_needed ? "bg-red-500" : "bg-slate-200 dark:bg-zinc-700")}>
                      <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all", logForm.followup_needed ? "right-1" : "left-1")} />
                    </div>
                    <span className="text-sm font-bold text-slate-700 dark:text-zinc-200">🔔 Follow-up Needed</span>
                  </label>
                  {logForm.followup_needed && (
                    <input type="date" value={logForm.followup_date} onChange={(e) => setLogForm({ ...logForm, followup_date: e.target.value })}
                      className="px-4 py-2 bg-red-50 border border-red-200 rounded-2xl text-sm font-bold text-red-700 outline-none" />
                  )}
                </div>
                <button type="submit" disabled={submitting}
                  className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl font-bold shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                  Save Call Log
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Schedule Call Modal ── */}
      <AnimatePresence>
        {showScheduleModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900/95 backdrop-blur-2xl rounded-[2rem] border border-slate-200 dark:border-zinc-700 shadow-2xl w-full max-w-xl p-8 relative max-h-[90vh] overflow-y-auto">
              <button onClick={() => { setShowScheduleModal(false); setGeneratedPitch(""); }} className="absolute top-6 right-6 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
              <h2 className="text-2xl font-black text-slate-800 dark:text-zinc-100 mb-6 flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><CalendarClock className="w-5 h-5" /></div>
                Schedule a Call
              </h2>
              <form onSubmit={handleScheduleCall} className="space-y-5">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">📌 Call Title *</label>
                  <input type="text" required placeholder="e.g. Discovery call with Acme Corp" value={schedForm.title} onChange={(e) => setSchedForm({ ...schedForm, title: e.target.value })}
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-400/30" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">📅 Scheduled Date & Time</label>
                  <input type="datetime-local" value={schedForm.scheduled_at} onChange={(e) => setSchedForm({ ...schedForm, scheduled_at: e.target.value })}
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-400/30" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">🏷️ Type</label>
                    <select value={schedForm.entity_type} onChange={(e) => setSchedForm({ ...schedForm, entity_type: e.target.value, entity_id: "" })}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-400/30">
                      <option value="client">Client</option>
                      <option value="lead">Lead</option>
                      <option value="contact">Contact</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">👤 Select {schedForm.entity_type}</label>
                    <select value={schedForm.entity_id} onChange={(e) => { setSchedForm({ ...schedForm, entity_id: e.target.value }); setGeneratedPitch(""); }}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-400/30">
                      <option value="">Select...</option>
                      {schedForm.entity_type === "client" && clients.map(c => <option key={c.id} value={c.id}>{c.companyName || c.projectName || c.email}</option>)}
                      {schedForm.entity_type === "lead" && leads.map(l => <option key={l.id} value={l.id}>{l.company_name || l.email}</option>)}
                      {schedForm.entity_type === "contact" && contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name || ""}</option>)}
                    </select>
                  </div>
                </div>

                {/* Generate Pitch section */}
                {schedForm.entity_id && (
                  <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 rounded-2xl border border-purple-100 dark:border-purple-900/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-purple-600 uppercase tracking-widest">🎯 AI Pitch</p>
                      <button type="button" onClick={handleGeneratePitch} disabled={generating}
                        className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs transition-all disabled:opacity-50">
                        {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        {generating ? "Generating..." : generatedPitch ? "Regenerate" : "Generate Pitch"}
                      </button>
                    </div>
                    {generatedPitch ? (
                      <div className="bg-white/70 dark:bg-zinc-900/50 rounded-xl p-4 border border-purple-100 dark:border-purple-900/30">
                        <textarea rows={8} value={generatedPitch} onChange={(e) => setGeneratedPitch(e.target.value)}
                          className="w-full text-sm text-slate-700 dark:text-zinc-200 font-medium leading-relaxed bg-transparent outline-none resize-y" />
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-zinc-400">Click generate to create an AI pitch — it will be saved with the scheduled call and emailed to the client.</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">📝 Notes</label>
                  <textarea rows={2} placeholder="Additional notes..." value={schedForm.notes} onChange={(e) => setSchedForm({ ...schedForm, notes: e.target.value })}
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">👤 Assign To</label>
                  <input type="text" placeholder="Team member name..." value={schedForm.assigned_to} onChange={(e) => setSchedForm({ ...schedForm, assigned_to: e.target.value })}
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-400/30" />
                </div>

                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                  <Bell className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    An email will be automatically sent to the client notifying them of the scheduled call. If a pitch was generated, it will be included.
                  </p>
                </div>

                <button type="submit" disabled={submitting || !schedForm.title}
                  className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl font-bold shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                  Schedule Call & Send Notification
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Generate Pitch Standalone Modal ── */}
      <AnimatePresence>
        {showGenerateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900/95 backdrop-blur-2xl rounded-[2rem] border border-slate-200 dark:border-zinc-700 shadow-2xl w-full max-w-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center px-8 py-6 border-b border-slate-100 dark:border-zinc-800">
                <h2 className="text-2xl font-black text-slate-800 dark:text-zinc-100 flex items-center gap-3">
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><Zap className="w-5 h-5" /></div>
                  Generate AI Call Pitch
                </h2>
                <button onClick={() => { setShowGenerateModal(false); setGeneratedPitch(""); setGenEntityId(""); }} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-8 space-y-6 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">🏷️ Type</label>
                    <select value={genType} onChange={(e) => { setGenType(e.target.value as any); setGenEntityId(""); setGeneratedPitch(""); }}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-amber-400/30">
                      <option value="client">Client</option>
                      <option value="lead">Lead</option>
                      <option value="contact">Contact</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">👤 Select</label>
                    <select required value={genEntityId} onChange={(e) => { setGenEntityId(e.target.value); setGeneratedPitch(""); }}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-amber-400/30">
                      <option value="">Select a {genType}...</option>
                      {genType === "client" && clients.map(c => <option key={c.id} value={c.id}>{c.companyName || c.projectName || c.email}</option>)}
                      {genType === "lead" && leads.map(l => <option key={l.id} value={l.id}>{l.company_name || l.email}</option>)}
                      {genType === "contact" && contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name || ""}</option>)}
                    </select>
                  </div>
                </div>

                <button type="button" onClick={async () => {
                  if (!genEntityId) return;
                  setGenerating(true);
                  try {
                    const res = await fetch(`${API_BASE_URL}/${genType}s/${genEntityId}/simulate-call`, { method: "POST" });
                    if (res.ok) { const data = await res.json(); setGeneratedPitch(data.pitch || ""); fetchAll(); }
                  } catch (e) { console.error(e); }
                  finally { setGenerating(false); }
                }} disabled={generating || !genEntityId}
                  className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl font-bold shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                  {generating ? "Generating Pitch..." : "Generate AI Pitch"}
                </button>

                {generatedPitch && (
                  <div className="bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-zinc-800 dark:to-indigo-950/30 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-900/40">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-black text-indigo-600 uppercase tracking-widest">✅ Pitch Generated</p>
                      <button onClick={() => navigator.clipboard.writeText(generatedPitch)}
                        className="text-xs font-bold text-indigo-600 bg-indigo-100 hover:bg-indigo-200 px-3 py-1 rounded-lg transition-colors">Copy</button>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-zinc-200 font-medium leading-relaxed whitespace-pre-wrap">{generatedPitch}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
