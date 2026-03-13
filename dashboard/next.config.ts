import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API calls to Rust backend (avoids CORS in production)
  async rewrites() {
    const proxyUrl = process.env.PROXY_URL || "http://localhost:3402";
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${proxyUrl}/api/v1/:path*`,
      },
      // PostHog reverse proxy — bypasses ad blockers
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "https://us.i.posthog.com/decide",
      },
    ];
  },

  // Security headers (supplement vercel.json for non-Vercel deploys)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
