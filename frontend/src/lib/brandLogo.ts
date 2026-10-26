import { API_BASE_URL } from "@/config";

/** A stored logo address to something an <img> can load: uploads are served by the API, external URLs are kept as they are. */
export function logoSrc(url?: string | null): string | null {
  if (!url) return null;
  return url.startsWith("/") ? `${API_BASE_URL}${url}` : url;
}
