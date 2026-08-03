"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Box,
  Check,
  Download,
  Eye,
  FileText,
  Maximize2,
  Plus,
  Replace,
  Trash2,
  Camera,
  Image as ImageIcon,
  FolderOpen,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelViewer3D } from "@/components/orders/model-viewer-3d";
import { useApp } from "@/providers/AppProvider";
import { cn } from "@/lib/utils";
import { compressImageIfNeeded } from "@/lib/orders/compress-image";
import {
  clearDraft,
  loadDraftAll,
  saveDraftSlotFiles,
} from "@/lib/orders/draft-upload-store";
import { generateModelThumbnail } from "@/lib/orders/model-thumbnail";
import {
  canOpenInModelViewer,
  fileTypeLabel,
  formatFileSize,
  isDicomFile,
  isImageFile,
  isPdfFile,
} from "@/lib/orders/scan-file";
import {
  ORDER_UPLOAD_SLOTS,
  getSlotDef,
  slotNotes,
  type OrderUploadSlotDef,
  type OrderUploadSlotId,
} from "@/lib/orders/upload-slots";
import {
  UploadConflictError,
  uploadOrderFileWithProgress,
  type UploadVersionMode,
} from "@/lib/orders/upload-with-progress";
import {
  persistSlotUploads,
  type PendingSlotUpload,
} from "@/lib/orders/persist-slot-uploads";

type TileItem = {
  file: File;
  previewUrl: string | null;
  progress: number;
  status: "ready" | "uploading" | "uploaded" | "error";
  error?: string;
  addedAt: Date;
  kind: "image" | "model3d" | "pdf" | "dcm" | "other";
};

type SlotState = {
  items: TileItem[];
};

export type { PendingSlotUpload };

export type OrderUploadTilesHandle = {
  getPendingUploads: () => PendingSlotUpload[];
  uploadAll: (orderId: string, pending?: PendingSlotUpload[]) => Promise<void>;
  clear: () => Promise<void>;
  hasFiles: () => boolean;
  askVersionMode: (
    fileName: string,
    existingName: string,
    existingVersion: number,
  ) => Promise<UploadVersionMode | null>;
};

interface OrderUploadTilesProps {
  draftKey: string;
  className?: string;
  /** When set, files upload immediately to this order. */
  orderId?: string;
  onChanged?: () => void;
}

type AssignOptions = {
  /** Default true — never wipe existing files unless replacing an index. */
  append?: boolean;
  replaceIndex?: number | null;
};

function emptySlots(): Record<OrderUploadSlotId, SlotState> {
  const map = {} as Record<OrderUploadSlotId, SlotState>;
  for (const slot of ORDER_UPLOAD_SLOTS) {
    map[slot.id] = { items: [] };
  }
  return map;
}

function revokePreviews(items: TileItem[]) {
  for (const item of items) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
}

function revokeRemoved(prev: TileItem[], next: TileItem[]) {
  const keep = new Set(next.map((i) => i.previewUrl).filter(Boolean));
  for (const item of prev) {
    if (item.previewUrl && !keep.has(item.previewUrl)) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
}

function detectTileKind(file: File): TileItem["kind"] {
  if (isImageFile(file)) return "image";
  if (canOpenInModelViewer(file)) return "model3d";
  if (isPdfFile(file)) return "pdf";
  if (isDicomFile(file)) return "dcm";
  return "other";
}

async function filesToItems(files: File[]): Promise<TileItem[]> {
  const items: TileItem[] = [];
  for (const raw of files) {
    const file = await compressImageIfNeeded(raw);
    const kind = detectTileKind(file);
    let previewUrl: string | null = null;

    if (kind === "image" || kind === "pdf") {
      previewUrl = URL.createObjectURL(file);
    } else if (kind === "model3d") {
      previewUrl = await generateModelThumbnail(file);
    }

    items.push({
      file,
      previewUrl,
      progress: 100,
      status: "ready",
      addedAt: new Date(),
      kind,
    });
  }
  return items;
}

function countLabel(def: OrderUploadSlotDef, count: number): string {
  if (def.group === "photos") return count === 1 ? "תמונה אחת" : `${count} תמונות`;
  if (def.group === "scans") return count === 1 ? "סריקה אחת" : `${count} סריקות`;
  return count === 1 ? "קובץ אחד" : `${count} קבצים`;
}

function badgeEmoji(def: OrderUploadSlotDef): string {
  if (def.group === "photos") return "📷";
  if (def.group === "scans") return "🦷";
  return "📄";
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export const OrderUploadTiles = forwardRef<OrderUploadTilesHandle, OrderUploadTilesProps>(
  function OrderUploadTiles({ draftKey, className, orderId, onChanged }, ref) {
    const { currentUser } = useApp();
    const [slots, setSlots] = useState<Record<OrderUploadSlotId, SlotState>>(emptySlots);
    const [viewerFullscreen, setViewerFullscreen] = useState(false);
    const [conflict, setConflict] = useState<{
      fileName: string;
      existingName: string;
      existingVersion: number;
      resolve: (mode: UploadVersionMode | null) => void;
    } | null>(null);

    const askVersionMode = useCallback(
      (fileName: string, existingName: string, existingVersion: number) =>
        new Promise<UploadVersionMode | null>((resolve) => {
          setConflict({ fileName, existingName, existingVersion, resolve });
        }),
      [],
    );

    const uploadOne = useCallback(
      async (
        targetOrderId: string,
        slotId: OrderUploadSlotId,
        file: File,
        onProgress?: (pct: number) => void,
        versionMode?: UploadVersionMode,
      ) => {
        try {
          await uploadOrderFileWithProgress({
            orderId: targetOrderId,
            file,
            notes: slotNotes(slotId),
            uploadSlotId: slotId,
            versionMode,
            onProgress,
          });
        } catch (err) {
          if (err instanceof UploadConflictError) {
            const mode = await askVersionMode(
              file.name,
              err.conflict.existing.fileName,
              err.conflict.existing.version,
            );
            if (!mode) throw new Error("ההעלאה בוטלה");
            await uploadOrderFileWithProgress({
              orderId: targetOrderId,
              file,
              notes: slotNotes(slotId),
              uploadSlotId: slotId,
              versionMode: mode,
              onProgress,
            });
            return;
          }
          throw err;
        }
      },
      [askVersionMode],
    );

    const [hydrated, setHydrated] = useState(false);
    const [pickerSlot, setPickerSlot] = useState<OrderUploadSlotId | null>(null);
    const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
    /** Slot file manager (list) — opened when card already has files. */
    const [managerSlot, setManagerSlot] = useState<OrderUploadSlotId | null>(null);
    /** Single-file preview / zoom. */
    const [viewer, setViewer] = useState<{ slotId: OrderUploadSlotId; index: number } | null>(null);
    const [dragOver, setDragOver] = useState<OrderUploadSlotId | null>(null);
    const [focusedSlot, setFocusedSlot] = useState<OrderUploadSlotId | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const galleryInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const filesInputRef = useRef<HTMLInputElement>(null);
    const slotsRef = useRef(slots);
    slotsRef.current = slots;

    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const draft = await loadDraftAll(draftKey);
          if (cancelled) return;
          const next = emptySlots();
          for (const [slotId, files] of draft) {
            next[slotId] = { items: await filesToItems(files) };
          }
          setSlots(next);
        } catch {
          /* ignore corrupt drafts */
        } finally {
          if (!cancelled) setHydrated(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [draftKey]);

    useEffect(() => {
      return () => {
        for (const slot of Object.values(slotsRef.current)) {
          revokePreviews(slot.items);
        }
      };
    }, []);

    const persistSlot = useCallback(
      async (slotId: OrderUploadSlotId, items: TileItem[]) => {
        await saveDraftSlotFiles(
          draftKey,
          slotId,
          items.map((i) => i.file),
        );
        onChanged?.();
      },
      [draftKey, onChanged],
    );

    const setSlotItems = useCallback(
      async (slotId: OrderUploadSlotId, items: TileItem[], persist = true) => {
        setSlots((prev) => {
          revokeRemoved(prev[slotId].items, items);
          return { ...prev, [slotId]: { items } };
        });
        if (persist) await persistSlot(slotId, items);
      },
      [persistSlot],
    );

    const mergeWithNameConflicts = useCallback(
      async (prevItems: TileItem[], incoming: TileItem[]): Promise<TileItem[]> => {
        const working = [...prevItems];
        for (const item of incoming) {
          const existingIdx = working.findIndex((w) => sameName(w.file.name, item.file.name));
          if (existingIdx < 0) {
            working.push(item);
            continue;
          }
          const existing = working[existingIdx]!;
          const mode = await askVersionMode(item.file.name, existing.file.name, 1);
          if (!mode) {
            revokePreviews([item]);
            continue;
          }
          if (mode === "replace") {
            revokePreviews([existing]);
            working[existingIdx] = item;
          } else {
            // new version — keep both in the local list
            working.push(item);
          }
        }
        return working;
      },
      [askVersionMode],
    );

    const assignFiles = useCallback(
      async (slotId: OrderUploadSlotId, list: FileList | File[] | null, options: AssignOptions = {}) => {
        if (!list) return;
        const incoming = Array.from(list);
        if (!incoming.length) return;

        const append = options.append !== false;
        const replaceAt = options.replaceIndex ?? null;
        const newItems = await filesToItems(incoming);
        const prevItems = slotsRef.current[slotId].items;

        let merged: TileItem[];
        let uploadStartIndex: number;

        if (replaceAt != null && prevItems[replaceAt]) {
          const first = newItems[0]!;
          revokePreviews(newItems.slice(1));
          revokePreviews([prevItems[replaceAt]!]);
          merged = [...prevItems];
          merged[replaceAt] = first;
          uploadStartIndex = replaceAt;
        } else if (append && prevItems.length > 0) {
          merged = await mergeWithNameConflicts(prevItems, newItems);
          uploadStartIndex = prevItems.length;
        } else if (append) {
          merged = newItems;
          uploadStartIndex = 0;
        } else {
          revokePreviews(prevItems);
          merged = newItems;
          uploadStartIndex = 0;
        }

        await setSlotItems(slotId, merged);

        if (orderId) {
          const toUpload =
            replaceAt != null
              ? [merged[replaceAt]!].filter(Boolean)
              : merged.slice(uploadStartIndex);

          for (let i = 0; i < toUpload.length; i++) {
            const item = toUpload[i]!;
            const globalIndex =
              replaceAt != null
                ? replaceAt
                : merged.findIndex((m) => m === item) >= 0
                  ? merged.findIndex((m) => m === item)
                  : uploadStartIndex + i;

            const idx = merged.indexOf(item);
            const targetIndex = idx >= 0 ? idx : globalIndex;

            setSlots((prev) => {
              const items = [...prev[slotId].items];
              const cur = items[targetIndex];
              if (!cur) return prev;
              items[targetIndex] = { ...cur, status: "uploading", progress: 0 };
              return { ...prev, [slotId]: { items } };
            });
            try {
              await uploadOne(orderId, slotId, item.file, (pct) => {
                setSlots((prev) => {
                  const items = [...prev[slotId].items];
                  const cur = items[targetIndex];
                  if (!cur) return prev;
                  items[targetIndex] = { ...cur, progress: pct, status: "uploading" };
                  return { ...prev, [slotId]: { items } };
                });
              });
              setSlots((prev) => {
                const items = [...prev[slotId].items];
                const cur = items[targetIndex];
                if (!cur) return prev;
                items[targetIndex] = { ...cur, progress: 100, status: "uploaded" };
                return { ...prev, [slotId]: { items } };
              });
              setToast("הקובץ נשמר בהצלחה");
            } catch (err) {
              console.error("[order-upload-tiles] immediate upload failed", err);
              setSlots((prev) => {
                const items = [...prev[slotId].items];
                const cur = items[targetIndex];
                if (!cur) return prev;
                items[targetIndex] = {
                  ...cur,
                  status: "error",
                  error: err instanceof Error ? err.message : "שגיאה",
                };
                return { ...prev, [slotId]: { items } };
              });
              setToast(
                err instanceof Error
                  ? `הקובץ לא נשמר: ${err.message}`
                  : "הקובץ לא נשמר בשרת",
              );
            }
          }
        }
      },
      [orderId, setSlotItems, uploadOne, mergeWithNameConflicts],
    );

    useEffect(() => {
      if (!toast) return;
      const t = window.setTimeout(() => setToast(null), 3500);
      return () => window.clearTimeout(t);
    }, [toast]);

    useImperativeHandle(
      ref,
      () => ({
        getPendingUploads: () => {
          const out: PendingSlotUpload[] = [];
          for (const def of ORDER_UPLOAD_SLOTS) {
            for (const item of slotsRef.current[def.id].items) {
              if (item.status === "error") continue;
              // Copy File reference — parent must snapshot before any remount.
              out.push({
                slotId: def.id,
                file: item.file,
                notes: slotNotes(def.id),
              });
            }
          }
          return out;
        },
        hasFiles: () =>
          ORDER_UPLOAD_SLOTS.some((def) => slotsRef.current[def.id].items.length > 0),
        askVersionMode,
        clear: async () => {
          for (const slot of Object.values(slotsRef.current)) revokePreviews(slot.items);
          setSlots(emptySlots());
          await clearDraft(draftKey);
        },
        uploadAll: async (targetOrderId: string, pendingOverride?: PendingSlotUpload[]) => {
          const pending =
            pendingOverride ??
            ORDER_UPLOAD_SLOTS.flatMap((def) =>
              slotsRef.current[def.id].items
                .filter((item) => item.status !== "error")
                .map((item) => ({
                  slotId: def.id,
                  file: item.file,
                  notes: slotNotes(def.id),
                })),
            );

          if (!pending.length) {
            console.warn("[order-upload-tiles] uploadAll called with no pending files", {
              orderId: targetOrderId,
            });
            return;
          }

          await persistSlotUploads(targetOrderId, pending, {
            askVersionMode,
            onFileStart: (file, slotId) => {
              setSlots((prev) => {
                const items = prev[slotId].items.map((it) =>
                  it.file === file || sameName(it.file.name, file.name)
                    ? { ...it, status: "uploading" as const, progress: 0 }
                    : it,
                );
                return { ...prev, [slotId]: { items } };
              });
            },
            onFileProgress: (file, pct) => {
              setSlots((prev) => {
                const next = { ...prev };
                for (const def of ORDER_UPLOAD_SLOTS) {
                  const items = next[def.id].items.map((it) =>
                    it.file === file ? { ...it, progress: pct, status: "uploading" as const } : it,
                  );
                  next[def.id] = { items };
                }
                return next;
              });
            },
            onFileDone: (file, slotId) => {
              setSlots((prev) => {
                const items = prev[slotId].items.map((it) =>
                  it.file === file || sameName(it.file.name, file.name)
                    ? { ...it, progress: 100, status: "uploaded" as const }
                    : it,
                );
                return { ...prev, [slotId]: { items } };
              });
              setToast("הקובץ נשמר בהצלחה");
            },
            onFileError: (file, error) => {
              setSlots((prev) => {
                const next = { ...prev };
                for (const def of ORDER_UPLOAD_SLOTS) {
                  const items = next[def.id].items.map((it) =>
                    it.file === file
                      ? { ...it, status: "error" as const, error: error.message }
                      : it,
                  );
                  next[def.id] = { items };
                }
                return next;
              });
              setToast(`הקובץ לא נשמר: ${error.message}`);
            },
          });
          await clearDraft(draftKey);
        },
      }),
      [draftKey, askVersionMode],
    );

    const openPicker = (slotId: OrderUploadSlotId, replaceAt: number | null = null) => {
      setReplaceIndex(replaceAt);
      setPickerSlot(slotId);
    };

    const triggerInput = (kind: "gallery" | "camera" | "files") => {
      if (!pickerSlot) return;
      const def = getSlotDef(pickerSlot);
      requestAnimationFrame(() => {
        if (kind === "camera" && def.capture) cameraInputRef.current?.click();
        else if (kind === "files") filesInputRef.current?.click();
        else galleryInputRef.current?.click();
      });
    };

    const onInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const slotId = pickerSlot;
      const files = e.target.files;
      const replaceAt = replaceIndex;
      e.target.value = "";
      setPickerSlot(null);
      setReplaceIndex(null);
      if (!slotId) return;
      await assignFiles(slotId, files, {
        append: replaceAt == null,
        replaceIndex: replaceAt,
      });
    };

    useEffect(() => {
      if (!focusedSlot) return;
      const onPaste = (e: ClipboardEvent) => {
        const items = e.clipboardData?.files;
        if (!items?.length) return;
        e.preventDefault();
        void assignFiles(focusedSlot, items, { append: true });
      };
      window.addEventListener("paste", onPaste);
      return () => window.removeEventListener("paste", onPaste);
    }, [focusedSlot, assignFiles]);

    const removeItem = async (slotId: OrderUploadSlotId, index: number) => {
      const next = slotsRef.current[slotId].items.filter((_, i) => i !== index);
      await setSlotItems(slotId, next);
      if (viewer?.slotId === slotId) {
        if (next.length === 0) setViewer(null);
        else if (viewer.index >= next.length) setViewer({ slotId, index: next.length - 1 });
        else if (viewer.index > index) setViewer({ slotId, index: viewer.index - 1 });
      }
      if (next.length === 0) setManagerSlot(null);
    };

    const photos = ORDER_UPLOAD_SLOTS.filter((s) => s.group === "photos");
    const scans = ORDER_UPLOAD_SLOTS.filter((s) => s.group === "scans");
    const docs = ORDER_UPLOAD_SLOTS.filter((s) => s.group === "docs");

    const downloadItem = (item: TileItem) => {
      const url = URL.createObjectURL(item.file);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.file.name;
      a.click();
      URL.revokeObjectURL(url);
    };

    const renderTile = (def: OrderUploadSlotDef) => {
      const state = slots[def.id];
      const primary = state.items[0];
      const count = state.items.length;
      const filled = count > 0;
      const uploading = state.items.some((i) => i.status === "uploading");
      const hasError = state.items.some((i) => i.status === "error");
      const allSaved = filled && state.items.every((i) => i.status === "uploaded");
      const avgProgress = uploading
        ? Math.round(
            state.items.reduce((s, i) => s + (i.status === "uploading" ? i.progress : 100), 0) /
              state.items.length,
          )
        : 0;
      const statusPill = hasError
        ? { label: "שגיאה", className: "bg-red-600" }
        : allSaved
          ? { label: "נשמר", className: "bg-emerald-600" }
          : filled
            ? { label: "מוכן לשליחה", className: "bg-amber-500" }
            : null;

      return (
        <div
          key={def.id}
          tabIndex={0}
          onFocus={() => setFocusedSlot(def.id)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(def.id);
          }}
          onDragLeave={() => setDragOver((d) => (d === def.id ? null : d))}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(null);
            void assignFiles(def.id, e.dataTransfer.files, { append: true });
          }}
          onClick={() => {
            if (filled) {
              setManagerSlot(def.id);
              return;
            }
            openPicker(def.id);
          }}
          className={cn(
            "relative aspect-square rounded-2xl border-2 overflow-hidden cursor-pointer transition-all outline-none bg-white",
            !filled && "border-slate-200 hover:border-sky-500",
            filled && !allSaved && !hasError && "border-amber-400",
            allSaved && "border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]",
            hasError && "border-red-400",
            dragOver === def.id && "border-sky-500 bg-sky-50 scale-[1.02]",
            focusedSlot === def.id && "ring-2 ring-sky-300",
          )}
        >
          {!filled && (
            <div className="absolute inset-0 flex flex-col items-center justify-between px-2 pt-2 pb-2.5">
              <div className="flex-1 w-full flex items-center justify-center min-h-0">
                {def.guideSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={def.guideSrc}
                    alt=""
                    aria-hidden
                    className="h-[70%] w-[70%] object-contain opacity-90"
                    draggable={false}
                  />
                ) : (
                  <FileText className="h-[42%] w-[42%] text-slate-300" strokeWidth={1.25} />
                )}
              </div>
              <div className="shrink-0 text-center space-y-0.5">
                <p className="text-xs font-bold text-slate-800 leading-tight">{def.label}</p>
                <p className="text-[10px] text-slate-400">{def.hint}</p>
              </div>
            </div>
          )}

          {filled && primary?.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primary.previewUrl}
              alt={def.label}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {filled && !primary?.previewUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-emerald-50 p-3">
              {primary?.kind === "model3d" || primary?.kind === "dcm" ? (
                <Box className="h-10 w-10 text-emerald-700" />
              ) : (
                <FileText className="h-10 w-10 text-emerald-700" />
              )}
              <span className="text-[10px] text-slate-600 line-clamp-2 text-center px-1">
                {primary?.file.name}
              </span>
            </div>
          )}

          {filled && (
            <>
              <div className="absolute top-1.5 left-1.5 z-10 rounded-full bg-white/95 border border-slate-200 text-slate-800 text-[11px] font-bold px-1.5 py-0.5 shadow">
                {badgeEmoji(def)} {count}
              </div>

              {statusPill && (
                <div
                  className={cn(
                    "absolute top-1.5 right-1.5 z-10 rounded-full text-white text-[10px] font-bold px-2 py-0.5 flex items-center gap-0.5 shadow",
                    statusPill.className,
                  )}
                >
                  {allSaved && <Check className="h-3 w-3" strokeWidth={3} />}
                  {statusPill.label}
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-2 pt-8 pb-2">
                <p className="text-[11px] text-white font-semibold truncate">{def.label}</p>
                <p
                  className={cn(
                    "text-[10px] font-medium",
                    allSaved ? "text-emerald-200" : hasError ? "text-red-200" : "text-amber-100",
                  )}
                >
                  {countLabel(def, count)}
                  {!allSaved && !hasError && !orderId ? " · יישמרו בשליחה" : ""}
                </p>
              </div>
            </>
          )}

          {uploading && (
            <div className="absolute inset-x-2 bottom-2 z-20 h-1.5 rounded-full bg-black/20 overflow-hidden">
              <div className="h-full bg-sky-500 transition-all" style={{ width: `${avgProgress}%` }} />
            </div>
          )}
        </div>
      );
    };

    const managerDef = managerSlot ? getSlotDef(managerSlot) : null;
    const managerItems = managerSlot ? slots[managerSlot]?.items ?? [] : [];

    const viewerItem =
      viewer && slots[viewer.slotId]?.items[viewer.index]
        ? slots[viewer.slotId].items[viewer.index]
        : null;

    return (
      <div className={cn("space-y-5", className)}>
        {toast && (
          <div
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium border",
              toast.includes("לא נשמר")
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-emerald-50 text-emerald-800 border-emerald-200",
            )}
            role="status"
          >
            {toast}
          </div>
        )}

        {!hydrated && <p className="text-xs text-slate-400">טוען טיוטת קבצים...</p>}

        <section>
          <h3 className="text-sm font-bold text-slate-800 mb-2">תמונות קליניות</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map(renderTile)}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-slate-800 mb-2">סריקות</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {scans.map(renderTile)}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-slate-800 mb-2">מסמכים נוספים</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {docs.map(renderTile)}
          </div>
        </section>

        <p className="text-[11px] text-slate-400">
          {orderId
            ? "קבצים מועלים מיד לשרת ולמסד הנתונים. לחיצה על כרטיס פותחת את רשימת הקבצים."
            : "קבצים מסומנים «מוכן לשליחה» נשמרים בשרת רק אחרי שליחת ההזמנה. לחיצה על כרטיס פותחת את הרשימה."}
        </p>

        <input
          ref={galleryInputRef}
          type="file"
          className="hidden"
          accept={pickerSlot ? getSlotDef(pickerSlot).accept : "image/*"}
          multiple
          onChange={(e) => void onInputChange(e)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={(e) => void onInputChange(e)}
        />
        <input
          ref={filesInputRef}
          type="file"
          className="hidden"
          accept={pickerSlot ? getSlotDef(pickerSlot).accept : "*/*"}
          multiple
          onChange={(e) => void onInputChange(e)}
        />

        {pickerSlot && (
          <div className="fixed inset-0 z-[180] flex items-end sm:items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => {
                setPickerSlot(null);
                setReplaceIndex(null);
              }}
            />
            <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl p-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-sm">
                  {replaceIndex != null
                    ? `החלפת קובץ · ${getSlotDef(pickerSlot).label}`
                    : getSlotDef(pickerSlot).label}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPickerSlot(null);
                    setReplaceIndex(null);
                  }}
                  className="p-1 rounded-lg hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {getSlotDef(pickerSlot).capture && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => triggerInput("camera")}
                >
                  <Camera className="h-4 w-4" /> מצלמה
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => triggerInput("gallery")}
              >
                <ImageIcon className="h-4 w-4" /> גלריה / תמונות
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => triggerInput("files")}
              >
                <FolderOpen className="h-4 w-4" /> קבצים
              </Button>
            </div>
          </div>
        )}

        {conflict && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl p-5 space-y-4">
              <h3 className="font-bold text-base">קובץ עם אותו שם כבר קיים</h3>
              <p className="text-sm text-slate-600">
                כבר קיים <strong>{conflict.existingName}</strong>
                {conflict.existingVersion > 1 ? ` (גרסה ${conflict.existingVersion})` : ""}.
                <br />
                הקובץ החדש: <strong>{conflict.fileName}</strong>
              </p>
              <p className="text-xs text-slate-500">מה ברצונך לעשות?</p>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    conflict.resolve("replace");
                    setConflict(null);
                  }}
                >
                  החלף את הקובץ הקיים
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    conflict.resolve("new_version");
                    setConflict(null);
                  }}
                >
                  שמור כגרסה נוספת
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    conflict.resolve(null);
                    setConflict(null);
                  }}
                >
                  ביטול
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Slot file manager */}
        {managerSlot && managerDef && (
          <div className="fixed inset-0 z-[185] flex items-end sm:items-center justify-center p-3 sm:p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setManagerSlot(null)} />
            <div className="relative w-full max-w-2xl max-h-[90vh] rounded-2xl bg-white shadow-xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                <div>
                  <p className="font-bold text-sm">{managerDef.label}</p>
                  <p className="text-xs text-emerald-700 font-medium">
                    {managerItems.every((i) => i.status === "uploaded")
                      ? "✅ נשמר בשרת"
                      : "מוכן לשליחה"}{" "}
                    · {countLabel(managerDef, managerItems.length)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setManagerSlot(null)}
                  className="p-1 rounded-lg hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-3 space-y-2">
                {managerItems.map((item, index) => (
                  <div
                    key={`${item.file.name}-${item.addedAt.getTime()}-${index}`}
                    className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5"
                  >
                    <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-white border border-slate-200 flex items-center justify-center">
                      {item.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : item.kind === "model3d" || item.kind === "dcm" ? (
                        <Box className="h-7 w-7 text-emerald-700" />
                      ) : (
                        <FileText className="h-7 w-7 text-slate-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{item.file.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {item.addedAt.toLocaleString("he-IL")} · {formatFileSize(item.file.size)} ·{" "}
                        {fileTypeLabel(item.file)}
                      </p>
                      {item.status === "error" && (
                        <p className="text-[11px] text-red-600 mt-0.5">{item.error}</p>
                      )}
                      {item.status === "uploading" && (
                        <div className="mt-1.5 h-1 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full bg-sky-500 transition-all"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1 mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            setViewerFullscreen(false);
                            setViewer({ slotId: managerSlot, index });
                          }}
                        >
                          <Eye className="h-3.5 w-3.5 ml-1" />
                          צפייה
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            setViewerFullscreen(true);
                            setViewer({ slotId: managerSlot, index });
                          }}
                        >
                          <Maximize2 className="h-3.5 w-3.5 ml-1" />
                          הגדלה
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => downloadItem(item)}
                        >
                          <Download className="h-3.5 w-3.5 ml-1" />
                          הורדה
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => openPicker(managerSlot, index)}
                        >
                          <Replace className="h-3.5 w-3.5 ml-1" />
                          החלפה
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px] text-red-600 border-red-200"
                          onClick={() => void removeItem(managerSlot, index)}
                        >
                          <Trash2 className="h-3.5 w-3.5 ml-1" />
                          מחיקה
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {managerItems.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-8">אין קבצים בכרטיס זה</p>
                )}
              </div>

              <div className="border-t px-4 py-3 shrink-0 bg-white">
                <Button
                  type="button"
                  className="w-full gap-2"
                  onClick={() => openPicker(managerSlot)}
                >
                  <Plus className="h-4 w-4" />
                  {managerDef.addLabel}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Single-file viewer / zoom */}
        {viewer && viewerItem && (
          <div className="fixed inset-0 z-[195] flex items-center justify-center p-3 sm:p-4">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => {
                setViewer(null);
                setViewerFullscreen(false);
              }}
            />
            <div
              className={cn(
                "relative bg-white shadow-xl overflow-hidden flex flex-col",
                viewerFullscreen
                  ? "w-full h-full max-w-none max-h-none rounded-none"
                  : "w-full max-w-4xl max-h-[92vh] rounded-2xl",
              )}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                <div>
                  <p className="font-bold text-sm">{getSlotDef(viewer.slotId).label}</p>
                  <p className="text-xs text-slate-500 truncate max-w-[60vw]">{viewerItem.file.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setViewer(null);
                    setViewerFullscreen(false);
                  }}
                  className="p-1 rounded-lg hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div
                className={cn(
                  "flex-1 min-h-0 bg-slate-100",
                  viewerItem.kind === "model3d" ? "p-0" : "p-4 overflow-auto",
                )}
              >
                {viewerItem.kind === "model3d" && (
                  <ModelViewer3D
                    key={`${viewer.slotId}-${viewer.index}-${viewerItem.file.name}`}
                    file={viewerItem.file}
                    fileName={viewerItem.file.name}
                    className={viewerFullscreen ? "min-h-[calc(100vh-220px)]" : "min-h-[420px]"}
                  />
                )}
                {viewerItem.kind === "image" && viewerItem.previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={viewerItem.previewUrl}
                    alt={viewerItem.file.name}
                    className={cn(
                      "object-contain mx-auto",
                      viewerFullscreen ? "max-h-[calc(100vh-180px)] max-w-full" : "max-w-full max-h-[60vh]",
                    )}
                  />
                )}
                {viewerItem.kind === "pdf" && viewerItem.previewUrl && (
                  <iframe
                    title={viewerItem.file.name}
                    src={viewerItem.previewUrl}
                    className="w-full h-[60vh] rounded-lg border bg-white"
                  />
                )}
                {viewerItem.kind === "dcm" && (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
                    <Box className="h-12 w-12 text-slate-400" />
                    <p className="font-medium text-slate-700">קובץ DCM (DICOM)</p>
                    <p className="text-sm text-slate-500 max-w-md">
                      הקובץ נשמר בהזמנה. ניתן להוריד ולפתוח בתוכנת DICOM ייעודית.
                    </p>
                  </div>
                )}
                {viewerItem.kind === "other" && (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                    <FileText className="h-12 w-12 text-slate-400" />
                    <p className="text-sm font-medium">{viewerItem.file.name}</p>
                  </div>
                )}
              </div>

              <div className="border-t px-4 py-3 space-y-3 shrink-0 bg-white">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-slate-600">
                  <p>
                    <span className="text-slate-400">שם: </span>
                    {viewerItem.file.name}
                  </p>
                  <p>
                    <span className="text-slate-400">סוג: </span>
                    {fileTypeLabel(viewerItem.file)}
                  </p>
                  <p>
                    <span className="text-slate-400">גודל: </span>
                    {formatFileSize(viewerItem.file.size)}
                  </p>
                  <p>
                    <span className="text-slate-400">תאריך: </span>
                    {viewerItem.addedAt.toLocaleString("he-IL")}
                  </p>
                  <p className="sm:col-span-2">
                    <span className="text-slate-400">הועלה ע״י: </span>
                    {currentUser?.name || "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setViewerFullscreen((v) => !v)}
                  >
                    <Maximize2 className="h-4 w-4 ml-1" />
                    {viewerFullscreen ? "צמצום" : "הגדלה"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => downloadItem(viewerItem)}>
                    <Download className="h-4 w-4 ml-1" />
                    הורדה
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openPicker(viewer.slotId, viewer.index)}
                  >
                    <Replace className="h-4 w-4 ml-1" />
                    החלפה
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200"
                    onClick={() => void removeItem(viewer.slotId, viewer.index)}
                  >
                    <Trash2 className="h-4 w-4 ml-1" />
                    מחיקה
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);
