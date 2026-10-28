import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep acceptance builds separate from a running development server.
  distDir: process.env.FLOWMEDIC_VERIFY_BUILD === "1" ? "build/verify" : ".next",
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
