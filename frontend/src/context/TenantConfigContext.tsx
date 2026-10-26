"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";

export interface TenantSettings {
  brand_name?: string | null;
  brand_logo_url?: string | null;
  primary_color?: string | null;
  website_url?: string | null;
  default_currency?: string | null;
  locale?: string | null;
  timezone?: string | null;
  default_dial_code?: string | null;
  home_dashboard?: string | null;
  lead_statuses?: string[] | null;
  deal_stages?: string[] | null;
  client_statuses?: string[] | null;
}

interface TenantConfig {
  loaded: boolean;
  features: Record<string, boolean>;
  settings: TenantSettings;
  preset: string | null;
  /** True when the module is on for this tenant. Fails open until the config is known, and for unknown keys. */
  hasFeature: (key?: string) => boolean;
  /** Strict: true only once the config is loaded AND the add-on is explicitly on (add-ons are off by default). */
  isOn: (key: string) => boolean;
  /** Tenant brand name, or the built-in product name when the tenant has not set one. */
  brandName: string;
  refresh: () => void;
}

const DEFAULT_BRAND = "SERP Hawk";

const TenantConfigContext = createContext<TenantConfig>({
  loaded: false,
  features: {},
  settings: {},
  preset: null,
  hasFeature: () => true,
  isOn: () => false,
  brandName: DEFAULT_BRAND,
  refresh: () => {},
});

export function TenantConfigProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useRole();
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<TenantSettings>({});
  const [preset, setPreset] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setFeatures({});
      setSettings({});
      setPreset(null);
      setLoaded(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/me/features`, { cache: "no-store" });
        if (!res.ok) return; // older backend or a transient error: stay fail-open
        const data = await res.json();
        if (!alive) return;
        // keep the same objects when nothing changed, so a quiet re-check does not re-render the whole app
        setFeatures((prev) => (JSON.stringify(prev) === JSON.stringify(data.features || {}) ? prev : data.features || {}));
        setSettings((prev) => (JSON.stringify(prev) === JSON.stringify(data.settings || {}) ? prev : data.settings || {}));
        setPreset(data.preset ?? null);
        setLoaded(true);
      } catch {
        /* keep the previous config; every module stays visible */
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAuthenticated, user?.id, nonce]);

  // The company's modules can be switched on or off by its administrator while people are signed in: look again when the
  // tab regains focus and once a minute, so menus and pages follow the profile without anyone having to sign in again.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    let last = Date.now();
    const recheck = () => {
      if (document.visibilityState === "hidden" || Date.now() - last < 15000) return;
      last = Date.now();
      setNonce((n) => n + 1);
    };
    const timer = setInterval(recheck, 60000);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [isAuthenticated, user?.id]);

  const value: TenantConfig = {
    loaded,
    features,
    settings,
    preset,
    hasFeature: (key?: string) => !key || !loaded || features[key] !== false,
    isOn: (key: string) => loaded && features[key] === true,
    brandName: settings.brand_name || DEFAULT_BRAND,
    refresh: () => setNonce((n) => n + 1),
  };

  return <TenantConfigContext.Provider value={value}>{children}</TenantConfigContext.Provider>;
}

export function useTenantConfig() {
  return useContext(TenantConfigContext);
}
