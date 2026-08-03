"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { FmUploadBar } from "@/components/file-manager-v2/fm-upload-bar";
import { FmGalleryGrid } from "@/components/file-manager-v2/fm-gallery-grid";
import { FmLightbox } from "@/components/file-manager-v2/fm-lightbox";
import {
  FM2_MAX_BATCH,
  FM2_PROGRESS_THROTTLE_MS,
  FM2_UPLOAD_CONCURRENCY,
} from "@/lib/file-manager-v2/constants";
import {
  buildLocalPreview,
  detectFmFileKind,
  revokePreviewUrl,
} from "@/lib/file-manager-v2/preview";
import {
  fetchOrderFiles,
  filterFilesForSlot,
  orderFileToFm,
} from "@/lib/file-manager-v2/server-files";
import { computeUploadAggregate } from "@/lib/file-manager-v2/upload-state";
import type {
  FileManagerV2Handle,
  FileManagerV2Props,
  FmFile,
} from "@/lib/file-manager-v2/types";
import { createPerfSession, fm2UploadFile } from "@/lib/file-manager-v2/upload-pipeline";
import { compressImageIfNeeded } from "@/lib/orders/compress-image";
import { slotNotes } from "@/lib/orders/upload-slots";
import { buildFileViewUrl } from "@/lib/file-utils";
import { cn } from "@/lib/utils";

function newLocalId() {
  return `fm2-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);
  return mobile;
}

/** Instant local thumbnail — sync for images. */
function instantPreview(file: File, kind: FmFile["kind"]): string | null {
  if (kind === "image" && typeof URL !== "undefined") {
    try {
      return URL.createObjectURL(file);
    } catch {
      return null;
    }
  }
  return null;
}

export const FileManagerV2 = forwardRef<FileManagerV2Handle, FileManagerV2Props>(
  function FileManagerV2(
    {
      uploadSlotId,
      orderId,
      ensureOrderId,
      onUploadStateChange,
      className,
    },
    ref,
  ) {
    const isMobile = useIsMobile();
    const [files, setFiles] = useState<FmFile[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [hydrated, setHydrated] = useState(false);
    const [lastSelectedCount, setLastSelectedCount] = useState<number | null>(null);
    const [flashDoneIds, setFlashDoneIds] = useState<Set<string>>(new Set());

    const filesRef = useRef(files);
    filesRef.current = files;
    const orderIdRef = useRef(orderId);
    const ensureOrderIdRef = useRef(ensureOrderId);
    const orderIdPromiseRef = useRef<Promise<string | null> | null>(null);
    const queueRef = useRef<string[]>([]);
    const activeIdsRef = useRef<Set<string>>(new Set());
    const abortMap = useRef<Map<string, AbortController>>(new Map());
    const progressThrottleRef = useRef<Map<string, number>>(new Map());
    const onUploadStateChangeRef = useRef(onUploadStateChange);
    const lastEmittedRef = useRef<string>("");
    const pumpRef = useRef<() => void>(() => {});

    useEffect(() => {
      onUploadStateChangeRef.current = onUploadStateChange;
    }, [onUploadStateChange]);

    useEffect(() => {
      orderIdRef.current = orderId;
      ensureOrderIdRef.current = ensureOrderId;
      if (orderId) orderIdPromiseRef.current = null;
    }, [orderId, ensureOrderId]);

    const emitState = useCallback((list: FmFile[]) => {
      const next = computeUploadAggregate(list);
      const key = [
        next.total,
        next.queued,
        next.uploading,
        next.done,
        next.error,
        next.overallProgress,
        next.isUploading ? 1 : 0,
        next.isComplete ? 1 : 0,
        next.hasBlocking ? 1 : 0,
      ].join("|");
      if (key === lastEmittedRef.current) return;
      lastEmittedRef.current = key;
      onUploadStateChangeRef.current?.(next);
    }, []);

    useEffect(() => {
      emitState(files);
    }, [files, emitState]);

    useEffect(() => {
      if (lastSelectedCount == null) return;
      const t = window.setTimeout(() => setLastSelectedCount(null), 4000);
      return () => window.clearTimeout(t);
    }, [lastSelectedCount]);

    /** One shared draft/order resolve for all parallel workers. */
    const resolveOrderId = useCallback(async (): Promise<string | null> => {
      if (orderIdRef.current) return orderIdRef.current;
      if (!orderIdPromiseRef.current) {
        orderIdPromiseRef.current = (async () => {
          if (ensureOrderIdRef.current) {
            const id = await ensureOrderIdRef.current();
            if (id) orderIdRef.current = id;
            return id;
          }
          return null;
        })();
      }
      try {
        return await orderIdPromiseRef.current;
      } finally {
        if (!orderIdRef.current) orderIdPromiseRef.current = null;
      }
    }, []);

    const loadServerFiles = useCallback(
      async (oid: string) => {
        try {
          const all = await fetchOrderFiles(oid);
          const slotFiles = filterFilesForSlot(all, uploadSlotId);
          const mapped = slotFiles.map(orderFileToFm);
          setFiles((prev) => {
            const localActive = prev.filter(
              (f) =>
                f.localFile ||
                f.status === "queued" ||
                f.status === "uploading" ||
                f.status === "error",
            );
            const serverIds = new Set(mapped.map((m) => m.fileId));
            const keepLocal = localActive.filter(
              (l) => !l.fileId || !serverIds.has(l.fileId),
            );
            const doneLocal = prev.filter(
              (f) => f.status === "done" && f.fileId && f.previewUrl && f.localFile,
            );
            const localByFileId = new Map(
              doneLocal.map((f) => [f.fileId!, f] as const),
            );
            const mergedServer = mapped.map((m) => {
              const local = m.fileId ? localByFileId.get(m.fileId) : undefined;
              if (local?.previewUrl) {
                return {
                  ...m,
                  previewUrl: local.previewUrl,
                  localFile: local.localFile,
                };
              }
              return m;
            });
            return [...mergedServer, ...keepLocal];
          });
        } catch {
          /* ignore */
        }
      },
      [uploadSlotId],
    );

    // Hydrate once when orderId is known — never after each upload
    useEffect(() => {
      let cancelled = false;
      (async () => {
        if (orderId && !cancelled) await loadServerFiles(orderId);
        if (!cancelled) setHydrated(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [orderId, loadServerFiles]);

    useEffect(() => {
      return () => {
        for (const f of filesRef.current) revokePreviewUrl(f.previewUrl);
        for (const c of abortMap.current.values()) c.abort();
      };
    }, []);

    const updateFile = useCallback((id: string, patch: Partial<FmFile>) => {
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    }, []);

    const updateProgress = useCallback((id: string, pct: number) => {
      const now = Date.now();
      const last = progressThrottleRef.current.get(id) ?? 0;
      if (pct < 100 && now - last < FM2_PROGRESS_THROTTLE_MS) return;
      progressThrottleRef.current.set(id, now);
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, progress: pct } : f)),
      );
    }, []);

    const markDone = useCallback((id: string, patch: Partial<FmFile>) => {
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
      setFlashDoneIds((prev) => new Set(prev).add(id));
      window.setTimeout(() => {
        setFlashDoneIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 1000);
    }, []);

    const runWorker = useCallback(
      async (fileLocalId: string) => {
        const entry = filesRef.current.find((f) => f.id === fileLocalId);
        if (!entry?.localFile) {
          activeIdsRef.current.delete(fileLocalId);
          pumpRef.current();
          return;
        }

        const perf = createPerfSession(
          entry.fileName,
          entry.fileSize,
          fileLocalId,
        );
        // Time from selection (addedAt) until worker start
        perf.steps.SELECT_FILE = Math.max(0, Math.round(Date.now() - entry.addedAt));

        const controller = new AbortController();
        abortMap.current.set(fileLocalId, controller);
        updateFile(fileLocalId, {
          status: "uploading",
          progress: 1,
          error: undefined,
        });

        try {
          const hadOrderId = Boolean(orderIdRef.current);
          const oid = await perf.span("CREATE_DRAFT", () => resolveOrderId());
          perf.flags.draftCreated = !hadOrderId && Boolean(oid);

          if (!oid) throw new Error("אין מזהה הזמנה — נסה שוב");
          if (controller.signal.aborted) {
            throw new DOMException("בוטל", "AbortError");
          }

          const uploadFile = await perf.span("COMPRESS", () =>
            compressImageIfNeeded(entry.localFile!),
          );

          const result = await fm2UploadFile(
            uploadFile,
            {
              orderId: oid,
              uploadSlotId,
              notes: slotNotes(uploadSlotId),
            },
            (pct) => updateProgress(fileLocalId, pct),
            controller.signal,
            {
              localId: fileLocalId,
              perf,
              draftAlreadyReady: hadOrderId,
              autoFinish: false,
            },
          );

          // Immediate local update — NO GET /files refresh
          const tUi = performance.now();
          markDone(fileLocalId, {
            status: "done",
            progress: 100,
            fileId: result.fileId,
            orderId: oid,
            error: undefined,
            localFile: uploadFile,
          });
          perf.steps.UI_RENDER = Math.round(performance.now() - tUi);
          perf.steps.REFRESH_FILE_LIST = 0;
          perf.flags.refreshList = false;
          perf.finish();
        } catch (err) {
          const aborted =
            (err instanceof DOMException && err.name === "AbortError") ||
            (err instanceof Error && err.message.includes("בוטל"));
          if (!aborted) {
            perf.finish(err instanceof Error ? err.message : "העלאה נכשלה");
          }
          if (aborted) {
            setFiles((prev) => {
              const target = prev.find((f) => f.id === fileLocalId);
              if (target) revokePreviewUrl(target.previewUrl);
              return prev.filter((f) => f.id !== fileLocalId);
            });
            queueRef.current = queueRef.current.filter((id) => id !== fileLocalId);
          } else {
            updateFile(fileLocalId, {
              status: "error",
              error: err instanceof Error ? err.message : "העלאה נכשלה",
              retryCount: (entry.retryCount ?? 0) + 1,
            });
          }
        } finally {
          abortMap.current.delete(fileLocalId);
          activeIdsRef.current.delete(fileLocalId);
          progressThrottleRef.current.delete(fileLocalId);
          pumpRef.current();
        }
      },
      [resolveOrderId, uploadSlotId, updateFile, updateProgress, markDone],
    );

    const pumpParallel = useCallback(() => {
      while (
        queueRef.current.length > 0 &&
        activeIdsRef.current.size < FM2_UPLOAD_CONCURRENCY
      ) {
        const nextId = queueRef.current.shift();
        if (!nextId) break;
        const entry = filesRef.current.find((f) => f.id === nextId);
        if (
          !entry?.localFile ||
          entry.status === "done" ||
          entry.status === "uploading"
        ) {
          continue;
        }
        if (activeIdsRef.current.has(nextId)) continue;

        activeIdsRef.current.add(nextId);
        void runWorker(nextId);
      }
    }, [runWorker]);

    pumpRef.current = pumpParallel;

    /**
     * Fast enqueue: all files appear in the grid immediately, then up to 6
     * independent workers start (Promise.allSettled style).
     */
    const enqueueFiles = useCallback(
      (list: FileList | File[]) => {
        const raw = Array.from(list).slice(0, FM2_MAX_BATCH);
        if (!raw.length) return;

        setLastSelectedCount(raw.length);
        void resolveOrderId();

        const newEntries: FmFile[] = raw.map((file) => {
          const kind = detectFmFileKind(file);
          return {
            id: newLocalId(),
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || "application/octet-stream",
            kind,
            previewUrl: instantPreview(file, kind),
            progress: 0,
            status: "queued" as const,
            retryCount: 0,
            localFile: file,
            addedAt: Date.now(),
          };
        });

        for (const e of newEntries) queueRef.current.push(e.id);
        setFiles((prev) => [...prev, ...newEntries]);

        // Non-image previews — background only
        for (const e of newEntries) {
          if (e.kind === "image" || !e.localFile) continue;
          void buildLocalPreview(e.localFile, e.kind).then((url) => {
            if (!url) return;
            setFiles((prev) =>
              prev.map((f) =>
                f.id === e.id && !f.previewUrl ? { ...f, previewUrl: url } : f,
              ),
            );
          });
        }

        pumpParallel();
      },
      [pumpParallel, resolveOrderId],
    );

    const retryFile = useCallback(
      (index: number) => {
        const f = filesRef.current[index];
        if (!f?.localFile || f.status !== "error") return;
        if (!queueRef.current.includes(f.id)) queueRef.current.push(f.id);
        updateFile(f.id, { status: "queued", progress: 0, error: undefined });
        queueMicrotask(() => pumpParallel());
      },
      [pumpParallel, updateFile],
    );

    const cancelFile = useCallback(
      (index: number) => {
        const f = filesRef.current[index];
        if (!f || f.status === "done") return;

        queueRef.current = queueRef.current.filter((id) => id !== f.id);
        const controller = abortMap.current.get(f.id);
        if (controller) {
          controller.abort();
          return;
        }

        revokePreviewUrl(f.previewUrl);
        activeIdsRef.current.delete(f.id);
        setFiles((prev) => prev.filter((item) => item.id !== f.id));
        pumpParallel();
      },
      [pumpParallel],
    );

    const doneFiles = files.filter((f) => f.status === "done");

    const queueMeta = (() => {
      const waiting = files.filter((f) => f.status === "queued");
      const map = new Map<string, { position: number; total: number }>();
      waiting.forEach((f, i) => {
        map.set(f.id, { position: i + 1, total: waiting.length });
      });
      return map;
    })();

    const handleDownload = useCallback(
      (index: number) => {
        const f = files[index];
        if (!f || f.status !== "done") return;
        if (f.localFile) {
          const url = URL.createObjectURL(f.localFile);
          const a = document.createElement("a");
          a.href = url;
          a.download = f.fileName;
          a.click();
          URL.revokeObjectURL(url);
          return;
        }
        if (f.fileId && (f.orderId || orderIdRef.current)) {
          window.open(
            buildFileViewUrl(f.orderId ?? orderIdRef.current!, f.fileId),
            "_blank",
          );
        } else if (f.previewUrl) {
          window.open(f.previewUrl, "_blank");
        }
      },
      [files],
    );

    const handleRename = useCallback(
      async (index: number) => {
        const f = files[index];
        if (!f || f.status !== "done") return;
        const next = window.prompt("שם קובץ חדש", f.fileName);
        if (!next?.trim() || next.trim() === f.fileName) return;
        if (f.fileId) {
          await fetch(`/api/orders/files/${f.fileId}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName: next.trim() }),
          });
        }
        setFiles((prev) =>
          prev.map((item) =>
            item.id === f.id ? { ...item, fileName: next.trim() } : item,
          ),
        );
      },
      [files],
    );

    const handleDelete = useCallback(async (index: number) => {
      const f = files[index];
      if (!f) return;
      if (f.fileId) {
        await fetch(`/api/orders/files/${f.fileId}`, {
          method: "DELETE",
          credentials: "include",
        });
      }
      abortMap.current.get(f.id)?.abort();
      revokePreviewUrl(f.previewUrl);
      setFiles((prev) => prev.filter((item) => item.id !== f.id));
    }, [files]);

    const openLightbox = useCallback(
      (index: number) => {
        const f = files[index];
        if (!f || f.status !== "done") return;
        const di = doneFiles.findIndex((d) => d.id === f.id);
        setLightboxIndex(di >= 0 ? di : null);
      },
      [files, doneFiles],
    );

    useImperativeHandle(
      ref,
      () => ({
        waitForUploads: async (timeoutMs = 120_000) => {
          const start = Date.now();
          while (Date.now() - start < timeoutMs) {
            const blocking = filesRef.current.some(
              (f) =>
                f.status === "queued" ||
                f.status === "uploading" ||
                f.status === "error",
            );
            if (
              !blocking &&
              queueRef.current.length === 0 &&
              activeIdsRef.current.size === 0
            ) {
              return;
            }
            await new Promise((r) => setTimeout(r, 150));
          }
          throw new Error("העלאות עדיין בתהליך");
        },
        hasUploadedFiles: () =>
          filesRef.current.some((f) => f.status === "done" && !!f.fileId),
        hasFiles: () => filesRef.current.length > 0,
        hasBlockingUploads: () =>
          filesRef.current.some(
            (f) =>
              f.status === "queued" ||
              f.status === "uploading" ||
              f.status === "error",
          ),
        hasActiveUploads: () =>
          filesRef.current.some(
            (f) => f.status === "queued" || f.status === "uploading",
          ),
        getUploadAggregate: () => computeUploadAggregate(filesRef.current),
        getFileCount: () =>
          filesRef.current.filter((f) => f.status === "done").length,
        clearLocal: () => {
          for (const f of filesRef.current) revokePreviewUrl(f.previewUrl);
          for (const c of abortMap.current.values()) c.abort();
          queueRef.current = [];
          activeIdsRef.current.clear();
          setFiles([]);
        },
      }),
      [],
    );

    return (
      <div className={cn("w-full", className)}>
        {lastSelectedCount != null && lastSelectedCount > 0 && (
          <p className="text-[11px] font-semibold text-emerald-700 mb-1.5">
            ✓ {lastSelectedCount} קבצים נבחרו
          </p>
        )}

        <FmUploadBar
          isMobile={isMobile}
          dragActive={dragActive}
          onDragActive={setDragActive}
          onFiles={enqueueFiles}
        />

        {!hydrated && files.length === 0 && (
          <p className="text-[10px] text-slate-400 text-center mt-1">טוען...</p>
        )}

        <FmGalleryGrid
          files={files}
          flashDoneIds={flashDoneIds}
          queueMeta={queueMeta}
          onView={openLightbox}
          onRename={(i) => void handleRename(i)}
          onDownload={(i) => handleDownload(i)}
          onDelete={(i) => void handleDelete(i)}
          onRetry={retryFile}
          onCancel={cancelFile}
        />

        <FmLightbox
          files={doneFiles}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onDownload={handleDownload}
        />
      </div>
    );
  },
);
