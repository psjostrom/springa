import React from "react";
import { render, renderHook, type RenderOptions, type RenderHookOptions } from "@testing-library/react";
import { Provider as JotaiProvider } from "jotai";
import { SWRConfig } from "swr";

/** Wraps every render in fresh Jotai + SWR state to isolate tests. */
function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <JotaiProvider>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        {children}
      </SWRConfig>
    </JotaiProvider>
  );
}

function customRender(ui: React.ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: AllProviders, ...options });
}

function customRenderHook<Result, Props>(
  hook: (props: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, "wrapper">,
) {
  return renderHook(hook, { wrapper: AllProviders, ...options });
}

// Re-export everything from testing-library, override render + renderHook
export * from "@testing-library/react";
export { customRender as render, customRenderHook as renderHook };
