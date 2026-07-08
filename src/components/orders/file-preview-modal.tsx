"use client";

import type { OrderFile } from "@/lib/types";
import { FILE_TYPE_LABELS } from "@/lib/constants/labels";
import { isPreviewable } from "@/lib/file-utils";
import { Button } from "@/components/ui/button";
import { X, Download, Eye } from "lucide-react";

interface FilePreviewModalProps {
  file: OrderFile | null;
  onClose: () => void;
}

export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  if (!file) return null;

  const canPreview = file.dataUrl && isPreviewable(file.mimeType, file.fileName);
  const isPdf = file.mimeType === "application/pdf" || file.fileName.toLowerCase().endsWith(".pdf");
  const isImage = file.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.fileName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <p className="font-bold text-slate-900">{file.fileName}</p>
            <p className="text-xs text-slate-400">{FILE_TYPE_LABELS[file.fileType]}</p>
          </div>
          <div className="flex gap-2">
            {file.dataUrl && (
              <a href={file.dataUrl} download={file.fileName}>
                <Button variant="outline" size="sm"><Download className="h-4 w-4" /></Button>
              </a>
            )}
            <Button variant="outline" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[200px] bg-slate-50">
          {canPreview && isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.dataUrl!} alt={file.fileName} className="max-h-[70vh] max-w-full object-contain rounded-lg" />
          )}
          {canPreview && isPdf && (
            <iframe src={file.dataUrl!} title={file.fileName} className="w-full h-[70vh] rounded-lg border" />
          )}
          {!canPreview && (
            <div className="text-center text-slate-500">
              <Eye className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>אין תצוגה מקדימה לקובץ זה</p>
              {file.dataUrl ? (
                <a href={file.dataUrl} download={file.fileName} className="text-opal-gold-dark underline text-sm mt-2 inline-block">הורדת קובץ</a>
              ) : (
                <p className="text-xs mt-1">קובץ גדול מדי — שם הקובץ נשמר בלבד</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
