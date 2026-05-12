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
 * Fetch BG entries for many disjoint windows. Returns a flat sorted-ASC array
 * of trimmed readings (`ts`, `mmol` only); callers partition per window using
 * `findReadingsInWindow` if they need per-window slices.
 *
 * Two paths, capability-detected per server:
 *  - **Scout batch** (`/api/v1/entries/batch`) — single round trip, Scout-only.
 *    Tried first; on 404 we mark the server as vanilla and fall through.
 *  - **Vanilla NS** (`/api/v1/entries.json` per window) — N round trips at
 *    bounded concurrency. Slower, but works against any Nightscout-compatible
 *    server, preserving Springa's "pure NS consumer" architecture promise.
 *
 * The capability decision is cached per-nsUrl in module memory for the
 * process lifetime — no probe overhead after the first call.
 */
export async function fetchBGBatchFromNS(
  nsUrl: string,
  apiSecret: string,
  windows: { since: number; until: number }[],
): Promise<Pick<BGReading, "ts" | "mmol">[]> {
  if (windows.length === 0) return [];
  const normalized = normalizeNSUrl(nsUrl);
  const known = batchCapability.get(normalized);

  if (known !== "vanilla") {
    try {
      const result = await fetchBGBatchScout(normalized, apiSecret, windows);
      batchCapability.set(normalized, "scout");
      return result;
    } catch (err) {
      if (err instanceof BatchUnsupportedError) {
        // Server doesn't speak Scout's batch dialect. Remember and fall through.
        batchCapability.set(normalized, "vanilla");
      } else {
        // Genuine error (auth, network, 5xx). Don't switch modes — the next
        // call should retry batch since Scout is presumably still the right
        // path, just temporarily unhappy.
        throw err;
      }
    }
  }

  return fetchBGBatchVanillaNS(normalized, apiSecret, windows);
}

type BatchCapability = "scout" | "vanilla";
const batchCapability = new Map<string, BatchCapability>();

class BatchUnsupportedError extends Error {
  constructor() { super("Nightscout server does not support /api/v1/entries/batch"); }
}

async function fetchBGBatchScout(
  nsUrl: string,
  apiSecret: string,
  windows: { since: number; until: number }[],
): Promise<Pick<BGReading, "ts" | "mmol">[]> {
  const url = new URL("/api/v1/entries/batch", nsUrl);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "api-secret": apiSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ windows }),
  });

  // 404 from any vanilla NS = "this endpoint doesn't exist". Distinguish from
  // 404 on a request-specific resource (which Scout's batch endpoint never
  // returns) by treating any 404 here as "wrong server type".
  if (response.status === 404) throw new BatchUnsupportedError();
  if (!response.ok) {
    throw new Error(`Nightscout batch fetch failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as { readings?: { ts: number; mmol: number }[] };
  return json.readings ?? [];
}

// Concurrency bound for the vanilla-NS fallback. NS rate limits are
// per-server; 5 in-flight requests is conservative and well within the
// limits any real Nightscout install applies.
const VANILLA_NS_CONCURRENCY = 5;
const VANILLA_NS_COUNT = 10000;

async function fetchBGBatchVanillaNS(
  nsUrl: string,
  apiSecret: string,
  windows: { since: number; until: number }[],
): Promise<Pick<BGReading, "ts" | "mmol">[]> {
  const perWindow = await mapWithConcurrency(
    windows,
    VANILLA_NS_CONCURRENCY,
    async (w) => {
      const readings = await fetchBGFromNS(nsUrl, apiSecret, {
        since: w.since,
        until: w.until,
        count: VANILLA_NS_COUNT,
      });
      return readings.map((r) => ({ ts: r.ts, mmol: r.mmol }));
    },
  );

  // Activity windows can overlap (back-to-back runs share padding). Dedupe
  // by ts so the flat output matches Scout's batch shape exactly.
  const seen = new Set<number>();
  const flat: { ts: number; mmol: number }[] = [];
  for (const arr of perWindow) {
    for (const r of arr) {
      if (!seen.has(r.ts)) {
        seen.add(r.ts);
        flat.push(r);
      }
    }
  }
  flat.sort((a, b) => a.ts - b.ts);
  return flat;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const slice = items.slice(i, i + limit);
    const sliceResults = await Promise.all(slice.map(fn));
    results.push(...sliceResults);
  }
  return results;
}

/**
 * Test-only helper to clear the per-nsUrl capability cache between cases.
 * Production code never calls this — capability is cached for the process
 * lifetime by design.
 */
export function _resetBatchCapabilityCacheForTests(): void {
  batchCapability.clear();
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
