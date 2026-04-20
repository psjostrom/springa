import { describe, it, expect } from "vitest";
import { GET, POST, PUT, DELETE } from "../[...path]/route";

function makeRequest(path: string, method = "GET", body?: unknown): Request {
  const url = `http://localhost:3000/api/demo/${path}`;
  return new Request(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeParams(path: string) {
  return { params: Promise.resolve({ path: path.split("/") }) };
}

describe("demo catch-all route", () => {
  it("GET /settings returns fixture with demo flag", async () => {
    const res = await GET(makeRequest("settings"), makeParams("settings"));
    const data = await res.json();
    expect(data.demo).toBe(true);
    expect(data.email).toBe("demo@springa.run");
    expect(data.onboardingComplete).toBe(true);
    expect(data.diabetesMode).toBe(true);
  });

  it("GET /bg returns readings with resolved timestamps", async () => {
    const res = await GET(makeRequest("bg"), makeParams("bg"));
    const data = await res.json();
    expect(data.readings).toBeDefined();
    expect(data.current).toBeDefined();
    expect(data.trend).toBeDefined();
    // Timestamps should be absolute (positive), not relative (negative)
    if (data.readings.length > 0) {
      expect(data.readings[0].ts).toBeGreaterThan(0);
    }
  });

  it("GET /unknown-route returns 404", async () => {
    const res = await GET(makeRequest("nonexistent"), makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("PUT returns demo: true without side effects", async () => {
    const res = PUT();
    const data = await res.json();
    expect(data).toEqual({ ok: true, demo: true });
  });

  it("DELETE returns demo: true", async () => {
    const res = DELETE();
    const data = await res.json();
    expect(data).toEqual({ ok: true, demo: true });
  });

  it("POST /chat with unknown first question returns canned fallback", async () => {
    const res = await POST(
      makeRequest("chat", "POST", {
        messages: [{ role: "user", content: "Tell me a joke" }],
      }),
      makeParams("chat"),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    // First message falls back to canned response (not demo message)
    expect(text).toContain("training companion");
  });

  it("POST /chat with follow-up question returns demo message", async () => {
    const res = await POST(
      makeRequest("chat", "POST", {
        messages: [
          { role: "user", content: "What can Springa do?" },
          { role: "assistant", content: "..." },
          { role: "user", content: "Tell me more" },
        ],
      }),
      makeParams("chat"),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("demo mode");
  });

  it("POST /chat with pre-filled question returns canned response", async () => {
    const res = await POST(
      makeRequest("chat", "POST", {
        messages: [{ role: "user", content: "What can Springa do for me?" }],
      }),
      makeParams("chat"),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("training companion");
  });

  it("POST /intervals/streams returns stream fixtures", async () => {
    const res = await POST(
      makeRequest("intervals/streams", "POST", { activityIds: ["i123"] }),
      makeParams("intervals/streams"),
    );
    const data = await res.json();
    expect(data).toBeDefined();
    expect(typeof data).toBe("object");
  });

  it("POST to non-chat non-streams route returns demo: true", async () => {
    const res = await POST(
      makeRequest("intervals/events/replace", "POST", { workout: {} }),
      makeParams("intervals/events/replace"),
    );
    const data = await res.json();
    expect(data).toEqual({ ok: true, demo: true });
  });

  it("GET /intervals/calendar shifts dates relative to today", async () => {
    const res = await GET(makeRequest("intervals/calendar"), makeParams("intervals/calendar"));
    const data = (await res.json()) as { date?: string }[];
    expect(Array.isArray(data)).toBe(true);
    if (data.length === 0) return;

    // Find an event with a date — it should be near today, not the snapshot date
    const withDate = data.find((e) => e.date);
    expect(withDate).toBeDefined();
    const eventYear = new Date(withDate!.date!).getFullYear();
    const thisYear = new Date().getFullYear();
    // Shifted dates should be in the current year (±1 for edge cases)
    expect(Math.abs(eventYear - thisYear)).toBeLessThanOrEqual(1);
  });

  it("GET /settings includes hrZones", async () => {
    const res = await GET(makeRequest("settings"), makeParams("settings"));
    const data = (await res.json()) as { hrZones?: number[]; maxHr?: number };
    expect(data.hrZones).toBeDefined();
    expect(data.hrZones).toHaveLength(5);
    // Zones should be monotonically increasing
    for (let i = 1; i < data.hrZones!.length; i++) {
      expect(data.hrZones![i]).toBeGreaterThan(data.hrZones![i - 1]);
    }
  });

  it("GET /insulin-context resolves relative timestamps including updated", async () => {
    const res = await GET(makeRequest("insulin-context"), makeParams("insulin-context"));
    const data = (await res.json()) as { iob: number; updated: number };
    // updated is either 0 (no IOB data captured) or a resolved absolute timestamp
    expect(data.updated).toBeGreaterThanOrEqual(0);
    expect(typeof data.updated).toBe("number");
  });

  it("date shifting preserves date-only string format", async () => {
    // Settings has raceDate as "YYYY-MM-DD" — should not get time appended
    // (settings currently skips shiftDates, but verify the function works for date-only strings)
    const res = await GET(makeRequest("settings"), makeParams("settings"));
    const data = (await res.json()) as { raceDate?: string };
    if (data.raceDate) {
      expect(data.raceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
