import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Lets a test build (e.g. NEXT_DIST_DIR=.next-e2e) run alongside `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Self-contained server (server.js + only the needed node_modules) for the Cloud Run image.
  output: "standalone",
  // Make sure Prisma's query engine is copied into the standalone output.
  outputFileTracingIncludes: { "/**": ["./node_modules/.prisma/client/**/*"] },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
