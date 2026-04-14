import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/lib/__tests__/test-utils";
import { PaceSuggestionCard } from "../PaceSuggestionCard";
import type { PaceSuggestion } from "@/lib/paceInsight";

const improvementSuggestion: PaceSuggestion = {
  direction: "improvement",
  confidence: "high",
  suggestedAbilitySecs: 1560,
  currentAbilitySecs: 1620,
  currentAbilityDist: 5,
  z4ImprovementSecPerKm: -12,
  cardiacCostChangePercent: -5.2,
  raceResult: null,
};

const regressionSuggestion: PaceSuggestion = {
  direction: "regression",
  confidence: "high",
  suggestedAbilitySecs: 1680,
  currentAbilitySecs: 1620,
  currentAbilityDist: 5,
  z4ImprovementSecPerKm: 18,
  cardiacCostChangePercent: 7.1,
  raceResult: null,
};

const raceMatchSuggestion: PaceSuggestion = {
  direction: "improvement",
  confidence: "high",
  suggestedAbilitySecs: 1560,
  currentAbilitySecs: 1620,
  currentAbilityDist: 5,
  z4ImprovementSecPerKm: null,
  cardiacCostChangePercent: null,
  raceResult: { distance: 5000, duration: 1560, name: "Parkrun 5K", distanceMatch: true },
};

describe("PaceSuggestionCard", () => {
  it("renders improvement card with evidence text", () => {
    render(
      <PaceSuggestionCard suggestion={improvementSuggestion} onAccept={vi.fn()} onDismiss={vi.fn()} isAccepting={false} />,
    );
    expect(screen.getByText(/paces may need updating/i)).toBeInTheDocument();
    expect(screen.getByText(/26:00/)).toBeInTheDocument();
    expect(screen.getByText(/27:00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update plan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /not now/i })).toBeInTheDocument();
  });

  it("renders regression card with different framing", () => {
    render(
      <PaceSuggestionCard suggestion={regressionSuggestion} onAccept={vi.fn()} onDismiss={vi.fn()} isAccepting={false} />,
    );
    expect(screen.getByText(/paces may need adjusting/i)).toBeInTheDocument();
    expect(screen.getByText(/injury risk/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /adjust plan/i })).toBeInTheDocument();
  });

  it("renders race result card when distance matches", () => {
    render(
      <PaceSuggestionCard suggestion={raceMatchSuggestion} onAccept={vi.fn()} onDismiss={vi.fn()} isAccepting={false} />,
    );
    expect(screen.getByText(/Race result: Parkrun 5K/i)).toBeInTheDocument();
    expect(screen.getByText(/You finished in 26:00/)).toBeInTheDocument();
  });

  it("calls onAccept when accept button is clicked", async () => {
    const onAccept = vi.fn();
    render(
      <PaceSuggestionCard suggestion={improvementSuggestion} onAccept={onAccept} onDismiss={vi.fn()} isAccepting={false} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /update plan/i }));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it("calls onDismiss when dismiss button is clicked", async () => {
    const onDismiss = vi.fn();
    render(
      <PaceSuggestionCard suggestion={improvementSuggestion} onAccept={vi.fn()} onDismiss={onDismiss} isAccepting={false} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("disables buttons and shows loading state when accepting", () => {
    render(
      <PaceSuggestionCard suggestion={improvementSuggestion} onAccept={vi.fn()} onDismiss={vi.fn()} isAccepting={true} />,
    );
    expect(screen.getByRole("button", { name: /updating/i })).toBeDisabled();
  });
});
