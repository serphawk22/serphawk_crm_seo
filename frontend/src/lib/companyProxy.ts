import "server-only";
import { createHash, createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { COMPANY_BASE_DOMAIN } from "@/lib/companyConfig";

export async function companyFetch(request: NextRequest, target: string, body?: Buffer) {
  const backend = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
  const origin = new URL(backend);
  if (!/^https?:$/.test(origin.protocol) || !target.startsWith("/") || target.startsWith("//")) throw new Error("Invalid backend configuration");
  const destination = new URL(target, origin.origin);
  if (destination.origin !== origin.origin || /[\\]/.test(target) || destination.pathname + destination.search !== target) throw new Error("Invalid proxy target");
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() || "";
  const base = COMPANY_BASE_DOMAIN;
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host.endsWith(".localhost");
  const local = process.env.NODE_ENV !== "production" && isLocalHost;
  if (!local && host !== base && !host.endsWith("." + base)) return new Response("Company unavailable", { status: 404 });
  const signedHost = local ? (host.endsWith(".localhost") ? host.replace(/\.localhost$/, "." + base) : base) : host;
  const secret = process.env.COMPANY_PROXY_SECRET;
  const stamp = String(Math.floor(Date.now() / 1000));
  // Vercel overwrites x-real-ip. No arbitrary browser forwarded-IP headers are propagated.
  const ip = process.env.VERCEL ? request.headers.get("x-real-ip") || "unknown" : "local";
  const payload = body || Buffer.alloc(0);
  const headers = new Headers();
  for (const key of ["authorization", "content-type", "accept", "range", "x-user-id", "cookie"]) {
    if (key === "authorization" && target.startsWith("/internal/")) continue;
    const value = request.headers.get(key); if (value) headers.set(key, value);
  }
  if (secret) {
    const canonical = [request.method, target, signedHost, stamp, createHash("sha256").update(payload).digest("hex"), ip].join("\n");
    headers.set("x-company-host", signedHost);
    headers.set("x-company-time", stamp);
    headers.set("x-company-ip", ip);
    headers.set("x-company-signature", createHmac("sha256", secret).update(canonical).digest("hex"));
  } else if (local) {
    headers.set("x-company-host", signedHost);
  }
  const response = await fetch(destination, { method: request.method, headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : new Uint8Array(payload), cache: "no-store", redirect: "manual" });
  const backendCacheControl = response.headers.get("cache-control");
  const output = new Headers({ "Cache-Control": backendCacheControl || "private, no-cache" });
  for (const key of ["content-type", "content-disposition", "content-range", "accept-ranges", "retry-after", "set-cookie"]) {
    const value = response.headers.get(key); if (value) output.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers: output });
}

export function sameOrigin(request: NextRequest) {
  if (["GET", "HEAD"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  try { return !!origin && new URL(origin).host === request.headers.get("host"); }
  catch { return false; }
}
