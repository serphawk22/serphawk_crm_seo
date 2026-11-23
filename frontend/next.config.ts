import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

// In local development only, load strictly required proxy variables from root .env.
// Never expose backend credentials (DATABASE_URL, OPENAI_API_KEY, SESSION_SECRET, etc.) to the frontend.
if (process.env.NODE_ENV !== "production") {
  const rootEnvPath = path.resolve(process.cwd(), "../.env");
  const ALLOWED_LOCAL_VARS = new Set([
    "COMPANY_PROXY_SECRET",
    "COMPANY_LOCAL_DEVELOPMENT",
    "BACKEND_URL",
    "NEXT_PUBLIC_API_BASE_URL",
  ]);

  if (fs.existsSync(rootEnvPath)) {
    try {
      const content = fs.readFileSync(rootEnvPath, "utf-8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          if (ALLOWED_LOCAL_VARS.has(key) && process.env[key] === undefined) {
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            process.env[key] = val;
          }
        }
      }
    } catch {
      // Ignore if unreadable
    }
  }
}

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/showcase/index.html", destination: "/showcase", permanent: true }];
  },
  async rewrites() {
    return [
      { source: "/showcase", destination: "/showcase/index.html" },
      { source: "/blog", destination: "/blogs" },
      { source: "/blog/:slug*", destination: "/blogs/:slug*" },
      { source: "/storefront", destination: "/shop" },
      { source: "/storefront/:path*", destination: "/shop/:path*" }
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // (The old `eslint.ignoreDuringBuilds` key was removed: Next 16 no longer lints during
  // `next build` and rejects that option in NextConfig.)
};

export default nextConfig;
