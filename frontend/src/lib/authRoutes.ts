import { COMPANY_BASE_DOMAIN } from "@/lib/companyConfig";

export const platformOrigin = `https://${COMPANY_BASE_DOMAIN}`;
export const platformLogin = `${platformOrigin}/login`;

export function isPublicPage(path: string | null | undefined) {
  if (!path) return false;
  // Explicit public pages
  if (
    [
      "/",
      "/login",
      "/signup",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/showcase",
      "/demo_showcase",
      "/leadformpage",
      "/demo",
      "/demo-account",
      "/product-guide",
      "/shop",
      "/storefront",
      "/blogs"
    ].includes(path)
    || path.startsWith("/p/")
    || path.startsWith("/proposals/")
  ) {
    return true;
  }

  // Public blog viewing routes: /blogs/[slug]
  // Note: /blogs/create and /blogs/edit are authoring routes and require login
  if (path.startsWith("/blogs/") && !path.startsWith("/blogs/create") && !path.startsWith("/blogs/edit")) {
    return true;
  }

  return false;
}

export function loginError(detail: unknown, fallback: string) {
  if (detail && typeof detail === "object" && "code" in detail && detail.code === "wrong_company") {
    return { wrongCompany: true, message: "This account belongs to another workspace. Redirecting to serphawk.in to sign in." };
  }
  return { wrongCompany: false, message: typeof detail === "string" ? detail : fallback };
}
