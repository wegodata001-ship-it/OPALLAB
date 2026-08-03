"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

interface LoadingContextValue {
  isLoading: boolean;
  message: string;
  show: (message?: string) => void;
  hide: () => void;
  /** Force-clear stuck overlay (refcount leak safety). */
  reset: () => void;
  run: <T>(fn: () => Promise<T>, message?: string) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextValue | null>(null);

/** Max time a single show() may keep the overlay before auto-release. */
const STUCK_GUARD_MS = 20_000;

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState("טוען נתונים...");
  const countRef = useRef(0);
  const stuckTimer = useRef<number | null>(null);

  const clearStuckTimer = () => {
    if (stuckTimer.current != null) {
      window.clearTimeout(stuckTimer.current);
      stuckTimer.current = null;
    }
  };

  const armStuckTimer = useCallback(() => {
    clearStuckTimer();
    stuckTimer.current = window.setTimeout(() => {
      if (countRef.current > 0) {
        console.warn("[LoadingProvider] stuck overlay auto-reset", { count: countRef.current });
        countRef.current = 0;
        setCount(0);
      }
    }, STUCK_GUARD_MS);
  }, []);

  const show = useCallback(
    (msg = "טוען נתונים...") => {
      setMessage(msg);
      countRef.current += 1;
      setCount(countRef.current);
      armStuckTimer();
    },
    [armStuckTimer],
  );

  const hide = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1);
    setCount(countRef.current);
    if (countRef.current === 0) clearStuckTimer();
  }, []);

  const reset = useCallback(() => {
    countRef.current = 0;
    setCount(0);
    clearStuckTimer();
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, msg = "טוען נתונים...") => {
      show(msg);
      try {
        return await fn();
      } finally {
        hide();
      }
    },
    [show, hide],
  );

  useEffect(() => () => clearStuckTimer(), []);

  const value = useMemo(
    () => ({ isLoading: count > 0, message, show, hide, reset, run }),
    [count, message, show, hide, reset, run],
  );

  return (
    <LoadingContext.Provider value={value}>
      {children}
      {count > 0 && <LoadingOverlay message={message} fullscreen />}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) {
    return {
      isLoading: false,
      message: "",
      show: () => {},
      hide: () => {},
      reset: () => {},
      run: async <T,>(fn: () => Promise<T>) => fn(),
    };
  }
  return ctx;
}
