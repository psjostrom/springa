import { describe, it, expect } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Toast } from "../Toast";

describe("Toast", () => {
  it("renders message, action button, and dismiss button", () => {
    render(
      <Toast
        message="Enable push notifications"
        actionLabel="Enable"
        onAction={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("Enable push notifications")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("calls onAction when CTA is clicked", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <Toast
        message="Test"
        actionLabel="Go"
        onAction={onAction}
        onDismiss={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("calls onDismiss when dismiss is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <Toast
        message="Test"
        actionLabel="Go"
        onAction={() => {}}
        onDismiss={onDismiss}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders CTA as link when actionHref is provided", () => {
    render(
      <Toast
        message="Rate this run"
        actionLabel="Rate"
        actionHref="/feedback?activityId=123"
        onDismiss={() => {}}
      />,
    );
    const link = screen.getByRole("link", { name: "Rate" });
    expect(link).toHaveAttribute("href", "/feedback?activityId=123");
  });

  it("applies success accent to CTA", () => {
    render(
      <Toast
        message="Test"
        actionLabel="Rate"
        onAction={() => {}}
        onDismiss={() => {}}
        accent="success"
      />,
    );
    const btn = screen.getByRole("button", { name: "Rate" });
    expect(btn.className).toContain("bg-success");
  });

  it("defaults to brand accent", () => {
    render(
      <Toast
        message="Test"
        actionLabel="Go"
        onAction={() => {}}
        onDismiss={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn.className).toContain("bg-brand");
  });

  it("renders ReactNode message content", () => {
    render(
      <Toast
        message={<><strong>W12 Easy</strong> — unrated</>}
        actionLabel="Rate"
        onAction={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("W12 Easy")).toBeInTheDocument();
    expect(screen.getByText(/unrated/)).toBeInTheDocument();
  });
});
