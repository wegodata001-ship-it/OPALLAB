/** Format HH:MM in he-IL (24h). */
export function formatAttendanceTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Format decimal hours as H:MM. */
export function formatAttendanceDuration(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return "—";
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
