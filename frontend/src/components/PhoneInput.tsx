"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { COUNTRY_DIAL_CODES, dialCodeFromLocale, joinPhone, parsePhoneNumber } from "@/lib/phone";
import { useTenantConfig } from "@/context/TenantConfigContext";

interface PhoneInputProps {
  /** The stored value: "<dial code> <national number>", or "" */
  value: string;
  onChange: (full: string) => void;
  /** Country code used when the value has none. Defaults to the client's setting, then the browser's region, then +1. */
  defaultDialCode?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

/**
 * A phone field with a searchable country selector. The user can change the country or the number at any time;
 * the value handed back is always "<dial code> <national number>" (empty when no number is typed).
 */
export default function PhoneInput({ value, onChange, defaultDialCode, id, name, placeholder, disabled, required }: PhoneInputProps) {
  const { settings } = useTenantConfig();
  const fallbackDial = defaultDialCode || settings.default_dial_code || dialCodeFromLocale() || "+1";

  const parsedFirst = useMemo(() => parsePhoneNumber(value, fallbackDial), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [dial, setDial] = useState(parsedFirst.dialCode);
  const [national, setNational] = useState(parsedFirst.nationalNumber);
  const [countryCode, setCountryCode] = useState<string>(() => pickCountry(parsedFirst.dialCode)?.code || "");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const box = useRef<HTMLDivElement>(null);

  // The value can arrive after the first render (loaded from the server): follow it when it is not what we last produced.
  useEffect(() => {
    if (value !== joinPhone(dial, national)) {
      const p = parsePhoneNumber(value, fallbackDial);
      setDial(p.dialCode);
      setNational(p.nationalNumber);
      setCountryCode(pickCountry(p.dialCode)?.code || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const selected = COUNTRY_DIAL_CODES.find((c) => c.code === countryCode && c.dialCode === dial) || pickCountry(dial) || COUNTRY_DIAL_CODES[0];
  const q = search.trim().toLowerCase();
  const filtered = COUNTRY_DIAL_CODES.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || (c.nativeName || "").toLowerCase().includes(q) || c.dialCode.includes(q) || c.code.toLowerCase().includes(q)
  );

  return (
    <div className="relative" ref={box}>
      <div
        className={`flex items-center rounded-xl border focus-within:ring-2 focus-within:ring-blue-500 ${disabled ? "opacity-60" : ""}`}
        style={{ borderColor: "var(--border)", background: "var(--background)" }}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => { setOpen((o) => !o); setSearch(""); }}
          className="flex shrink-0 items-center gap-1.5 rounded-l-xl border-r px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800/60"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          title={`${selected.name} (${selected.dialCode}) - click to change the country`}
          aria-label="Change country code"
        >
          <span className="text-base leading-none">{selected.flag}</span>
          <span className="text-xs font-semibold">{selected.dialCode}</span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required={required}
          disabled={disabled}
          value={national}
          onChange={(e) => {
            setNational(e.target.value);
            onChange(joinPhone(dial, e.target.value));
          }}
          placeholder={placeholder || placeholderFor(selected.code)}
          className="w-full rounded-r-xl bg-transparent px-3 py-2 text-sm outline-none"
          style={{ color: "var(--text-primary)" }}
        />
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-72 max-w-[90vw] overflow-hidden rounded-2xl border bg-white p-2 shadow-2xl dark:bg-zinc-900" style={{ borderColor: "var(--border)" }}>
          <div className="mb-2 flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country or code..."
              className="w-full bg-transparent text-xs outline-none"
              style={{ color: "var(--text-primary)" }}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600" aria-label="Clear search">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {filtered.length === 0 && <p className="p-3 text-center text-xs text-slate-400">No country found</p>}
            {filtered.map((c) => {
              const active = c.code === selected.code && c.dialCode === selected.dialCode;
              return (
                <button
                  key={`${c.code}-${c.dialCode}`}
                  type="button"
                  onClick={() => {
                    setDial(c.dialCode);
                    setCountryCode(c.code);
                    setOpen(false);
                    setSearch("");
                    onChange(joinPhone(c.dialCode, national));   // changing the country keeps the typed number
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                    active ? "bg-blue-600 font-semibold text-white" : "text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="text-sm leading-none">{c.flag}</span>
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className={`ml-2 shrink-0 font-mono text-[11px] ${active ? "text-blue-100" : "text-slate-400"}`}>{c.dialCode}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** When several countries share a dial code (+1), prefer the one matching the browser's region. */
function pickCountry(dialCode: string) {
  const same = COUNTRY_DIAL_CODES.filter((c) => c.dialCode === dialCode);
  if (same.length <= 1) return same[0];
  let region = "";
  try {
    region = ((typeof navigator !== "undefined" && (navigator.languages?.[0] || navigator.language)) || "").split("-")[1]?.toUpperCase() || "";
  } catch {}
  return same.find((c) => c.code === region) || same[0];
}

function placeholderFor(code: string): string {
  switch (code) {
    case "IN": return "98765 43210";
    case "ES": return "612 34 56 78";
    case "MX": return "33 1234 5678";
    case "GB": return "7400 123456";
    default: return "555 123 4567";
  }
}
