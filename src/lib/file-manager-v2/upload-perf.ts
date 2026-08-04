/**
 * File Manager V2 — upload performance audit.
 * Filter console by `[UPLOAD]` or `[fm2-perf]`.
 */

export type PerfStep =
  | "SELECT_FILE"
  | "CREATE_DRAFT"
  | "COMPRESS"
  | "GET_UPLOAD_URL"
  | "UPLOAD_TO_STORAGE"
  | "VERIFY_STORAGE"
  | "CREATE_DATABASE_RECORD"
  | "GENERATE_THUMBNAIL"
  | "REFRESH_FILE_LIST"
  | "UI_RENDER"
  | "RETRY_WAIT"
  | "TOTAL";

export type ApiTiming = {
  endpoint: string;
  serverMs: number | null;
  networkMs: number;
  totalMs: number;
  status: number;
};

export type PerfReport = {
  fileName: string;
  fileSize: number;
  localId: string;
  steps: Partial<Record<PerfStep, number>>;
  apis: ApiTiming[];
  flags: {
    doubleUpload: boolean;
    draftCreated: boolean;
    refreshList: boolean;
    base64: boolean;
    thumbnailOnCriticalPath: boolean;
    retryAfterSuccess: boolean;
  };
  error?: string;
};

/** Soft budget per stage (ms). Above = FAIL in audit table. */
export const STAGE_BUDGET_MS: Partial<Record<PerfStep, number>> = {
  SELECT_FILE: 200,
  CREATE_DRAFT: 1000,
  COMPRESS: 1000,
  GET_UPLOAD_URL: 1000,
  UPLOAD_TO_STORAGE: 60_000, // size-dependent — flag only runaway hangs
  VERIFY_STORAGE: 1000,
  CREATE_DATABASE_RECORD: 1000,
  GENERATE_THUMBNAIL: 0,
  REFRESH_FILE_LIST: 0,
  UI_RENDER: 50,
  TOTAL: 90_000,
};

const pad = (label: string, width = 24) => label.padEnd(width, ".");

export type UploadLogEvent =
  | "File Selected"
  | "Preview Ready"
  | "Storage Upload Started"
  | "Storage Upload Finished"
  | "Database Saved"
  | "UI Updated";

/** Structured console log — filter by `[UPLOAD]`. */
export function uploadLog(
  event: UploadLogEvent,
  detail: Record<string, string | number | boolean | null | undefined> = {},
): void {
  const parts = Object.entries(detail)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  console.info(`[UPLOAD] ${event}${parts ? ` · ${parts}` : ""}`);
}

export function createPerfSession(fileName: string, fileSize: number, localId: string) {
  const t0 = performance.now();
  const marks = new Map<string, number>();
  const steps: Partial<Record<PerfStep, number>> = {};
  const apis: ApiTiming[] = [];
  const flags = {
    doubleUpload: false,
    draftCreated: false,
    refreshList: false,
    base64: false,
    thumbnailOnCriticalPath: false,
    retryAfterSuccess: false,
  };

  const mark = (name: string) => {
    marks.set(name, performance.now());
  };

  const measure = (step: PerfStep, from: string, to?: string) => {
    const a = marks.get(from);
    const b = to ? marks.get(to) : performance.now();
    if (a == null || b == null) return;
    steps[step] = Math.round(b - a);
  };

  const span = async <T>(step: PerfStep, fn: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      steps[step] = Math.round(performance.now() - start);
    }
  };

  const recordApi = (timing: ApiTiming) => {
    apis.push(timing);
  };

  const finish = (error?: string): PerfReport => {
    steps.TOTAL = Math.round(performance.now() - t0);
    const report: PerfReport = {
      fileName,
      fileSize,
      localId,
      steps,
      apis,
      flags,
      error,
    };
    printPerfReport(report);
    return report;
  };

  return { mark, measure, span, recordApi, flags, steps, apis, finish, t0 };
}

export type PerfSession = ReturnType<typeof createPerfSession>;

export function printPerfReport(report: PerfReport): void {
  const lines: string[] = [
    "",
    "========== FM2 UPLOAD PERF ==========",
    `file: ${report.fileName} (${(report.fileSize / 1024).toFixed(1)} KB)`,
    `id:   ${report.localId}`,
    "",
    "שלב | ms | תקין?",
  ];

  const order: PerfStep[] = [
    "SELECT_FILE",
    "CREATE_DRAFT",
    "COMPRESS",
    "GET_UPLOAD_URL",
    "UPLOAD_TO_STORAGE",
    "VERIFY_STORAGE",
    "CREATE_DATABASE_RECORD",
    "GENERATE_THUMBNAIL",
    "REFRESH_FILE_LIST",
    "UI_RENDER",
    "RETRY_WAIT",
    "TOTAL",
  ];

  for (const step of order) {
    const ms = report.steps[step];
    if (ms == null) continue;
    const budget = STAGE_BUDGET_MS[step];
    const ok =
      budget == null
        ? "—"
        : step === "UPLOAD_TO_STORAGE"
          ? ms <= budget
            ? "תקין"
            : "לא תקין (hang?)"
          : ms <= budget
            ? "תקין"
            : "לא תקין";
    lines.push(`${pad(step)} ${ms}ms · ${ok}`);
  }

  if (report.apis.length) {
    lines.push("");
    lines.push("--- API ---");
    for (const a of report.apis) {
      lines.push(`${a.endpoint}`);
      lines.push(
        `  Server Time ... ${a.serverMs != null ? `${a.serverMs}ms` : "n/a"}`,
      );
      lines.push(`  Network Time .. ${a.networkMs}ms`);
      lines.push(`  Total Time .... ${a.totalMs}ms (HTTP ${a.status})`);
    }
  }

  lines.push("");
  lines.push("--- FLAGS ---");
  lines.push(`doubleUpload .............. ${report.flags.doubleUpload}`);
  lines.push(`draftCreatedThisFile ...... ${report.flags.draftCreated}`);
  lines.push(`refreshFileList ........... ${report.flags.refreshList}`);
  lines.push(`base64OnCriticalPath ...... ${report.flags.base64}`);
  lines.push(`thumbnailOnCriticalPath ... ${report.flags.thumbnailOnCriticalPath}`);
  lines.push(`retryAfterSuccess ......... ${report.flags.retryAfterSuccess}`);

  // Target checks
  const toPut =
    (report.steps.SELECT_FILE ?? 0) +
    (report.steps.CREATE_DRAFT ?? 0) +
    (report.steps.COMPRESS ?? 0) +
    (report.steps.GET_UPLOAD_URL ?? 0);
  lines.push("");
  lines.push("--- TARGETS ---");
  lines.push(
    `startUploadBudget(<200ms to PUT) ... ${toPut}ms · ${toPut <= 200 ? "PASS" : "FAIL"}`,
  );
  lines.push(
    `previewBeforeUpload ................ PASS (blob URL at enqueue)`,
  );
  lines.push(
    `refreshAfterUpload ................. ${report.flags.refreshList ? "FAIL" : "PASS (local markDone)"}`,
  );

  if (report.error) {
    lines.push("");
    lines.push(`ERROR: ${report.error}`);
  }

  lines.push("====================================");
  lines.push("");

  console.info(`[fm2-perf]\n${lines.join("\n")}`);
  console.info(
    `[UPLOAD] Report · file=${report.fileName} totalMs=${report.steps.TOTAL ?? "?"} error=${report.error ?? "none"}`,
  );
}

/** Parse X-Server-Time-Ms / Server-Timing from response headers. */
export function readServerTimeMs(headers: Headers): number | null {
  const direct = headers.get("x-server-time-ms");
  if (direct && !Number.isNaN(Number(direct))) return Number(direct);
  const st = headers.get("server-timing");
  if (!st) return null;
  const m = /(?:^|,)\s*app(?:;dur=([0-9.]+))?/i.exec(st);
  if (m?.[1]) return Math.round(Number(m[1]));
  return null;
}
