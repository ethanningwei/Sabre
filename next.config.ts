import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the floating dev badge sits on top of the bottom nav
  devIndicators: false,
  turbopack: { root: __dirname },
  experimental: {
    // Keep visited pages for 30s so switching back to a tab is instant.
    // Your own edits clear this (server actions revalidate), and generating
    // a parade state always reads fresh data on the server.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
