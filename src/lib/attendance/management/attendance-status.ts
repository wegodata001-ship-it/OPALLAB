import { formatTime } from "@/lib/utils";
import type { AttendanceManagementRecord } from "./types";

/** Minimum worked duration — 5:00. No maximum. */
export const MINIMUM_WORK_MINUTES = 300;
/** Below this (but >=) is critical; 4:00–4:59 is borderline. */
export const BOUNDARY_MINUTES = 240;

/** Expected start (Asia/Jerusalem) — same as legacy late rule. */
export const EXPECTED_START_HOUR = 9;
export const EXPECTED_START_MINUTE = 0;
/** Expected exit (Asia/Jerusalem). */
export const EXPECTED_EXIT_HOUR = 16;
export const EXPECTED_EXIT_MINUTE = 0;

export type AttendanceStatusLevel =
  | "missing_checkout"
  | "critical"
  | "borderline"
  | "late"
  | "early_leave"
  | "ok";

export type AttendanceStatusReason = {
  id: string;
  text: string;
};

export type AttendanceStatusResult = {
  level: AttendanceStatusLevel;
  label: string;
  reasons: AttendanceStatusReason[];
  workedMinutes: number | null;
  minimumMinutes: number;
  missingMinutes: number | null;
  lateMinutes: number | null;
  earlyExitMinutes: number | null;
  expectedStartTime: string;
  expectedExitTime: string;
};

const LEVEL_PRIORITY: Record<AttendanceStatusLevel, number> = {
  missing_checkout: 100,
  critical: 90,
  borderline: 70,
  late: 50,
  early_leave: 50,
  ok: 0,
};

const LEVEL_LABELS: Record<AttendanceStatusLevel, string> = {
  missing_checkout: "חסרה יציאה",
  critical: "חריג",
  borderline: "גבולי",
  late: "איחור",
  early_leave: "יציאה מוקדמת",
  ok: "תקין",
};

function jerusalemHourMinute(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "0";
  return {
    hour: Number(hourRaw === "24" ? "0" : hourRaw),
    minute: Number(parts.find((p) => p.type === "minute")?.value ?? 0),
  };
}

export function formatMinutesHHmm(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDurationFromHours(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  return formatMinutesHHmm(Math.round(hours * 60));
}

export function workedMinutesFromRecord(
  checkIn: Date,
  checkOut: Date | null | undefined,
): number | null {
  if (!checkOut) return null;
  return Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000);
}

export function lateMinutesFromCheckIn(checkIn: Date): number | null {
  const { hour, minute } = jerusalemHourMinute(checkIn);
  const actual = hour * 60 + minute;
  const expected = EXPECTED_START_HOUR * 60 + EXPECTED_START_MINUTE;
  if (actual <= expected) return null;
  return actual - expected;
}

export function earlyExitMinutesFromCheckOut(checkOut: Date): number | null {
  const { hour, minute } = jerusalemHourMinute(checkOut);
  const actual = hour * 60 + minute;
  const expected = EXPECTED_EXIT_HOUR * 60 + EXPECTED_EXIT_MINUTE;
  if (actual >= expected) return null;
  return expected - actual;
}

export function isLateCheckIn(checkIn: Date): boolean {
  return lateMinutesFromCheckIn(checkIn) != null;
}

export function isEarlyLeaveCheckOut(checkOut: Date): boolean {
  return earlyExitMinutesFromCheckOut(checkOut) != null;
}

type DurationTier = "unknown" | "ok" | "borderline" | "critical";

function durationTier(workedMinutes: number | null): DurationTier {
  if (workedMinutes == null) return "unknown";
  if (workedMinutes >= MINIMUM_WORK_MINUTES) return "ok";
  if (workedMinutes >= BOUNDARY_MINUTES) return "borderline";
  return "critical";
}

function pickPrimaryLevel(levels: AttendanceStatusLevel[]): AttendanceStatusLevel {
  return levels.reduce(
    (best, level) => (LEVEL_PRIORITY[level] > LEVEL_PRIORITY[best] ? level : best),
    "ok" as AttendanceStatusLevel,
  );
}

function expectedTimeLabel(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function getAttendanceStatus(
  record: Pick<
    AttendanceManagementRecord,
    | "checkIn"
    | "checkOut"
    | "checkInLatitude"
    | "checkInLongitude"
    | "latitude"
    | "longitude"
    | "outOfGeofence"
    | "anomalies"
  >,
): AttendanceStatusResult {
  const expectedStartTime = expectedTimeLabel(EXPECTED_START_HOUR, EXPECTED_START_MINUTE);
  const expectedExitTime = expectedTimeLabel(EXPECTED_EXIT_HOUR, EXPECTED_EXIT_MINUTE);
  const reasons: AttendanceStatusReason[] = [];
  const levels: AttendanceStatusLevel[] = [];

  if (!record.checkOut) {
    reasons.push({
      id: "missing_checkout",
      text: "לא ניתן לחשב משך עבודה עד להשלמת שעת היציאה.",
    });
    return {
      level: "missing_checkout",
      label: LEVEL_LABELS.missing_checkout,
      reasons,
      workedMinutes: null,
      minimumMinutes: MINIMUM_WORK_MINUTES,
      missingMinutes: null,
      lateMinutes: lateMinutesFromCheckIn(record.checkIn),
      earlyExitMinutes: null,
      expectedStartTime,
      expectedExitTime,
    };
  }

  const workedMinutes = workedMinutesFromRecord(record.checkIn, record.checkOut);
  const tier = durationTier(workedMinutes);
  const lateMinutes = lateMinutesFromCheckIn(record.checkIn);
  const earlyExitMinutes = earlyExitMinutesFromCheckOut(record.checkOut);

  if (tier === "critical" && workedMinutes != null) {
    levels.push("critical");
    const missing = MINIMUM_WORK_MINUTES - workedMinutes;
    reasons.push({
      id: "duration_critical",
      text: `משך העבודה ${formatMinutesHHmm(workedMinutes)} — חסרות ${formatMinutesHHmm(missing)} מהמינימום.`,
    });
  } else if (tier === "borderline" && workedMinutes != null) {
    levels.push("borderline");
    const missing = MINIMUM_WORK_MINUTES - workedMinutes;
    reasons.push({
      id: "duration_borderline",
      text: `משך העבודה ${formatMinutesHHmm(workedMinutes)} — חסרות ${formatMinutesHHmm(missing)} מהמינימום.`,
    });
    reasons.push({
      id: "duration_borderline_note",
      text: "משך העבודה נמוך מהמינימום, אך נמצא בטווח הגבולי של עד שעה.",
    });
  }

  if (lateMinutes != null && lateMinutes > 0) {
    levels.push("late");
    reasons.push({
      id: "late",
      text: `איחור של ${formatMinutesHHmm(lateMinutes)}.`,
    });
  }

  if (earlyExitMinutes != null && earlyExitMinutes > 0) {
    levels.push("early_leave");
    reasons.push({
      id: "early_leave",
      text: `יציאה מוקדמת ב-${formatMinutesHHmm(earlyExitMinutes)} (יציאה בפועל ${formatTime(record.checkOut)}, מתוכנן ${expectedExitTime}).`,
    });
  }

  if (record.anomalies?.includes("missing_gps")) {
    reasons.push({ id: "missing_gps", text: "חסר GPS בכניסה/יציאה." });
  }
  if (record.outOfGeofence || record.anomalies?.includes("out_of_geofence")) {
    reasons.push({ id: "out_of_geofence", text: "כניסה מחוץ לאזור המעבדה." });
  }

  if (levels.length === 0) {
    levels.push("ok");
    if (tier === "ok") {
      reasons.push({
        id: "duration_ok",
        text: `משך העבודה ${formatMinutesHHmm(workedMinutes)} — עומד במינימום של ${formatMinutesHHmm(MINIMUM_WORK_MINUTES)}.`,
      });
    }
  }

  const level = pickPrimaryLevel(levels);
  const missingMinutes =
    workedMinutes != null && workedMinutes < MINIMUM_WORK_MINUTES
      ? MINIMUM_WORK_MINUTES - workedMinutes
      : null;

  return {
    level,
    label: LEVEL_LABELS[level],
    reasons,
    workedMinutes,
    minimumMinutes: MINIMUM_WORK_MINUTES,
    missingMinutes,
    lateMinutes,
    earlyExitMinutes,
    expectedStartTime,
    expectedExitTime,
  };
}

export function statusBadgeClassName(level: AttendanceStatusLevel): string {
  switch (level) {
    case "ok":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "borderline":
    case "missing_checkout":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "critical":
      return "bg-red-50 text-red-700 ring-red-200";
    case "late":
    case "early_leave":
      return "bg-orange-50 text-orange-800 ring-orange-200";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
}

/** Map primary status level to legacy compliance filter bucket. */
export function complianceStatusFromLevel(
  level: AttendanceStatusLevel,
  hasMissingData: boolean,
): "ok" | "missing" | "anomaly" {
  if (level === "missing_checkout" || hasMissingData) return "missing";
  if (level === "ok") return "ok";
  return "anomaly";
}
