// --- MyLife Cloud client ---
// Auth: ASP.NET Forms Auth (GET login page for tokens, POST credentials, follow dashboard redirect).
// Data: Logbook page — Telerik RadGrid with basal rates, boluses, carbs, hypo carbs.
// Session: cookie-based (.ASPXAUTH + ASP.NET_SessionId), cached in-memory with 12h TTL.

import * as cheerio from "cheerio";

const BASE_URL = "https://mylife-software.net";
const LOGIN_PATH = "/Pages/Login.aspx";
const DASHBOARD_PATH = "/Pages/Dashboard.aspx";
const LOGBOOK_PATH = "/Pages/Filterable/Logbook.aspx?ItemValue=logbook";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

// --- Types ---

export interface MyLifeSession {
  cookies: string;
  expiresAt: number; // ms timestamp
}

export type MyLifeEventType =
  | "Basal rate"
  | "Bolus"
  | "Carbohydrates"
  | "Hypo Carbohydrates";

export interface MyLifeEvent {
  timestamp: string; // ISO 8601
  type: MyLifeEventType;
  value: number; // U, U/h, or g depending on type
  unit: string; // "U", "U/h", "g carb"
  id: string; // GUID from hidden column
}

export interface MyLifeData {
  events: MyLifeEvent[];
}

// --- Session cache (in-memory, 12h TTL) ---

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessionCache = new Map<string, MyLifeSession>();

function getCachedSession(email: string): MyLifeSession | null {
  const session = sessionCache.get(email);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessionCache.delete(email);
    return null;
  }
  return session;
}

/** Clear cached session (e.g. on auth failure during data fetch). */
export function clearSession(email: string): void {
  sessionCache.delete(email);
}

// --- Cookie helpers ---

/** Merge Set-Cookie headers into a cookie map, skipping empty auth cookies (logout). */
function mergeCookies(
  cookieMap: Map<string, string>,
  setCookieHeaders: string[],
): void {
  for (const header of setCookieHeaders) {
    const pair = header.split(";")[0];
    const eqIdx = pair.indexOf("=");
    if (eqIdx < 0) continue;
    const name = pair.substring(0, eqIdx);
    const value = pair.substring(eqIdx + 1);
    // Skip empty .ASPXAUTH (logout cookie)
    if (name === ".ASPXAUTH" && !value) continue;
    cookieMap.set(name, pair);
  }
}

function cookieString(cookieMap: Map<string, string>): string {
  return [...cookieMap.values()].join("; ");
}

// --- Auth ---

export async function signIn(
  email: string,
  password: string,
): Promise<MyLifeSession> {
  const cached = getCachedSession(email);
  if (cached) {
    console.log("[MyLife] Using cached session for", email);
    return cached;
  }
  console.log("[MyLife] Signing in for", email);

  // Step 1: GET login page to extract ASP.NET tokens
  const loginGet = await fetch(`${BASE_URL}${LOGIN_PATH}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!loginGet.ok) {
    throw new Error(`MyLife login page failed (${loginGet.status})`);
  }

  const loginHtml = await loginGet.text();
  const cookieMap = new Map<string, string>();
  mergeCookies(cookieMap, loginGet.headers.getSetCookie());

  const $ = cheerio.load(loginHtml);
  const viewstate = $("#__VIEWSTATE").val() as string;
  const viewstateGen = $("#__VIEWSTATEGENERATOR").val() as string;
  const eventValidation = $("#__EVENTVALIDATION").val() as string;
  const reqToken = $('input[name="__RequestVerificationToken"]').val() as string;

  if (!viewstate || !eventValidation) {
    throw new Error("MyLife login page: missing ASP.NET form tokens");
  }

  // Step 2: POST login credentials
  const body = new URLSearchParams();
  body.set("__VIEWSTATE", viewstate);
  body.set("__VIEWSTATEGENERATOR", viewstateGen);
  body.set("__EVENTVALIDATION", eventValidation);
  body.set("__RequestVerificationToken", reqToken);
  body.set(
    "ctl00$conContent$UserLogin$lgnMylifeLogin$UserName",
    email,
  );
  body.set(
    "ctl00$conContent$UserLogin$lgnMylifeLogin$Password",
    password,
  );
  body.set(
    "ctl00$conContent$UserLogin$lgnMylifeLogin$LoginButton",
    "Log in",
  );

  const loginPost = await fetch(`${BASE_URL}${LOGIN_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieString(cookieMap),
      Origin: BASE_URL,
      Referer: `${BASE_URL}${LOGIN_PATH}`,
      "User-Agent": USER_AGENT,
    },
    body: body.toString(),
    redirect: "manual",
  });

  mergeCookies(cookieMap, loginPost.headers.getSetCookie());

  // Expect 302 redirect to Dashboard on success
  if (loginPost.status !== 302) {
    throw new Error(
      `MyLife sign-in failed (${loginPost.status}): expected redirect`,
    );
  }
  console.log("[MyLife] Login POST → 302 redirect OK");

  const authCookie = cookieMap.get(".ASPXAUTH");
  if (!authCookie) {
    throw new Error("MyLife sign-in: no .ASPXAUTH cookie returned");
  }

  // Step 3: Follow redirect to Dashboard (initializes server-side session state)
  const dashRes = await fetch(`${BASE_URL}${DASHBOARD_PATH}`, {
    headers: {
      Cookie: cookieString(cookieMap),
      Referer: `${BASE_URL}${LOGIN_PATH}`,
      "User-Agent": USER_AGENT,
    },
  });

  // Dashboard may set additional cookies
  mergeCookies(cookieMap, dashRes.headers.getSetCookie());

  // Consume body to avoid hanging connection
  await dashRes.text();

  const session: MyLifeSession = {
    cookies: cookieString(cookieMap),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  sessionCache.set(email, session);
  console.log("[MyLife] Sign-in complete, session cached (12h TTL)");
  return session;
}

// --- Data fetching ---

const KNOWN_EVENT_TYPES = new Set<string>([
  "Basal rate",
  "Bolus",
  "Carbohydrates",
  "Hypo Carbohydrates",
]);

/**
 * Compute UTC offset string (e.g. "+01:00") for a timezone at a given date.
 * Handles DST transitions correctly via Intl.
 */
function tzOffset(tz: string, date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const gmtPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  // "GMT+01:00" → "+01:00", "GMT" (UTC) → "+00:00"
  return gmtPart === "GMT" ? "+00:00" : gmtPart.replace("GMT", "");
}

/** Parse date + time from MyLife logbook format into ISO 8601 with timezone offset. */
function parseMyLifeDateTime(date: string, time: string, tz: string): string {
  // date = "01.03.26" (DD.MM.YY), time = "08:42"
  const [day, month, year] = date.split(".");
  // Use a rough UTC date to determine DST status for the offset
  const rough = new Date(`20${year}-${month}-${day}T12:00:00Z`);
  const offset = tzOffset(tz, rough);
  return `20${year}-${month}-${day}T${time}:00${offset}`;
}

/** Parse value string like "5.00 U", "1.36 U/h", "60 g carb" into { value, unit }. */
function parseValue(raw: string): { value: number; unit: string } {
  const match = /^([\d.]+)\s*(.+)$/.exec(raw);
  if (!match) return { value: 0, unit: raw };
  return { value: parseFloat(match[1]), unit: match[2].trim() };
}

/**
 * Fetch logbook data from MyLife Cloud.
 * The logbook page defaults to "Last 14 days" which is sufficient for
 * the 5-hour IOB lookback window. The session must be initialized via
 * signIn() first (which visits Dashboard to set up server state).
 *
 * @param session - authenticated MyLife session
 * @param timezone - IANA timezone for the logbook timestamps (e.g. "Europe/Stockholm")
 */
export async function fetchMyLifeData(
  session: MyLifeSession,
  timezone = "Europe/Stockholm",
): Promise<MyLifeData> {
  const res = await fetch(`${BASE_URL}${LOGBOOK_PATH}`, {
    headers: {
      Cookie: session.cookies,
      Referer: `${BASE_URL}${DASHBOARD_PATH}`,
      "User-Agent": USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`MyLife logbook failed (${res.status})`);
  }

  const html = await res.text();
  console.log("[MyLife] Logbook HTML size:", html.length, "bytes");
  const $ = cheerio.load(html);

  // Detect expired session: ASP.NET redirects to login page (200 + login form)
  if ($("#__VIEWSTATE").length > 0 && $("tr.rgRow, tr.rgAltRow").length === 0) {
    throw new Error("MyLife session expired (login page returned instead of logbook)");
  }

  const rows = $("tr.rgRow, tr.rgAltRow");
  console.log("[MyLife] Found", rows.length, "table rows");

  const events: MyLifeEvent[] = [];

  rows.each((_i, row) => {
    const cols = $(row).find("td");
    const date = $(cols[1]).text().trim();
    const time = $(cols[2]).text().trim();
    const type = $(cols[3]).find(".event-type-title").text().trim();
    const rawValue = $(cols[4]).text().trim();
    const hiddenId = $(cols[cols.length - 1]).text().trim();

    if (!date || !time || !KNOWN_EVENT_TYPES.has(type)) return;

    const { value, unit } = parseValue(rawValue);

    events.push({
      timestamp: parseMyLifeDateTime(date, time, timezone),
      type: type as MyLifeEventType,
      value,
      unit,
      id: hiddenId,
    });
  });

  // Log summary
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }
  console.log(
    `MyLife logbook: ${events.length} events (${Object.entries(counts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")})`,
  );

  return { events };
}
