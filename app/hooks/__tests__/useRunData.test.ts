// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@/lib/__tests__/test-utils";
import { useRunData } from "../useRunData";
import type { CalendarEvent } from "@/lib/types";
import type { CachedActivity, EnrichedActivity } from "@/lib/activityStreamsDb";

// Use vi.hoisted() to ensure mocks are available when vi.mock is hoisted
const { buildBGModelFromCachedMock, buildRunBGContextsMock, useStreamCacheMock } = vi.hoisted(() => ({
  buildBGModelFromCachedMock: vi.fn(() => ({
    categories: new Map(),
    byStartLevel: [],
    byEntrySlope: [],
    byTime: [],
    fuelSuggestions: [],
  })),
  buildRunBGContextsMock: vi.fn(() => new Map()),
  useStreamCacheMock: vi.fn(() => ({
    cached: [] as CachedActivity[],
    loading: false,
    progress: { done: 0, total: 0 },
  })),
}));

vi.mock("@/lib/bgModel", () => ({
  buildBGModelFromCached: buildBGModelFromCachedMock,
}));

vi.mock("@/lib/runBGContext", () => ({
  buildRunBGContexts: buildRunBGContextsMock,
}));

vi.mock("../useStreamCache", () => ({
  useStreamCache: useStreamCacheMock,
}));

const makeEvent = (id: string, type: "completed" | "planned" = "completed"): CalendarEvent => ({
  id,
  activityId: id,
  date: new Date("2026-03-01"),
  name: "Test Run",
  description: "",
  type,
  category: "easy",
});

const makeCached = (id: string): EnrichedActivity => ({
  activityId: id,
  category: "easy",
  fuelRate: 48,
  glucose: [{ time: 0, value: 10 }],
  hr: [{ time: 0, value: 120 }],
  pace: [],
  cadence: [],
  altitude: [],
});

describe("useRunData memoization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not rebuild BG model on re-render with same data", () => {
    const events = [makeEvent("a1")];
    const cached = [makeCached("a1")];

    useStreamCacheMock.mockReturnValue({
      cached,
      loading: false,
      progress: { done: 1, total: 1 },
    });

    const { rerender } = renderHook(
      ({ events: e }) => useRunData(true, e, undefined),
      { initialProps: { events } },
    );

    expect(buildBGModelFromCachedMock).toHaveBeenCalledTimes(1);

    // Re-render with same events reference
    rerender({ events });

    // Should NOT call buildBGModelFromCached again
    expect(buildBGModelFromCachedMock).toHaveBeenCalledTimes(1);
  });

  it("does not rebuild BG model when events reference changes but content is same", () => {
    const events1 = [makeEvent("a1")];
    const events2 = [makeEvent("a1")]; // Same content, different reference
    const cached = [makeCached("a1")];

    useStreamCacheMock.mockReturnValue({
      cached,
      loading: false,
      progress: { done: 1, total: 1 },
    });

    const { rerender } = renderHook(
      ({ events }) => useRunData(true, events, undefined),
      { initialProps: { events: events1 } },
    );

    expect(buildBGModelFromCachedMock).toHaveBeenCalledTimes(1);

    // Re-render with new array reference but same cached data
    rerender({ events: events2 });

    // The memoization depends on cachedActivities, not events directly
    // Since cached didn't change, model shouldn't rebuild
    expect(buildBGModelFromCachedMock).toHaveBeenCalledTimes(1);
  });

  it("rebuilds BG model when cached data changes", () => {
    const events = [makeEvent("a1"), makeEvent("a2")];
    const cached1 = [makeCached("a1")];
    const cached2 = [makeCached("a1"), makeCached("a2")];

    useStreamCacheMock.mockReturnValue({
      cached: cached1,
      loading: false,
      progress: { done: 1, total: 2 },
    });

    const { rerender } = renderHook(
      ({ cached }) => {
        useStreamCacheMock.mockReturnValue({
          cached,
          loading: false,
          progress: { done: cached.length, total: 2 },
        });
        return useRunData(true, events, undefined);
      },
      { initialProps: { cached: cached1 } },
    );

    expect(buildBGModelFromCachedMock).toHaveBeenCalledTimes(1);

    // Re-render with new cached data
    rerender({ cached: cached2 });

    // Should rebuild because cachedActivities changed
    expect(buildBGModelFromCachedMock).toHaveBeenCalledTimes(2);
  });

  it("does not call buildBGModelFromCached when cached is empty", () => {
    const events = [makeEvent("a1")];

    useStreamCacheMock.mockReturnValue({
      cached: [],
      loading: true,
      progress: { done: 0, total: 1 },
    });

    const { result } = renderHook(() => useRunData(true, events, undefined));

    expect(buildBGModelFromCachedMock).not.toHaveBeenCalled();
    expect(result.current.bgModel).toBeNull();
  });

  it("returns stable bgActivityNames reference on re-render", () => {
    const events = [makeEvent("a1")];

    useStreamCacheMock.mockReturnValue({
      cached: [],
      loading: false,
      progress: { done: 0, total: 0 },
    });

    const { result, rerender } = renderHook(
      ({ events: e }) => useRunData(true, e, undefined),
      { initialProps: { events } },
    );

    const firstRef = result.current.bgActivityNames;

    rerender({ events });

    // Same reference due to memoization
    expect(result.current.bgActivityNames).toBe(firstRef);
  });

  it("returns stable runBGContexts reference on re-render with same inputs", () => {
    const events = [makeEvent("a1")];

    useStreamCacheMock.mockReturnValue({
      cached: [],
      loading: false,
      progress: { done: 0, total: 0 },
    });

    const { result, rerender } = renderHook(
      ({ events: e }) => useRunData(true, e, undefined),
      { initialProps: { events } },
    );

    const firstRef = result.current.runBGContexts;

    rerender({ events });

    // Same reference due to memoization
    expect(result.current.runBGContexts).toBe(firstRef);
  });
});
