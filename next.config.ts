import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the floating dev badge sits on top of the bottom nav
  devIndicators: false,
  turbopack: { root: __dirname },
};

export default nextConfig;
