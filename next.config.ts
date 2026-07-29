import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Pin Turbopack to this checkout. Git worktrees under .claude/worktrees/ otherwise
// inherit the parent repo lockfile and can silently serve the wrong tree during QA.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: projectRoot,
  },
  rewrites() {
    return [
      // Nightscout API uses .json suffix (e.g. /api/v1/entries.json, /api/v1/entries/sgv.json)
      {
        source: "/api/v1/entries/sgv.json",
        destination: "/api/v1/entries",
      },
      {
        source: "/api/v1/:path.json",
        destination: "/api/v1/:path",
      },
    ];
  },
};

export default nextConfig;
