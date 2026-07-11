"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useLoading } from "@/providers/LoadingProvider";

/** Shows global loading briefly on dashboard route changes. */
export function PageTransitionLoader() {
  const pathname = usePathname();
  const { show, hide } = useLoading();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    show("טוען נתונים...");
    const timer = window.setTimeout(hide, 400);
    return () => window.clearTimeout(timer);
  }, [pathname, show, hide]);

  return null;
}
