"use client";

import React, { useState, useEffect } from "react";
import { 
  Bell, Mail, Plus, Trash2, Edit2, CheckCircle2, AlertCircle, 
  Send, Loader2, Clock, ShieldCheck, UserCheck, ChevronRight,
  ExternalLink, Sparkles, RefreshCw, X
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";
import LocalizedText from "@/components/LocalizedText";
import Link from "next/link";

export interface NotificationRecipient {
  id: string;
  email: string;
  name: string;
  active: boolean;
  reminder_advance_minutes: number;
  events: {
    lead_added: boolean;
    client_added_or_converted: boolean;
    followup_created: boolean;
    followup_reminder: boolean;
    meeting_synopsis: boolean;
  };
}

const defaultEvents = {
  lead_added: true,
  client_added_or_converted: true,
  followup_created: true,
  followup_reminder: true,
  meeting_synopsis: true,
};

export default function NotificationEmailRecipientsTab() {
  const { t } = useLanguage();
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  const [smtpSender, setSmtpSender] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [formReminderAdvance, setFormReminderAdvance] = useState(60);
  const [formEvents, setFormEvents] = useState({ ...defaultEvents });
  const [formError, setFormError] = useState("");

  // Testing State
  const [testingEmail, setTestingEmail] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ email: string; ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("crm_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // 1. Fetch Tenant Settings for Notification Recipients
      const settingsRes = await fetch(`${API_BASE_URL}/tenant/settings`, { headers });
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        const storedRecipients = data.settings?.notification_email_recipients || [];
        setRecipients(Array.isArray(storedRecipients) ? storedRecipients : []);
      }

      // 2. Check SMTP status
      const smtpRes = await fetch(`${API_BASE_URL}/settings/email`, { headers });
      if (smtpRes.ok) {
        const smtpData = await smtpRes.json();
        if (smtpData.from_email && (smtpData.has_password || smtpData.smtp_pass)) {
          setSmtpConfigured(true);
          setSmtpSender(smtpData.from_email);
        } else {
          setSmtpConfigured(false);
        }
      } else {
        setSmtpConfigured(false);
      }
    } catch (err) {
      console.error("Error loading notification settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const saveRecipients = async (updatedList: NotificationRecipient[]) => {
    setSaving(true);
    try {
      const token = localStorage.getItem("crm_token");
      const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (token) reqHeaders["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/tenant/settings`, {
        method: "PUT",
        headers: reqHeaders,
        body: JSON.stringify({
          settings: {
            notification_email_recipients: updatedList
          }
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to update notification recipients");
      }

      setRecipients(updatedList);
      setShowAddModal(false);
      setEditingId(null);
      resetForm();
    } catch (err: any) {
      alert(err.message || "Could not save notification receivers");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormEmail("");
    setFormName("");
    setFormReminderAdvance(60);
    setFormEvents({ ...defaultEvents });
    setFormError("");
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleOpenEdit = (rec: NotificationRecipient) => {
    setEditingId(rec.id);
    setFormEmail(rec.email);
    setFormName(rec.name || "");
    setFormReminderAdvance(rec.reminder_advance_minutes || 60);
    setFormEvents({
      lead_added: Boolean(rec.events?.lead_added),
      client_added_or_converted: Boolean(rec.events?.client_added_or_converted),
      followup_created: Boolean(rec.events?.followup_created),
      followup_reminder: Boolean(rec.events?.followup_reminder),
      meeting_synopsis: Boolean(rec.events?.meeting_synopsis),
    });
    setFormError("");
    setShowAddModal(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = formEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setFormError("Please enter a valid email address");
      return;
    }

    if (!editingId && recipients.some(r => r.email.toLowerCase() === cleanEmail)) {
      setFormError("This email address is already added");
      return;
    }

    const payload: NotificationRecipient = {
      id: editingId || Math.random().toString(36).substring(2, 10),
      email: cleanEmail,
      name: formName.trim() || cleanEmail.split("@")[0],
      active: true,
      reminder_advance_minutes: Number(formReminderAdvance) || 60,
      events: { ...formEvents },
    };

    let updated: NotificationRecipient[];
    if (editingId) {
      updated = recipients.map(r => r.id === editingId ? { ...payload, active: r.active } : r);
    } else {
      updated = [...recipients, payload];
    }

    saveRecipients(updated);
  };

  const handleToggleActive = (id: string) => {
    const updated = recipients.map(r => r.id === id ? { ...r, active: !r.active } : r);
    saveRecipients(updated);
  };

  const handleDelete = (id: string, email: string) => {
    if (!confirm(`Are you sure you want to remove ${email} from notification receivers?`)) return;
    const updated = recipients.filter(r => r.id !== id);
    saveRecipients(updated);
  };

  const handleSendTest = async (email: string) => {
    setTestingEmail(email);
    setTestResult(null);
    try {
      const token = localStorage.getItem("crm_token");
      const testHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (token) testHeaders["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/settings/notifications/test`, {
        method: "POST",
        headers: testHeaders,
        body: JSON.stringify({ email, event_key: "lead_added" })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTestResult({ email, ok: true, msg: "Test email dispatched successfully! Please check inbox and spam." });
      } else {
        setTestResult({ email, ok: false, msg: data.detail || "Failed to dispatch test notification." });
      }
    } catch (e: any) {
      setTestResult({ email, ok: false, msg: e.message || "Network error dispatching test email." });
    } finally {
      setTestingEmail(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mailbox Status Card */}
      <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs ${
        smtpConfigured
          ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40 text-emerald-950 dark:text-emerald-200"
          : "bg-amber-50/70 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/40 text-amber-950 dark:text-amber-200"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            smtpConfigured ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"
          }`}>
            {smtpConfigured ? <ShieldCheck className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider">
              {smtpConfigured ? "Sender Mailbox Connected & Ready" : "Company Mailbox Not Connected"}
            </h3>
            <p className="text-xs opacity-90 mt-0.5">
              {smtpConfigured 
                ? `CRM notifications will be dispatched from ${smtpSender}` 
                : "Connect your SMTP email in Company Settings so notification receivers can receive email alerts."}
            </p>
          </div>
        </div>

        {!smtpConfigured && (
          <Link
            href="/settings?tab=company"
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 shadow-xs shrink-0"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Connect SMTP Mailbox</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-white/10 rounded-xl shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Notification Email Receivers</span>
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/40">
              {recipients.length} configured
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-xl">
            Add email addresses to receive instant notifications for new leads, client conversions, follow-up scheduling, 1-hour/2-hour reminders, and meeting synopses.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all shadow-sm hover:shadow-indigo-500/20 shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Notification Receiver</span>
        </button>
      </div>

      {/* Test Result Toast */}
      {testResult && (
        <div className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 border ${
          testResult.ok 
            ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-emerald-800 dark:text-emerald-300"
            : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 text-rose-800 dark:text-rose-300"
        }`}>
          <div className="flex items-center gap-2">
            {testResult.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span><strong>{testResult.email}</strong>: {testResult.msg}</span>
          </div>
          <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Recipients List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/90 dark:border-white/10">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : recipients.length === 0 ? (
        <div className="text-center py-12 px-4 bg-white dark:bg-zinc-900 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <Mail className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200">No Notification Receivers Added</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto mt-1 mb-4">
            Add team members, management, or sales leads to automatically notify them via email when important CRM activities occur.
          </p>
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add First Receiver</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {recipients.map((rec) => (
            <div
              key={rec.id}
              className={`p-4 rounded-xl border transition-all ${
                rec.active 
                  ? "bg-white dark:bg-zinc-900 border-slate-200/90 dark:border-white/10 shadow-2xs" 
                  : "bg-slate-50/70 dark:bg-zinc-900/40 border-slate-200/50 dark:border-white/5 opacity-70"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Info */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                    rec.active 
                      ? "bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-xs" 
                      : "bg-slate-200 dark:bg-zinc-800 text-slate-500"
                  }`}>
                    {(rec.name || rec.email).charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {rec.name || rec.email.split("@")[0]}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                        ({rec.email})
                      </span>
                      {rec.active ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                          Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                          Paused
                        </span>
                      )}
                    </div>

                    {/* Subscribed Events Pills */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mr-0.5">
                        Alerts:
                      </span>
                      {rec.events?.lead_added && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40">
                          🎯 Lead Added
                        </span>
                      )}
                      {rec.events?.client_added_or_converted && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40">
                          🎉 Client Converted
                        </span>
                      )}
                      {rec.events?.followup_created && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/40">
                          📅 Follow-up Created
                        </span>
                      )}
                      {rec.events?.followup_reminder && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/50 dark:border-rose-800/40 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          <span>Reminder: {rec.reminder_advance_minutes === 60 ? "1 hr prior" : rec.reminder_advance_minutes === 120 ? "2 hrs prior" : `${rec.reminder_advance_minutes}m prior`}</span>
                        </span>
                      )}
                      {rec.events?.meeting_synopsis && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/40">
                          📝 Meeting Synopsis
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => handleSendTest(rec.email)}
                    disabled={testingEmail === rec.email}
                    title="Send test notification email"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-200 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {testingEmail === rec.email ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                    ) : (
                      <Send className="w-3 h-3 text-slate-400" />
                    )}
                    <span>Test</span>
                  </button>

                  <button
                    onClick={() => handleToggleActive(rec.id)}
                    title={rec.active ? "Pause notifications" : "Resume notifications"}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                      rec.active
                        ? "border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                        : "border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                    }`}
                  >
                    {rec.active ? "Pause" : "Resume"}
                  </button>

                  <button
                    onClick={() => handleOpenEdit(rec)}
                    title="Edit receiver settings"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDelete(rec.id, rec.email)}
                    title="Delete receiver"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Receiver Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Mail className="w-4 h-4 text-indigo-600" />
                  <span>{editingId ? "Edit Notification Receiver" : "Add Notification Receiver"}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Configure email address and subscribed CRM alerts
                </p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                  Recipient Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="director@company.com"
                  value={formEmail}
                  onChange={e => { setFormEmail(e.target.value); setFormError(""); }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                  Recipient Name / Role
                </label>
                <input
                  type="text"
                  placeholder="e.g. Varshith - Managing Director"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                  Meeting Reminder Advance Timing
                </label>
                <select
                  value={formReminderAdvance}
                  onChange={e => setFormReminderAdvance(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value={15}>15 Minutes Before Meeting Starts</option>
                  <option value={30}>30 Minutes Before Meeting Starts</option>
                  <option value={60}>1 Hour Before Meeting Starts (Default)</option>
                  <option value={120}>2 Hours Before Meeting Starts</option>
                </select>
              </div>

              {/* Event Subscriptions */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider block mb-2">
                  Send Email For Events:
                </label>
                <div className="space-y-2 bg-slate-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-zinc-700">
                  <label className="flex items-center gap-2.5 text-xs text-slate-800 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formEvents.lead_added}
                      onChange={e => setFormEvents(f => ({ ...f, lead_added: e.target.checked }))}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 rounded border-slate-300 dark:border-zinc-600"
                    />
                    <span><strong>Lead Added:</strong> When a new lead is captured or added</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-slate-800 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formEvents.client_added_or_converted}
                      onChange={e => setFormEvents(f => ({ ...f, client_added_or_converted: e.target.checked }))}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 rounded border-slate-300 dark:border-zinc-600"
                    />
                    <span><strong>Client Added or Converted:</strong> When a client profile is created</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-slate-800 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formEvents.followup_created}
                      onChange={e => setFormEvents(f => ({ ...f, followup_created: e.target.checked }))}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 rounded border-slate-300 dark:border-zinc-600"
                    />
                    <span><strong>Follow-up Scheduled:</strong> When a meeting or follow-up call is created</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-slate-800 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formEvents.followup_reminder}
                      onChange={e => setFormEvents(f => ({ ...f, followup_reminder: e.target.checked }))}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 rounded border-slate-300 dark:border-zinc-600"
                    />
                    <span><strong>Meeting Reminder:</strong> Sent prior to meeting start time</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-slate-800 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formEvents.meeting_synopsis}
                      onChange={e => setFormEvents(f => ({ ...f, meeting_synopsis: e.target.checked }))}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 rounded border-slate-300 dark:border-zinc-600"
                    />
                    <span><strong>Meeting Synopsis:</strong> When outcome and synopsis notes are recorded</span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingId ? "Save Changes" : "Add Receiver"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
