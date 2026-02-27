import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Manages a URL search parameter as modal state with proper history handling.
 * Pushes a history entry on open, pops it on close (or replaceState if the
 * entry wasn't pushed by us). Syncs state on browser back/forward.
 */
export function useModalURL(paramName: string): {
  value: string | null;
  open: (value?: string) => void;
  close: () => void;
} {
  const [value, setValue] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get(paramName)
      : null,
  );

  const pushedRef = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      setValue(new URLSearchParams(window.location.search).get(paramName));
    };
    window.addEventListener("popstate", onPopState);
    return () => { window.removeEventListener("popstate", onPopState); };
  }, [paramName]);

  const open = useCallback(
    (newValue = "1") => {
      setValue(newValue);
      const params = new URLSearchParams(window.location.search);
      const wasOpen = params.has(paramName);
      params.set(paramName, newValue);
      const url = `?${params.toString()}`;
      if (wasOpen) {
        window.history.replaceState(null, "", url);
      } else {
        window.history.pushState(null, "", url);
        pushedRef.current = true;
      }
    },
    [paramName],
  );

  const close = useCallback(() => {
    setValue(null);
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      const params = new URLSearchParams(window.location.search);
      params.delete(paramName);
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        query ? `?${query}` : window.location.pathname,
      );
    }
  }, [paramName]);

  return { value, open, close };
}
