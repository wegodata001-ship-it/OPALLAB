"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useApp } from "@/providers/AppProvider";
import { canAccess, getDefaultRoute, type AppModule } from "@/lib/permissions";

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
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, currentUser } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/");
      return;
    }
    if (!currentUser) return;

    const base = "/" + pathname.split("/").filter(Boolean)[0];
    const module = PATH_MODULE[base];
    if (module && !canAccess(currentUser.role, module)) {
      router.replace(getDefaultRoute(currentUser.role));
    }
  }, [isAuthenticated, currentUser, pathname, router]);

  if (!isAuthenticated || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-opal-gold border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
