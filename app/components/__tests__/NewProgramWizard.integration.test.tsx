import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { NewProgramWizard } from "../NewProgramWizard";
import { getProgramWeeks, type NewProgramDraft } from "@/lib/programs";
import "@/lib/__tests__/setup-dom";

const initialDraft: NewProgramDraft = {
  raceName: "",
  raceDist: 16,
  raceDate: "2026-10-28",
  currentAbilityDist: 10,
  currentAbilitySecs: 3300,
  runDays: [2, 4, 0],
  longRunDay: 0,
  totalWeeks: 18,
  startKm: 8,
  includeBasePhase: false,
};

function dateWeeksFromNow(weeks: number): string {
  const raceDate = new Date();
  raceDate.setDate(raceDate.getDate() + weeks * 7);
  const year = raceDate.getFullYear();
  const month = String(raceDate.getMonth() + 1).padStart(2, "0");
  const day = String(raceDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function WizardHarness({
  validationError = null,
  onPreview = () => {},
}: {
  validationError?: string | null;
  onPreview?: (draft: NewProgramDraft) => void;
}) {
  const [draft, setDraft] = useState(initialDraft);

  return (
    <NewProgramWizard
      draft={draft}
      validationError={validationError}
      onDraftChange={setDraft}
      onCancel={() => {}}
      onPreview={() => { onPreview(draft); }}
    />
  );
}

describe("NewProgramWizard", () => {
  it("renders returning-runner sections with prefilled values", () => {
    render(
      <NewProgramWizard
        draft={initialDraft}
        validationError={null}
        onDraftChange={() => {}}
        onCancel={() => {}}
        onPreview={() => {}}
      />,
    );

    expect(screen.getByText("Start new program")).toBeInTheDocument();
    expect(screen.getByText("Race goal")).toBeInTheDocument();
    expect(screen.getByText("Current fitness")).toBeInTheDocument();
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByDisplayValue("16")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-10-28")).toBeInTheDocument();
    expect(screen.queryByLabelText("Total weeks")).not.toBeInTheDocument();
  });

  it("updates race name and calls preview with the changed draft", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();

    render(<WizardHarness onPreview={onPreview} />);

    await user.type(screen.getByLabelText("Race name"), "Stockholm Half");
    await user.click(screen.getByRole("button", { name: "Preview plan" }));

    expect(onPreview).toHaveBeenCalledWith({
      ...initialDraft,
      raceName: "Stockholm Half",
    });
  });

  it("derives plan length from the selected race date", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();

    render(<WizardHarness onPreview={onPreview} />);

    await user.clear(screen.getByLabelText("Race date"));
    await user.type(screen.getByLabelText("Race date"), "2027-06-29");
    await user.click(screen.getByRole("button", { name: "Preview plan" }));

    expect(onPreview).toHaveBeenCalledWith({
      ...initialDraft,
      raceDate: "2027-06-29",
      totalWeeks: getProgramWeeks("2027-06-29"),
    });
  });

  it("shows validation errors from Planner", () => {
    render(<WizardHarness validationError="Race date must be at least 10 weeks away." />);

    expect(screen.getByText("Race date must be at least 10 weeks away.")).toBeInTheDocument();
  });

  it("shows a prominent warning for compressed timelines", () => {
    render(
      <NewProgramWizard
        draft={{ ...initialDraft, raceDate: dateWeeksFromNow(10), totalWeeks: 10 }}
        validationError={null}
        onDraftChange={() => {}}
        onCancel={() => {}}
        onPreview={() => {}}
      />,
    );

    expect(screen.getByText("Compressed plan")).toBeInTheDocument();
    expect(screen.getByText(/will not be as good as a 12-week plan/i)).toBeInTheDocument();
  });

  it("does not allow removing the final run day", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const oneDayDraft: NewProgramDraft = {
      ...initialDraft,
      runDays: [0],
      longRunDay: 0,
    };

    render(
      <NewProgramWizard
        draft={oneDayDraft}
        validationError={null}
        onDraftChange={onDraftChange}
        onCancel={() => {}}
        onPreview={() => {}}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Sun" })[0]);
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("makes a long club run the long run day", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();

    render(<WizardHarness onPreview={onPreview} />);

    await user.click(screen.getByRole("switch", { name: "Club run" }));
    await user.click(screen.getByRole("button", { name: "Long run" }));
    await user.click(screen.getByRole("button", { name: "Preview plan" }));

    expect(onPreview).toHaveBeenCalledWith({
      ...initialDraft,
      clubDay: 2,
      clubType: "long",
      longRunDay: 2,
    });
  });

  it("uses passing contrast classes for selected controls and primary action", async () => {
    const user = userEvent.setup();

    render(<WizardHarness />);

    expect(screen.getByRole("button", { name: "Preview plan" })).toHaveClass("bg-brand-btn");
    await user.click(screen.getByRole("switch", { name: "Club run" }));
    expect(
      screen.getAllByRole("button", { name: "Tue" }).some((button) =>
        button.className.includes("bg-brand-btn"),
      ),
    ).toBe(true);
  });
});
