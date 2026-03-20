import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  rewrites() {
    return [
      // Nightscout API uses .json suffix (e.g. /api/v1/entries.json)
      {
        source: "/api/v1/:path.json",
        destination: "/api/v1/:path",
      },
    ];
  },
};

export default nextConfig;
