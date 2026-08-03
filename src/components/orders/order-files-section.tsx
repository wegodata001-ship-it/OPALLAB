"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrderFile } from "@/lib/types";
import { FILE_TYPE_LABELS } from "@/lib/constants/labels";
import {
  buildFileViewUrl,
  getFileExtension,
  getOrderFileFolderId,
  getPreviewKind,
  isPreviewable,
} from "@/lib/file-utils";
import { FilePreviewModal } from "@/components/orders/file-preview-modal";
import { FileModelThumb } from "@/components/orders/file-model-thumb";
import { useApp } from "@/providers/AppProvider";
import {
  ORDER_FILE_CATEGORIES,
  ORDER_FILE_CATEGORY_LABELS,
  ORDER_FILE_SLOT_LABELS,
  categoryAccept,
  categorySupportsCamera,
  type OrderFileCategory,
  type OrderFileSlotKey,
} from "@/lib/orders/order-file-taxonomy";
import { formatFileSize } from "@/lib/orders/scan-file";
import {
  Camera,
  ChevronLeft,
  Download,
  Eye,
  Folder,
  FolderInput,
  FolderOpen,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPatch } from "@/lib/api/client";

interface OrderFilesSectionProps {
  orderId: string;
  files: OrderFile[];
  onUpload: (
    file: File,
    folderId?: string,
    meta?: { category?: OrderFileCategory; slotKey?: string },
    onProgress?: (pct: number, info?: { loaded: number; total: number; fileName: string }) => void,
  ) => void | Promise<void>;
  canUpload?: boolean;
}

type UploadProgress = {
  fileName: string;
  pct: number;
  loaded: number;
  total: number;
  startedAt: number;
};

function categoryOf(file: OrderFile): OrderFileCategory {
  return (file.category as OrderFileCategory) || "Other";
}

export function OrderFilesSection({
  files,
  onUpload,
  canUpload = true,
}: OrderFilesSectionProps) {
  const { users, refresh } = useApp();
  const [preview, setPreview] = useState<OrderFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<OrderFileCategory | "all">("all");
  const [showHistory, setShowHistory] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  const userName = useCallback(
    (id: string, fallback?: string | null) =>
      fallback || users.find((u) => u.id === id)?.name || id.slice(0, 6),
    [users],
  );

  const visible = useMemo(() => {
    const list = showHistory ? files : files.filter((f) => f.isCurrent !== false);
    return list;
  }, [files, showHistory]);

  const byCategory = useMemo(() => {
    const map = new Map<OrderFileCategory, OrderFile[]>();
    for (const cat of ORDER_FILE_CATEGORIES) map.set(cat, []);
    for (const f of visible) {
      const cat = categoryOf(f);
      const list = map.get(cat) ?? [];
      list.push(f);
      map.set(cat, list);
    }
    return map;
  }, [visible]);

  /** Full dental scene — all current mesh files on the order (Exocad-style). */
  const sceneFilesForPreview = useMemo(() => {
    if (!preview) return [];
    const meshExt = new Set(["stl", "obj", "ply", "glb", "gltf", "zip"]);
    return visible.filter((f) => {
      if (f.isCurrent === false) return false;
      return meshExt.has(getFileExtension(f.fileName));
    });
  }, [preview, visible]);

  const handleFiles = useCallback(
    async (list: FileList | File[] | null, category?: OrderFileCategory) => {
      if (!list) return;
      const arr = Array.from(list).slice(0, 50);
      if (!arr.length) return;
      setUploading(true);
      setUploadMessage(null);
      let ok = 0;
      try {
        for (const file of arr) {
          const startedAt = Date.now();
          setProgress({
            fileName: file.name,
            pct: 0,
            loaded: 0,
            total: file.size,
            startedAt,
          });
          await onUpload(
            file,
            undefined,
            category ? { category } : undefined,
            (pct, info) => {
              setProgress({
                fileName: info?.fileName ?? file.name,
                pct,
                loaded: info?.loaded ?? Math.round((pct / 100) * file.size),
                total: info?.total ?? file.size,
                startedAt,
              });
            },
          );
          ok += 1;
        }
        setUploadMessage(
          ok === 1 ? "הקובץ נשמר בהצלחה." : `${ok} קבצים נשמרו בהצלחה.`,
        );
      } catch (err) {
        console.error("[order-files-section] upload failed", err);
        setUploadMessage(
          err instanceof Error ? `הקובץ לא נשמר: ${err.message}` : "הקובץ לא נשמר בשרת",
        );
      } finally {
        setUploading(false);
        setProgress(null);
      }
    },
    [onUpload],
  );

  const renameFile = useCallback(
    async (file: OrderFile) => {
      const next = window.prompt("שם קובץ חדש", file.fileName);
      if (!next || next.trim() === file.fileName) return;
      try {
        await apiPatch(`/api/orders/files/${file.id}`, { fileName: next.trim() });
        await refresh();
        setUploadMessage("שם הקובץ עודכן");
      } catch (err) {
        setUploadMessage(err instanceof Error ? err.message : "שינוי השם נכשל");
      }
    },
    [refresh],
  );

  const moveFile = useCallback(
    async (file: OrderFile) => {
      const labels = ORDER_FILE_CATEGORIES.map(
        (c, i) => `${i + 1}. ${ORDER_FILE_CATEGORY_LABELS[c]}`,
      ).join("\n");
      const pick = window.prompt(`העברה לתיקייה:\n${labels}\n\nהזינו מספר 1-${ORDER_FILE_CATEGORIES.length}`);
      const idx = Number(pick) - 1;
      if (!Number.isFinite(idx) || idx < 0 || idx >= ORDER_FILE_CATEGORIES.length) return;
      const category = ORDER_FILE_CATEGORIES[idx]!;
      try {
        await apiPatch(`/api/orders/files/${file.id}`, { category, slotKey: "General" });
        await refresh();
        setUploadMessage(`הועבר ל־${ORDER_FILE_CATEGORY_LABELS[category]}`);
      } catch (err) {
        setUploadMessage(err instanceof Error ? err.message : "העברה נכשלה");
      }
    },
    [refresh],
  );

  const deleteFileRow = useCallback(
    async (file: OrderFile) => {
      if (!window.confirm(`למחוק את הקובץ «${file.fileName}»?`)) return;
      try {
        await fetch(`/api/orders/files/${file.id}`, {
          method: "DELETE",
          credentials: "include",
        }).then(async (res) => {
          const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
          if (!json.success) throw new Error(json.error?.message || "מחיקה נכשלה");
        });
        await refresh();
        setUploadMessage("הקובץ נמחק");
      } catch (err) {
        setUploadMessage(err instanceof Error ? err.message : "מחיקה נכשלה");
      }
    },
    [refresh],
  );

  const categoriesToShow =
    openCategory === "all"
      ? ORDER_FILE_CATEGORIES.filter((c) => (byCategory.get(c)?.length ?? 0) > 0 || canUpload)
      : [openCategory];

  const speedLabel = (() => {
    if (!progress || progress.pct <= 0) return null;
    const elapsed = (Date.now() - progress.startedAt) / 1000;
    if (elapsed < 0.2) return null;
    const bps = progress.loaded / elapsed;
    if (bps < 1024) return `${bps.toFixed(0)} B/s`;
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  })();

  return (
    <>
      {uploadMessage && (
        <p
          className={cn(
            "mb-3 rounded-lg border px-3 py-2 text-sm font-medium",
            uploadMessage.includes("לא נשמר")
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800",
          )}
        >
          {uploadMessage}
        </p>
      )}

      {progress && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
            <span className="font-medium truncate">{progress.fileName}</span>
            <span className="shrink-0">
              {progress.pct}%{speedLabel ? ` · ${speedLabel}` : ""}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-opal-gold transition-all duration-150"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setOpenCategory("all")}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs border",
              openCategory === "all" ? "bg-opal-gold/15 border-opal-gold text-opal-gold-dark" : "bg-white",
            )}
          >
            הכל ({visible.length})
          </button>
          {ORDER_FILE_CATEGORIES.map((cat) => {
            const count = byCategory.get(cat)?.length ?? 0;
            if (!count && openCategory !== cat) return null;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setOpenCategory(cat)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs border",
                  openCategory === cat ? "bg-opal-gold/15 border-opal-gold text-opal-gold-dark" : "bg-white",
                )}
              >
                {ORDER_FILE_CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showHistory}
            onChange={(e) => setShowHistory(e.target.checked)}
            className="accent-opal-gold"
          />
          הצג גרסאות ישנות
        </label>
      </div>

      {canUpload && openCategory === "all" && (
        <p className="text-xs text-slate-500 mb-3">
          בחרו קטגוריה והעלו קובץ ישירות — ללא חלונות ביניים.
        </p>
      )}

      <div className="space-y-3">
        {categoriesToShow.map((cat) => {
          const list = byCategory.get(cat) ?? [];
          const accept = categoryAccept(cat);
          const showCamera = categorySupportsCamera(cat);
          return (
            <div key={cat} className="rounded-xl border bg-white overflow-hidden">
              <div className="px-3 py-2.5 bg-slate-50 border-b">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Folder className="h-4 w-4 text-opal-gold" />
                  {ORDER_FILE_CATEGORY_LABELS[cat]}
                  {list.length > 0 && (
                    <span className="text-xs font-normal text-emerald-700">({list.length})</span>
                  )}
                </div>
                {canUpload && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-50">
                      <FolderOpen className="h-3.5 w-3.5 text-opal-gold" />
                      העלאת קובץ
                      <input
                        type="file"
                        multiple
                        accept={accept}
                        className="sr-only"
                        disabled={uploading}
                        onChange={(e) => {
                          void handleFiles(e.target.files, cat);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {showCamera && (
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-50">
                        <Camera className="h-3.5 w-3.5 text-opal-gold" />
                        צילום מהמצלמה
                        <input
                          type="file"
                          accept="image/*,.heic,.HEIC"
                          capture={isMobile ? "environment" : undefined}
                          className="sr-only"
                          disabled={uploading}
                          onChange={(e) => {
                            void handleFiles(e.target.files, cat);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>

              {list.length === 0 ? (
                <p className="text-xs text-slate-400 px-3 py-4">אין קבצים בתיקייה זו</p>
              ) : (
                <ul className="divide-y">
                  {list.map((f) => {
                    const slotLabel = f.slotKey
                      ? ORDER_FILE_SLOT_LABELS[f.slotKey as OrderFileSlotKey] || f.slotKey
                      : null;
                    const kind = getPreviewKind(f.mimeType, f.fileName);
                    const thumbUrl =
                      kind === "image"
                        ? buildFileViewUrl(f.orderId, getOrderFileFolderId(f))
                        : null;
                    const downloadHref =
                      f.dataUrl || buildFileViewUrl(f.orderId, getOrderFileFolderId(f));
                    return (
                      <li key={f.id} className="p-3 hover:bg-opal-gold/5 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setPreview(f)}
                            className="flex items-start gap-3 min-w-0 text-right flex-1"
                          >
                            <span className="h-14 w-14 rounded-lg border bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
                              {thumbUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={thumbUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : kind === "model3d" || kind === "zip" ? (
                                <FileModelThumb file={f} />
                              ) : (
                                <Folder className="h-5 w-5 text-slate-300" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium truncate">{f.fileName}</span>
                              <span className="block text-[11px] text-slate-500 mt-0.5 space-x-reverse space-x-2">
                                {slotLabel && <span>{slotLabel}</span>}
                                <span>v{f.version ?? 1}</span>
                                {!f.isCurrent && <span className="text-amber-600">ישן</span>}
                                <span>{FILE_TYPE_LABELS[f.fileType]}</span>
                                <span>{formatFileSize(f.fileSize ?? 0)}</span>
                              </span>
                              <span className="block text-[11px] text-slate-400 mt-0.5">
                                {new Date(f.uploadedAt).toLocaleString("he-IL")} ·{" "}
                                {userName(f.uploadedBy, f.uploadedByName)}
                              </span>
                            </span>
                          </button>
                          <span className="flex items-center gap-0.5 shrink-0">
                            {isPreviewable(f.mimeType, f.fileName) && (
                              <button
                                type="button"
                                title="צפייה"
                                className="p-1.5 rounded-md text-opal-gold hover:bg-white"
                                onClick={() => setPreview(f)}
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                            <a
                              href={downloadHref}
                              download={f.fileName}
                              title="הורדה"
                              className="p-1.5 rounded-md text-slate-500 hover:bg-white"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download className="h-4 w-4" />
                            </a>
                            {canUpload && (
                              <>
                                <button
                                  type="button"
                                  title="שינוי שם"
                                  className="p-1.5 rounded-md text-slate-500 hover:bg-white"
                                  onClick={() => void renameFile(f)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  title="העברה לתיקייה"
                                  className="p-1.5 rounded-md text-slate-500 hover:bg-white"
                                  onClick={() => void moveFile(f)}
                                >
                                  <FolderInput className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  title="מחיקה"
                                  className="p-1.5 rounded-md text-red-500 hover:bg-white"
                                  onClick={() => void deleteFileRow(f)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                            <ChevronLeft className="h-4 w-4 text-slate-300" />
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">אין קבצים בהזמנה</p>
      )}

      <FilePreviewModal
        file={preview}
        sceneFiles={sceneFilesForPreview}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
