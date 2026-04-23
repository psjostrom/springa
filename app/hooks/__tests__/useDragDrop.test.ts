// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { renderHook, act } from "@/lib/__tests__/test-utils";
import { useDragDrop } from "../useDragDrop";
import type { CalendarEvent } from "@/lib/types";
import { server } from "@/lib/__tests__/msw/server";
import { capturedPutPayload, resetCaptures } from "@/lib/__tests__/msw/handlers";

const planned: CalendarEvent = {
  id: "event-100",
  date: new Date("2026-03-10T14:00:00"),
  name: "W02 Easy",
  description: "",
  type: "planned",
  category: "easy",
};

const completed: CalendarEvent = {
  id: "event-200",
  date: new Date("2026-03-08T10:00:00"),
  name: "W01 Long (8km)",
  description: "",
  type: "completed",
  category: "long",
};
let originalConsoleError: typeof console.error;

describe("useDragDrop", () => {
  let setEventsMock: ReturnType<typeof vi.fn>;
  let setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;

  beforeEach(() => {
    originalConsoleError = console.error;
    console.error = () => {};
    resetCaptures();
    setEventsMock = vi.fn();
    setEvents = setEventsMock as unknown as React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it("allows dragging planned events", () => {
    const { result } = renderHook(() => useDragDrop(setEvents));

    const dragEvent = {
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    } as unknown as React.DragEvent;

    act(() => { result.current.handleDragStart(dragEvent, planned); });

    expect(result.current.draggedEvent).toEqual(planned);
    expect(dragEvent.dataTransfer.effectAllowed).toBe("move");
  });

  it("ignores drag on completed events", () => {
    const { result } = renderHook(() => useDragDrop(setEvents));

    const dragEvent = {
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    } as unknown as React.DragEvent;

    act(() => { result.current.handleDragStart(dragEvent, completed); });

    expect(result.current.draggedEvent).toBeNull();
  });

  it("calls updateEvent and updates local state on drop", async () => {
    const { result } = renderHook(() => useDragDrop(setEvents));

    // Start drag
    const dragEvent = {
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    } as unknown as React.DragEvent;
    act(() => { result.current.handleDragStart(dragEvent, planned); });

    // Drop on new date
    const targetDate = new Date("2026-03-12");
    await act(async () => { await result.current.handleDrop(targetDate); });

    // Verify the PUT was sent to the correct endpoint with the right payload
    expect(capturedPutPayload).not.toBeNull();
    expect(capturedPutPayload!.url).toContain("/events/100");
    expect(capturedPutPayload!.body).toEqual(expect.objectContaining({
      start_date_local: expect.stringContaining("2026-03-12"),
    }));
    expect(setEventsMock).toHaveBeenCalled();
    expect(result.current.draggedEvent).toBeNull();
  });

  it("sets dragError on API failure", async () => {
    server.use(
      http.put("/api/intervals/events/:eventId", () => {
        return new HttpResponse("server error", { status: 500 });
      }),
    );

    const { result } = renderHook(() => useDragDrop(setEvents));

    const dragEvent = {
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    } as unknown as React.DragEvent;
    act(() => { result.current.handleDragStart(dragEvent, planned); });

    await act(async () => { await result.current.handleDrop(new Date("2026-03-12")); });

    expect(result.current.dragError).toBe("Failed to move workout. Please try again.");
    expect(setEventsMock).not.toHaveBeenCalled();
  });

  it("clearDragError resets the error", async () => {
    server.use(
      http.put("/api/intervals/events/:eventId", () => {
        return new HttpResponse("fail", { status: 500 });
      }),
    );

    const { result } = renderHook(() => useDragDrop(setEvents));

    const dragEvent = {
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    } as unknown as React.DragEvent;
    act(() => { result.current.handleDragStart(dragEvent, planned); });
    await act(async () => { await result.current.handleDrop(new Date("2026-03-12")); });

    expect(result.current.dragError).not.toBeNull();

    act(() => { result.current.clearDragError(); });
    expect(result.current.dragError).toBeNull();
  });

  it("handleDragEnd resets state", () => {
    const { result } = renderHook(() => useDragDrop(setEvents));

    const dragEvent = {
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    } as unknown as React.DragEvent;
    act(() => { result.current.handleDragStart(dragEvent, planned); });
    expect(result.current.draggedEvent).not.toBeNull();

    act(() => { result.current.handleDragEnd(); });
    expect(result.current.draggedEvent).toBeNull();
    expect(result.current.dragOverDate).toBeNull();
  });
});
