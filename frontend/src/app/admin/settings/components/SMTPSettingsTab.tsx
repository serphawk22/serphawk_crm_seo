"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Shield, Check, Loader2, AlertCircle, Server, Key, User, Send } from "lucide-react";
import { API_BASE_URL } from "@/config";
import EmailOTPVerification from "@/components/EmailOTPVerification";

interface SMTPSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  from_name: string;
  from_email: string;
  /** Sent by the server: whether a password is already saved (the password itself is never sent back). */
  has_password?: boolean;
  /** False when the saved password is stored without encryption. */
  encrypted?: boolean;
}

export default function SMTPSettingsTab() {
  const [settings, setSettings] = useState<SMTPSettings>({
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    smtp_user: "",
    smtp_pass: "",
    from_name: "",
    from_email: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem("crm_token");
      const res = await fetch(`${API_BASE_URL}/settings/email`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.detail === "string" ? data.detail : "Could not load mailbox settings.");
        return;
      }
      if (data.smtp_host) {
        setSettings({ ...data, smtp_pass: "" });
        // If settings already exist, consider email as pre-verified
        setOtpVerified(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerified = () => {
    setOtpVerified(true);
    setShowOtpModal(false);
  };

  const handleSave = async () => {
    if (!otpVerified) {
      setShowOtpModal(true);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const token = localStorage.getItem("crm_token");
      const res = await fetch(`${API_BASE_URL}/settings/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Failed to save settings");
        return;
      }
      setSettings({ ...settings, smtp_pass: "", has_password: true, encrypted: data.encrypted });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/settings/email/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtp_host: settings.smtp_host,
          smtp_port: settings.smtp_port,
          smtp_user: settings.smtp_user,
          smtp_pass: settings.smtp_pass || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setTestResult(res.ok ? data : { ok: false, message: typeof data.detail === "string" ? data.detail : "The test could not be run." });
    } catch {
      setTestResult({ ok: false, message: "Network error. Please try again." });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* OTP Verification Modal */}
      <AnimatePresence>
        {showOtpModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setShowOtpModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-700 p-6 w-full max-w-md"
            >
              <EmailOTPVerification
                email={settings.from_email}
                purpose="smtp_settings"
                onVerified={handleOtpVerified}
                onCancel={() => setShowOtpModal(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SMTP Configuration Card */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg dark:bg-indigo-900/30 dark:text-indigo-400">
            <Server size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">SMTP Configuration</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400">Configure your email server settings for outgoing emails.</p>
          </div>
        </div>

        {/* Verification Status */}
        {!otpVerified && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-bold text-sm text-blue-800 dark:text-blue-300">
                  Email verification required
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Enter your "From Email" address below, then click "Send OTP" to verify before saving.
                </p>
              </div>
            </div>
          </div>
        )}

        {otpVerified && (
          <div className="mb-6 flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg w-fit">
            <Check className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Email verified
            </span>
          </div>
        )}

        <div className="space-y-4">
          {/* SMTP Host */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 text-slate-500 dark:text-zinc-400">
              SMTP Host
            </label>
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <Server className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={settings.smtp_host}
                onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
                placeholder="smtp.gmail.com"
                className="flex-1 bg-transparent text-[13.5px] outline-none text-slate-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* SMTP Port */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 text-slate-500 dark:text-zinc-400">
              SMTP Port
            </label>
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <span className="text-slate-400 font-mono text-sm">#</span>
              <input
                type="number"
                value={settings.smtp_port}
                onChange={(e) => setSettings({ ...settings, smtp_port: parseInt(e.target.value) || 587 })}
                placeholder="587"
                className="flex-1 bg-transparent text-[13.5px] outline-none text-slate-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* SMTP User */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 text-slate-500 dark:text-zinc-400">
              SMTP Username
            </label>
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <User className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={settings.smtp_user}
                onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
                placeholder="your-email@gmail.com"
                className="flex-1 bg-transparent text-[13.5px] outline-none text-slate-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* SMTP Password */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 text-slate-500 dark:text-zinc-400">
              SMTP Password / App Password
            </label>
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <Key className="w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={settings.smtp_pass}
                onChange={(e) => setSettings({ ...settings, smtp_pass: e.target.value })}
                placeholder={settings.has_password ? "Saved. Leave blank to keep it" : "Enter app password"}
                className="flex-1 bg-transparent text-[13.5px] outline-none text-slate-800 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* From Name */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 text-slate-500 dark:text-zinc-400">
              From Name
            </label>
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <Mail className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={settings.from_name}
                onChange={(e) => setSettings({ ...settings, from_name: e.target.value })}
                placeholder="Your Company Name"
                className="flex-1 bg-transparent text-[13.5px] outline-none text-slate-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* From Email */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 text-slate-500 dark:text-zinc-400">
              From Email <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <Mail className="w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={settings.from_email}
                onChange={(e) => {
                  setSettings({ ...settings, from_email: e.target.value });
                  setOtpVerified(false);
                }}
                placeholder="noreply@yourcompany.com"
                className="flex-1 bg-transparent text-[13.5px] outline-none text-slate-800 dark:text-zinc-100"
              />
            </div>
          </div>
        </div>

        {settings.has_password && settings.encrypted === false && (
          <p className="mt-4 text-xs text-amber-600">
            The saved password is stored without encryption. Enter it again and save to store it encrypted.
          </p>
        )}
        {testResult && (
          <div className={`mt-4 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border ${testResult.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-600"}`}>
            {testResult.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {testResult.message}
          </div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-zinc-800">
          {!otpVerified && settings.from_email && (
            <button
              onClick={() => setShowOtpModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
            >
              <Shield size={16} />
              Send OTP to Verify
            </button>
          )}
          <button
            onClick={testConnection}
            disabled={testing || !settings.smtp_host || !settings.smtp_user || (!settings.smtp_pass && !settings.has_password)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border border-slate-300 dark:border-zinc-600 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server size={16} />}
            Test connection
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (!otpVerified && !!settings.from_email)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-50 shadow-sm ml-auto"
            style={{
              background: saved ? "#10b981" : "linear-gradient(135deg, #2563eb, #6366f1)",
            }}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : saved ? (
              <><Check className="w-4 h-4" /> Saved!</>
            ) : (
              <><Send className="w-4 h-4" /> Save SMTP Settings</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
