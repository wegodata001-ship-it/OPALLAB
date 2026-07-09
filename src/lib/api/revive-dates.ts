const DATE_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "entryDate",
  "completionDate",
  "checkIn",
  "checkOut",
  "paidAt",
  "uploadedAt",
  "packagedAt",
  "shippedAt",
  "deliveredAt",
  "completedAt",
]);

function reviveValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (DATE_FIELDS.has(key) && typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date;
  }
  if (key === "completedStages" && typeof value === "object" && value !== null) {
    const stages: Record<string, unknown> = {};
    for (const [stageKey, stage] of Object.entries(value as Record<string, unknown>)) {
      if (!stage || typeof stage !== "object") continue;
      const entry = stage as Record<string, unknown>;
      stages[stageKey] = {
        ...entry,
        completedAt:
          typeof entry.completedAt === "string" ? new Date(entry.completedAt) : entry.completedAt,
      };
    }
    return stages;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      item !== null && typeof item === "object"
        ? reviveItem(item as Record<string, unknown>)
        : item,
    );
  }
  if (typeof value === "object") return reviveItem(value as Record<string, unknown>);
  return value;
}

function reviveItem(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = reviveValue(key, value);
  }
  return out;
}

export function reviveDates<T>(data: T): T {
  return reviveItem(data as Record<string, unknown>) as T;
}
