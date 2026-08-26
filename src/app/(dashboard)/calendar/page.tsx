"use client";

import { Suspense } from "react";
import { Header } from "@/components/layout/sidebar";
import { ManagerCalendarApp } from "@/components/calendar/manager-calendar-app";
import { useApp } from "@/providers/AppProvider";
import { canAccessCalendar } from "@/lib/calendar/permissions";

function CalendarGate() {
  const { currentUser } = useApp();
  if (!currentUser || !canAccessCalendar(currentUser)) {
    return (
      <div className="py-20 text-center text-slate-500">
        אין הרשאה ליומן המנהל (מנהל מערכת / מזכירה בלבד).
      </div>
    );
  }

  return (
    <>
      <Header
        title="יומן מנהל"
        description="מרכז שליטה — פגישות, מסירות, איסופים ומשימות"
      />
      <ManagerCalendarApp />
    </>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-400">טוען יומן...</div>}>
      <CalendarGate />
    </Suspense>
  );
}
