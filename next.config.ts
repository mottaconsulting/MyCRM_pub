import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // LinkedIn Connections.csv uploads go through a server action; the default
    // 1 MB body limit is too small for large connection exports.
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
