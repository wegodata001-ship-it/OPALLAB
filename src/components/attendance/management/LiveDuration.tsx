"use client";

import { useEffect, useState } from "react";
import { formatLiveDuration } from "@/lib/attendance/management/client";

export function LiveDuration({ since }: { since: Date }) {
  const [ms, setMs] = useState(() => Date.now() - since.getTime());

  useEffect(() => {
    const tick = () => setMs(Date.now() - since.getTime());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [since]);

  return <span className="font-mono font-bold text-emerald-700">{formatLiveDuration(ms)}</span>;
}
