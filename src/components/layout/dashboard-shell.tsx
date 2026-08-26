"use client";

import { useApp } from "@/providers/AppProvider";
import { isAssistantOnlyUser } from "@/lib/user-roles";
import { Sidebar } from "@/components/layout/sidebar";
import { DashboardContent } from "@/components/layout/dashboard-content";

/** Hides the lab sidebar for attendance-only assistants. */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { currentUser } = useApp();
  const assistantOnly = currentUser ? isAssistantOnlyUser(currentUser) : false;

  if (assistantOnly) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/80">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/80">
      <Sidebar />
      <main className="min-h-screen overflow-x-hidden lg:mr-56">
        <DashboardContent>{children}</DashboardContent>
      </main>
    </div>
  );
}
