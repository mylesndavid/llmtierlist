import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The value view is the home page now. The query string (e.g. ?preset=raw) passes through.
      { source: "/value", destination: "/", permanent: false },
    ];
  },
  experimental: {
    /**
     * Client-side router cache. Every page here is dynamic (vote state is
     * per-viewer), and Next defaults dynamic entries to 0s — so bouncing
     * between two pages seconds apart re-fetched both. Holding them briefly
     * makes back-and-forth navigation instant; anything older re-fetches.
     */
    staleTimes: {
      dynamic: 15,
      static: 300,
    },
  },
};

export default nextConfig;
