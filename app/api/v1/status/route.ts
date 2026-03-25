import { NextResponse } from "next/server";

/**
 * GET /api/v1/status.json — Nightscout-compatible status endpoint.
 *
 * Public (no auth required). Clients use this to verify the server
 * is alive and discover supported features.
 */
export function GET() {
  const now = new Date();

  return NextResponse.json({
    status: "ok",
    name: "Springa",
    version: "0.1.0",
    serverTime: now.toISOString(),
    serverTimeEpoch: now.getTime(),
    apiEnabled: true,
    settings: {
      units: "mmol",
      timeFormat: 24,
      customTitle: "Springa",
      theme: "colors",
      enable: ["careportal", "rawbg", "iob"],
    },
  });
}
