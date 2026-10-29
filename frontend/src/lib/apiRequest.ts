/** Match origins, not string prefixes: lookalike domains must never receive a session token. */
export function isInternalApi(resource: RequestInfo | URL, apiBase: string, origin: string): boolean {
  try {
    const raw = typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url;
    const url = new URL(raw, origin);
    const api = new URL(apiBase, origin);
    return url.origin === origin || (url.origin === api.origin &&
      (api.pathname === '/' || url.pathname === api.pathname || url.pathname.startsWith(api.pathname.replace(/\/$/, '') + '/')));
  } catch { return false; }
}
