"use client";
import { useEffect, useState } from "react";
import LeadCaptureForm, { LeadForm } from "@/components/LeadCaptureForm";
import { useCompanyBrand } from "@/components/CompanyBoundary";
import { AlertCircle, RefreshCw, ShieldCheck } from "lucide-react";

export default function LeadFormPage() {
  const brand = useCompanyBrand();
  const [form, setForm] = useState<LeadForm | null>(null);
  const [siteKey, setSiteKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const es = brand.locale === "es";

  const loadForm = () => {
    setLoading(true);
    setError("");
    fetch("/api/lead-capture", { cache: "no-store" })
      .then(async r => {
        if (!r.ok) {
          const data = await r.json().catch(() => null);
          throw new Error(
            data?.detail ||
              (es
                ? "El formulario de esta empresa no está disponible actualmente."
                : "This company's enquiry form is currently unavailable.")
          );
        }
        return r.json();
      })
      .then(data => {
        setForm(data.form);
        setSiteKey(data.site_key || "");
      })
      .catch(e => {
        setError(
          e instanceof Error
            ? e.message
            : es
            ? "No se pudo cargar el formulario."
            : "Unable to load the enquiry form."
        );
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-slate-50 via-slate-50/90 to-slate-100 text-slate-900 selection:bg-slate-200 selection:text-slate-900">
      {/* Decorative ambient background glows using the brand's primary color */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden opacity-30 sm:opacity-45"
        aria-hidden="true"
      >
        <div
          className="absolute -top-[160px] left-1/2 -translate-x-1/2 w-[760px] h-[380px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, var(--company-color, #2563eb) 0%, transparent 70%)",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.22]" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        {loading ? (
          <div className="bg-white/80 backdrop-blur-md rounded-3xl p-8 sm:p-12 shadow-xl border border-slate-200/80 animate-pulse space-y-8">
            <div className="space-y-3">
              <div className="h-6 w-36 bg-slate-200 rounded-full" />
              <div className="h-10 w-3/4 bg-slate-200 rounded-xl" />
              <div className="h-4 w-1/2 bg-slate-200 rounded-lg" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4">
              <div className="h-16 bg-slate-100 rounded-xl" />
              <div className="h-16 bg-slate-100 rounded-xl" />
              <div className="h-16 bg-slate-100 rounded-xl" />
              <div className="h-16 bg-slate-100 rounded-xl" />
              <div className="h-32 md:col-span-2 bg-slate-100 rounded-xl" />
            </div>
            <div className="h-12 w-full bg-slate-200 rounded-xl" />
          </div>
        ) : error ? (
          <div
            role="alert"
            className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-slate-200 text-center space-y-5 max-w-lg mx-auto"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto shadow-xs">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {es ? "Formulario no disponible" : "Form Currently Unavailable"}
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">{error}</p>
            </div>
            <button
              onClick={loadForm}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs tracking-wide transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{es ? "Intentar de nuevo" : "Try again"}</span>
            </button>
          </div>
        ) : form ? (
          <LeadCaptureForm form={form} locale={brand.locale} brand={brand} siteKey={siteKey} />
        ) : null}

        {/* Global footer branding & security note */}
        <footer className="mt-12 text-center text-xs text-slate-400 space-y-2">
          <p className="flex items-center justify-center gap-1.5 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {es
                ? "Formulario seguro verificado · Transmisión cifrada SSL"
                : "Verified secure enquiry form · SSL encrypted transmission"}
            </span>
          </p>
          <p>
            © {new Date().getFullYear()} {brand.brand_name || "SerpHawk"}.{" "}
            {es ? "Todos los derechos reservados." : "All rights reserved."}
          </p>
        </footer>
      </div>
    </main>
  );
}
