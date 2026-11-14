"use client";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/config";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { useRole } from "@/context/RoleContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  Globe,
  ExternalLink,
  MessageSquare,
  Clock,
  ChevronDown,
  ChevronUp,
  Check,
  Copy,
  TrendingUp,
  ArrowRight,
} from "lucide-react";

type AttributionCurrent = {
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  landing_path?: string;
};

type EnquiryItem = {
  id: number;
  created_at: string;
  attribution: {
    current: AttributionCurrent;
    first?: AttributionCurrent;
  };
  fields: Record<string, string | boolean>;
};

type LeadCaptureData = {
  summary?: Record<string, number>;
  original_source?: string;
  enquiries?: EnquiryItem[];
};

function formatFieldKey(key: string, es: boolean): string {
  const commonEn: Record<string, string> = {
    name: "Full Name",
    email: "Email Address",
    phone: "Phone Number",
    company_name: "Company / Organization",
    website: "Website URL",
    interest: "Service / Course Interest",
    message: "Message",
  };
  const commonEs: Record<string, string> = {
    name: "Nombre Completo",
    email: "Correo Electrónico",
    phone: "Teléfono",
    company_name: "Empresa / Organización",
    website: "Sitio Web",
    interest: "Servicio o Curso de Interés",
    message: "Mensaje",
  };

  const dict = es ? commonEs : commonEn;
  if (dict[key]) return dict[key];

  return key
    .replace(/^custom_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, l => l.toUpperCase());
}

function formatDate(dateStr: string, es: boolean): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(es ? "es-ES" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export default function WebsiteLeadSummary({ leadId }: { leadId?: number }) {
  const { isOn } = useTenantConfig();
  const { role } = useRole();
  const { language } = useLanguage();
  const es = language === "es";

  const enabled =
    isOn("public_lead_pages") &&
    ["Admin", "SalesManager", "Sales", "Employee"].includes(role || "");

  const [data, setData] = useState<LeadCaptureData | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedJson, setExpandedJson] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetch(API_BASE_URL + (leadId ? `/lead-capture/lead/${leadId}` : "/lead-capture"), {
      cache: "no-store",
    })
      .then(async r => {
        if (r.ok && active) setData(await r.json());
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [enabled, leadId]);

  if (!enabled || !data) return null;

  // 1. LEAD CONTEXT: If viewing a specific lead, only render if there are real website inquiries!
  if (leadId) {
    if (!data.enquiries || data.enquiries.length === 0) {
      return null; // Not a website lead, or no inquiries exist. Do not show anything!
    }

    const copyToClipboard = (text: string, key: string) => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
      }
    };

    return (
      <section className="rounded-3xl border border-indigo-100 dark:border-indigo-950/60 bg-gradient-to-br from-white via-indigo-50/20 to-slate-50 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 p-5 sm:p-6 shadow-sm shadow-indigo-100/30 transition-all">
        {/* Header Bar */}
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            !collapsed ? "border-b border-indigo-100/60 dark:border-zinc-800 pb-4" : ""
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-sm shadow-indigo-500/20 shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                  {es ? "Captación desde Formulario Web" : "Inbound Website Enquiry"}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300">
                  {data.enquiries.length}{" "}
                  {data.enquiries.length === 1
                    ? es
                      ? "envío"
                      : "submission"
                    : es
                    ? "envíos"
                    : "submissions"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                {es ? "Origen de descubrimiento:" : "Discovery source:"}{" "}
                <span className="font-semibold text-slate-700 dark:text-zinc-300">
                  {data.original_source || "Website"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href="/website-leads"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-zinc-800 hover:bg-indigo-50 border border-indigo-200/60 dark:border-zinc-700 shadow-2xs transition-colors"
            >
              <span>{es ? "Ver todas las consultas" : "View All Enquiries"}</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              title={collapsed ? "Expand details" : "Collapse details"}
            >
              <span>{collapsed ? (es ? "Ver detalles" : "View details") : (es ? "Ocultar" : "Hide")}</span>
              {collapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Inquiry Submissions Content */}
        {!collapsed && (
          <div className="space-y-4 pt-4">
            {data.enquiries.map((row) => {
              const fields = row.fields || {};
              const attr = row.attribution?.current || {};
              const source = attr.source || "website";
              const messageText = String(fields.message || "").trim();

              // All other fields (excluding message and name)
              const otherFields = Object.keys(fields).filter(
                k => !["message", "name"].includes(k)
              );

              return (
                <div
                  key={row.id}
                  className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 p-4 sm:p-5 space-y-4 shadow-2xs"
                >
                  {/* Inquiry Metadata Tag Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-100 dark:border-indigo-900/50">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>
                          {source === "google"
                            ? "Google Ads / Search"
                            : source === "facebook"
                            ? "Facebook Ads"
                            : source === "instagram"
                            ? "Instagram"
                            : source === "website"
                            ? "Website Referral"
                            : source}
                        </span>
                      </span>

                      {attr.utm_campaign && (
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-medium">
                          <span className="text-slate-400 font-normal">Campaign:</span>{" "}
                          {attr.utm_campaign}
                        </span>
                      )}

                      {attr.utm_medium && (
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-medium">
                          <span className="text-slate-400 font-normal">Medium:</span>{" "}
                          {attr.utm_medium}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-zinc-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatDate(row.created_at, es)}</span>
                    </div>
                  </div>

                  {/* Message Quote Box */}
                  {messageText && (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-200/70 dark:border-zinc-800/80 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{es ? "Mensaje enviado" : "Submitted Message"}</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                        {messageText}
                      </p>
                    </div>
                  )}

                  {/* Dynamic Form Fields Grid (NO JSON!) */}
                  {otherFields.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                        {es ? "Detalles del Formulario" : "Form Details"}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {otherFields.map(key => {
                          const val = fields[key];
                          const label = formatFieldKey(key, es);

                          return (
                            <div
                              key={key}
                              className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-zinc-950/40 border border-slate-200/60 dark:border-zinc-800 space-y-0.5"
                            >
                              <div className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wide truncate">
                                {label}
                              </div>
                              <div className="text-xs font-medium text-slate-900 dark:text-zinc-100 break-words">
                                {typeof val === "boolean" ? (
                                  val ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                                      <Check className="w-3 h-3" /> {es ? "Sí" : "Yes"}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">{es ? "No" : "No"}</span>
                                  )
                                ) : String(val).startsWith("http") ? (
                                  <a
                                    href={String(val)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 truncate"
                                  >
                                    <span className="truncate">{String(val)}</span>
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                ) : String(val).trim() ? (
                                  String(val)
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Optional Discreet Developer JSON toggle */}
                  <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedJson(prev => ({ ...prev, [row.id]: !prev[row.id] }))
                      }
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
                    >
                      {expandedJson[row.id]
                        ? es
                          ? "Ocultar payload técnico"
                          : "Hide technical payload"
                        : es
                        ? "Ver payload técnico"
                        : "View technical payload"}
                    </button>

                    {expandedJson[row.id] && (
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(JSON.stringify(fields, null, 2), `json-${row.id}`)
                        }
                        className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        {copiedKey === `json-${row.id}` ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span>{es ? "Copiado" : "Copied"}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>{es ? "Copiar JSON" : "Copy JSON"}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {expandedJson[row.id] && (
                    <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 text-[11px] font-mono overflow-auto max-h-48 whitespace-pre-wrap">
                      {JSON.stringify(fields, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  // 2. DASHBOARD CONTEXT: When rendered on dashboards without leadId, only show if there is real enquiry activity!
  if (!data.summary || (data.summary.enquiries ?? 0) === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 my-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
              {es ? "Consultas del Sitio Web" : "Inbound Website Enquiries"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {es
                ? "Captación en tiempo real a través de formularios"
                : "Real-time inbound lead intake"}
            </p>
          </div>
        </div>

        <a
          href="/website-leads"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-2xs transition-colors"
        >
          <span>{es ? "Gestionar consultas" : "Manage Enquiries"}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800">
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200/60 dark:border-zinc-800">
          <p className="text-[10px] font-semibold uppercase text-slate-400">
            {es ? "Total" : "Total Enquiries"}
          </p>
          <strong className="text-base text-slate-900 dark:text-zinc-100">
            {data.summary.enquiries ?? 0}
          </strong>
        </div>

        <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40">
          <p className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
            {es ? "Nuevos Leads" : "New Leads"}
          </p>
          <strong className="text-base text-emerald-700 dark:text-emerald-300">
            {data.summary.new_leads ?? 0}
          </strong>
        </div>

        <div className="p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40">
          <p className="text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-400">
            {es ? "Recurrentes" : "Repeat Enquiries"}
          </p>
          <strong className="text-base text-blue-700 dark:text-blue-300">
            {data.summary.repeat_enquiries ?? 0}
          </strong>
        </div>

        <div className="p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40">
          <p className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">
            {es ? "Por Resolver" : "Pending / Conflict"}
          </p>
          <strong className="text-base text-amber-700 dark:text-amber-300">
            {data.summary.pending ?? 0}
          </strong>
        </div>
      </div>
    </section>
  );
}
