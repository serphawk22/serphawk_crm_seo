"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import {
  User,
  Mail,
  Phone,
  Building2,
  Globe,
  Sparkles,
  MessageSquare,
  Layers,
  CheckSquare,
  FileText,
  ChevronDown,
  Shield,
  ShieldCheck,
  Lock,
  Clock,
  CheckCircle2,
  AlertCircle,
  Info,
  Send,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { captureVisit, activeVisit, rememberVisit } from "@/lib/leadAttribution";

export type FormField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};

export type LeadForm = {
  heading: string;
  description: string;
  privacy_notice: string;
  submit_label: string;
  success_message: string;
  revision?: string;
  fields: FormField[];
  course_ids?: number[];
};

export type CompanyBrandInfo = {
  company?: boolean;
  brand_name?: string;
  brand_logo_url?: string;
  primary_color?: string;
  locale?: string;
};

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

function bot() {
  return (window as Window & { turnstile?: Turnstile }).turnstile;
}

const STORE = "company-attribution-v1";

function getFieldIcon(key: string, type: string) {
  if (key === "name" || key.includes("name")) return <User className="w-4 h-4" />;
  if (type === "email" || key === "email") return <Mail className="w-4 h-4" />;
  if (type === "tel" || key === "phone") return <Phone className="w-4 h-4" />;
  if (key === "company_name" || key.includes("company") || key.includes("organization"))
    return <Building2 className="w-4 h-4" />;
  if (type === "url" || key === "website" || key.includes("web") || key.includes("url"))
    return <Globe className="w-4 h-4" />;
  if (key === "interest" || key.includes("course") || key.includes("service"))
    return <Sparkles className="w-4 h-4" />;
  if (type === "textarea" || key === "message" || key.includes("comment"))
    return <MessageSquare className="w-4 h-4" />;
  if (type === "select") return <Layers className="w-4 h-4" />;
  if (type === "checkbox") return <CheckSquare className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

function getFieldPlaceholder(key: string, type: string, es: boolean): string {
  if (key === "name") return es ? "Ej. Juan Pérez" : "e.g. Jane Doe";
  if (type === "email" || key === "email") return es ? "nombre@empresa.com" : "name@company.com";
  if (type === "tel" || key === "phone") return es ? "+52 (55) 1234-5678" : "+1 (555) 012-3456";
  if (key === "company_name") return es ? "Nombre de tu empresa u organización" : "Your company or organization";
  if (type === "url" || key === "website") return "https://example.com";
  if (key === "interest") return es ? "¿Qué servicio o solución buscas?" : "Which service or solution are you interested in?";
  if (type === "textarea" || key === "message")
    return es ? "Cuéntanos sobre tus requerimientos o dudas..." : "Tell us about your project or enquiry...";
  return "";
}

export default function LeadCaptureForm({
  form,
  preview = false,
  locale = "en",
  brand,
  siteKey,
}: {
  form: LeadForm;
  preview?: boolean;
  locale?: string;
  brand?: CompanyBrandInfo;
  siteKey?: string;
}) {
  const es = locale === "es";
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState("");
  const [trap, setTrap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [ready, setReady] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const submission = useRef("");
  const payload = useRef<Record<string, unknown> | null>(null);
  const current = useRef<Record<string, string>>({});

  function editField(key: string, value: string | boolean) {
    if (payload.current) {
      payload.current = null;
      submission.current = crypto.randomUUID();
    }
    setValues(v => ({ ...v, [key]: value }));
  }

  useEffect(() => {
    if (preview) return;
    submission.current = crypto.randomUUID();
    current.current = captureVisit(location.search, location.pathname, document.referrer);
    try {
      const stored = JSON.parse(localStorage.getItem(STORE) || "null");
      if (activeVisit(stored)) setConsent(true);
      else localStorage.removeItem(STORE);
    } catch {
      /* Storage is optional. */
    }
    setStorageReady(true);
  }, [preview]);

  useEffect(() => {
    if (preview || !ready || !siteKey || !widget.current || !bot()) return;
    widgetId.current = bot()!.render(widget.current, {
      sitekey: siteKey,
      action: "lead_capture",
      callback: (value: string) => setToken(value),
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
    });
    return () => {
      if (widgetId.current) bot()?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [ready, preview, siteKey]);

  useEffect(() => {
    if (preview || !storageReady) return;
    try {
      if (!consent) {
        localStorage.removeItem(STORE);
        return;
      }
      const previous = JSON.parse(localStorage.getItem(STORE) || "null");
      localStorage.setItem(STORE, JSON.stringify(rememberVisit(previous, current.current)));
    } catch {
      /* Continue with current-visit attribution. */
    }
  }, [consent, preview, storageReady]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preview) {
      setError(es ? "Vista previa: no se envían datos." : "Preview only; no enquiry was sent.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!payload.current) {
        let saved = null;
        try {
          saved = consent ? activeVisit(JSON.parse(localStorage.getItem(STORE) || "null")) : null;
        } catch {
          /* optional */
        }
        payload.current = {
          submission_id: submission.current,
          revision: form.revision,
          fields: values,
          consent,
          website_trap: trap,
          attribution: {
            current: current.current,
            first: saved?.first || current.current,
            latest_campaign: saved?.latest_campaign,
          },
        };
      }
      const res = await fetch("/api/lead-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload.current, turnstile_token: token }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 422 || res.status === 409) payload.current = null;
        throw new Error(data.detail || "Unable to send");
      }
      setReceipt(data.receipt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send");
      setToken("");
      if (widgetId.current) bot()?.reset(widgetId.current);
    } finally {
      setBusy(false);
    }
  }

  // Check contact info presence (email or phone required by backend)
  const hasEmail = Boolean(String(values.email || "").trim());
  const hasPhone = Boolean(String(values.phone || "").trim());
  const hasContact = hasEmail || hasPhone;

  if (receipt) {
    return (
      <div
        role="status"
        className="rounded-3xl bg-white/95 backdrop-blur-xl p-8 sm:p-12 shadow-2xl border border-emerald-100 text-slate-900 text-center space-y-6 max-w-2xl mx-auto"
      >
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {form.success_message}
          </h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            {es
              ? "Hemos recibido tus datos de forma segura. Un especialista se comunicará contigo a la brevedad."
              : "We have safely received your details. A specialist will review your request and reach out shortly."}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 inline-flex flex-col sm:flex-row items-center gap-3 text-sm">
          <span className="text-slate-500 font-medium">
            {es ? "Referencia" : "Reference"}:
          </span>
          <code className="font-mono font-bold text-slate-900 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            {receipt}
          </code>
          <button
            type="button"
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(receipt);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? (es ? "¡Copiado!" : "Copied!") : es ? "Copiar" : "Copy"}</span>
          </button>
        </div>

        <div className="pt-4 border-t border-slate-100 max-w-md mx-auto flex flex-col items-center gap-3">
          <p className="text-xs text-slate-400">
            {es
              ? "Guarda este identificador de referencia para cualquier consulta relacionada."
              : "Keep this reference code for future enquiries regarding your request."}
          </p>
          <button
            type="button"
            onClick={() => {
              setReceipt("");
              setValues({});
              setToken("");
              setError("");
              payload.current = null;
              submission.current = crypto.randomUUID();
            }}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors underline"
          >
            {es ? "Enviar otra consulta" : "Submit another enquiry"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="relative rounded-3xl bg-white/95 backdrop-blur-xl p-6 sm:p-10 md:p-12 shadow-2xl shadow-slate-200/60 border border-slate-200/90 text-slate-900 space-y-7"
    >
      {preview && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
          <span>
            {es
              ? "Modo vista previa: Las interacciones no envían datos al servidor."
              : "Preview mode: Form interactions do not submit real data."}
          </span>
          <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-950 font-bold text-[10px]">
            PREVIEW
          </span>
        </div>
      )}

      {/* Form Header */}
      <div className="space-y-3 pb-2 border-b border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-2xs border"
            style={{
              borderColor: "rgba(37, 99, 235, 0.2)",
              backgroundColor: "rgba(37, 99, 235, 0.05)",
              color: "var(--company-color, #2563eb)",
            }}
          >
            <span>✦</span>
            <span>
              {brand?.brand_name
                ? es
                  ? `Contacto con ${brand.brand_name}`
                  : `Connect with ${brand.brand_name}`
                : es
                ? "Formulario Oficial"
                : "Official Enquiry"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
            <Lock className="w-3.5 h-3.5" />
            <span>{es ? "Cifrado 256-bit" : "256-bit Encrypted"}</span>
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">
          {form.heading}
        </h1>

        {form.description && (
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
            {form.description}
          </p>
        )}
      </div>

      {/* Dynamic Fields Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
        {form.fields.map(field => {
          const isFullWidth =
            field.type === "textarea" ||
            field.type === "checkbox" ||
            field.key === "message" ||
            field.key === "comments" ||
            field.key === "address" ||
            (field.label && field.label.length > 35);

          return (
            <div
              key={field.key}
              className={`flex flex-col justify-start ${
                isFullWidth ? "md:col-span-2" : "md:col-span-1"
              }`}
            >
              {field.type === "checkbox" ? (
                <label className="flex items-start gap-3.5 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-300 cursor-pointer transition-all">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--company-color,#2563eb)] focus:ring-[var(--company-color,#2563eb)]/30 cursor-pointer shrink-0"
                    required={field.required}
                    checked={values[field.key] === true}
                    onChange={e => editField(field.key, e.target.checked)}
                  />
                  <span className="text-sm font-medium text-slate-800 leading-snug">
                    {field.label}
                    {field.required && (
                      <span className="text-red-500 ml-1 font-bold">*</span>
                    )}
                  </span>
                </label>
              ) : (
                <>
                  <label
                    htmlFor={`field-${field.key}`}
                    className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between"
                  >
                    <span>
                      {field.label}
                      {field.required && (
                        <span className="text-red-500 ml-1 font-bold">*</span>
                      )}
                    </span>
                    {!field.required && (
                      <span className="text-[10px] lowercase font-normal text-slate-400">
                        ({es ? "opcional" : "optional"})
                      </span>
                    )}
                  </label>

                  {field.type === "textarea" ? (
                    <div className="relative rounded-xl border border-slate-200 bg-slate-50/60 focus-within:bg-white focus-within:border-[var(--company-color,#2563eb)] focus-within:ring-2 focus-within:ring-[var(--company-color,#2563eb)]/20 transition-all duration-200 shadow-2xs">
                      <div className="absolute top-3 left-3.5 pointer-events-none text-slate-400">
                        {getFieldIcon(field.key, field.type)}
                      </div>
                      <textarea
                        id={`field-${field.key}`}
                        className="w-full bg-transparent pl-10 pr-3.5 pt-2.5 pb-6 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none min-h-[110px] resize-y"
                        maxLength={field.key === "message" ? 5000 : 2000}
                        required={field.required}
                        placeholder={getFieldPlaceholder(field.key, field.type, es)}
                        value={String(values[field.key] || "")}
                        onChange={e => editField(field.key, e.target.value)}
                      />
                      <div className="absolute bottom-1.5 right-3 text-[10px] text-slate-400 pointer-events-none">
                        {String(values[field.key] || "").length} /{" "}
                        {field.key === "message" ? 5000 : 2000}
                      </div>
                    </div>
                  ) : field.type === "select" ? (
                    <div className="relative rounded-xl border border-slate-200 bg-slate-50/60 focus-within:bg-white focus-within:border-[var(--company-color,#2563eb)] focus-within:ring-2 focus-within:ring-[var(--company-color,#2563eb)]/20 transition-all duration-200 shadow-2xs">
                      <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-400">
                        {getFieldIcon(field.key, field.type)}
                      </div>
                      <select
                        id={`field-${field.key}`}
                        className="w-full bg-transparent pl-10 pr-10 py-2.5 text-sm text-slate-900 focus:outline-none appearance-none cursor-pointer"
                        required={field.required}
                        value={String(values[field.key] || "")}
                        onChange={e => editField(field.key, e.target.value)}
                      >
                        <option value="">
                          {es ? "— Seleccionar opción —" : "— Select an option —"}
                        </option>
                        {field.options?.map(o => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  ) : (
                    <div className="relative rounded-xl border border-slate-200 bg-slate-50/60 focus-within:bg-white focus-within:border-[var(--company-color,#2563eb)] focus-within:ring-2 focus-within:ring-[var(--company-color,#2563eb)]/20 transition-all duration-200 shadow-2xs">
                      <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-400">
                        {getFieldIcon(field.key, field.type)}
                      </div>
                      <input
                        id={`field-${field.key}`}
                        className="w-full bg-transparent pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                        type={field.type}
                        required={field.required}
                        maxLength={255}
                        placeholder={getFieldPlaceholder(field.key, field.type, es)}
                        value={String(values[field.key] || "")}
                        onChange={e => editField(field.key, e.target.value)}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Contact Requirement Banner */}
      <div
        className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
          hasContact
            ? "bg-emerald-50 text-emerald-800 border border-emerald-200/80"
            : "bg-slate-50 text-slate-600 border border-slate-200/80"
        }`}
      >
        {hasContact ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              {es
                ? "Método de contacto proporcionado (correo o teléfono)"
                : "Contact method provided (email or phone)"}
            </span>
          </>
        ) : (
          <>
            <Info className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              {es
                ? "Introduce tu correo o teléfono."
                : "Please provide an email address or phone number."}
            </span>
          </>
        )}
      </div>

      {/* Hidden honeypot trap field */}
      <label className="hidden" aria-hidden="true">
        Website
        <input
          tabIndex={-1}
          autoComplete="off"
          value={trap}
          onChange={e => setTrap(e.target.value)}
        />
      </label>

      {/* Privacy Notice if present */}
      {form.privacy_notice && (
        <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
            <span>{es ? "Aviso de Privacidad" : "Privacy Notice"}</span>
          </div>
          <p>{form.privacy_notice}</p>
        </div>
      )}

      {/* Attribution Retention Consent */}
      <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200/70 bg-white hover:bg-slate-50/80 cursor-pointer transition-colors text-xs text-slate-600 leading-normal">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--company-color,#2563eb)] focus:ring-[var(--company-color,#2563eb)]/30 cursor-pointer shrink-0"
          checked={consent}
          onChange={e => {
            if (payload.current) {
              payload.current = null;
              submission.current = crypto.randomUUID();
            }
            setConsent(e.target.checked);
          }}
        />
        <span>
          {es
            ? "Permitir recordar el origen de mi visita durante 30 días (opcional)."
            : "Allow this company to remember how I found it for 30 days (optional)."}
        </span>
      </label>

      {/* Bot Verification Widget */}
      {!preview && (
        <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Shield className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              {es
                ? "Verificación de seguridad anti-spam"
                : "Spam & bot security verification"}
            </span>
          </div>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            onLoad={() => setReady(true)}
          />
          <div ref={widget} className="flex justify-center" />
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{es ? "Error" : "Submission error"}</p>
            <p className="text-xs text-red-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Primary Submit CTA Button */}
      <button
        type="submit"
        disabled={busy || (!preview && !token)}
        className="group relative w-full overflow-hidden rounded-xl px-6 py-3.5 font-bold text-white shadow-md hover:shadow-lg active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 transition-all duration-200 flex items-center justify-center gap-2 text-base"
        style={{ background: "var(--company-color, #2563eb)" }}
      >
        {busy ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{es ? "Enviando…" : "Sending…"}</span>
          </>
        ) : (
          <>
            <span>{form.submit_label}</span>
            <Send className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </>
        )}
      </button>

      {/* Trust & Confidence strip */}
      <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{es ? "Transmisión segura SSL" : "SSL Encrypted"}</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{es ? "Respuesta en < 24 hrs" : "Reply in < 24 hours"}</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{es ? "Cero spam garantizado" : "Zero spam guarantee"}</span>
        </div>
      </div>
    </form>
  );
}
