"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

interface PasswordStrengthMeterProps {
  password: string;
  compact?: boolean;
}

export function getPasswordScore(password: string) {
  if (!password) return null;
  const rules = [
    { key: "pw_8", met: password.length >= 8 },
    { key: "pw_12", met: password.length >= 12 },
    { key: "pw_upper", met: /[A-Z]/.test(password) },
    { key: "pw_lower", met: /[a-z]/.test(password) },
    { key: "pw_number", met: /\d/.test(password) },
    { key: "pw_special", met: /[^A-Za-z0-9]/.test(password) },
  ];
  const metCount = rules.filter((r) => r.met).length;
  const score = Math.round((metCount / rules.length) * 100);
  if (score <= 25) return { labelKey: "pw_very_weak", color: "#ef4444", bar: "16%", score, rules };
  if (score <= 45) return { labelKey: "pw_weak", color: "#f97316", bar: "38%", score, rules };
  if (score <= 65) return { labelKey: "pw_fair", color: "#f59e0b", bar: "58%", score, rules };
  if (score <= 85) return { labelKey: "pw_good", color: "#3b82f6", bar: "78%", score, rules };
  return { labelKey: "pw_strong", color: "#10b981", bar: "100%", score, rules };
}

export default function PasswordStrengthMeter({ password, compact = false }: PasswordStrengthMeterProps) {
  const { t } = useLanguage();
  const strength = getPasswordScore(password);

  if (!strength || !password) return null;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/50 p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: strength.bar, background: strength.color }}
          />
        </div>
        <span
          className="text-[11px] font-bold whitespace-nowrap rounded-md px-1.5 py-0.5"
          style={{ color: strength.color, background: `${strength.color}18` }}
        >
          {t(`auth.${strength.labelKey}`)} · {strength.score}/100
        </span>
      </div>
      <div className={`grid gap-x-3 gap-y-1.5 mt-2 ${compact ? "grid-cols-1" : "grid-cols-2"}`}>
        {strength.rules.map((rule) => (
          <div key={rule.key} className="flex items-center gap-1.5">
            {rule.met ? (
              <CheckCircle2
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "#10b981" }}
              />
            ) : (
              <Circle className="w-3.5 h-3.5 shrink-0 text-slate-300 dark:text-zinc-600" />
            )}
            <span
              className={`text-[11px] font-medium ${
                rule.met ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-zinc-400"
              }`}
            >
              {t(`auth.${rule.key}`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}