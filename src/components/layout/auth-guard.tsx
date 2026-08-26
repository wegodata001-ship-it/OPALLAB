"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useApp } from "@/providers/AppProvider";
import { canAccessUser, getDefaultRoute, type AppModule } from "@/lib/permissions";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

const PATH_MODULE: Record<string, AppModule> = {
  "/dashboard": "dashboard",
  "/orders/deleted": "deleted-orders",
  "/orders": "orders",
  "/calendar": "calendar",
  "/workflow": "workflow",
  "/inventory": "inventory",
  "/accounts": "accounts",
  "/shipping": "shipping",
  "/attendance": "attendance",
  "/portal": "portal",
  "/settings": "settings",
  "/my-work": "my-work",
  "/my-attendance": "my-attendance",
  "/attendance-management": "attendance-management",
  // Legacy URLs redirect into attendance-management
  "/trusted-devices": "attendance-management",
  "/system": "attendance-management",
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, currentUser } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/");
      return;
    }
    if (!currentUser) return;

    const segments = pathname.split("/").filter(Boolean);
    const twoSeg = segments.length >= 2 ? `/${segments[0]}/${segments[1]}` : null;
    const oneSeg = segments.length >= 1 ? `/${segments[0]}` : "/";
    const module =
      (twoSeg && PATH_MODULE[twoSeg]) ||
      PATH_MODULE[oneSeg] ||
      undefined;
    // /system/* pages render their own 403 UI — do not hide them behind a redirect (looks like 404).
    if (module && !canAccessUser(currentUser, module) && !pathname.startsWith("/system/")) {
      router.replace(getDefaultRoute(currentUser));
    }
  }, [isAuthenticated, isLoading, currentUser, pathname, router]);

  if (isLoading || !isAuthenticated || !currentUser) {
    return (
      <div className="min-h-screen relative">
        <LoadingOverlay message="טוען נתונים..." fullscreen />
      </div>
    );
  }

  return <>{children}</>;
}
