import { describe, it, expect } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import { EmptyState } from "../EmptyState";
import "@/lib/__tests__/setup-dom";

describe("EmptyState", () => {
  it("renders message text", () => {
    render(
      <EmptyState message="Complete your first run">
        <svg data-testid="ghost"><rect /></svg>
      </EmptyState>
    );
    expect(screen.getByText("Complete your first run")).toBeInTheDocument();
  });

  it("renders ghost content as children", () => {
    render(
      <EmptyState message="Test message">
        <svg data-testid="ghost"><rect /></svg>
      </EmptyState>
    );
    expect(screen.getByTestId("ghost")).toBeInTheDocument();
  });
});
