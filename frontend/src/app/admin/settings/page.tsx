"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  Lock,
  LogOut,
  Camera,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Shield,
  Bell,
  Palette,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useRole } from "@/context/RoleContext";

type Tab = "profile" | "security" | "notifications" | "appearance";

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "appearance", label: "Appearance", icon: Palette },
];

function SaveButton({
  saving,
  saved,
  onClick,
}: {
  saving: boolean;
  saved: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={saving}
      whileHover={{ scale: saving ? 1 : 1.02 }}
      whileTap={{ scale: 0.97 }}
      className="px-6 py-2.5 rounded-xl font-bold text-[13px] text-white flex items-center gap-2 transition-all disabled:opacity-60"
      style={{
        background: saved
          ? "#10b981"
          : "linear-gradient(135deg, #2563eb, #6366f1)",
        boxShadow: "0 4px 16px rgba(37,99,235,0.25)",
      }}
    >
      {saving ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
      ) : saved ? (
        <><Check className="w-4 h-4" /> Saved!</>
      ) : (
        "Save Changes"
      )}
    </motion.button>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
}: {
  icon: typeof User;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label
        className="block text-[11px] font-bold uppercase tracking-widest mb-1.5"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </label>
      <div
        className="flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all duration-200"
        style={{
          borderColor: focused ? "#2563eb" : "var(--border)",
          background: disabled ? "var(--surface)" : "var(--background)",
          boxShadow: focused ? "0 0 0 3px rgba(37,99,235,0.1)" : undefined,
        }}
      >
        <Icon className="w-4 h-4 shrink-0" style={{ color: focused ? "#2563eb" : "var(--text-secondary)" }} />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent text-[13.5px] outline-none disabled:cursor-not-allowed"
          style={{ color: "var(--text-primary)" }}
        />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout } = useRole();

  // Profile
  const [name, setName] = useState(user?.name || "Brajesh");
  const [email] = useState(user?.email || "brajesh@serphawk.com");
  const [phone, setPhone] = useState("+91 85199 90425");
  const [location, setLocation] = useState("New Delhi, India");
  const [company, setCompany] = useState("SERP Hawk");
  const [bio, setBio] = useState("Admin & Growth Strategist at SERP Hawk. Passionate about SEO & SaaS.");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);

  // Notifications
  const [notifs, setNotifs] = useState({
    emailAlerts: true,
    taskReminders: true,
    clientUpdates: false,
    weeklyReport: true,
  });

  const [tab, setTab] = useState<Tab>("profile");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Avatar upload
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setAvatar(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const initial = name.charAt(0).toUpperCase();

  const saveProfile = async () => {
    setProfileSaving(true);
    await new Promise((r) => setTimeout(r, 1400));
    setProfileSaving(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  };

  const savePassword = async () => {
    setPwError("");
    if (!currentPw) { setPwError("Please enter your current password"); return; }
    if (newPw.length < 8) { setPwError("New password must be at least 8 characters"); return; }
    if (newPw !== confirmPw) { setPwError("Passwords do not match"); return; }
    setPwSaving(true);
    await new Promise((r) => setTimeout(r, 1400));
    setPwSaving(false);
    setPwSaved(true);
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
    setTimeout(() => setPwSaved(false), 3000);
  };

  const pwStrength = useCallback(() => {
    if (!newPw) return null;
    if (newPw.length < 6) return { level: 1, label: "Weak", color: "#ef4444" };
    if (newPw.length < 10 || !/[A-Z]/.test(newPw) || !/[0-9]/.test(newPw))
      return { level: 2, label: "Fair", color: "#f59e0b" };
    return { level: 3, label: "Strong", color: "#10b981" };
  }, [newPw]);

  const strength = pwStrength();

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Manage your profile, security, and preferences
        </p>
      </motion.div>

      <div className="flex gap-6 flex-col md:flex-row">
        {/* Left tab nav */}
        <motion.nav
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex md:flex-col gap-1 md:w-44 shrink-0"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all w-full text-left"
              style={
                tab === id
                  ? { background: "rgba(37,99,235,0.08)", color: "#2563eb" }
                  : { color: "var(--sidebar-text)" }
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              {tab === id && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
            </button>
          ))}

          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold w-full text-left transition-all text-red-500 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Sign Out
            </button>
          </div>
        </motion.nav>

        {/* Right panel */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex-1 min-w-0"
        >
          {/* ── PROFILE TAB ── */}
          {tab === "profile" && (
            <div
              className="rounded-2xl p-6 space-y-6"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <h2 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
                Personal Information
              </h2>

              {/* Avatar */}
              <div className="flex items-center gap-5">
                <div className="relative">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt="Avatar"
                      className="w-20 h-20 rounded-2xl object-cover ring-2 ring-blue-200"
                    />
                  ) : (
                    <div
                      className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-extrabold text-white shadow-lg"
                      style={{ background: "linear-gradient(135deg, #2563eb, #6366f1)" }}
                    >
                      {initial}
                    </div>
                  )}
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl flex items-center justify-center shadow-md transition-transform hover:scale-110"
                    style={{ background: "#2563eb" }}
                    title="Change photo"
                  >
                    <Camera className="w-3.5 h-3.5 text-white" />
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
                <div>
                  <p className="font-bold text-[15px]" style={{ color: "var(--text-primary)" }}>{name}</p>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Admin · {company}</p>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="mt-1.5 text-[12px] font-semibold text-blue-600 hover:underline"
                  >
                    Change photo
                  </button>
                </div>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field icon={User} label="Full Name" value={name} onChange={setName} placeholder="Your full name" />
                <Field icon={Mail} label="Email Address" value={email} onChange={() => {}} disabled placeholder="email@example.com" />
                <Field icon={Phone} label="Phone" value={phone} onChange={setPhone} type="tel" placeholder="+1 234 567 8900" />
                <Field icon={MapPin} label="Location" value={location} onChange={setLocation} placeholder="City, Country" />
                <Field icon={Building2} label="Company" value={company} onChange={setCompany} placeholder="Company name" />
              </div>

              {/* Bio */}
              <div>
                <label
                  className="block text-[11px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  placeholder="Tell us about yourself..."
                  className="w-full px-3.5 py-3 rounded-xl border text-[13.5px] outline-none resize-none transition-all"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--background)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div className="flex justify-end pt-2">
                <SaveButton saving={profileSaving} saved={profileSaved} onClick={saveProfile} />
              </div>
            </div>
          )}

          {/* ── SECURITY TAB ── */}
          {tab === "security" && (
            <div className="space-y-4">
              {/* Change Password */}
              <div
                className="rounded-2xl p-6 space-y-5"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <h2 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
                  Change Password
                </h2>

                {/* Current password */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    Current Password
                  </label>
                  <div
                    className="flex items-center gap-3 px-3.5 py-3 rounded-xl border"
                    style={{ borderColor: "var(--border)", background: "var(--background)" }}
                  >
                    <Lock className="w-4 h-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
                    <input
                      type={showCurrent ? "text" : "password"}
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      placeholder="Enter current password"
                      className="flex-1 bg-transparent text-[13.5px] outline-none"
                      style={{ color: "var(--text-primary)" }}
                    />
                    <button type="button" onClick={() => setShowCurrent(!showCurrent)} style={{ color: "var(--text-secondary)" }}>
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* New password */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    New Password
                  </label>
                  <div
                    className="flex items-center gap-3 px-3.5 py-3 rounded-xl border"
                    style={{ borderColor: "var(--border)", background: "var(--background)" }}
                  >
                    <Lock className="w-4 h-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
                    <input
                      type={showNew ? "text" : "password"}
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      placeholder="Enter new password"
                      className="flex-1 bg-transparent text-[13.5px] outline-none"
                      style={{ color: "var(--text-primary)" }}
                    />
                    <button type="button" onClick={() => setShowNew(!showNew)} style={{ color: "var(--text-secondary)" }}>
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Strength bar */}
                  {strength && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-1 flex-1">
                        {[1, 2, 3].map((lvl) => (
                          <div
                            key={lvl}
                            className="h-1 flex-1 rounded-full transition-all"
                            style={{ background: lvl <= strength.level ? strength.color : "var(--border)" }}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] font-bold" style={{ color: strength.color }}>
                        {strength.label}
                      </span>
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    Confirm Password
                  </label>
                  <div
                    className="flex items-center gap-3 px-3.5 py-3 rounded-xl border"
                    style={{
                      borderColor: confirmPw && confirmPw !== newPw ? "#ef4444" : "var(--border)",
                      background: "var(--background)",
                    }}
                  >
                    <Lock className="w-4 h-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
                    <input
                      type="password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      placeholder="Confirm new password"
                      className="flex-1 bg-transparent text-[13.5px] outline-none"
                      style={{ color: "var(--text-primary)" }}
                    />
                    {confirmPw && confirmPw === newPw && (
                      <Check className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {pwError && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {pwError}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex justify-end pt-1">
                  <SaveButton saving={pwSaving} saved={pwSaved} onClick={savePassword} />
                </div>
              </div>

              {/* Sign out section */}
              <div
                className="rounded-2xl p-5 flex items-center justify-between gap-4"
                style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)" }}
              >
                <div>
                  <p className="font-bold text-[14px] text-red-600">Sign Out</p>
                  <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    You will be redirected to the login page
                  </p>
                </div>
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-[13px] text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {/* ── NOTIFICATIONS TAB ── */}
          {tab === "notifications" && (
            <div
              className="rounded-2xl p-6 space-y-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <h2 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
                Notification Preferences
              </h2>
              {(
                [
                  { key: "emailAlerts", label: "Email Alerts", desc: "Get notified via email for critical events" },
                  { key: "taskReminders", label: "Task Reminders", desc: "Daily digest of upcoming and overdue tasks" },
                  { key: "clientUpdates", label: "Client Updates", desc: "Notify when client status changes" },
                  { key: "weeklyReport", label: "Weekly Report", desc: "Get a weekly performance summary every Monday" },
                ] as const
              ).map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between gap-4 py-2">
                  <div>
                    <p className="font-semibold text-[13.5px]" style={{ color: "var(--text-primary)" }}>{label}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{desc}</p>
                  </div>
                  <button
                    onClick={() => setNotifs((n) => ({ ...n, [key]: !n[key] }))}
                    className={`relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 ${
                      notifs[key] ? "bg-blue-600" : "bg-gray-200"
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-300 ${
                        notifs[key] ? "left-[22px]" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── APPEARANCE TAB ── */}
          {tab === "appearance" && (
            <div
              className="rounded-2xl p-6 space-y-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <h2 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
                Appearance
              </h2>
              <div>
                <p className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Theme</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "light", label: "Light", preview: "#ffffff", border: "#e5e7eb" },
                    { value: "dark", label: "Dark", preview: "#111827", border: "#374151" },
                    { value: "system", label: "System", preview: "linear-gradient(135deg, #ffffff 50%, #111827 50%)", border: "#6366f1" },
                  ].map((t) => (
                    <button
                      key={t.value}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:border-blue-400"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    >
                      <div
                        className="w-12 h-8 rounded-lg border"
                        style={{ background: t.preview, borderColor: t.border }}
                      />
                      <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                        {t.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Accent Color</p>
                <div className="flex gap-3">
                  {[
                    "#2563eb", "#7c3aed", "#0891b2", "#10b981", "#f59e0b", "#ef4444",
                  ].map((color) => (
                    <button
                      key={color}
                      className="w-8 h-8 rounded-full border-2 border-white shadow-md hover:scale-110 transition-transform"
                      style={{ background: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Logout confirmation modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
            onClick={(e) => e.target === e.currentTarget && setShowLogoutConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="text-[17px] font-bold mb-2" style={{ color: "var(--text-primary)" }}>
                Sign out?
              </h3>
              <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
                You will be taken back to the login screen. All unsaved changes will be lost.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-[13px] border transition-colors hover:bg-gray-50"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={logout}
                  className="flex-1 py-2.5 rounded-xl font-bold text-[13px] text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
