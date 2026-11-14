import { NextRequest } from "next/server";
import { companyFetch, sameOrigin } from "@/lib/companyProxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function proxy(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return Response.json({ detail: "Invalid origin" }, { status: 403 });
    const body = Buffer.from(await request.arrayBuffer());
    if (body.length > 25 * 1024 * 1024) return new Response("Upload too large", { status: 413 });
    const path = request.nextUrl.pathname.replace(/^\/api\/backend/, "");
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith("/internal/") && decoded !== "/internal/company-brand") return new Response("Not found", { status: 404 });
    return await companyFetch(request, path + request.nextUrl.search, body);
  } catch { return Response.json({ detail: "Service temporarily unavailable" }, { status: 503 }); }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as HEAD };
