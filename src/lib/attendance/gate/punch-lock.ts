/**
 * Module-level single-flight lock for the attendance gate.
 * Survives React remounts (Suspense / Strict Mode) within the same page load,
 * so bootstrap cannot fire two punches and flip check-in → check-out (or vice versa).
 */

export type GatePunchAction = "check-in" | "check-out";

export type GatePunchResult = {
  action: GatePunchAction;
  userName: string;
  message: string;
  durationHours?: number | null;
};

let inFlight: Promise<GatePunchResult> | null = null;
let completed: GatePunchResult | null = null;

export function peekGatePunchResult(): GatePunchResult | null {
  return completed;
}

export function resetGatePunchLock(): void {
  inFlight = null;
  completed = null;
}

export async function runGatePunchOnce(
  execute: () => Promise<GatePunchResult>,
): Promise<GatePunchResult> {
  if (completed) return completed;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const result = await execute();
    completed = result;
    return result;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
