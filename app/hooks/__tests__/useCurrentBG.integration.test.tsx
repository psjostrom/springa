import { useEffect } from "react";
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { useSetAtom } from "jotai";
import { renderHook, waitFor } from "@/lib/__tests__/test-utils";
import { server } from "@/lib/__tests__/msw/server";
import { settingsAtom } from "@/app/atoms";
import { useCurrentBG } from "../useCurrentBG";

function useCurrentBGProbe(diabetesMode: boolean) {
  const setSettings = useSetAtom(settingsAtom);

  useEffect(() => {
    setSettings((previous) => ({ ...(previous ?? {}), diabetesMode }));
  }, [diabetesMode, setSettings]);

  return useCurrentBG();
}

describe("useCurrentBG", () => {
  it("does not poll /api/bg while diabetes mode is disabled", () => {
    let requestCount = 0;

    server.use(
      http.get("/api/bg", () => {
        requestCount += 1;
        return HttpResponse.json({
          current: { mmol: 6.2, arrow: "→", ts: Date.now() },
          trend: { arrow: "→", slope: 0 },
          readings: [],
        });
      }),
    );

    const { result } = renderHook(({ diabetesMode }) => useCurrentBGProbe(diabetesMode), {
      initialProps: { diabetesMode: false },
    });

    expect(requestCount).toBe(0);
    expect(result.current.currentBG).toBeNull();
    expect(result.current.readings).toEqual([]);
  });

  it("ignores an in-flight response after diabetes mode is turned off", async () => {
    let releaseStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      releaseStarted = () => resolve();
    });
    let releaseResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = () => resolve();
    });

    server.use(
      http.get("/api/bg", async () => {
        releaseStarted?.();
        await responseGate;
        return HttpResponse.json({
          current: { mmol: 7.4, arrow: "↘", ts: Date.now() },
          trend: { arrow: "↘", slope: -0.2 },
          readings: [
            { ts: Date.now(), mmol: 7.4, sgv: 133, direction: "FortyFiveDown", delta: -0.2 },
          ],
        });
      }),
    );

    const { result, rerender } = renderHook(
      ({ diabetesMode }) => useCurrentBGProbe(diabetesMode),
      { initialProps: { diabetesMode: false } },
    );

    rerender({ diabetesMode: true });
    await started;

    rerender({ diabetesMode: false });
    await waitFor(() => {
      expect(result.current.currentBG).toBeNull();
      expect(result.current.trend).toBeNull();
      expect(result.current.readings).toEqual([]);
    });

    releaseResponse?.();

    await waitFor(() => {
      expect(result.current.currentBG).toBeNull();
      expect(result.current.trend).toBeNull();
      expect(result.current.readings).toEqual([]);
    });
  });
});