/**
 * File Manager V2 — queue diagnostics.
 * Filter console by `[QUEUE]`.
 */

export type QueueLiveStatus = {
  queueLength: number;
  runningWorkers: number;
  pendingWorkers: number;
  paused: boolean;
  activeUploads: number;
  maxConcurrent: number;
};

export function queueLog(
  event: string,
  detail: Record<string, string | number | boolean | null | undefined> = {},
): void {
  const parts = Object.entries(detail)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  console.info(`[QUEUE] ${event}${parts ? ` · ${parts}` : ""}`);
}

export function logQueueLiveStatus(status: QueueLiveStatus, tag = "LIVE"): void {
  queueLog(tag, {
    queueLength: status.queueLength,
    runningWorkers: status.runningWorkers,
    pendingWorkers: status.pendingWorkers,
    paused: status.paused,
    activeUploads: status.activeUploads,
    maxConcurrent: status.maxConcurrent,
  });
}

/** Stall if still queued & no worker claimed it within this window. */
export const QUEUE_STALL_MS = 500;
