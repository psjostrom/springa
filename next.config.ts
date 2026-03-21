import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  rewrites() {
    return [
      // Specific rewrites before generic wildcard (first match wins)
      // Nightscout /api/v1/entries/sgv.json → /api/sgv
      {
        source: "/api/v1/entries/sgv.json",
        destination: "/api/sgv",
      },
      // Nightscout API uses .json suffix (e.g. /api/v1/entries.json)
      {
        source: "/api/v1/:path.json",
        destination: "/api/v1/:path",
      },
    ];
  },
};

export default nextConfig;
