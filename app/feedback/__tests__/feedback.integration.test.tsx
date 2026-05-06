import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, waitFor } from "@/lib/__tests__/test-utils";
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
  it("shows prescribed carbs separately and keeps the input empty by default", async () => {
    installFeedbackHandlers();
    searchParamsState.current = new URLSearchParams("activityId=i12345");

    render(<FeedbackPage />);

    await waitFor(() => {
      expect(screen.getByText("5.5 km")).toBeInTheDocument();
    });

    expect(screen.getByText("Prescribed: 41g")).toBeInTheDocument();
    const carbsInput = screen.getByPlaceholderText("e.g. 40");
    expect(carbsInput).toBeInTheDocument();
    expect(carbsInput).toHaveValue(null);
  });

  it("copies prescribed carbs into the input when requested", async () => {
    installFeedbackHandlers();
    const user = userEvent.setup();
    searchParamsState.current = new URLSearchParams("activityId=i12345");

    render(<FeedbackPage />);

    await waitFor(() => {
      expect(screen.getByText("5.5 km")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Use prescribed/i }));

    const carbsInput = screen.getByPlaceholderText("e.g. 40");
    expect(carbsInput).toHaveValue(41);

    await user.click(screen.getByText("\uD83D\uDC4D"));
    await user.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(capturedPostBody).not.toBeNull();
    });

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

    const carbsInput = screen.getByPlaceholderText("e.g. 40");
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
