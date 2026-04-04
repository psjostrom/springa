import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import {
  fetchFromNS,
  validateNSConnection,
  fetchBGFromNS,
  fetchTreatmentsFromNS,
} from "../nightscout";

const TEST_NS_URL = "https://test.nightscout.local";
const TEST_API_SECRET = "test-secret-12345";

describe("fetchFromNS", () => {
  it("sends api-secret header correctly", async () => {
    let capturedHeaders: Headers | undefined;

    server.use(
      http.get(`${TEST_NS_URL}/api/v1/test`, ({ request }) => {
        capturedHeaders = request.headers;
        return HttpResponse.json({ success: true });
      }),
    );

    await fetchFromNS(TEST_NS_URL, TEST_API_SECRET, "/api/v1/test");

    expect(capturedHeaders?.get("api-secret")).toBe(TEST_API_SECRET);
  });

  it("passes query params correctly", async () => {
    let capturedUrl: string | undefined;

    server.use(
      http.get(`${TEST_NS_URL}/api/v1/test`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ success: true });
      }),
    );

    await fetchFromNS(TEST_NS_URL, TEST_API_SECRET, "/api/v1/test", {
      count: "10",
      "find[date][$gt]": "1234567890",
    });

    expect(capturedUrl).toContain("count=10");
    expect(capturedUrl).toContain("find%5Bdate%5D%5B%24gt%5D=1234567890");
  });

  it("throws on non-OK response", async () => {
    server.use(
      http.get(`${TEST_NS_URL}/api/v1/test`, () => {
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(
      fetchFromNS(TEST_NS_URL, TEST_API_SECRET, "/api/v1/test"),
    ).rejects.toThrow("Nightscout fetch failed: 401");
  });
});

describe("validateNSConnection", () => {
  it("returns valid:true for healthy NS", async () => {
    server.use(
      http.get(`${TEST_NS_URL}/api/v1/status.json`, () => {
        return HttpResponse.json({ name: "Test NS", status: "ok" });
      }),
    );

    const result = await validateNSConnection(TEST_NS_URL);

    expect(result.valid).toBe(true);
    expect(result.name).toBe("Test NS");
    expect(result.error).toBeUndefined();
  });

  it("returns valid:false for unreachable NS", async () => {
    server.use(
      http.get(`${TEST_NS_URL}/api/v1/status.json`, () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const result = await validateNSConnection(TEST_NS_URL);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("HTTP 500");
  });

  it("returns valid:false on network error", async () => {
    server.use(
      http.get(`${TEST_NS_URL}/api/v1/status.json`, () => {
        return HttpResponse.error();
      }),
    );

    const result = await validateNSConnection(TEST_NS_URL);

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("fetchBGFromNS", () => {
  it("maps NS entries to BGReading format", async () => {
    server.use(
      http.get(`${TEST_NS_URL}/api/v1/entries.json`, () => {
        return HttpResponse.json([
          {
            sgv: 180,
            date: 1640000000000,
            direction: "Flat",
            delta: 0,
          },
          {
            sgv: 90,
            date: 1640000300000,
            direction: "FortyFiveDown",
            delta: -5,
          },
        ]);
      }),
    );

    const readings = await fetchBGFromNS(TEST_NS_URL, TEST_API_SECRET, {});

    expect(readings).toHaveLength(2);

    // First reading: 180 mg/dL → 10.0 mmol/L (180 / 18.018 = 9.99...)
    expect(readings[0].sgv).toBe(180);
    expect(readings[0].mmol).toBe(10.0);
    expect(readings[0].ts).toBe(1640000000000);
    expect(readings[0].direction).toBe("Flat");
    expect(readings[0].delta).toBe(0);

    // Second reading: 90 mg/dL → 5.0 mmol/L
    expect(readings[1].sgv).toBe(90);
    expect(readings[1].mmol).toBe(5.0);
    expect(readings[1].ts).toBe(1640000300000);
    expect(readings[1].direction).toBe("FortyFiveDown");
    expect(readings[1].delta).toBe(-5);
  });

  it("passes query params correctly", async () => {
    let capturedUrl: string | undefined;

    server.use(
      http.get(`${TEST_NS_URL}/api/v1/entries.json`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      }),
    );

    await fetchBGFromNS(TEST_NS_URL, TEST_API_SECRET, {
      since: 1640000000000,
      until: 1640100000000,
      count: 100,
    });

    expect(capturedUrl).toContain("count=100");
    expect(capturedUrl).toContain("find%5Bdate%5D%5B%24gt%5D=1640000000000");
    expect(capturedUrl).toContain("find%5Bdate%5D%5B%24lt%5D=1640100000000");
  });

  it("handles missing direction and delta", async () => {
    server.use(
      http.get(`${TEST_NS_URL}/api/v1/entries.json`, () => {
        return HttpResponse.json([
          {
            sgv: 100,
            date: 1640000000000,
          },
        ]);
      }),
    );

    const readings = await fetchBGFromNS(TEST_NS_URL, TEST_API_SECRET, {});

    expect(readings[0].direction).toBe("NONE");
    expect(readings[0].delta).toBe(0);
  });
});

describe("fetchTreatmentsFromNS", () => {
  it("passes created_at query params", async () => {
    let capturedUrl: string | undefined;

    server.use(
      http.get(`${TEST_NS_URL}/api/v1/treatments.json`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      }),
    );

    await fetchTreatmentsFromNS(TEST_NS_URL, TEST_API_SECRET, {
      since: 1640000000000,
      until: 1640100000000,
      count: 50,
    });

    expect(capturedUrl).toContain("count=50");
    expect(capturedUrl).toContain("find%5Bcreated_at%5D%5B%24gte%5D=1640000000000");
    expect(capturedUrl).toContain("find%5Bcreated_at%5D%5B%24lte%5D=1640100000000");
  });

  it("passes eventType filter", async () => {
    let capturedUrl: string | undefined;

    server.use(
      http.get(`${TEST_NS_URL}/api/v1/treatments.json`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      }),
    );

    await fetchTreatmentsFromNS(TEST_NS_URL, TEST_API_SECRET, {
      eventType: "Meal Bolus",
    });

    expect(capturedUrl).toContain("find%5BeventType%5D=Meal+Bolus");
  });

  it("returns treatments as raw objects", async () => {
    server.use(
      http.get(`${TEST_NS_URL}/api/v1/treatments.json`, () => {
        return HttpResponse.json([
          {
            _id: "t1",
            eventType: "Meal Bolus",
            insulin: 5,
            carbs: 40,
            created_at: "2021-12-20T12:00:00.000Z",
          },
          {
            _id: "t2",
            eventType: "Temp Basal",
            duration: 30,
            created_at: "2021-12-20T13:00:00.000Z",
          },
        ]);
      }),
    );

    const treatments = await fetchTreatmentsFromNS(TEST_NS_URL, TEST_API_SECRET, {});

    expect(treatments).toHaveLength(2);
    expect(treatments[0]).toEqual({
      _id: "t1",
      eventType: "Meal Bolus",
      insulin: 5,
      carbs: 40,
      created_at: "2021-12-20T12:00:00.000Z",
    });
    expect(treatments[1]).toEqual({
      _id: "t2",
      eventType: "Temp Basal",
      duration: 30,
      created_at: "2021-12-20T13:00:00.000Z",
    });
  });
});
