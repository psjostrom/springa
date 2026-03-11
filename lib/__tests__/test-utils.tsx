import React from "react";
import { render, renderHook, type RenderOptions, type RenderHookOptions } from "@testing-library/react";
import { Provider as JotaiProvider, createStore, type WritableAtom } from "jotai";
import { SWRConfig } from "swr";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AtomInit = [atom: WritableAtom<any, [any], void>, value: any];

/** Wraps every render in fresh Jotai + SWR state to isolate tests. */
function createWrapper(atomInits?: AtomInit[]) {
  const store = createStore();
  if (atomInits) {
    for (const [atom, value] of atomInits) {
      store.set(atom, value);
    }
  }
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <JotaiProvider store={store}>
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          {children}
        </SWRConfig>
      </JotaiProvider>
    );
  };
}

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  atomInits?: AtomInit[];
}

function customRender(ui: React.ReactElement, options?: CustomRenderOptions) {
  const { atomInits, ...rest } = options ?? {};
  return render(ui, { wrapper: createWrapper(atomInits), ...rest });
}

function customRenderHook<Result, Props>(
  hook: (props: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, "wrapper">,
) {
  return renderHook(hook, { wrapper: createWrapper(), ...options });
}

// Re-export everything from testing-library, override render + renderHook
export * from "@testing-library/react";
export { customRender as render, customRenderHook as renderHook };
