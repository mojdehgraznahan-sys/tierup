import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The microphone is allowed for TierUp's own pages only (session transcripts), never for embeds.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
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
  // Session transcript clips (~30 s of audio) are uploaded through a server action.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
