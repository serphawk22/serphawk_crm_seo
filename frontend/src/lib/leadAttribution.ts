export const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_id", "utm_content", "utm_term", "gclid", "gbraid", "wbraid", "fbclid"];
export type Visit = Record<string, string>;
export type RememberedVisit = { first: Visit; latest: Visit; latest_campaign?: Visit; expires: number };
export function captureVisit(search: string, path: string, referrer: string, now = Date.now()): Visit {
  const params = new URLSearchParams(search);
  let origin = "";
  try { origin = referrer ? new URL(referrer).origin : ""; } catch { /* invalid referrer */ }
  const visit: Visit = { path: path.split("?")[0].split("#")[0], timestamp: new Date(now).toISOString(), referrer: origin };
  for (const key of ATTRIBUTION_KEYS) if (params.has(key)) visit[key] = params.get(key)!.slice(0, 500);
  return visit;
}
export function activeVisit(value: unknown, now = Date.now()): RememberedVisit | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as Partial<RememberedVisit>;
  return typeof saved.expires === "number" && saved.expires > now && !!saved.first && !!saved.latest ? saved as RememberedVisit : null;
}
export function rememberVisit(previous: unknown, current: Visit, now = Date.now()): RememberedVisit {
  const saved = activeVisit(previous, now);
  const campaign = ATTRIBUTION_KEYS.some(key => !!current[key]);
  return { first: saved?.first || current, latest: current, latest_campaign: campaign ? current : saved?.latest_campaign,
    expires: saved?.expires || now + 30 * 86400000 };
}
