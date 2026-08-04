"use client";

import { Download, Globe, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFileExtension } from "@/lib/file-utils";
import { formatFileSize } from "@/lib/orders/scan-file";
import { openDentalWebView } from "@/lib/orders/dental-webview";
import { formatDateTime } from "@/lib/utils";

export type MeshFileInfo = {
  fileName: string;
  fileSize?: number | null;
  uploadedAt?: Date | string | null;
  uploadedByName?: string | null;
  downloadUrl?: string | null;
};

type MeshFileInfoModalProps = {
  file: MeshFileInfo | null;
  onClose: () => void;
  onDownload?: () => void;
};

function meshTypeLabel(fileName: string): string {
  const ext = getFileExtension(fileName).toUpperCase();
  if (ext === "STL" || ext === "PLY" || ext === "OBJ") return ext;
  return ext || "3D";
}

/**
 * Simple file-info modal for STL / PLY / OBJ — no internal 3D viewer.
 * Actions: Download · Open WebView · Close
 */
export function MeshFileInfoModal({ file, onClose, onDownload }: MeshFileInfoModalProps) {
  if (!file) return null;

  const typeLabel = meshTypeLabel(file.fileName);
  const sizeLabel =
    file.fileSize != null && file.fileSize > 0 ? formatFileSize(file.fileSize) : "—";
  const uploadedLabel = file.uploadedAt ? formatDateTime(file.uploadedAt) : "—";
  const uploaderLabel = file.uploadedByName?.trim() || "—";

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
      return;
    }
    if (!file.downloadUrl) return;
    const a = document.createElement("a");
    a.href = file.downloadUrl;
    a.download = file.fileName;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mesh-file-info-title"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-400 tracking-wide">קובץ תלת־ממד</p>
            <h2
              id="mesh-file-info-title"
              className="text-lg font-bold text-slate-900 truncate mt-0.5"
              title={file.fileName}
            >
              {file.fileName}
            </h2>
          </div>
          <button
            type="button"
            title="סגור"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <dl className="px-5 py-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">סוג קובץ</dt>
            <dd className="font-semibold text-slate-900">{typeLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">גודל</dt>
            <dd className="font-medium text-slate-800">{sizeLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">תאריך העלאה</dt>
            <dd className="font-medium text-slate-800 text-left">{uploadedLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">הועלה על ידי</dt>
            <dd className="font-medium text-slate-800">{uploaderLabel}</dd>
          </div>
        </dl>

        <div className="px-5 pb-5 pt-1 flex flex-col gap-2">
          <Button
            type="button"
            className="w-full h-11 text-base font-bold"
            onClick={handleDownload}
            disabled={!file.downloadUrl && !onDownload}
          >
            <Download className="h-4 w-4" />
            הורד קובץ
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full h-11 text-base font-bold border-sky-300 text-sky-700 hover:bg-sky-50"
            onClick={openDentalWebView}
          >
            <Globe className="h-4 w-4" />
            Open WebView
          </Button>
          <Button type="button" variant="ghost" className="w-full h-10 text-slate-500" onClick={onClose}>
            סגור
          </Button>
        </div>
      </div>
    </div>
  );
}
