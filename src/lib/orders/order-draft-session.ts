const PREFIX = "opal-order-draft:";

export type StoredOrderDraft = {
  orderId: string;
  createdAt: number;
};

export function draftSessionKey(draftKey: string): string {
  return `${PREFIX}${draftKey}`;
}

export function loadDraftSession(draftKey: string): StoredOrderDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(draftSessionKey(draftKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredOrderDraft;
    if (!parsed?.orderId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraftSession(draftKey: string, orderId: string): void {
  if (typeof window === "undefined") return;
  const payload: StoredOrderDraft = { orderId, createdAt: Date.now() };
  sessionStorage.setItem(draftSessionKey(draftKey), JSON.stringify(payload));
}

export function clearDraftSession(draftKey: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(draftSessionKey(draftKey));
}
