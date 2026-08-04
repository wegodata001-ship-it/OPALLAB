"use client";

import {
  Box,
  Check,
  Download,
  Eye,
  FileArchive,
  FileText,
  Film,
  Globe,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FmFile } from "@/lib/file-manager-v2/types";
import { isDentalWebViewMesh, openDentalWebView } from "@/lib/orders/dental-webview";

function KindIcon({ kind, className }: { kind: FmFile["kind"]; className?: string }) {
  if (kind === "model3d" || kind === "dcm") return <Box className={className} />;
  if (kind === "video") return <Film className={className} />;
  if (kind === "archive") return <FileArchive className={className} />;
  return <FileText className={className} />;
}

type QueueMeta = Map<string, { position: number; total: number }>;

type FmGalleryGridProps = {
  files: FmFile[];
  flashDoneIds: Set<string>;
  queueMeta: QueueMeta;
  onView: (index: number) => void;
  onRename: (index: number) => void;
  onDownload: (index: number) => void;
  onDelete: (index: number) => void;
  onRetry: (index: number) => void;
  onCancel: (index: number) => void;
};

function FileStatusRow({
  file,
  flashing,
  queueInfo,
}: {
  file: FmFile;
  flashing: boolean;
  queueInfo?: { position: number; total: number };
}) {
  if (file.status === "queued") {
    const pos = queueInfo?.position ?? 1;
    const total = queueInfo?.total ?? 1;
    return (
      <p className="text-[10px] text-slate-500 font-medium truncate">
        ⏳ ממתין בתור ({pos} מתוך {total})
      </p>
    );
  }

  if (file.status === "uploading") {
    return (
      <div className="space-y-0.5">
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-sky-500 transition-all duration-150"
            style={{ width: `${Math.max(file.progress, 4)}%` }}
          />
        </div>
        <p className="text-[10px] text-sky-700 font-medium tabular-nums">
          {file.progress}% · מעלה...
        </p>
      </div>
    );
  }

  if (file.status === "error") {
    return (
      <p className="text-[10px] text-red-600 font-medium truncate">❌ נכשל</p>
    );
  }

  if (file.status === "done") {
    if (flashing) {
      return (
        <div className="space-y-0.5">
          <div className="h-1.5 rounded-full bg-emerald-100 overflow-hidden">
            <div className="h-full w-full rounded-full bg-emerald-500" />
          </div>
          <p className="text-[10px] text-emerald-700 font-medium truncate">
            ✓ נשמר
          </p>
        </div>
      );
    }
    return (
      <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5">
        <Check className="h-3 w-3 shrink-0" />
        <span className="truncate">נשמר</span>
      </p>
    );
  }

  return null;
}

export function FmGalleryGrid({
  files,
  flashDoneIds,
  queueMeta,
  onView,
  onRename,
  onDownload,
  onDelete,
  onRetry,
  onCancel,
}: FmGalleryGridProps) {
  if (!files.length) {
    return <p className="text-xs text-slate-400 text-center py-3">אין קבצים</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
      {files.map((file, index) => {
        const flashing = flashDoneIds.has(file.id);
        const busy = file.status === "queued" || file.status === "uploading";
        return (
          <div key={file.id} className="flex flex-col gap-1 min-w-0">
            <div
              className={cn(
                "group relative aspect-square rounded-lg overflow-hidden border bg-white",
                file.status === "done"
                  ? "border-emerald-200"
                  : file.status === "error"
                    ? "border-red-300"
                    : "border-slate-200",
              )}
            >
              <button
                type="button"
                className="absolute inset-0 w-full h-full"
                onClick={() => file.status === "done" && onView(index)}
                disabled={file.status !== "done"}
              >
                {file.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={file.previewUrl}
                    alt={file.fileName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-50 p-1">
                    <KindIcon kind={file.kind} className="h-8 w-8 text-slate-400" />
                  </div>
                )}
              </button>

              {busy && (
                <button
                  type="button"
                  title="בטל העלאה"
                  className="absolute top-1 left-1 z-10 h-6 w-6 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/75"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel(index);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}

              {file.status === "done" && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1">
                  {!isDentalWebViewMesh(file.fileName) && file.kind !== "model3d" && (
                    <button
                      type="button"
                      title="צפייה"
                      className="h-7 w-7 rounded-full bg-white/90 text-slate-800 flex items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        onView(index);
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="שינוי שם"
                    className="h-7 w-7 rounded-full bg-white/90 text-slate-800 flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRename(index);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="הורדה"
                    className="h-7 w-7 rounded-full bg-white/90 text-slate-800 flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(index);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  {isDentalWebViewMesh(file.fileName) && (
                    <button
                      type="button"
                      title="Open WebView"
                      className="h-7 w-7 rounded-full bg-white/90 text-sky-700 flex items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDentalWebView();
                      }}
                    >
                      <Globe className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="מחיקה"
                    className="h-7 w-7 rounded-full bg-red-500/90 text-white flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(index);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <p
              className="text-[10px] text-slate-700 font-medium truncate px-0.5"
              title={file.fileName}
            >
              {file.fileName}
            </p>

            <FileStatusRow
              file={file}
              flashing={flashing}
              queueInfo={queueMeta.get(file.id)}
            />

            {busy && (
              <button
                type="button"
                onClick={() => onCancel(index)}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <X className="h-3 w-3" />
                בטל העלאה
              </button>
            )}

            {file.status === "error" && (
              <button
                type="button"
                onClick={() => onRetry(index)}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-100 transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                נסה שוב
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FmStatsSummary({ files }: { files: FmFile[] }) {
  void files;
  return null;
}

export function FmQueueBadge({ files }: { files: FmFile[] }) {
  void files;
  return null;
}
