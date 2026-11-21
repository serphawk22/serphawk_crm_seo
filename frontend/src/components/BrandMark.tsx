"use client";

import { ReactNode, useEffect, useState } from "react";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { logoSrc } from "@/lib/brandLogo";
import { useCompanyBrand } from "@/components/CompanyBoundary";

interface BrandMarkProps {
  /** Edge of the square the logo is fitted into, in px. */
  size: number;
  /** What to show when the company has no logo (or it fails to load): falls back to official Serp Hawk logo. */
  fallback?: ReactNode;
  className?: string;
}

/** The company's uploaded logo, fitted without distortion; falls back to the official Serp Hawk logo. */
export default function BrandMark({ size, fallback, className }: BrandMarkProps) {
  const company = useCompanyBrand();
  const { settings } = useTenantConfig();
  const src = logoSrc(settings.brand_logo_url);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    if (company.company) {
      return (
        <span
          aria-label={company.brand_name}
          className="inline-grid place-items-center rounded-lg font-bold text-white"
          style={{ width: size, height: size, background: company.primary_color || '#2563eb' }}
        >
          {(company.brand_name || '').split(/\s+/).map(v => v[0]).join('').slice(0, 2).toUpperCase()}
        </span>
      );
    }
    return fallback ? (
      <>{fallback}</>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/Serp%20Hawk%20Logo.png"
        alt="Serp Hawk Logo"
        width={size}
        height={size}
        className={`shrink-0 object-contain ${className || ""}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-lg bg-white object-contain ${className || ""}`}
      style={{ width: size, height: size }}
    />
  );
}
