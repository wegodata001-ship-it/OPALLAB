"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

interface LoadingContextValue {
  isLoading: boolean;
  message: string;
  show: (message?: string) => void;
  hide: () => void;
  run: <T>(fn: () => Promise<T>, message?: string) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState("טוען נתונים...");

  const show = useCallback((msg = "טוען נתונים...") => {
    setMessage(msg);
    setCount((c) => c + 1);
  }, []);

  const hide = useCallback(() => {
    setCount((c) => Math.max(0, c - 1));
  }, []);

  const run = useCallback(async <T,>(fn: () => Promise<T>, msg = "טוען נתונים...") => {
    show(msg);
    try {
      return await fn();
    } finally {
      hide();
    }
  }, [show, hide]);

  const value = useMemo(
    () => ({ isLoading: count > 0, message, show, hide, run }),
    [count, message, show, hide, run],
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
      run: async <T,>(fn: () => Promise<T>) => fn(),
    };
  }
  return ctx;
}
