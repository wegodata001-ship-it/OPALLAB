import type { OrderUploadSlotId } from "@/lib/orders/upload-slots";

const DB_NAME = "opal-lab-order-drafts";
const STORE = "slot-files";
const DB_VERSION = 1;

export type DraftSlotRecord = {
  draftKey: string;
  slotId: OrderUploadSlotId;
  /** For extra_files — index within the slot. */
  index: number;
  fileName: string;
  mimeType: string;
  blob: Blob;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: ["draftKey", "slotId", "index"] });
        store.createIndex("byDraft", "draftKey", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB tx aborted"));
  });
}

export async function saveDraftSlotFiles(
  draftKey: string,
  slotId: OrderUploadSlotId,
  files: File[],
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const index = store.index("byDraft");

  await new Promise<void>((resolve, reject) => {
    const req = index.openCursor(IDBKeyRange.only(draftKey));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve();
        return;
      }
      const value = cursor.value as DraftSlotRecord;
      if (value.slotId === slotId) cursor.delete();
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });

  const now = Date.now();
  files.forEach((file, i) => {
    const record: DraftSlotRecord = {
      draftKey,
      slotId,
      index: i,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      blob: file,
      updatedAt: now,
    };
    store.put(record);
  });

  await txDone(tx);
  db.close();
}

export async function loadDraftAll(draftKey: string): Promise<Map<OrderUploadSlotId, File[]>> {
  const result = new Map<OrderUploadSlotId, File[]>();
  if (typeof indexedDB === "undefined") return result;

  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const index = store.index("byDraft");

  const rows = await new Promise<DraftSlotRecord[]>((resolve, reject) => {
    const req = index.getAll(IDBKeyRange.only(draftKey));
    req.onsuccess = () => resolve((req.result as DraftSlotRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });

  await txDone(tx);
  db.close();

  rows.sort((a, b) => a.slotId.localeCompare(b.slotId) || a.index - b.index);
  for (const row of rows) {
    const file = new File([row.blob], row.fileName, {
      type: row.mimeType,
      lastModified: row.updatedAt,
    });
    const list = result.get(row.slotId) ?? [];
    list.push(file);
    result.set(row.slotId, list);
  }
  return result;
}

export async function clearDraft(draftKey: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const index = store.index("byDraft");

  await new Promise<void>((resolve, reject) => {
    const req = index.openCursor(IDBKeyRange.only(draftKey));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });

  await txDone(tx);
  db.close();
}
