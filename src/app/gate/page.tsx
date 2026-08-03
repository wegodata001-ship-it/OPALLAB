"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ATTENDANCE_CHECKIN_PATH } from "@/lib/attendance/gate/checkin-url";

function GateRedirect() {
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

export default function GatePage() {
  return (
    <Suspense fallback={null}>
      <GateRedirect />
    </Suspense>
  );
}
