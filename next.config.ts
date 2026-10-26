import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page renders per-user data behind RLS (wages, hours, payments).
  // No framework-level caching (Cache Components / PPR) — each request must
  // hit Supabase fresh under the caller's session. See docs/ARCHITECTURE.md §3.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
