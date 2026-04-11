import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { NotificationPrompt } from "../NotificationPrompt";

let permission = "default";

beforeEach(() => {
	localStorage.clear();
	permission = "default";
	Object.defineProperty(globalThis, "Notification", {
		value: {
			get permission() {
				return permission;
			},
			requestPermission: () => {
				permission = "granted";
				return Promise.resolve("granted" as NotificationPermission);
			},
		},
		writable: true,
		configurable: true,
	});
});

afterEach(() => {
	// @ts-expect-error — cleanup test global
	delete globalThis.Notification;
});

describe("NotificationPrompt", () => {
	it("shows prompt when permission is default and not dismissed", () => {
		render(<NotificationPrompt />);
		expect(screen.getByText("Enable push notifications for pre-run alerts")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Enable" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
	});

	it("hides when permission is already granted", () => {
		permission = "granted";
		render(<NotificationPrompt />);
		expect(screen.queryByText("Enable push notifications for pre-run alerts")).not.toBeInTheDocument();
	});

	it("hides when permission is denied", () => {
		permission = "denied";
		render(<NotificationPrompt />);
		expect(screen.queryByText("Enable push notifications for pre-run alerts")).not.toBeInTheDocument();
	});

	it("hides after dismiss and stays hidden on re-render", async () => {
		const user = userEvent.setup();
		const { unmount } = render(<NotificationPrompt />);
		expect(screen.getByText("Enable push notifications for pre-run alerts")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Dismiss" }));
		expect(screen.queryByText("Enable push notifications for pre-run alerts")).not.toBeInTheDocument();

		// Re-mount — should stay dismissed via localStorage
		unmount();
		render(<NotificationPrompt />);
		expect(screen.queryByText("Enable push notifications for pre-run alerts")).not.toBeInTheDocument();
	});

	it("hides after enabling notifications", async () => {
		const user = userEvent.setup();
		render(<NotificationPrompt />);

		await user.click(screen.getByRole("button", { name: "Enable" }));
		// requestPermission resolves, permission changes to "granted", storage event fires
		await act(() => Promise.resolve());
		expect(screen.queryByText("Enable push notifications for pre-run alerts")).not.toBeInTheDocument();
	});

	it("does not render when Notification API is unavailable", () => {
		// @ts-expect-error — simulate missing API
		delete globalThis.Notification;
		render(<NotificationPrompt />);
		expect(screen.queryByText("Enable push notifications for pre-run alerts")).not.toBeInTheDocument();
	});
});
