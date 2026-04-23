import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@/lib/__tests__/test-utils";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";
import type { CalendarEvent } from "@/lib/types";
import type { BGResponseModel } from "@/lib/bgModel";
import { settingsAtom } from "@/app/atoms";
import { RunAnalysis } from "../RunAnalysis";
import "@/lib/__tests__/setup-dom";

const event: CalendarEvent = {
  id: "activity-act-1",
  activityId: "act-1",
  date: new Date("2026-04-10T08:00:00Z"),
  name: "Easy Run",
  description: "",
  type: "completed",
  category: "easy",
  distance: 6500,
  duration: 2700,
  avgHr: 145,
  glucose: [
    { time: 0, value: 8.0 },
    { time: 30, value: 7.2 },
  ],
};

const bgModel: BGResponseModel = {
  activitiesAnalyzed: 3,
  categories: { easy: null, long: null, interval: null },
  observations: [],
  bgByStartLevel: [],
  bgByEntrySlope: [],
  bgByTime: [],
  targetFuelRates: [],
};

describe("RunAnalysis", () => {
  it("refetches analysis when bg model context becomes available", async () => {
    const requestBodies: unknown[] = [];

    server.use(
      http.post("/api/run-analysis", async ({ request }) => {
        requestBodies.push(await request.json());
        const callNumber = requestBodies.length;
        return HttpResponse.json({
          analysis: callNumber === 1 ? "Initial analysis" : "Enriched analysis",
        });
      }),
    );

    const { rerender } = render(
      <RunAnalysis event={event} bgModel={null} runBGContext={null} />,
      {
        atomInits: [[settingsAtom, { diabetesMode: true }]],
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Initial analysis")).toBeInTheDocument();
    });

    rerender(<RunAnalysis event={event} bgModel={bgModel} runBGContext={null} />);

    await waitFor(() => {
      expect(screen.getByText("Enriched analysis")).toBeInTheDocument();
    });

    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[0]).toMatchObject({ regenerate: false });
    expect(requestBodies[0]).not.toHaveProperty("bgModelSummary");
    expect(requestBodies[1]).toMatchObject({ regenerate: false });
    expect(requestBodies[1]).toHaveProperty("bgModelSummary");
  });
});