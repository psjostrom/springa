import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";
import FeedbackPage from "../page";
import { searchParamsState } from "@/lib/__tests__/setup-dom";
import "@/lib/__tests__/setup-dom";

const feedbackResponse = {
  createdAt: 1771934400000,
  activityId: "i12345",
  rating: null,
  comment: null,
  distance: 5500,
  duration: 2280000,
  avgHr: 128,
  carbsG: null,
  prescribedCarbsG: 41,
};

let capturedPostBody: Record<string, unknown> | null = null;

function installFeedbackHandlers(overrides?: Partial<typeof feedbackResponse>) {
  server.use(
    http.get("/api/run-feedback", () => {
      return HttpResponse.json({ ...feedbackResponse, ...overrides });
    }),
    http.post("/api/run-feedback", async ({ request }) => {
      capturedPostBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );
}

afterEach(() => {
  capturedPostBody = null;
});

describe("Feedback page — prescribed carbs", () => {
  it("submits prescribed carbs when user leaves input empty", async () => {
    installFeedbackHandlers();
    const user = userEvent.setup();
    searchParamsState.current = new URLSearchParams("activityId=i12345");

    render(<FeedbackPage />);

    await waitFor(() => {
      expect(screen.getByText("5.5 km")).toBeInTheDocument();
    });

    // Placeholder should show prescribed amount
    const carbsInput = screen.getByPlaceholderText("41 (prescribed)");
    expect(carbsInput).toBeInTheDocument();

    // Rate good, hit save without touching carbs
    await user.click(screen.getByText("\uD83D\uDC4D"));
    await user.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(capturedPostBody).not.toBeNull();
    });

    expect(capturedPostBody!.activityId).toBe("i12345");
    expect(capturedPostBody!.rating).toBe("good");
    expect(capturedPostBody!.carbsG).toBe(41);
  });

  it("submits user-entered carbs instead of prescribed", async () => {
    installFeedbackHandlers();
    const user = userEvent.setup();
    searchParamsState.current = new URLSearchParams("activityId=i12345");

    render(<FeedbackPage />);

    await waitFor(() => {
      expect(screen.getByText("5.5 km")).toBeInTheDocument();
    });

    // Clear pre-filled value and type a different one
    const carbsInput = screen.getByPlaceholderText("41 (prescribed)");
    await user.clear(carbsInput);
    await user.type(carbsInput, "55");

    // Rate good, save
    await user.click(screen.getByText("\uD83D\uDC4D"));
    await user.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(capturedPostBody).not.toBeNull();
    });

    expect(capturedPostBody!.carbsG).toBe(55);
  });

  it("shows default placeholder when no prescribed carbs", async () => {
    installFeedbackHandlers({ prescribedCarbsG: undefined });
    searchParamsState.current = new URLSearchParams("activityId=i12345");

    render(<FeedbackPage />);

    await waitFor(() => {
      expect(screen.getByText("5.5 km")).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText("e.g. 40")).toBeInTheDocument();
  });
});
