"use client";
import { useEffect, useState, useMemo } from "react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";
import { useCompanyBrand } from "@/components/CompanyBoundary";
import LeadCaptureForm, { LeadForm, FormField } from "@/components/LeadCaptureForm";
import {
  Globe,
  Mail,
  Phone,
  Building2,
  UserPlus,
  UserCheck,
  Repeat,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  MessageSquare,
  FileText,
  Filter,
  Download,
  Settings,
  Eye,
  Plus,
  Trash2,
  ShieldCheck,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  ArrowRight,
  Info,
} from "lucide-react";

type AttributionDetails = {
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  landing_path?: string;
};

type Enquiry = {
  id: number;
  lead_id?: number;
  created_at: string;
  state: string;
  receiving_company_name?: string;
  hostname?: string;
  receipt?: string;
  fields: Record<string, string | boolean>;
  attribution: {
    current: AttributionDetails;
    first: AttributionDetails;
    latest_campaign?: AttributionDetails;
  };
  consent?: {
    accepted: boolean;
    version: string;
    recorded_at: string;
  };
  new_lead: boolean;
};

async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(API_BASE_URL + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : "Please check your entries"
    );
  }
  return data;
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

export default function WebsiteLeads() {
  const { user } = useRole();
  const brand = useCompanyBrand();
  const es = brand.locale === "es";
  const isAdmin = user?.role === "Admin";

  const [activeTab, setActiveTab] = useState<"enquiries" | "builder" | "campaigns">("enquiries");
  const [form, setForm] = useState<LeadForm | null>(null);
  const [domain, setDomain] = useState({ lead_form_url: "", domain_status: "" });
  const [published, setPublished] = useState(false);
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);
  const [preview, setPreview] = useState(false);
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [source, setSource] = useState("");
  const [campaign, setCampaign] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<Record<number, string>>({});

  // UI helpers
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedEnquiries, setExpandedEnquiries] = useState<Record<number, boolean>>({});

  // Campaign UTM generator states
  const [utmSource, setUtmSource] = useState("google");
  const [utmCampaign, setUtmCampaign] = useState("spring-promo");
  const [utmMedium, setUtmMedium] = useState("cpc");

  const query = new URLSearchParams({ source, campaign, start, end }).toString();

  async function loadRows() {
    const data = await api("/lead-capture?" + query);
    setRows(data.enquiries || []);
    setSummary(data.summary || {});
  }

  useEffect(() => {
    if (!user) return;
    loadRows().catch(e => setError(e.message));
    if (isAdmin) {
      api("/tenant/lead-capture")
        .then(data => {
          setForm(data.draft);
          setDomain(data.domain);
          setCourses(data.courses || []);
          setPublished(!!data.published);
        })
        .catch(e => setError(e.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }

  function changeField(index: number, patch: Partial<FormField>) {
    setForm(f =>
      f ? { ...f, fields: f.fields.map((v, i) => (i === index ? { ...v, ...patch } : v)) } : f
    );
  }

  const copyToClipboard = (text: string, key: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedEnquiries(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const previewForm = useMemo(() => {
    if (!form) return null;
    if (form.course_ids?.length) {
      return {
        ...form,
        fields: [
          ...form.fields.filter(f => f.key !== "interest"),
          {
            key: "interest",
            label: "Course",
            type: "select",
            required: true,
            options: courses
              .filter(c => form.course_ids?.includes(c.id))
              .map(c => c.title),
          },
        ],
      };
    }
    return form;
  }, [form, courses]);

  // Generated campaign tracking link
  const generatedUtmLink = useMemo(() => {
    if (!domain.lead_form_url) return "";
    const params = new URLSearchParams();
    if (utmSource) params.set("utm_source", utmSource);
    if (utmMedium) params.set("utm_medium", utmMedium);
    if (utmCampaign) params.set("utm_campaign", utmCampaign);
    return `${domain.lead_form_url}?${params.toString()}`;
  }, [domain.lead_form_url, utmSource, utmMedium, utmCampaign]);

  // Helper map from field key to user-configured label
  const fieldLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (form?.fields) {
      form.fields.forEach(f => {
        map[f.key] = f.label;
      });
    }
    return map;
  }, [form]);

  return (
    <div className="space-y-7 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm"
              style={{ background: "var(--company-color, #2563eb)" }}
            >
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {es ? "Consultas del Sitio Web" : "Website Leads & Intake"}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {es
                  ? "Gestión de consultas del formulario público, atribución de marketing y configuración."
                  : "Monitor inbound website enquiries, marketing attribution journeys, and intake form settings."}
              </p>
            </div>
          </div>
        </div>

        {/* Domain & Live Form Status Pill */}
        {domain.lead_form_url && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200 shadow-2xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  published ? "bg-emerald-500 animate-pulse" : "bg-amber-400"
                }`}
              />
              <span className="text-slate-600">
                {published
                  ? es
                    ? "Formulario Publicado"
                    : "Live Form Active"
                  : es
                  ? "Borrador (No publicado)"
                  : "Draft Only"}
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 font-mono text-[11px] truncate max-w-[180px]">
                {domain.domain_status || "ready"}
              </span>
            </div>

            <a
              href={domain.lead_form_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity"
              style={{ background: "var(--company-color, #2563eb)" }}
            >
              <span>{es ? "Abrir Formulario" : "Open Public Form"}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* Global Alerts */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-sm shadow-xs"
        >
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold">{es ? "Atención" : "Notice"}: </strong>
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError("")}
            className="text-red-600 hover:text-red-900 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {message && (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm shadow-xs"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold">{es ? "Éxito" : "Success"}: </strong>
            <span>{message}</span>
          </div>
          <button
            onClick={() => setMessage("")}
            className="text-emerald-600 hover:text-emerald-900 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {es ? "Total Consultas" : "Total Enquiries"}
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-900">{summary.enquiries ?? 0}</p>
          <p className="text-[11px] text-slate-500">
            {es ? "Registradas en el sistema" : "Recorded across all campaigns"}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {es ? "Nuevos Leads" : "New Leads Created"}
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-emerald-600">{summary.new_leads ?? 0}</p>
          <p className="text-[11px] text-emerald-700">
            {es ? "Prospectos únicos añadidos" : "First-time prospective clients"}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {es ? "Consultas Recurrentes" : "Repeat Enquiries"}
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Repeat className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-indigo-600">
            {summary.repeat_enquiries ?? 0}
          </p>
          <p className="text-[11px] text-slate-500">
            {es ? "Vinculadas a leads existentes" : "Matched with existing CRM contacts"}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {es ? "Por Resolver" : "Pending / Conflict"}
            </span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                (summary.pending ?? 0) > 0
                  ? "bg-amber-100 text-amber-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p
            className={`text-3xl font-extrabold ${
              (summary.pending ?? 0) > 0 ? "text-amber-600" : "text-slate-900"
            }`}
          >
            {summary.pending ?? 0}
          </p>
          <p className="text-[11px] text-slate-500">
            {es ? "Requieren asignación o revisión" : "Awaiting manual assignment"}
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200/80">
        <button
          onClick={() => setActiveTab("enquiries")}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-semibold text-sm transition-all ${
            activeTab === "enquiries"
              ? "border-[var(--company-color,#2563eb)] text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{es ? "Consultas Recibidas" : "Inquiries & Submissions"}</span>
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {rows.length}
          </span>
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveTab("builder")}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 font-semibold text-sm transition-all ${
              activeTab === "builder"
                ? "border-[var(--company-color,#2563eb)] text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>{es ? "Diseñador del Formulario" : "Form Builder & Settings"}</span>
            {published && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                LIVE
              </span>
            )}
          </button>
        )}

        <button
          onClick={() => setActiveTab("campaigns")}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-semibold text-sm transition-all ${
            activeTab === "campaigns"
              ? "border-[var(--company-color,#2563eb)] text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <LinkIcon className="w-4 h-4" />
          <span>{es ? "Enlaces de Campaña y UTM" : "Campaign Links & UTMs"}</span>
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: INQUIRIES & SUBMISSIONS LIST                           */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "enquiries" && (
        <div className="space-y-6">
          {/* Filters & Export Bar */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Filter className="w-4 h-4" />
                <span>{es ? "Filtros y Búsqueda" : "Filters & Search"}</span>
              </div>

              <button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const r = await fetch(API_BASE_URL + "/lead-capture/export?" + query);
                    if (!r.ok) throw new Error("Export failed");
                    const url = URL.createObjectURL(await r.blob());
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `website-enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  })
                }
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 shadow-2xs transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>{es ? "Exportar CSV" : "Export CSV"}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                  {es ? "Canal de Origen" : "Traffic Source"}
                </label>
                <select
                  aria-label="Source"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--company-color,#2563eb)]/20 text-slate-900"
                  value={source}
                  onChange={e => setSource(e.target.value)}
                >
                  <option value="">{es ? "Todos los orígenes" : "All Sources"}</option>
                  <option value="google">Google Ads / Search</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="website">Website Referral</option>
                  <option value="direct_unknown">{es ? "Directo / Desconocido" : "Direct / Organic"}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                  {es ? "Campaña UTM" : "UTM Campaign"}
                </label>
                <input
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--company-color,#2563eb)]/20 text-slate-900"
                  placeholder={es ? "Ej. summer_promo" : "e.g. google-ads-2026"}
                  value={campaign}
                  onChange={e => setCampaign(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                  {es ? "Desde" : "From Date"}
                </label>
                <input
                  type="date"
                  aria-label="From date"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--company-color,#2563eb)]/20 text-slate-900"
                  value={start}
                  onChange={e => setStart(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                  {es ? "Hasta" : "To Date"}
                </label>
                <input
                  type="date"
                  aria-label="To date"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--company-color,#2563eb)]/20 text-slate-900"
                  value={end}
                  onChange={e => setEnd(e.target.value)}
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  disabled={busy}
                  onClick={() => action(loadRows)}
                  className="flex-1 rounded-xl px-4 py-2 font-semibold text-sm text-white shadow-xs hover:opacity-95 transition-opacity"
                  style={{ background: "var(--company-color, #2563eb)" }}
                >
                  {es ? "Filtrar" : "Apply"}
                </button>
                {(source || campaign || start || end) && (
                  <button
                    onClick={() => {
                      setSource("");
                      setCampaign("");
                      setStart("");
                      setEnd("");
                    }}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    {es ? "Limpiar" : "Clear"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Submissions List */}
          {rows.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-xs space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Globe className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {es ? "No se encontraron consultas" : "No Website Inquiries Found"}
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                {es
                  ? "Las consultas enviadas a través del formulario público aparecerán aquí organizadas para el equipo de ventas."
                  : "Leads submitted via your public web form will appear here automatically with attribution analytics."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {rows.map(row => {
                const isExpanded = !!expandedEnquiries[row.id];
                const fields = row.fields || {};
                const name = String(fields.name || "").trim() || (es ? "Sin Nombre" : "Unnamed Prospect");
                const email = String(fields.email || "").trim();
                const phone = String(fields.phone || "").trim();
                const companyName = String(fields.company_name || "").trim();
                const websiteUrl = String(fields.website || "").trim();
                const interest = String(fields.interest || "").trim();
                const messageText = String(fields.message || "").trim();

                // Non-message fields for structured display
                const otherFieldKeys = Object.keys(fields).filter(
                  k => !["message", "name"].includes(k)
                );

                const attribution = row.attribution?.current || {};
                const firstAttr = row.attribution?.first || {};
                const trafficSource = attribution.source || "direct_unknown";

                return (
                  <article
                    key={row.id}
                    className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow p-5 sm:p-7 space-y-5"
                  >
                    {/* Inquiry Top Row: Prospect Identity, Status, and Timestamp */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white text-base shadow-xs shrink-0"
                          style={{ background: "var(--company-color, #2563eb)" }}
                        >
                          {name.charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-slate-900 tracking-tight truncate">
                              {name}
                            </h2>
                            {companyName && (
                              <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-md">
                                <Building2 className="w-3 h-3" />
                                <span className="truncate max-w-[140px]">{companyName}</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                            <Clock className="w-3 h-3" />
                            <span>{formatDate(row.created_at, es)}</span>
                            {row.receiving_company_name && (
                              <>
                                <span>·</span>
                                <span className="text-slate-500 font-medium truncate">
                                  {row.receiving_company_name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        {row.state === "linked" && row.new_lead ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{es ? "Nuevo Lead" : "New Lead Created"}</span>
                          </span>
                        ) : row.state === "linked" && !row.new_lead ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                            <Repeat className="w-3.5 h-3.5" />
                            <span>{es ? "Consulta Recurrente" : "Repeat Enquiry"}</span>
                          </span>
                        ) : row.state === "pending_conflict" ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{es ? "Conflicto por Resolver" : "Conflict (Review)"}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{row.state}</span>
                          </span>
                        )}

                        {row.receipt && (
                          <button
                            type="button"
                            title="Click to copy Reference ID"
                            onClick={() => copyToClipboard(row.receipt || "", `ref-${row.id}`)}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors"
                          >
                            <span>REF: {row.receipt.slice(0, 8)}…</span>
                            {copiedKey === `ref-${row.id}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-400" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Contact Channels Strip */}
                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      {email && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-800 font-medium">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          <a href={`mailto:${email}`} className="hover:underline text-slate-900">
                            {email}
                          </a>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(email, `email-${row.id}`)}
                            className="ml-1 text-slate-400 hover:text-slate-700"
                          >
                            {copiedKey === `email-${row.id}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      )}

                      {phone && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-800 font-medium">
                          <Phone className="w-3.5 h-3.5 text-slate-500" />
                          <a href={`tel:${phone}`} className="hover:underline text-slate-900">
                            {phone}
                          </a>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(phone, `phone-${row.id}`)}
                            className="ml-1 text-slate-400 hover:text-slate-700"
                          >
                            {copiedKey === `phone-${row.id}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      )}

                      {websiteUrl && (
                        <a
                          href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        >
                          <Globe className="w-3.5 h-3.5 text-slate-500" />
                          <span>{websiteUrl.replace(/^https?:\/\//, "")}</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </a>
                      )}

                      {interest && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 text-violet-800 border border-violet-200 font-medium">
                          <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                          <span>{interest}</span>
                        </div>
                      )}
                    </div>

                    {/* Prospect's Message / Note */}
                    {messageText && (
                      <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                          <span>{es ? "Mensaje del Prospecto" : "Client Message"}</span>
                        </div>
                        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                          {messageText}
                        </p>
                      </div>
                    )}

                    {/* Structured Dynamic Form Fields (Replaces Raw JSON!) */}
                    {otherFieldKeys.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            {es ? "Datos del Formulario" : "Form Details"}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {otherFieldKeys.map(key => {
                            const val = fields[key];
                            const label = fieldLabelMap[key] || formatFieldKey(key, es);

                            return (
                              <div
                                key={key}
                                className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-1"
                              >
                                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide truncate">
                                  {label}
                                </div>
                                <div className="text-sm font-medium text-slate-900 break-words">
                                  {typeof val === "boolean" ? (
                                    val ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-xs">
                                        <Check className="w-3 h-3" /> {es ? "Sí" : "Yes"}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-0.5 rounded text-xs">
                                        {es ? "No" : "No"}
                                      </span>
                                    )
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

                    {/* Attribution & Marketing Origin (Clean Non-Developer Presentation) */}
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-50 via-slate-50 to-blue-50/30 border border-slate-200/80 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                          <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                          <span>{es ? "Atribución de Marketing" : "Marketing Attribution & Source"}</span>
                        </div>

                        {row.consent?.accepted && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            <ShieldCheck className="w-3 h-3" />
                            <span>{es ? "Consentimiento 30 días" : "30-Day Consent Active"}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 font-semibold text-slate-800 shadow-2xs">
                          <Globe className="w-3.5 h-3.5 text-blue-500" />
                          <span>
                            {trafficSource === "google"
                              ? "Google Ads / Search"
                              : trafficSource === "facebook"
                              ? "Facebook Ads"
                              : trafficSource === "instagram"
                              ? "Instagram"
                              : trafficSource === "website"
                              ? "Website Referral"
                              : es
                              ? "Directo / Orgánico"
                              : "Direct / Organic"}
                          </span>
                        </span>

                        {attribution.utm_campaign && (
                          <span className="px-3 py-1 rounded-xl bg-white border border-slate-200 font-medium text-slate-700 shadow-2xs">
                            <span className="text-slate-400 font-normal">Campaign:</span>{" "}
                            {attribution.utm_campaign}
                          </span>
                        )}

                        {attribution.utm_medium && (
                          <span className="px-3 py-1 rounded-xl bg-white border border-slate-200 font-medium text-slate-700 shadow-2xs">
                            <span className="text-slate-400 font-normal">Medium:</span>{" "}
                            {attribution.utm_medium}
                          </span>
                        )}

                        {attribution.referrer && (
                          <span className="px-3 py-1 rounded-xl bg-white border border-slate-200 font-medium text-slate-700 shadow-2xs truncate max-w-xs">
                            <span className="text-slate-400 font-normal">Referrer:</span>{" "}
                            {attribution.referrer}
                          </span>
                        )}
                      </div>

                      {/* Journey comparison: First touch vs Latest touch */}
                      {firstAttr.source && firstAttr.source !== attribution.source && (
                        <p className="text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-700">
                            {es ? "Recorrido del prospecto:" : "Prospect Journey:"}
                          </span>{" "}
                          {es ? "Primera visita desde" : "First touched via"}{" "}
                          <strong className="text-slate-800">{firstAttr.source}</strong>,{" "}
                          {es ? "consulta enviada desde" : "converted via"}{" "}
                          <strong className="text-slate-800">{attribution.source}</strong>.
                        </p>
                      )}
                    </div>

                    {/* Developer raw JSON toggle (Discreet & optional, out of the way) */}
                    <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {row.lead_id && (
                          <a
                            href={`/leads/${row.lead_id}`}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs hover:opacity-95 transition-opacity"
                            style={{ background: "var(--company-color, #2563eb)" }}
                          >
                            <span>{es ? "Abrir Lead en CRM" : "Open Lead in CRM"}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {isAdmin && row.state !== "linked" && (
                          <div className="flex items-center gap-2">
                            <input
                              className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 bg-white placeholder:text-slate-400"
                              placeholder={es ? "ID del lead existente" : "Existing lead ID"}
                              value={links[row.id] || ""}
                              onChange={e => setLinks({ ...links, [row.id]: e.target.value })}
                            />
                            <button
                              disabled={busy}
                              onClick={() =>
                                action(async () => {
                                  await api(
                                    `/lead-capture/${row.id}/resolve`,
                                    "POST",
                                    links[row.id] ? { lead_id: Number(links[row.id]) } : {}
                                  );
                                  await loadRows();
                                  setMessage(
                                    es ? "Consulta vinculada con éxito." : "Enquiry resolved."
                                  );
                                })
                              }
                              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
                            >
                              {es ? "Vincular" : "Link / Retry"}
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleExpand(row.id)}
                        className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 transition-colors flex items-center gap-1 self-start sm:self-auto"
                      >
                        <span>{isExpanded ? (es ? "Ocultar JSON técnico" : "Hide raw payload") : (es ? "Ver JSON técnico" : "View technical payload")}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>

                    {/* Collapsible raw JSON for developers */}
                    {isExpanded && (
                      <div className="p-3 rounded-2xl bg-slate-900 text-slate-200 text-xs font-mono overflow-auto max-h-60 space-y-2">
                        <div className="flex items-center justify-between text-slate-400 text-[10px] pb-1 border-b border-slate-800">
                          <span>Raw Payload Object (Developer View)</span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                JSON.stringify(
                                  { fields: row.fields, attribution: row.attribution, consent: row.consent },
                                  null,
                                  2
                                ),
                                `json-${row.id}`
                              )
                            }
                            className="text-slate-300 hover:text-white flex items-center gap-1"
                          >
                            {copiedKey === `json-${row.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedKey === `json-${row.id}` ? "Copied" : "Copy JSON"}</span>
                          </button>
                        </div>
                        <pre className="overflow-auto whitespace-pre-wrap">
                          {JSON.stringify(
                            { fields: row.fields, attribution: row.attribution, consent: row.consent },
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: FORM BUILDER & SETTINGS (ADMIN ONLY)                   */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "builder" && isAdmin && form && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-7">
            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {es ? "Configuración del Formulario Público" : "Public Form Builder"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {es
                    ? "Personaliza los títulos, textos, aviso de privacidad y campos dinámicos que verán tus visitantes."
                    : "Configure headings, privacy notices, course offerings, and dynamic intake fields."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      await api("/tenant/lead-capture", "PUT", form);
                      setMessage(es ? "Borrador guardado correctamente" : "Draft saved successfully");
                    })
                  }
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
                >
                  {es ? "Guardar Borrador" : "Save Draft"}
                </button>

                <button
                  type="button"
                  onClick={() => setPreview(!preview)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                  <span>{preview ? (es ? "Ocultar Vista Previa" : "Hide Preview") : es ? "Vista Previa" : "Preview"}</span>
                </button>

                <button
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      await api("/tenant/lead-capture", "PUT", form);
                      await api("/tenant/lead-capture/publish", "POST");
                      setPublished(true);
                      setMessage(es ? "¡Formulario publicado exitosamente!" : "Form published live successfully!");
                    })
                  }
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-xs hover:opacity-95 transition-opacity"
                  style={{ background: "var(--company-color, #2563eb)" }}
                >
                  {es ? "Publicar en Vivo" : "Publish Form"}
                </button>

                {published && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await api("/tenant/lead-capture/publish", "DELETE");
                        setPublished(false);
                        setMessage(es ? "Formulario despublicado" : "Form unpublished");
                      })
                    }
                    className="px-4 py-2 rounded-xl border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 text-xs font-semibold transition-colors"
                  >
                    {es ? "Despublicar" : "Unpublish"}
                  </button>
                )}
              </div>
            </div>

            {/* General Texts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  {es ? "Título Principal del Formulario" : "Form Heading"}
                </label>
                <input
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--company-color,#2563eb)]/20 text-slate-900"
                  value={form.heading}
                  onChange={e => setForm({ ...form, heading: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  {es ? "Texto del Botón de Envío" : "Submit Button Label"}
                </label>
                <input
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--company-color,#2563eb)]/20 text-slate-900"
                  value={form.submit_label}
                  onChange={e => setForm({ ...form, submit_label: e.target.value })}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  {es ? "Descripción / Subtítulo" : "Description Subtitle"}
                </label>
                <textarea
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--company-color,#2563eb)]/20 text-slate-900 min-h-[70px] resize-y"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  {es ? "Mensaje de Éxito al Enviar" : "Success Message"}
                </label>
                <input
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--company-color,#2563eb)]/20 text-slate-900"
                  value={form.success_message}
                  onChange={e => setForm({ ...form, success_message: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  {es ? "Aviso de Privacidad (Legal)" : "Privacy Policy Notice"}
                </label>
                <textarea
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--company-color,#2563eb)]/20 text-slate-900 min-h-[70px] resize-y"
                  value={form.privacy_notice}
                  onChange={e => setForm({ ...form, privacy_notice: e.target.value })}
                />
              </div>
            </div>

            {/* Courses Option (Institute Module) */}
            {courses.length > 0 && (
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    {es ? "Cursos Disponibles en el Formulario" : "Public Course Offerings"}
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {courses.map(c => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-slate-200/80 text-xs font-medium text-slate-800 cursor-pointer hover:border-slate-300"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-[var(--company-color,#2563eb)] focus:ring-[var(--company-color,#2563eb)]/30"
                        checked={form.course_ids?.includes(c.id) || false}
                        onChange={e =>
                          setForm({
                            ...form,
                            course_ids: e.target.checked
                              ? [...(form.course_ids || []), c.id]
                              : form.course_ids?.filter(id => id !== c.id),
                          })
                        }
                      />
                      <span className="truncate">{c.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Dynamic Fields Section */}
            <div className="space-y-4 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {es ? "Campos del Formulario" : "Form Intake Fields"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {es
                      ? "Nombre, Correo y Teléfono son obligatorios para el sistema. Puedes agregar hasta 10 campos personalizados."
                      : "Name, email and phone are core intake fields. You can add up to 10 custom fields."}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    form.fields.filter(f => f.key.startsWith("custom_")).length >= 10
                  }
                  onClick={() =>
                    setForm({
                      ...form,
                      fields: [
                        ...form.fields,
                        {
                          key: "custom_" + crypto.randomUUID().replaceAll("-", "").slice(0, 12),
                          label: es ? "Nuevo campo" : "New field",
                          type: "text",
                          required: false,
                        },
                      ],
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 shadow-2xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{es ? "Agregar Campo" : "Add Field"}</span>
                </button>
              </div>

              <div className="space-y-3">
                {form.fields.map((f, i) => (
                  <div
                    key={f.key}
                    className="p-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-5">
                        <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                          {es ? "Etiqueta visible" : "Field Label"}
                        </label>
                        <input
                          className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 bg-white"
                          value={f.label}
                          onChange={e => changeField(i, { label: e.target.value })}
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                          {es ? "Tipo de dato" : "Field Type"}
                        </label>
                        <select
                          className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 bg-white"
                          value={f.type}
                          disabled={!f.key.startsWith("custom_") && f.key !== "interest"}
                          onChange={e => changeField(i, { type: e.target.value })}
                        >
                          {(f.key === "interest"
                            ? ["text", "select"]
                            : f.key.startsWith("custom_")
                            ? ["text", "textarea", "select", "checkbox"]
                            : [f.type]
                          ).map(t => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2 flex items-center pt-4 sm:pt-0">
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={f.required}
                            disabled={f.key === "name"}
                            onChange={e => changeField(i, { required: e.target.checked })}
                            className="rounded border-slate-300 text-[var(--company-color,#2563eb)] focus:ring-[var(--company-color,#2563eb)]/30"
                          />
                          <span>{es ? "Requerido" : "Required"}</span>
                        </label>
                      </div>

                      <div className="sm:col-span-2 flex justify-end">
                        {!["name", "email", "phone"].includes(f.key) ? (
                          <button
                            type="button"
                            onClick={() =>
                              setForm({
                                ...form,
                                fields: form.fields.filter((_, n) => n !== i),
                              })
                            }
                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                            title="Remove field"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium px-2 py-0.5 rounded bg-slate-100">
                            Core
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Options area for select fields */}
                    {f.type === "select" && (
                      <div className="pt-2 border-t border-slate-200/50">
                        <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                          {es ? "Opciones del desplegable (una por línea)" : "Dropdown Options (one per line)"}
                        </label>
                        <textarea
                          className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 bg-white min-h-[60px]"
                          value={(f.options || []).join("\n")}
                          onChange={e => changeField(i, { options: e.target.value.split("\n") })}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Live Interactive Preview Drawer */}
            {preview && previewForm && (
              <div className="pt-6 border-t border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-slate-500" />
                    <h3 className="font-bold text-sm text-slate-900">
                      {es ? "Vista Previa Interactiva en Vivo" : "Interactive Live Preview"}
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400">
                    {es ? "Visualización exacta para el visitante" : "Exact appearance for website visitors"}
                  </span>
                </div>
                <div className="p-4 sm:p-8 rounded-3xl bg-slate-100/80 border border-slate-200">
                  <div className="max-w-2xl mx-auto">
                    <LeadCaptureForm form={previewForm} preview locale={brand.locale} brand={brand} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 3: CAMPAIGN URL BUILDER & UTMS                            */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "campaigns" && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {es ? "Generador de Enlaces con Seguimiento UTM" : "Campaign Link Generator & Attribution"}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {es
                  ? "Crea enlaces con parámetros UTM para tus anuncios de Google, Facebook, Instagram o boletines y rastrea automáticamente las conversiones."
                  : "Generate trackable campaign links with UTM parameters for paid ads, email newsletters, or partner sites."}
              </p>
            </div>

            {domain.lead_form_url ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                      {es ? "Plataforma / Canal (Source)" : "Traffic Source"}
                    </label>
                    <select
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--company-color,#2563eb)]/20 text-slate-900"
                      value={utmSource}
                      onChange={e => {
                        const s = e.target.value;
                        setUtmSource(s);
                        if (["facebook", "instagram"].includes(s)) setUtmMedium("paid_social");
                        else if (s === "google") setUtmMedium("cpc");
                        else if (s === "email") setUtmMedium("newsletter");
                        else setUtmMedium("referral");
                      }}
                    >
                      <option value="google">Google (Search / Ads)</option>
                      <option value="facebook">Facebook Ads</option>
                      <option value="instagram">Instagram Ads</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="email">Email Campaign / Newsletter</option>
                      <option value="website">Partner / Referral Website</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                      {es ? "Medio (Medium)" : "Medium"}
                    </label>
                    <input
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--company-color,#2563eb)]/20 text-slate-900"
                      value={utmMedium}
                      onChange={e => setUtmMedium(e.target.value)}
                      placeholder="cpc, paid_social, newsletter"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                      {es ? "Nombre de la Campaña (Campaign)" : "Campaign Name"}
                    </label>
                    <input
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--company-color,#2563eb)]/20 text-slate-900"
                      value={utmCampaign}
                      onChange={e => setUtmCampaign(e.target.value)}
                      placeholder="summer-promo-2026"
                    />
                  </div>
                </div>

                {/* Generated Link Card */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {es ? "Enlace Generado Listo para Anuncios" : "Generated Tracking URL"}
                    </span>
                    <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 font-medium">
                      {es ? "Atribución Activa" : "Attribution Ready"}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      readOnly
                      className="flex-1 font-mono text-xs text-slate-800 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 select-all"
                      value={generatedUtmLink}
                    />

                    <button
                      type="button"
                      onClick={() => copyToClipboard(generatedUtmLink, "campaign-url")}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs text-white shadow-xs hover:opacity-95 transition-opacity"
                      style={{ background: "var(--company-color, #2563eb)" }}
                    >
                      {copiedKey === "campaign-url" ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>{es ? "¡Copiado!" : "Copied!"}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{es ? "Copiar Enlace" : "Copy Link"}</span>
                        </>
                      )}
                    </button>

                    <a
                      href={generatedUtmLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <span>{es ? "Probar" : "Test"}</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/60 text-xs text-slate-600 leading-relaxed space-y-1">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-blue-600" />
                    <span>{es ? "¿Cómo funciona la atribución?" : "How does lead attribution work?"}</span>
                  </div>
                  <p>
                    {es
                      ? "Cuando un usuario entra a través de este enlace, el sistema recuerda el origen (Google, Facebook, campaña específica). Si el visitante acepta la política de privacidad, recordamos su canal durante 30 días incluso si regresa directamente."
                      : "When prospects land via this link, their journey (source, medium, campaign) is securely preserved. If they accept retention, their discovery origin is attributed for 30 days even if they return directly."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
                <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
                <p className="text-sm font-semibold text-slate-800">
                  {es ? "Subdominio no configurado aún" : "Subdomain Not Configured Yet"}
                </p>
                <p className="text-xs text-slate-500">
                  {es
                    ? "Para generar enlaces de campaña, primero asigna un subdominio a tu empresa en Configuración de Clientes."
                    : "Assign a company subdomain in Client Management first to enable public form links."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
