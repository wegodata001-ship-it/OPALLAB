"use client";

import type { ReactNode } from "react";
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
        <p className="text-[10px] text-emerald-700 font-medium truncate">✓ נשמר</p>
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

function ActionBtn({
  label,
  title,
  onClick,
  icon,
  variant = "default",
}: {
  label: string;
  title?: string;
  onClick: () => void;
  icon: ReactNode;
  variant?: "default" | "sky" | "danger";
}) {
  return (
    <button
      type="button"
      title={title || label}
      onClick={onClick}
      className={cn(
        "flex min-h-[44px] w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-[10px] font-semibold leading-tight",
        variant === "default" &&
          "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100",
        variant === "sky" &&
          "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 active:bg-sky-100",
        variant === "danger" &&
          "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 active:bg-red-100",
      )}
    >
      <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <span className="truncate max-w-full px-0.5">{label}</span>
    </button>
  );
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
    <div className="mt-2 grid grid-cols-1 gap-3">
      {files.map((file, index) => {
        const flashing = flashDoneIds.has(file.id);
        const busy = file.status === "queued" || file.status === "uploading";
        const isMesh = isDentalWebViewMesh(file.fileName);

        return (
          <div
            key={file.id}
            className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
          >
            <div className="flex items-stretch gap-2 min-w-0">
              <button
                type="button"
                className={cn(
                  "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-slate-50",
                  file.status === "done"
                    ? "border-emerald-200"
                    : file.status === "error"
                      ? "border-red-300"
                      : "border-slate-200",
                )}
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
                  <span className="flex h-full w-full items-center justify-center">
                    <KindIcon kind={file.kind} className="h-7 w-7 text-slate-400" />
                  </span>
                )}
              </button>

              <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
                <p
                  className="text-xs font-semibold text-slate-800 truncate"
                  title={file.fileName}
                >
                  {file.fileName}
                </p>
                <FileStatusRow
                  file={file}
                  flashing={flashing}
                  queueInfo={queueMeta.get(file.id)}
                />
              </div>

              {busy && (
                <button
                  type="button"
                  title="בטל העלאה"
                  className="self-start shrink-0 h-8 w-8 rounded-full bg-slate-800/70 text-white flex items-center justify-center"
                  onClick={() => onCancel(index)}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {file.status === "done" && (
              <div className="grid grid-cols-2 gap-1.5">
                {isMesh ? (
                  <>
                    <ActionBtn
                      label="הורדה"
                      icon={<Download />}
                      onClick={() => onDownload(index)}
                    />
                    <ActionBtn
                      label="WebView"
                      title="Open WebView"
                      variant="sky"
                      icon={<Globe />}
                      onClick={() => openDentalWebView()}
                    />
                    <ActionBtn
                      label="שם"
                      title="שינוי שם"
                      icon={<Pencil />}
                      onClick={() => onRename(index)}
                    />
                    <ActionBtn
                      label="מחק"
                      title="מחיקה"
                      variant="danger"
                      icon={<Trash2 />}
                      onClick={() => onDelete(index)}
                    />
                  </>
                ) : (
                  <>
                    {file.kind !== "model3d" && (
                      <ActionBtn
                        label="צפייה"
                        icon={<Eye />}
                        onClick={() => onView(index)}
                      />
                    )}
                    <ActionBtn
                      label="הורדה"
                      icon={<Download />}
                      onClick={() => onDownload(index)}
                    />
                    <ActionBtn
                      label="שם"
                      title="שינוי שם"
                      icon={<Pencil />}
                      onClick={() => onRename(index)}
                    />
                    <ActionBtn
                      label="מחק"
                      title="מחיקה"
                      variant="danger"
                      icon={<Trash2 />}
                      onClick={() => onDelete(index)}
                    />
                  </>
                )}
              </div>
            )}

            {busy && (
              <button
                type="button"
                onClick={() => onCancel(index)}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
                בטל העלאה
              </button>
            )}

            {file.status === "error" && (
              <button
                type="button"
                onClick={() => onRetry(index)}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 text-xs font-medium text-red-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
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
