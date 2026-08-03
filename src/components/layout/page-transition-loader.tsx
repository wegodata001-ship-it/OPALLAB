"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useLoading } from "@/providers/LoadingProvider";

/**
 * Brief route-change indicator.
 * CRITICAL: every show() must be paired with hide() — including effect cleanup —
 * otherwise the LoadingProvider refcount sticks and the fullscreen overlay blocks all clicks.
 */
export function PageTransitionLoader() {
  const pathname = usePathname();
  const { show, hide } = useLoading();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }

    let settled = false;
    show("טוען נתונים...");
    const timer = window.setTimeout(() => {
      settled = true;
      hide();
    }, 280);

    return () => {
      window.clearTimeout(timer);
      if (!settled) hide();
    };
  }, [pathname, show, hide]);

  return null;
}
