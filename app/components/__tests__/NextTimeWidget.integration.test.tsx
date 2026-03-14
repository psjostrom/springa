import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextTimeWidget } from "../NextTimeWidget";

describe("NextTimeWidget", () => {
  it("renders extracted bullets from analysis text", () => {
    const analysis = `**Key Metrics**:
- Some metric

**Next Time**:
- Run slower at 7:15/km
- Add 10g extra carbs`;

    render(<NextTimeWidget analysis={analysis} />);
    expect(screen.getByText(/Run slower/)).toBeInTheDocument();
    expect(screen.getByText(/Add 10g/)).toBeInTheDocument();
  });

  it("returns null when analysis is null", () => {
    const { container } = render(<NextTimeWidget analysis={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when no Next Time section in analysis", () => {
    const { container } = render(<NextTimeWidget analysis={"**Key Metrics**:\n- Just metrics"} />);
    expect(container.firstChild).toBeNull();
  });
});
