"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Wider content shell for screens that need more horizontal room (e.g. calendar). */
export function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wide = pathname === "/calendar" || pathname.startsWith("/calendar/");

  return (
    <div
      className={cn(
        "w-full p-4 sm:p-6 lg:p-8",
        wide ? "max-w-[96rem]" : "max-w-7xl",
      )}
    >
      {children}
    </div>
  );
}
