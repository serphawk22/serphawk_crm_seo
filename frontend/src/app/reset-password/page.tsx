"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, KeyRound, Lock, CheckCircle2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import "@/i18n/config";
import { API_BASE_URL } from "@/config";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";

function ResetPasswordCard() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const email = params.get("email") || "";
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [show, setShow] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(t("resetPasswordPage.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("resetPasswordPage.passwordMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, new_password: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || t("resetPasswordPage.invalidToken"));
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError(t("resetPasswordPage.invalidToken"));
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center font-sans p-6 bg-slate-50">
      <div className="w-full max-w-[420px]">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 mb-8">
          <ArrowLeft className="w-4 h-4" />
          {t("auth.backToLogin")}
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-xl p-8">
          {done ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                {t("resetPasswordPage.resetSuccess")}
              </h1>
              <Link
                href="/login"
                className="inline-block mt-4 py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors"
              >
                {t("auth.login")}
              </Link>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-6">
                <KeyRound className="w-7 h-7 text-blue-600" />
              </div>
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight mb-2">
                {t("resetPasswordPage.title")}
              </h1>
              <p className="text-gray-500 text-[15px] font-medium mb-6">
                {t("resetPasswordPage.subtitle")}
              </p>

              {!token ? (
                <p className="text-sm font-medium text-red-600">
                  {t("resetPasswordPage.invalidToken")}
                </p>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                      {t("auth.emailAddress")}
                    </label>
                    <div className="relative flex items-center rounded-xl border border-slate-200 focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] transition-all duration-200">
                      <Lock className="absolute left-4 w-4 h-4 text-gray-400" />
                      <input
                        type="email"
                        required
                        readOnly
                        value={email}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 text-gray-900 text-[15px] outline-none rounded-xl"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                      {t("auth.password")}
                    </label>
                    <div className="relative flex items-center rounded-xl border border-slate-200 focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] transition-all duration-200">
                      <Lock className="absolute left-4 w-4 h-4 text-gray-400" />
                      <input
                        type={show ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-11 pr-12 py-3.5 bg-transparent text-gray-900 text-[15px] outline-none rounded-xl"
                        placeholder={t("loginPage.passwordPlaceholder")}
                      />
                    </div>
                    <PasswordStrengthMeter password={password} compact />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                      {t("auth.confirmPassword")}
                    </label>
                    <div className="relative flex items-center rounded-xl border border-slate-200 focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] transition-all duration-200">
                      <Lock className="absolute left-4 w-4 h-4 text-gray-400" />
                      <input
                        type={show ? "text" : "password"}
                        required
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="w-full pl-11 pr-12 py-3.5 bg-transparent text-gray-900 text-[15px] outline-none rounded-xl"
                        placeholder={t("auth.confirmPassword")}
                      />
                      <button
                        type="button"
                        onClick={() => setShow(!show)}
                        className="absolute right-4 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-medium">
                      <span className="text-base">⚠️</span>
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-4 rounded-xl font-bold text-white text-[15px] flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg transition-all"
                    style={{
                      background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
                      boxShadow: "0 4px 20px rgba(37,99,235,0.35)",
                    }}
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{t("auth.resetPassword")}</span>
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordCard />
    </Suspense>
  );
}