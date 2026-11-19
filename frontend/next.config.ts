import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/showcase/index.html", destination: "/showcase", permanent: true }];
  },
  async rewrites() {
    return [{ source: "/showcase", destination: "/showcase/index.html" }];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // (The old `eslint.ignoreDuringBuilds` key was removed: Next 16 no longer lints during
  // `next build` and rejects that option in NextConfig.)
};

export default nextConfig;
