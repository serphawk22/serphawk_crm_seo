import { NextRequest } from "next/server";
import { companyFetch, sameOrigin } from "@/lib/companyProxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try { return await companyFetch(request, "/internal/lead-capture/config"); }
  catch { return Response.json({ detail: "Form unavailable" }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return new Response("Invalid origin", { status: 403 });
    if (Number(request.headers.get("content-length")) > 32768) return new Response("Submission too large", { status: 413 });
    const body = Buffer.from(await request.arrayBuffer());
    if (body.length > 32768) return new Response("Submission too large", { status: 413 });
    return await companyFetch(request, "/internal/lead-capture/submit", body);
  } catch { return Response.json({ detail: "Unable to send. Please retry." }, { status: 503 }); }
}
