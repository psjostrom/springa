import { useEffect } from "react";
import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { useSetAtom } from "jotai";
import { render, screen } from "@/lib/__tests__/test-utils";
import { calendarEventsAtom } from "@/app/atoms";
import type { CalendarEvent } from "@/lib/types";
import { UnratedRunBanner } from "../UnratedRunBanner";

function makeCompletedRun(activityId: string, name: string, date: string): CalendarEvent {
  return {
    id: `activity-${activityId}`,
    date: new Date(date),
    name,
    description: "",
    type: "completed",
    category: "easy",
    activityId,
    rating: null,
  };
}

function BannerHarness({ events }: { events: CalendarEvent[] }) {
  const setCalendarEvents = useSetAtom(calendarEventsAtom);

  useEffect(() => {
    setCalendarEvents(events);
  }, [events, setCalendarEvents]);

  return <UnratedRunBanner />;
}

describe("UnratedRunBanner", () => {
  it("shows again when a new unrated run replaces a dismissed one", async () => {
    const user = userEvent.setup();
    const firstRun = makeCompletedRun("activity-1", "W04 Easy", "2026-04-23T09:00:00Z");
    const secondRun = makeCompletedRun("activity-2", "W05 Long", "2026-04-24T09:00:00Z");

    const { rerender } = render(<BannerHarness events={[firstRun]} />);

    expect(await screen.findByText("W04 Easy")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("W04 Easy")).not.toBeInTheDocument();

    rerender(<BannerHarness events={[firstRun, secondRun]} />);

    expect(await screen.findByText("W05 Long")).toBeInTheDocument();
    expect(screen.queryByText("W04 Easy")).not.toBeInTheDocument();
  });
});