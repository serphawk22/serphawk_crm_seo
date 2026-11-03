"use client";

import { useTenantConfig } from "@/context/TenantConfigContext";

export function useDashboardSections() {
  const { hasFeature, loaded } = useTenantConfig();
  return (section: string, module?: string) => loaded && hasFeature("dashboard") &&
    hasFeature(`dashboard_${section}`) && (!module || hasFeature(module));
}

export default function DashboardSection({ name, module, children }: {
  name: string; module?: string; children: React.ReactNode;
}) {
  const show = useDashboardSections();
  return show(name, module) ? <>{children}</> : null;
}
