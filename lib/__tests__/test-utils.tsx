import React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { SWRConfig } from "swr";

/** Wraps every render in a fresh SWR cache to isolate tests. */
function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );
}

function customRender(ui: React.ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything from testing-library, override render
export * from "@testing-library/react";
export { customRender as render };
