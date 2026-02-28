// --- Glooko API client ---
// Auth: v2 sign_in endpoint with extended deviceInformation (required for EU).
// Data: v3 histories endpoint — returns all data types in one call.
// EU server only (eu.api.glooko.com) — hardcoded for now.

const BASE_URL = "https://eu.api.glooko.com";
const LOGIN_PATH = "/api/v2/users/sign_in";
const HISTORIES_PATH = "/api/v3/users/summary/histories";

const DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json, text/plain, */*",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
  Referer: "https://eu.my.glooko.com/",
  Origin: "https://eu.my.glooko.com",
};

// --- Types ---

export interface GlookoSession {
  cookie: string;
  glookoCode: string;
  expiresAt: number; // ms timestamp
}

export interface GlookoBolus {
  pumpTimestamp: string; // ISO 8601
  insulinDelivered: number; // units
  carbsInput: number | null; // grams, null if no carbs entered
}

export interface GlookoData {
  boluses: GlookoBolus[];
}

// --- Session cache (in-memory, 23h TTL) ---

const SESSION_TTL_MS = 23 * 60 * 60 * 1000;
const sessionCache = new Map<string, GlookoSession>();

function getCachedSession(email: string): GlookoSession | null {
  const session = sessionCache.get(email);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessionCache.delete(email);
    return null;
  }
  return session;
}

// --- Auth ---

export async function signIn(
  email: string,
  password: string,
): Promise<GlookoSession> {
  // Check cache first
  const cached = getCachedSession(email);
  if (cached) return cached;

  const res = await fetch(`${BASE_URL}${LOGIN_PATH}`, {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({
      userLogin: { email, password },
      deviceInformation: {
        applicationType: "logbook",
        os: "android",
        osVersion: "33",
        device: "Google Pixel 4a",
        deviceManufacturer: "Google",
        deviceModel: "Pixel 4a",
        serialNumber: crypto.randomUUID().replace(/-/g, "").slice(0, 18),
        clinicalResearch: false,
        deviceId: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
        applicationVersion: "6.1.3",
        buildNumber: "0",
        gitHash: "g4fbed2011b",
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Glooko sign-in failed (${res.status}): ${text}`);
  }

  // Extract session cookie from Set-Cookie header
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Glooko sign-in: no session cookie returned");
  }

  const data = (await res.json()) as { userLogin?: { glookoCode?: string } };
  const glookoCode = data.userLogin?.glookoCode;
  if (!glookoCode) {
    throw new Error("Glooko sign-in: no glookoCode in response");
  }

  const session: GlookoSession = {
    cookie: setCookie.split(";")[0], // just the cookie value, not attributes
    glookoCode,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  sessionCache.set(email, session);
  return session;
}

/** Clear cached session (e.g. on auth failure during data fetch). */
export function clearSession(email: string): void {
  sessionCache.delete(email);
}

// --- Data fetching (v3 histories API) ---

// Response shape: { histories: [{ type, item, ... }] }
// Each entry has a `type` string and an `item` with the actual data.
interface HistoryEntry {
  type: string;
  item: Record<string, unknown>;
}

/** Fetch all insulin/meal data for a time window via v3 histories endpoint. */
export async function fetchGlookoData(
  session: GlookoSession,
  startDate: Date,
  endDate: Date,
): Promise<GlookoData> {
  const url = new URL(`${BASE_URL}${HISTORIES_PATH}`);
  url.searchParams.set("patient", session.glookoCode);
  url.searchParams.set("startDate", startDate.toISOString());
  url.searchParams.set("endDate", endDate.toISOString());

  const res = await fetch(url.toString(), {
    headers: {
      ...DEFAULT_HEADERS,
      Cookie: session.cookie,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Glooko histories failed (${res.status}): ${text}`);
  }

  const raw = await res.json() as { histories?: HistoryEntry[] };
  const histories = raw.histories ?? [];

  // Log discovered types on first fetch
  const types = [...new Set(histories.map((h) => h.type))];
  console.log(`Glooko histories: ${histories.length} entries, types: ${types.join(", ")}`);

  // Extract boluses from pumps_normal_boluses entries
  const boluses: GlookoBolus[] = histories
    .filter((h) => h.type === "pumps_normal_boluses")
    .map((h) => ({
      pumpTimestamp: h.item.pumpTimestamp as string,
      insulinDelivered: (h.item.insulinDelivered as number | null) ?? 0,
      carbsInput: (h.item.carbsInput as number | null) ?? null,
    }));

  const bolusCarbs = boluses.filter((b) => b.carbsInput != null && b.carbsInput > 0);
  console.log(
    `Glooko data: ${boluses.length} boluses (${bolusCarbs.length} with carbs: ${bolusCarbs.map((b) => `${b.carbsInput}g`).join(", ") || "none"})`,
  );

  return { boluses };
}
