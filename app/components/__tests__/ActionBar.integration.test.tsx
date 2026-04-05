import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { ActionBar } from "../ActionBar";
import "@/lib/__tests__/setup-dom";

describe("ActionBar", () => {
  it("shows 'View in Calendar' button on upload success when callback provided", () => {
    render(
      <ActionBar
        workoutCount={5}
        isUploading={false}
        statusMsg="Uploaded 5 workouts."
        onUpload={() => {}}
        onViewCalendar={() => {}}
      />
    );
    expect(screen.getByText(/View in Calendar/)).toBeInTheDocument();
  });

  it("does not show 'View in Calendar' when no callback", () => {
    render(
      <ActionBar
        workoutCount={5}
        isUploading={false}
        statusMsg="Uploaded 5 workouts."
        onUpload={() => {}}
      />
    );
    expect(screen.queryByText(/View in Calendar/)).not.toBeInTheDocument();
  });

  it("calls onViewCalendar when clicked", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    render(
      <ActionBar
        workoutCount={5}
        isUploading={false}
        statusMsg="Uploaded 5 workouts."
        onUpload={() => {}}
        onViewCalendar={onView}
      />
    );
    await user.click(screen.getByText(/View in Calendar/));
    expect(onView).toHaveBeenCalledOnce();
  });

  it("does not show 'View in Calendar' during upload", () => {
    render(
      <ActionBar
        workoutCount={5}
        isUploading={true}
        statusMsg=""
        onUpload={() => {}}
        onViewCalendar={() => {}}
      />
    );
    expect(screen.queryByText(/View in Calendar/)).not.toBeInTheDocument();
  });

  it("does not show 'View in Calendar' on error", () => {
    render(
      <ActionBar
        workoutCount={5}
        isUploading={false}
        statusMsg="Error: something went wrong"
        onUpload={() => {}}
        onViewCalendar={() => {}}
      />
    );
    expect(screen.queryByText(/View in Calendar/)).not.toBeInTheDocument();
  });
});
