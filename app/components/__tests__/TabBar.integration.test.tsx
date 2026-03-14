import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { TabBar } from "../TabBar";

const TABS = [
  { id: "overview" as const, label: "Overview" },
  { id: "deep-dive" as const, label: "Deep Dive" },
  { id: "analysis" as const, label: "Analysis" },
];

describe("TabBar", () => {
  it("renders all tab labels", () => {
    render(<TabBar tabs={TABS} activeTab="overview" onTabChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Deep Dive" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Analysis" })).toBeInTheDocument();
  });

  it("marks the active tab as selected", () => {
    render(<TabBar tabs={TABS} activeTab="deep-dive" onTabChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Deep Dive" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "false");
  });

  it("calls onTabChange when a tab is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TabBar tabs={TABS} activeTab="overview" onTabChange={onChange} />);
    await user.click(screen.getByRole("tab", { name: "Analysis" }));
    expect(onChange).toHaveBeenCalledWith("analysis");
  });
});
