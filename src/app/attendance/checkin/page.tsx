"use client";

import { Suspense } from "react";
import { GateApp } from "@/components/attendance/gate/GateApp";

/** Official lab attendance gate — fixed URL for QR print & NFC tags. */
export default function AttendanceCheckInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
          טוען שער נוכחות...
        </div>
      }
    >
      <GateApp />
    </Suspense>
  );
}
