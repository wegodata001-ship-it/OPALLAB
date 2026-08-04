/**
 * Module-level single-flight lock for the attendance gate.
 * Survives React remounts (Suspense / Strict Mode) within the same page load.
 */

export type GatePunchAction = "check-in" | "check-out";

export type GatePunchResult = {
  action: GatePunchAction;
  userName: string;
  message: string;
  durationHours?: number | null;
  checkIn?: string | null;
  checkOut?: string | null;
};

let inFlight: Promise<GatePunchResult> | null = null;

export function peekGatePunchResult(): GatePunchResult | null {
  return null;
}

export function resetGatePunchLock(): void {
  inFlight = null;
}

export async function runGatePunchOnce(
  execute: () => Promise<GatePunchResult>,
): Promise<GatePunchResult> {
  if (inFlight) return inFlight;

  inFlight = (async () => execute())();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
