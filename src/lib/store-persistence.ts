import { createInitialStore, type DataStore } from "@/lib/mock-data";
import { defaultLabSettings } from "@/lib/mock-data";

const STORAGE_KEY = "opal-lab-data-v1";

const DATE_FIELDS = new Set([
  "createdAt", "updatedAt", "entryDate", "completionDate", "checkIn", "checkOut",
  "paidAt", "uploadedAt", "packagedAt", "shippedAt", "deliveredAt", "completedAt",
]);

function reviveValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (DATE_FIELDS.has(key) && typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  if (key === "completedStages" && typeof value === "object" && value !== null) {
    const stages: Record<string, unknown> = {};
    for (const [sk, sv] of Object.entries(value as Record<string, unknown>)) {
      if (sv && typeof sv === "object") {
        const s = sv as Record<string, unknown>;
        stages[sk] = {
          ...s,
          completedAt: typeof s.completedAt === "string" ? new Date(s.completedAt) : s.completedAt,
        };
      }
    }
    return stages;
  }
  if (Array.isArray(value)) return value.map((item) => reviveItem(item));
  if (typeof value === "object") return reviveItem(value as Record<string, unknown>);
  return value;
}

function reviveItem(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = reviveValue(k, v);
  }
  return out;
}

export function loadStore(): DataStore {
  if (typeof window === "undefined") return createInitialStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialStore();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const revived: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      revived[k] = Array.isArray(v)
        ? v.map((item) => reviveItem(item as Record<string, unknown>))
        : v;
    }
    const store = revived as unknown as DataStore;
    if (!store.users?.length) return createInitialStore();
    if (!store.labSettings) store.labSettings = { ...defaultLabSettings };
    else store.labSettings = { ...defaultLabSettings, ...store.labSettings };
    return store;
  } catch {
    return createInitialStore();
  }
}

export function saveStore(store: DataStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // quota exceeded — ignore
  }
}

export function resetStore(): DataStore {
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  return createInitialStore();
}
