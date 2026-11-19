import { COMPANY_BASE_DOMAIN } from "@/lib/companyConfig";

export const platformOrigin = `https://${COMPANY_BASE_DOMAIN}`;
export const platformLogin = `${platformOrigin}/login`;

export function isPublicPage(path: string | null | undefined) {
  return !!path && (
    ["/", "/login", "/signup", "/register", "/forgot-password", "/reset-password", "/showcase", "/demo_showcase", "/leadformpage"].includes(path)
    || path.startsWith("/p/")
  );
}

export function loginError(detail: unknown, fallback: string) {
  if (detail && typeof detail === "object" && "code" in detail && detail.code === "wrong_company") {
    return { wrongCompany: true, message: "This account belongs to another workspace. Redirecting to serphawk.in to sign in." };
  }
  return { wrongCompany: false, message: typeof detail === "string" ? detail : fallback };
}
