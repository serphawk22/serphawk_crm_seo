import { NextRequest, NextResponse } from "next/server";
import { COMPANY_BASE_DOMAIN } from "@/lib/companyConfig";
export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() || "";
  const base = COMPANY_BASE_DOMAIN;
  if (host === "www." + base) {
    const url = request.nextUrl.clone(); url.hostname = base; url.protocol = "https:";
    return NextResponse.redirect(url);
  }
  const local = process.env.NODE_ENV !== "production" && (host === "localhost" || /^[a-z0-9-]+\.localhost$/.test(host));
  if (!local && host !== base && !new RegExp("^[a-z0-9-]+\\." + base.replace(/\./g, "\\.") + "$").test(host)) {
    return new NextResponse("Company unavailable", { status: 404 });
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
