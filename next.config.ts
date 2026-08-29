import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
