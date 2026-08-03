import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow large dental scans (STL/ZIP) on create-order upload.
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;
