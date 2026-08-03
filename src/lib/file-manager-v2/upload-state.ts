import type { FmFile, FmFileKind } from "@/lib/file-manager-v2/types";

export type FmUploadAggregate = {
  total: number;
  queued: number;
  uploading: number;
  done: number;
  error: number;
  /** Combined progress 0–100 across all session files */
  overallProgress: number;
  /** At least one file still uploading or waiting */
  isUploading: boolean;
  /** Every tracked file reached server (done + fileId) */
  isComplete: boolean;
  /** Blocks order save — waiting, uploading, or failed */
  hasBlocking: boolean;
  /** Summary lines after success, e.g. "3 STL" */
  kindSummary: { label: string; count: number }[];
};

export function isBlockingFile(f: FmFile): boolean {
  if (f.status === "queued" || f.status === "uploading") return true;
  if (f.status === "error") return true;
  if (f.status === "done" && f.localFile && !f.fileId) return true;
  return false;
}

function kindLabel(kind: FmFileKind, fileName: string): string {
  if (kind === "image") return "תמונות";
  if (kind === "pdf") return "PDF";
  if (kind === "model3d") {
    const ext = fileName.split(".").pop()?.toUpperCase();
    return ext === "STL" || ext === "OBJ" || ext === "PLY" ? ext : "STL";
  }
  if (kind === "archive") return "ZIP";
  if (kind === "dcm") return "DCM";
  if (kind === "video") return "וידאו";
  return "קבצים";
}

export function computeUploadAggregate(files: FmFile[]): FmUploadAggregate {
  /** Only track files from the current browser session (local picks + in-flight). */
  const tracked = files.filter(
    (f) => f.localFile != null || f.status !== "done" || !f.fileId,
  );

  if (tracked.length === 0) {
    return {
      total: 0,
      queued: 0,
      uploading: 0,
      done: 0,
      error: 0,
      overallProgress: 0,
      isUploading: false,
      isComplete: true,
      hasBlocking: false,
      kindSummary: [],
    };
  }

  let queued = 0;
  let uploading = 0;
  let done = 0;
  let error = 0;
  let progressSum = 0;

  for (const f of tracked) {
    if (f.status === "queued") {
      queued += 1;
      progressSum += 0;
    } else if (f.status === "uploading") {
      uploading += 1;
      progressSum += f.progress;
    } else if (f.status === "error") {
      error += 1;
      progressSum += f.progress;
    } else if (f.status === "done" && f.fileId) {
      done += 1;
      progressSum += 100;
    }
  }

  const total = tracked.length;
  const overallProgress = total > 0 ? Math.round(progressSum / total) : 0;
  const hasBlocking = tracked.some(isBlockingFile);
  const isComplete = total > 0 && !hasBlocking && done === total;
  const isUploading = queued > 0 || uploading > 0;

  const kindMap = new Map<string, number>();
  for (const f of tracked.filter((x) => x.status === "done" && x.fileId)) {
    const label = kindLabel(f.kind, f.fileName);
    kindMap.set(label, (kindMap.get(label) ?? 0) + 1);
  }

  const kindSummary = [...kindMap.entries()].map(([label, count]) => ({ label, count }));

  return {
    total,
    queued,
    uploading,
    done,
    error,
    overallProgress,
    isUploading,
    isComplete,
    hasBlocking,
    kindSummary,
  };
}

export function mergeAggregates(list: FmUploadAggregate[]): FmUploadAggregate {
  if (!list.length) {
    return {
      total: 0,
      queued: 0,
      uploading: 0,
      done: 0,
      error: 0,
      overallProgress: 0,
      isUploading: false,
      isComplete: true,
      hasBlocking: false,
      kindSummary: [],
    };
  }

  let total = 0;
  let queued = 0;
  let uploading = 0;
  let done = 0;
  let error = 0;
  let progressSum = 0;
  const kindMap = new Map<string, number>();

  for (const a of list) {
    total += a.total;
    queued += a.queued;
    uploading += a.uploading;
    done += a.done;
    error += a.error;
    progressSum += a.overallProgress * a.total;
    for (const k of a.kindSummary) {
      kindMap.set(k.label, (kindMap.get(k.label) ?? 0) + k.count);
    }
  }

  const overallProgress = total > 0 ? Math.round(progressSum / total) : 0;
  const hasBlocking = list.some((a) => a.hasBlocking);
  const isComplete = total > 0 && !hasBlocking && done === total;
  const isUploading = queued > 0 || uploading > 0;

  return {
    total,
    queued,
    uploading,
    done,
    error,
    overallProgress,
    isUploading,
    isComplete,
    hasBlocking,
    kindSummary: [...kindMap.entries()].map(([label, count]) => ({ label, count })),
  };
}
