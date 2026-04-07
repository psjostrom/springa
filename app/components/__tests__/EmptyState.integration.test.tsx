import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
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

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState message="Click me" onClick={onClick}>
        <svg><rect /></svg>
      </EmptyState>
    );
    await user.click(screen.getByRole("button", { name: /Click me/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders as plain text when no onClick", () => {
    render(
      <EmptyState message="No action">
        <svg><rect /></svg>
      </EmptyState>
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("No action")).toBeInTheDocument();
  });
});
