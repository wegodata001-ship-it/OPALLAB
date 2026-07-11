"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useApp } from "@/providers/AppProvider";
import { canAccessUser, getDefaultRoute, type AppModule } from "@/lib/permissions";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

const PATH_MODULE: Record<string, AppModule> = {
  "/dashboard": "dashboard",
  "/orders": "orders",
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

    const base = "/" + pathname.split("/").filter(Boolean)[0];
    const module = PATH_MODULE[base];
    if (module && !canAccessUser(currentUser, module)) {
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
