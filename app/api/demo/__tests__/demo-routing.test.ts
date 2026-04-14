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

  it("POST /chat with unknown question returns demo message", async () => {
    const res = await POST(
      makeRequest("chat", "POST", {
        messages: [{ role: "user", content: "Tell me a joke" }],
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
});
