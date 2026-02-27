// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDragDrop } from "../useDragDrop";
import type { CalendarEvent } from "@/lib/types";

vi.mock("@/lib/intervalsApi", () => ({
  updateEvent: vi.fn(),
}));

vi.mock("@/lib/format", () => ({
  parseEventId: (id: string) => parseInt(id.replace("event-", ""), 10),
}));

import { updateEvent } from "@/lib/intervalsApi";

const planned: CalendarEvent = {
  id: "event-100",
  date: new Date("2026-03-10T14:00:00"),
  name: "W02 Tue Easy eco16",
  description: "",
  type: "planned",
  category: "easy",
};

const completed: CalendarEvent = {
  id: "event-200",
  date: new Date("2026-03-08T10:00:00"),
  name: "W01 Sun Long (8km) eco16",
  description: "",
  type: "completed",
  category: "long",
};

describe("useDragDrop", () => {
  let setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  let setEventsMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setEventsMock = vi.fn();
    setEvents = setEventsMock as unknown as React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  });

  it("allows dragging planned events", () => {
    const { result } = renderHook(() => useDragDrop("key", setEvents));

    const dragEvent = {
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    } as unknown as React.DragEvent;

    act(() => { result.current.handleDragStart(dragEvent, planned); });

    expect(result.current.draggedEvent).toEqual(planned);
    expect(dragEvent.dataTransfer.effectAllowed).toBe("move");
  });

  it("ignores drag on completed events", () => {
    const { result } = renderHook(() => useDragDrop("key", setEvents));

    const dragEvent = {
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    } as unknown as React.DragEvent;

    act(() => { result.current.handleDragStart(dragEvent, completed); });

    expect(result.current.draggedEvent).toBeNull();
  });

  it("calls updateEvent and updates local state on drop", async () => {
    (updateEvent as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDragDrop("key", setEvents));

    // Start drag
    const dragEvent = {
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    } as unknown as React.DragEvent;
    act(() => { result.current.handleDragStart(dragEvent, planned); });

    // Drop on new date
    const targetDate = new Date("2026-03-12");
    await act(async () => { await result.current.handleDrop(targetDate); });

    expect(updateEvent).toHaveBeenCalledWith("key", 100, expect.objectContaining({
      start_date_local: expect.stringContaining("2026-03-12"),
    }));
    expect(setEventsMock).toHaveBeenCalled();
    expect(result.current.draggedEvent).toBeNull();
  });

  it("sets dragError on API failure", async () => {
    (updateEvent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network"));

    const { result } = renderHook(() => useDragDrop("key", setEvents));

    const dragEvent = {
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    } as unknown as React.DragEvent;
    act(() => { result.current.handleDragStart(dragEvent, planned); });

    await act(async () => { await result.current.handleDrop(new Date("2026-03-12")); });

    expect(result.current.dragError).toBe("Failed to move workout. Please try again.");
    expect(setEventsMock).not.toHaveBeenCalled();
  });

  it("clearDragError resets the error", async () => {
    (updateEvent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("fail"));

    const { result } = renderHook(() => useDragDrop("key", setEvents));

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
    const { result } = renderHook(() => useDragDrop("key", setEvents));

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
