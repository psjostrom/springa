import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Springa",
    short_name: "Springa",
    description:
      "Training planner and workout tracker with T1D blood glucose management, synced to Intervals.icu.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0a1a",
    theme_color: "#1a0a2e",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
