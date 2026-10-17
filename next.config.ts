import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a test build (e.g. NEXT_DIST_DIR=.next-e2e) run alongside `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
