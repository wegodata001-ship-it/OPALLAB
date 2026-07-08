"use client";

import { useState, useCallback } from "react";
import type { OrderFile, FileType } from "@/lib/types";
import { FILE_TYPE_LABELS } from "@/lib/constants/labels";
import { detectFileType, readFileForUpload, isPreviewable } from "@/lib/file-utils";
import { FilePreviewModal } from "@/components/orders/file-preview-modal";
import { Upload, Eye, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderFilesSectionProps {
  orderId: string;
  files: OrderFile[];
  onUpload: (file: { fileName: string; fileType: FileType; fileSize: number; dataUrl: string | null; mimeType: string }) => void;
  canUpload?: boolean;
}

export function OrderFilesSection({ orderId, files, onUpload, canUpload = true }: OrderFilesSectionProps) {
  const [preview, setPreview] = useState<OrderFile | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = useCallback(async (list: FileList | null) => {
    if (!list) return;
    setUploading(true);
    for (const f of Array.from(list)) {
      const { dataUrl, mimeType } = await readFileForUpload(f);
      onUpload({
        fileName: f.name,
        fileType: detectFileType(f.name),
        fileSize: f.size,
        dataUrl,
        mimeType,
      });
    }
    setUploading(false);
  }, [onUpload]);

  return (
    <>
      {canUpload && (
        <label className={cn(
          "flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-opal-gold/30 bg-opal-gold/5 cursor-pointer hover:bg-opal-gold/10 transition-colors mb-3",
          uploading && "opacity-50 pointer-events-none"
        )}>
          <Upload className="h-5 w-5 text-opal-gold" />
          <span className="text-sm font-medium text-opal-gold-dark">
            {uploading ? "מעלה..." : "העלאת קבצים (ניתן לבחור מספר קבצים)"}
          </span>
          <input type="file" multiple className="hidden" accept="*/*" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
        </label>
      )}

      {files.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">אין קבצים</p>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setPreview(f)}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-opal-gold/5 border border-transparent hover:border-opal-gold/20 text-sm transition-all text-right"
            >
              <span className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="truncate font-medium">{f.fileName}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0 mr-2">
                <span className="text-slate-400 text-xs">{FILE_TYPE_LABELS[f.fileType]}</span>
                {f.dataUrl && isPreviewable(f.mimeType, f.fileName) && (
                  <Eye className="h-4 w-4 text-opal-gold" />
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <FilePreviewModal file={preview} onClose={() => setPreview(null)} />
    </>
  );
}
