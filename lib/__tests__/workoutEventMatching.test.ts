import { expect, it } from "vitest";
import {
  findAuthoritativeWorkoutEventMatch,
  findWorkoutEventMatch,
} from "@/lib/workoutEventMatching";
import type { IntervalsActivity, IntervalsEvent } from "@/lib/types";

function workoutEvent(overrides: Partial<IntervalsEvent>): IntervalsEvent {
  return {
    id: 1,
    category: "WORKOUT",
    start_date_local: "2026-05-10T10:00:00",
    ...overrides,
  } as IntervalsEvent;
}

function activity(overrides: Partial<IntervalsActivity>): IntervalsActivity {
  return {
    id: "act-1",
    start_date: "2026-05-10T08:00:00Z",
    start_date_local: "2026-05-10T10:00:00",
    name: "W13 Easy",
    ...overrides,
  } as IntervalsActivity;
}

it("prefers authoritative pair links over fallback matching", () => {
  const act = activity({ id: "act-42", paired_event_id: 202 });
  const events = [
    workoutEvent({ id: 101, name: "W13 Easy", paired_activity_id: "act-42" }),
    workoutEvent({ id: 202, name: "W13 Easy" }),
  ];

  const match = findAuthoritativeWorkoutEventMatch(act, events);
  expect(match?.id).toBe(101);
});

it("uses fallback tie-break by day, then time, then event id", () => {
  const act = activity({
    name: "W13 Easy",
    start_date_local: "2026-05-10T10:00:00",
  });
  const events = [
    workoutEvent({ id: 300, name: "W13 Easy", start_date_local: "2026-05-09T10:00:00" }),
    workoutEvent({ id: 250, name: "W13 Easy", start_date_local: "2026-05-10T10:30:00" }),
    workoutEvent({ id: 249, name: "W13 Easy", start_date_local: "2026-05-10T10:30:00" }),
  ];

  const result = findWorkoutEventMatch(act, events);
  expect(result.matchingEvent?.id).toBe(249);
  expect(result.fallbackMatch?.id).toBe(249);
});

it("rejects claimed and already-paired events during fallback", () => {
  const act = activity({ name: "W13 Easy" });
  const events = [
    workoutEvent({ id: 201, name: "W13 Easy", paired_activity_id: "other-act" }),
    workoutEvent({ id: 202, name: "W13 Easy" }),
  ];

  const result = findWorkoutEventMatch(act, events, new Set([202]));
  expect(result.matchingEvent).toBeUndefined();
  expect(result.rejections).toContain("201|W13 Easy|paired→other-act");
  expect(result.rejections).toContain("202|W13 Easy|claimed");
});
