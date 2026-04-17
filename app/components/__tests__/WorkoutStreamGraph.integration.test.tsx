import { describe, it, expect } from "vitest";
import { render } from "@/lib/__tests__/test-utils";
import { WorkoutStreamGraph } from "../WorkoutStreamGraph";
import type { StreamData, DataPoint } from "@/lib/types";

describe("WorkoutStreamGraph NaN guard", () => {
  it("renders without NaN when all HR values are identical", () => {
    const streamData: StreamData = {
      heartrate: [
        { time: 0, value: 150 },
        { time: 5, value: 150 },
        { time: 10, value: 150 },
        { time: 15, value: 150 },
      ],
    };

    const { container } = render(<WorkoutStreamGraph streamData={streamData} />);

    // Path elements should exist and contain no NaN
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.getAttribute("d")).not.toContain("NaN");
    }
  });

  it("renders without NaN when all glucose values are identical", () => {
    const streamData: StreamData = {
      heartrate: [
        { time: 0, value: 140 },
        { time: 10, value: 145 },
      ],
    };
    const glucose: DataPoint[] = [
      { time: 0, value: 7.2 },
      { time: 5, value: 7.2 },
      { time: 10, value: 7.2 },
    ];

    const { container } = render(
      <WorkoutStreamGraph streamData={streamData} glucose={glucose} />,
    );

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.getAttribute("d")).not.toContain("NaN");
    }
  });

  it("renders without NaN in multi-stream mode with one constant stream", () => {
    const streamData: StreamData = {
      heartrate: [
        { time: 0, value: 150 },
        { time: 10, value: 150 },
      ],
      pace: [
        { time: 0, value: 6.5 },
        { time: 10, value: 7.0 },
      ],
    };

    const { container } = render(<WorkoutStreamGraph streamData={streamData} />);

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.getAttribute("d")).not.toContain("NaN");
    }
  });
});
