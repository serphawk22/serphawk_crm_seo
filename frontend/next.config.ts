import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // (The old `eslint.ignoreDuringBuilds` key was removed: Next 16 no longer lints during
  // `next build` and rejects that option in NextConfig.)
};

export default nextConfig;
