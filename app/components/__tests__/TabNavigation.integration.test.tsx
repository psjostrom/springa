import { describe, it, expect } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import { TabNavigation } from "../TabNavigation";
import "@/lib/__tests__/setup-dom";

describe("TabNavigation", () => {
  it("renders all 5 tabs by default", () => {
    render(<TabNavigation activeTab="calendar" onTabChange={() => {}} />);
    expect(screen.getAllByText("Calendar")).toHaveLength(2); // desktop + mobile
    expect(screen.getAllByText("Simulate")).toHaveLength(2);
  });

  it("hides tabs specified in hideTabs", () => {
    render(<TabNavigation activeTab="calendar" onTabChange={() => {}} hideTabs={["simulate"]} />);
    expect(screen.queryByText("Simulate")).not.toBeInTheDocument();
    expect(screen.getAllByText("Calendar")).toHaveLength(2); // still shows other tabs
  });

  it("hides multiple tabs", () => {
    render(<TabNavigation activeTab="calendar" onTabChange={() => {}} hideTabs={["simulate", "coach"]} />);
    expect(screen.queryByText("Simulate")).not.toBeInTheDocument();
    expect(screen.queryByText("Coach")).not.toBeInTheDocument();
    expect(screen.getAllByText("Calendar")).toHaveLength(2);
  });
});
