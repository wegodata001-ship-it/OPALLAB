/** Asia/Jerusalem helpers for attendance time edits (HH:mm on existing calendar day). */

export const ATTENDANCE_TZ = "Asia/Jerusalem";

export type AttendanceTimeField = "checkIn" | "checkOut";

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseHHmm(raw: string): { hour: number; minute: number } | null {
  const trimmed = raw.trim();
  const m = HHMM_RE.exec(trimmed);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function formatHHmmJerusalem(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ATTENDANCE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const hour = hourRaw === "24" ? "00" : hourRaw;
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function jerusalemParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ATTENDANCE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const hourRaw = get("hour");
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(hourRaw === "24" ? "0" : hourRaw),
    minute: Number(get("minute")),
  };
}

/**
 * Build a Date whose wall-clock time in Asia/Jerusalem equals the given local parts.
 */
export function zonedJerusalemDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 4; i++) {
    const seen = jerusalemParts(guess);
    const asUtcMs = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
    const wantMs = Date.UTC(year, month - 1, day, hour, minute);
    guess = new Date(guess.getTime() + (wantMs - asUtcMs));
  }
  return guess;
}

/** Apply HH:mm onto the Jerusalem calendar day of `base`. */
export function applyHHmmOnJerusalemDay(base: Date, hhmm: string): Date | null {
  const parsed = parseHHmm(hhmm);
  if (!parsed) return null;
  const day = jerusalemParts(base);
  return zonedJerusalemDate(day.year, day.month, day.day, parsed.hour, parsed.minute);
}

/**
 * Resolve new check-in / check-out timestamps from an HH:mm edit.
 * Overnight shifts are supported: if new checkOut would be ≤ checkIn on the
 * chosen day, checkOut is moved to the next Jerusalem calendar day.
 */
export function resolveEditedAttendanceTimes(input: {
  field: AttendanceTimeField;
  timeHHmm: string;
  currentCheckIn: Date;
  currentCheckOut: Date | null | undefined;
}): { checkIn: Date; checkOut: Date | null } {
  const parsed = parseHHmm(input.timeHHmm);
  if (!parsed) {
    throw new Error("INVALID_TIME");
  }

  if (input.field === "checkIn") {
    const checkIn = applyHHmmOnJerusalemDay(input.currentCheckIn, input.timeHHmm);
    if (!checkIn) throw new Error("INVALID_TIME");
    const checkOut = input.currentCheckOut ? new Date(input.currentCheckOut) : null;
    if (checkOut && checkOut.getTime() <= checkIn.getTime()) {
      throw new Error("CHECKOUT_BEFORE_CHECKIN");
    }
    return { checkIn, checkOut };
  }

  // checkOut — new or replace
  const baseDay = input.currentCheckOut ?? input.currentCheckIn;
  let checkOut = applyHHmmOnJerusalemDay(baseDay, input.timeHHmm);
  if (!checkOut) throw new Error("INVALID_TIME");

  const checkIn = new Date(input.currentCheckIn);
  if (checkOut.getTime() <= checkIn.getTime()) {
    // Overnight: same wall-clock time on the next Jerusalem calendar day
    const outParts = jerusalemParts(checkOut);
    const noon = zonedJerusalemDate(outParts.year, outParts.month, outParts.day, 12, 0);
    const nextDay = jerusalemParts(new Date(noon.getTime() + 24 * 60 * 60 * 1000));
    checkOut = zonedJerusalemDate(
      nextDay.year,
      nextDay.month,
      nextDay.day,
      parsed.hour,
      parsed.minute,
    );
  }

  if (checkOut.getTime() <= checkIn.getTime()) {
    throw new Error("CHECKOUT_BEFORE_CHECKIN");
  }

  return { checkIn, checkOut };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD calendar key in Asia/Jerusalem. */
export function jerusalemDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ATTENDANCE_TZ }).format(date);
}

export function parseDateInput(raw: string): { year: number; month: number; day: number } | null {
  const m = DATE_RE.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Combine YYYY-MM-DD + HH:mm into a Jerusalem zoned instant. */
export function combineJerusalemDateTime(dateStr: string, timeHHmm: string): Date | null {
  const date = parseDateInput(dateStr);
  const time = parseHHmm(timeHHmm);
  if (!date || !time) return null;
  return zonedJerusalemDate(date.year, date.month, date.day, time.hour, time.minute);
}

/** Resolve full check-in / check-out from separate date + time fields. */
export function resolveFullAttendanceTimes(input: {
  checkInDate: string;
  checkInTime: string;
  checkOutDate?: string | null;
  checkOutTime?: string | null;
}): { checkIn: Date; checkOut: Date | null } {
  const checkIn = combineJerusalemDateTime(input.checkInDate, input.checkInTime);
  if (!checkIn) throw new Error("INVALID_CHECKIN");

  const outDate = input.checkOutDate?.trim() ?? "";
  const outTime = input.checkOutTime?.trim() ?? "";
  if (!outDate && !outTime) return { checkIn, checkOut: null };
  if (!outDate || !outTime) throw new Error("INCOMPLETE_CHECKOUT");

  const checkOut = combineJerusalemDateTime(outDate, outTime);
  if (!checkOut) throw new Error("INVALID_CHECKOUT");
  if (checkOut.getTime() <= checkIn.getTime()) {
    throw new Error("CHECKOUT_BEFORE_CHECKIN");
  }
  return { checkIn, checkOut };
}

/** Inclusive Jerusalem day bounds for duplicate-day checks. */
export function jerusalemDayBounds(dateKey: string): { from: Date; to: Date } {
  const parts = parseDateInput(dateKey);
  if (!parts) throw new Error("INVALID_DATE");
  const from = zonedJerusalemDate(parts.year, parts.month, parts.day, 0, 0);
  const nextMidnight = zonedJerusalemDate(parts.year, parts.month, parts.day + 1, 0, 0);
  return { from, to: new Date(nextMidnight.getTime() - 1) };
}
