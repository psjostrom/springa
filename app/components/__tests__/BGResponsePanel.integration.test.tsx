import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, waitFor } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";
import type { CalendarEvent } from "@/lib/types";
import type { BGResponseModel } from "@/lib/bgModel";
import { BGResponsePanel } from "../BGResponsePanel";
import "@/lib/__tests__/setup-dom";

const mockBGModel: BGResponseModel = {
  activitiesAnalyzed: 5,
  categories: {
    easy: {
      category: "easy",
      avgRate: -0.8,
      medianRate: -0.7,
      sampleCount: 20,
      activityCount: 3,
      avgFuelRate: 25,
      confidence: "medium",
    },
    long: null,
    interval: null,
  },
  observations: [],
  bgByStartLevel: [],
  bgByTime: [],
  bgByEntrySlope: [],
  targetFuelRates: [],
};

const mockEvents: CalendarEvent[] = [
  {
    id: "e1",
    activityId: "a1",
    date: new Date("2026-03-01"),
    name: "Easy run",
    description: "",
    type: "completed",
    category: "easy",
    streamData: { glucose: [{ time: 0, value: 6.0 }] },
  },
  {
    id: "e2",
    activityId: "a2",
    date: new Date("2026-03-02"),
    name: "Long run",
    description: "",
    type: "completed",
    category: "long",
    streamData: { glucose: [{ time: 0, value: 7.0 }] },
  },
  {
    id: "e3",
    activityId: "a3",
    date: new Date("2026-03-03"),
    name: "Interval",
    description: "",
    type: "completed",
    category: "interval",
    streamData: { glucose: [{ time: 0, value: 5.5 }] },
  },
  {
    id: "e4",
    activityId: "a4",
    date: new Date("2026-03-04"),
    name: "Easy run 2",
    description: "",
    type: "completed",
    category: "easy",
    streamData: { glucose: [{ time: 0, value: 6.2 }] },
  },
  {
    id: "e5",
    activityId: "a5",
    date: new Date("2026-03-05"),
    name: "Easy run 3",
    description: "",
    type: "completed",
    category: "easy",
    streamData: { glucose: [{ time: 0, value: 5.8 }] },
  },
];

afterEach(() => {
  server.resetHandlers();
});

describe("BGResponsePanel cross-run patterns", () => {
  it("shows Discover Patterns button when no patterns exist and enough events", async () => {
    server.use(
      http.get("/api/bg-patterns", () => {
        return HttpResponse.json({ patterns: null, latestActivityId: null });
      }),
    );

    render(<BGResponsePanel model={mockBGModel} events={mockEvents} />);

    await waitFor(() => {
      expect(screen.getByText("Discover Patterns")).toBeInTheDocument();
    });
  });

  it("discovers patterns when button is clicked", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;

    server.use(
      http.get("/api/bg-patterns", () => {
        return HttpResponse.json({ patterns: null, latestActivityId: null });
      }),
      http.post("/api/bg-patterns", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          patterns: "**Key insight:** Your BG drops faster on easy runs.",
          latestActivityId: "a5",
        });
      }),
    );

    render(<BGResponsePanel model={mockBGModel} events={mockEvents} />);

    // Wait for button to appear
    await waitFor(() => {
      expect(screen.getByText("Discover Patterns")).toBeInTheDocument();
    });

    // Click discover
    await user.click(screen.getByText("Discover Patterns"));

    // Wait for patterns to appear
    await waitFor(() => {
      expect(screen.getByText(/Key insight/)).toBeInTheDocument();
    });

    // Verify the POST body included events
    expect(capturedBody).toHaveProperty("events");
    expect((capturedBody as { events: unknown[] }).events).toHaveLength(5);
  });

  it("shows Re-analyze button when patterns exist", async () => {
    server.use(
      http.get("/api/bg-patterns", () => {
        return HttpResponse.json({
          patterns: "Existing patterns text.",
          latestActivityId: "a5",
        });
      }),
    );

    render(<BGResponsePanel model={mockBGModel} events={mockEvents} />);

    await waitFor(() => {
      expect(screen.getByText("Re-analyze")).toBeInTheDocument();
    });
    expect(screen.getByText("Existing patterns text.")).toBeInTheDocument();
  });

  it("re-analyzes patterns when Re-analyze button is clicked", async () => {
    const user = userEvent.setup();
    let callCount = 0;

    server.use(
      http.get("/api/bg-patterns", () => {
        return HttpResponse.json({
          patterns: "Original patterns.",
          latestActivityId: "a5",
        });
      }),
      http.post("/api/bg-patterns", () => {
        callCount++;
        return HttpResponse.json({
          patterns: `Updated patterns v${callCount}.`,
          latestActivityId: "a5",
        });
      }),
    );

    render(<BGResponsePanel model={mockBGModel} events={mockEvents} />);

    // Wait for initial patterns
    await waitFor(() => {
      expect(screen.getByText("Original patterns.")).toBeInTheDocument();
    });

    // Click re-analyze
    await user.click(screen.getByText("Re-analyze"));

    // Wait for updated patterns
    await waitFor(() => {
      expect(screen.getByText("Updated patterns v1.")).toBeInTheDocument();
    });

    expect(callCount).toBe(1);
  });

  it("shows loading state during analysis", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/bg-patterns", () => {
        return HttpResponse.json({ patterns: null, latestActivityId: null });
      }),
      http.post("/api/bg-patterns", async () => {
        // Delay to simulate loading state
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({
          patterns: "Done!",
          latestActivityId: "a5",
        });
      }),
    );

    render(<BGResponsePanel model={mockBGModel} events={mockEvents} />);

    // Wait for button
    await waitFor(() => {
      expect(screen.getByText("Discover Patterns")).toBeInTheDocument();
    });

    // Click discover
    await user.click(screen.getByText("Discover Patterns"));

    // Should show loading text
    await waitFor(() => {
      expect(screen.getByText(/Analyzing patterns/)).toBeInTheDocument();
    });

    // Loading should disappear and result should show
    await waitFor(() => {
      expect(screen.getByText("Done!")).toBeInTheDocument();
    });
  });

  it("shows error when analysis fails", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/bg-patterns", () => {
        return HttpResponse.json({ patterns: null, latestActivityId: null });
      }),
      http.post("/api/bg-patterns", () => {
        return HttpResponse.json(
          { error: "AI service unavailable" },
          { status: 500 },
        );
      }),
    );

    render(<BGResponsePanel model={mockBGModel} events={mockEvents} />);

    // Wait for button
    await waitFor(() => {
      expect(screen.getByText("Discover Patterns")).toBeInTheDocument();
    });

    // Click discover
    await user.click(screen.getByText("Discover Patterns"));

    // Should show error
    await waitFor(() => {
      expect(screen.getByText("AI service unavailable")).toBeInTheDocument();
    });
  });

  it("shows stale indicator when new data available", async () => {
    // Create events where the latest has a different activityId than saved
    const eventsWithNew = [
      ...mockEvents,
      {
        id: "e6",
        activityId: "a6-new",
        date: new Date("2026-03-06"),
        name: "New run",
        description: "",
        type: "completed" as const,
        category: "easy" as const,
        streamData: { glucose: [{ time: 0, value: 6.0 }] },
      },
    ];

    server.use(
      http.get("/api/bg-patterns", () => {
        return HttpResponse.json({
          patterns: "Old patterns.",
          latestActivityId: "a5", // Stale - doesn't match a6-new
        });
      }),
    );

    render(<BGResponsePanel model={mockBGModel} events={eventsWithNew} />);

    // Should show "New data — re-analyze" instead of just "Re-analyze"
    await waitFor(() => {
      expect(screen.getByText("New data — re-analyze")).toBeInTheDocument();
    });
  });
});
