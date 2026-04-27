import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen } from "@/lib/__tests__/test-utils";
import { server } from "@/lib/__tests__/msw/server";
import { settingsAtom } from "@/app/atoms";
import type { UserSettings } from "@/lib/settings";
import { getSharedCalendarWindow } from "@/lib/sharedCalendarData";
import { useSharedCalendarData } from "../useSharedCalendarData";

function CalendarProbe({ renderTick }: { renderTick: number }) {
  const { events, error, isLoading } = useSharedCalendarData();
  const window = getSharedCalendarWindow();

  if (error) return <div>{error}</div>;
  if (isLoading) {
    return (
      <div>
        <div data-testid="window">{window.oldest}|{window.newest}</div>
        <div>loading-{renderTick}</div>
      </div>
    );
  }

  return (
    <div>
      <div data-testid="window">{window.oldest}|{window.newest}</div>
      <div>{events[0]?.name ?? "no-events"}</div>
    </div>
  );
}

describe("useSharedCalendarData", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refetches when the shared calendar window changes", async () => {
    const requestedWindows: string[] = [];

    server.use(
      http.get("/api/intervals/calendar", ({ request }) => {
        const url = new URL(request.url);
        const oldest = url.searchParams.get("oldest") ?? "missing-oldest";
        const newest = url.searchParams.get("newest") ?? "missing-newest";
        requestedWindows.push(`${oldest}|${newest}`);

        return HttpResponse.json([
          {
            id: `event-${oldest}`,
            date: `${oldest}T10:00:00.000Z`,
            name: `${oldest}|${newest}`,
            description: "",
            type: "planned",
            category: "easy",
          },
        ]);
      }),
    );

    vi.setSystemTime(new Date("2026-02-15T12:00:00Z"));

    const { rerender } = render(<CalendarProbe key={0} renderTick={0} />, {
      atomInits: [[settingsAtom, { intervalsConnected: true } as UserSettings]],
    });

    expect(await screen.findByText("2024-02-01|2026-08-31")).toBeInTheDocument();
    expect(screen.getByTestId("window")).toHaveTextContent("2024-02-01|2026-08-31");

    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
    rerender(<CalendarProbe key={1} renderTick={1} />);

    expect(screen.getByTestId("window")).toHaveTextContent("2024-03-01|2026-09-30");
    expect(await screen.findByText("2024-03-01|2026-09-30")).toBeInTheDocument();
    expect(requestedWindows).toEqual([
      "2024-02-01|2026-08-31",
      "2024-03-01|2026-09-30",
    ]);
  });
});