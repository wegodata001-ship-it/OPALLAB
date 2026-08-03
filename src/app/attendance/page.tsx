"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ATTENDANCE_CHECKIN_PATH } from "@/lib/attendance/gate/checkin-url";

function AttendanceRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(`${ATTENDANCE_CHECKIN_PATH}${qs ? `?${qs}` : ""}`);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300">
      מעביר לשער הנוכחות הרשמי...
    </div>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={null}>
      <AttendanceRedirect />
    </Suspense>
  );
}
