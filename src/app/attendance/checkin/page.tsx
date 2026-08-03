"use client";

import { GateApp } from "@/components/attendance/gate/GateApp";

/** Official lab attendance gate — fixed URL for QR print & NFC tags. */
export default function AttendanceCheckInPage() {
  return <GateApp />;
}
