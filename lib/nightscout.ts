import { MGDL_TO_MMOL } from "./constants";
import type { BGReading } from "./cgm";

/** Normalize a NS URL: add https:// if missing, strip trailing slash. */
export function normalizeNSUrl(raw: string): string {
  let url = raw.trim();
  while (url.endsWith("/")) url = url.slice(0, -1);
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  return url;
}

/**
 * Generic fetch from any Nightscout-compatible server.
 * Sends api-secret header for authentication.
 */
export async function fetchFromNS<T>(
  nsUrl: string,
  apiSecret: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(path, normalizeNSUrl(nsUrl));
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      "api-secret": apiSecret,
    },
  });

  if (!response.ok) {
    throw new Error(`Nightscout fetch failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Validate a Nightscout URL by hitting the public status endpoint.
 * Returns valid:true if the server responds successfully.
 */
export async function validateNSConnection(
  nsUrl: string,
): Promise<{ valid: boolean; name?: string; error?: string }> {
  try {
    const url = new URL("/api/v1/status.json", normalizeNSUrl(nsUrl));
    const response = await fetch(url.toString());

    if (!response.ok) {
      return {
        valid: false,
        error: `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as { name?: string };
    return {
      valid: true,
      name: data.name,
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

interface NSEntry {
  sgv: number;
  date?: number;
  dateString?: string;
  direction?: string;
  delta?: number;
}

/**
 * Fetch BG entries from Nightscout and map to BGReading format.
 */
export async function fetchBGFromNS(
  nsUrl: string,
  apiSecret: string,
  opts: { since?: number; until?: number; count?: number },
): Promise<BGReading[]> {
  const params: Record<string, string> = {};

  if (opts.count) {
    params.count = String(opts.count);
  }
  if (opts.since) {
    params["find[date][$gt]"] = String(opts.since);
  }
  if (opts.until) {
    params["find[date][$lt]"] = String(opts.until);
  }

  const entries = await fetchFromNS<NSEntry[]>(
    nsUrl,
    apiSecret,
    "/api/v1/entries.json",
    params,
  );

  return entries.map((entry) => {
    const rawTs =
      typeof entry.date === "number"
        ? entry.date
        : typeof entry.dateString === "string"
          ? new Date(entry.dateString).getTime()
          : Date.now();

    const ts = isNaN(rawTs) ? Date.now() : rawTs;

    return {
      sgv: entry.sgv,
      mmol: Math.round((entry.sgv / MGDL_TO_MMOL) * 10) / 10,
      ts,
      direction: entry.direction ?? "NONE",
      delta: typeof entry.delta === "number" ? entry.delta : 0,
    };
  });
}

/**
 * Fetch treatments from Nightscout.
 */
export async function fetchTreatmentsFromNS(
  nsUrl: string,
  apiSecret: string,
  opts: { since?: number; until?: number; count?: number; eventType?: string },
): Promise<Record<string, unknown>[]> {
  const params: Record<string, string> = {};

  if (opts.count) {
    params.count = String(opts.count);
  }
  if (opts.since) {
    params["find[created_at][$gte]"] = String(opts.since);
  }
  if (opts.until) {
    params["find[created_at][$lte]"] = String(opts.until);
  }
  if (opts.eventType) {
    params["find[eventType]"] = opts.eventType;
  }

  return fetchFromNS<Record<string, unknown>[]>(
    nsUrl,
    apiSecret,
    "/api/v1/treatments.json",
    params,
  );
}
