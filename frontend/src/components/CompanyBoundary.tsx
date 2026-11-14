"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ShieldCheck, ArrowRight, Loader2 } from "lucide-react";
import { COMPANY_DOMAINS_ENABLED } from "@/lib/companyConfig";

export type CompanyBrand = {
  company: boolean;
  brand_name?: string;
  brand_logo_url?: string;
  primary_color?: string;
  locale?: string;
};

const CompanyContext = createContext<CompanyBrand>({ company: false });
export function useCompanyBrand() {
  return useContext(CompanyContext);
}

export default function CompanyBoundary({ children }: { children: React.ReactNode }) {
  const enabled = COMPANY_DOMAINS_ENABLED;
  const [brand, setBrand] = useState<CompanyBrand | null>(null);
  const [error, setError] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled) return;
    fetch("/api/backend/internal/company-brand", { cache: "no-store" })
      .then(async r => {
        if (!r.ok) throw new Error();
        const data = await r.json();
        setBrand(data);
        if (data.company) {
          document.title = data.brand_name;
          document.documentElement.lang = data.locale === "es" ? "es" : "en";
          window.dispatchEvent(new CustomEvent("company-brand", { detail: data }));
        }
      })
      .catch(() => setError(true));
  }, [enabled]);

  if (!enabled) return <>{children}</>;

  if (error)
    return (
      <main className="min-h-screen grid place-items-center p-8 bg-slate-50 text-slate-800">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200/80 shadow-lg text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Company Unavailable</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Please check the domain address or try again later.
          </p>
        </div>
      </main>
    );

  if (!brand)
    return (
      <main className="min-h-screen grid place-items-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm text-slate-500 font-medium bg-white px-5 py-3 rounded-full border border-slate-200 shadow-2xs">
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          <span>Loading workspace…</span>
        </div>
      </main>
    );

  const es = brand.locale === "es";
  const isLeadPage = pathname === "/leadformpage";

  return (
    <CompanyContext.Provider value={brand}>
      <div style={{ "--company-color": brand.primary_color || "#2563eb" } as React.CSSProperties}>
        {brand.company && (
          <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-slate-200/80 transition-all">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {/* Tenant-managed external logos use the same image policy as BrandMark. */}
                {brand.brand_logo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    alt={brand.brand_name || "Logo"}
                    className="h-8 max-h-8 w-auto max-w-[140px] object-contain rounded"
                    src={
                      brand.brand_logo_url.startsWith("/")
                        ? "/api/backend" + brand.brand_logo_url
                        : brand.brand_logo_url
                    }
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-xs shrink-0"
                    style={{ background: "var(--company-color, #2563eb)" }}
                  >
                    {(brand.brand_name || "C").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex items-center gap-2 truncate">
                  <strong className="text-slate-900 font-bold text-base tracking-tight truncate">
                    {brand.brand_name}
                  </strong>
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
                    <ShieldCheck className="w-3 h-3 text-slate-500" />
                    <span>{es ? "Verificado" : "Verified"}</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {isLeadPage ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{es ? "Recepción activa" : "Open for enquiries"}</span>
                  </span>
                ) : (
                  <a
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity"
                    style={{ background: "var(--company-color, #2563eb)" }}
                    href="/leadformpage"
                  >
                    <span>{es ? "Contactar" : "Enquire"}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </header>
        )}
        {children}
      </div>
    </CompanyContext.Provider>
  );
}
