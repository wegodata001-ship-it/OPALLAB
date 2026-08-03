const STORAGE_KEY = "opal-lab-trusted-device-v1";

/** Get or create a stable trusted-device id in localStorage (not a hardware ID). */
export function getOrCreateDeviceKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 16) return existing;
    const key =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(STORAGE_KEY, key);
    return key;
  } catch {
    return `ephemeral_${Date.now()}`;
  }
}

export function readDeviceKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearDeviceKey(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
