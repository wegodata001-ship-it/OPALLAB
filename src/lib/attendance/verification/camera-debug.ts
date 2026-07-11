/** Temporary performance instrumentation for attendance camera flow. */

let logSeq = 0;

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function cameraPerfStart(label: string, extra?: Record<string, unknown>) {
  const id = ++logSeq;
  const t0 = now();
  console.log(`[Camera] START ${label}`, { id, ...extra });
  return {
    id,
    end(detail?: Record<string, unknown>) {
      const ms = Math.round(now() - t0);
      console.log(`[Camera] END ${label}`, { id, durationMs: ms, ...detail });
      console.log(`[Camera] Duration: ${ms} ms — ${label}`);
      return ms;
    },
  };
}

export function cameraPerfMark(label: string, detail?: Record<string, unknown>) {
  console.log(`[Camera] MARK ${label}`, { id: ++logSeq, ...detail });
}

export function cameraPerfCheck(label: string, detail: Record<string, unknown>) {
  console.log(`[Camera] CHECK ${label}`, detail);
}

/** High-level approval flow milestones. */
export function attendanceFlowLog(phase: string, detail?: Record<string, unknown>) {
  console.log(`[Attendance Flow] ${phase}`, detail ?? {});
}
