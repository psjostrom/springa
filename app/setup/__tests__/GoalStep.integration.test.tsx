import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { GoalStep } from "../GoalStep";
import { addWeeks, format } from "date-fns";

describe("GoalStep", () => {
  it("renders distance picker and experience options", async () => {
    const onNext = vi.fn();
    const onBack = vi.fn();

    render(<GoalStep onNext={onNext} onBack={onBack} />);

    // 4 distance buttons should be visible
    expect(screen.getByRole("button", { name: "5K" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10K" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Half" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marathon" })).toBeInTheDocument();

    // Experience options should not be visible yet (no distance selected)
    expect(screen.queryByText("Beginner")).not.toBeInTheDocument();
  });

  it("Next button disabled until distance and experience selected", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onBack = vi.fn();

    render(<GoalStep onNext={onNext} onBack={onBack} />);

    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(nextButton).toBeDisabled();

    // Click 10K
    await user.click(screen.getByRole("button", { name: "10K" }));

    // Experience options should appear
    expect(screen.getByText("Beginner")).toBeInTheDocument();
    expect(screen.getByText("Intermediate")).toBeInTheDocument();
    expect(screen.getByText("Experienced")).toBeInTheDocument();

    // Next still disabled (no experience selected)
    expect(nextButton).toBeDisabled();

    // Select Intermediate
    await user.click(screen.getByText("Intermediate"));

    // Date picker should appear (defaults to 18 weeks out)
    const dateInput = screen.getByDisplayValue(format(addWeeks(new Date(), 18), "yyyy-MM-dd"));
    expect(dateInput).toBeInTheDocument();

    // Next should now be enabled
    expect(nextButton).toBeEnabled();
  });

  it("race date validation: date < 12 weeks disables Next", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onBack = vi.fn();

    render(<GoalStep onNext={onNext} onBack={onBack} />);

    // Select distance and experience
    await user.click(screen.getByRole("button", { name: "10K" }));
    await user.click(screen.getByText("Intermediate"));

    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(nextButton).toBeEnabled();

    // Set date to 8 weeks from today
    const dateInput = screen.getByDisplayValue(format(addWeeks(new Date(), 18), "yyyy-MM-dd"));
    const tooSoonDate = format(addWeeks(new Date(), 8), "yyyy-MM-dd");
    await user.clear(dateInput);
    await user.type(dateInput, tooSoonDate);

    // Next button should now be disabled
    expect(nextButton).toBeDisabled();
  });

  it("onNext receives raceDist, experience, raceDate", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onBack = vi.fn();

    render(<GoalStep onNext={onNext} onBack={onBack} />);

    // Select 10K, Intermediate, keep default date (18 weeks)
    await user.click(screen.getByRole("button", { name: "10K" }));
    await user.click(screen.getByText("Intermediate"));

    const defaultDate = format(addWeeks(new Date(), 18), "yyyy-MM-dd");

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(onNext).toHaveBeenCalledWith({
      raceDist: 10,
      experience: "intermediate",
      raceDate: defaultDate,
    });
  });
});
