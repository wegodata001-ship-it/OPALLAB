import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow large dental scans (STL/ZIP) through route handlers / proxy.
    serverActions: {
      bodySizeLimit: "500mb",
    },
    proxyClientMaxBodySize: "500mb",
  },
};

export default nextConfig;
