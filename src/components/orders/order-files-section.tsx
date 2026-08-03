"use client";

import { useCallback, useMemo, useState } from "react";
import type { OrderFile } from "@/lib/types";
import { FILE_TYPE_LABELS } from "@/lib/constants/labels";
import { isPreviewable } from "@/lib/file-utils";
import { FilePreviewModal } from "@/components/orders/file-preview-modal";
import { useApp } from "@/providers/AppProvider";
import {
  ORDER_FILE_CATEGORIES,
  ORDER_FILE_CATEGORY_LABELS,
  ORDER_FILE_SLOT_LABELS,
  type OrderFileCategory,
  type OrderFileSlotKey,
} from "@/lib/orders/order-file-taxonomy";
import { formatFileSize } from "@/lib/orders/scan-file";
import {
  ChevronLeft,
  Eye,
  FileText,
  Folder,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderFilesSectionProps {
  orderId: string;
  files: OrderFile[];
  onUpload: (
    file: File,
    folderId?: string,
    meta?: { category?: OrderFileCategory; slotKey?: string },
  ) => void | Promise<void>;
  canUpload?: boolean;
}

function categoryOf(file: OrderFile): OrderFileCategory {
  return (file.category as OrderFileCategory) || "Other";
}

export function OrderFilesSection({
  files,
  onUpload,
  canUpload = true,
}: OrderFilesSectionProps) {
  const { users } = useApp();
  const [preview, setPreview] = useState<OrderFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openCategory, setOpenCategory] = useState<OrderFileCategory | "all">("all");
  const [showHistory, setShowHistory] = useState(false);

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

  const handleFiles = useCallback(
    async (list: FileList | null, category?: OrderFileCategory) => {
      if (!list) return;
      setUploading(true);
      try {
        for (const file of Array.from(list)) {
          await onUpload(file, undefined, category ? { category } : undefined);
        }
      } finally {
        setUploading(false);
      }
    },
    [onUpload],
  );

  const categoriesToShow =
    openCategory === "all"
      ? ORDER_FILE_CATEGORIES.filter((c) => (byCategory.get(c)?.length ?? 0) > 0 || canUpload)
      : [openCategory];

  return (
    <>
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
        <label
          className={cn(
            "flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-opal-gold/30 bg-opal-gold/5 cursor-pointer hover:bg-opal-gold/10 transition-colors mb-3",
            uploading && "opacity-50 pointer-events-none",
          )}
        >
          <Upload className="h-5 w-5 text-opal-gold" />
          <span className="text-sm font-medium text-opal-gold-dark">
            {uploading ? "מעלה..." : "העלאת קבצים (מיון אוטומטי לתיקיות)"}
          </span>
          <input
            type="file"
            multiple
            className="hidden"
            accept="*/*"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}

      <div className="space-y-3">
        {categoriesToShow.map((cat) => {
          const list = byCategory.get(cat) ?? [];
          return (
            <div key={cat} className="rounded-xl border bg-white overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Folder className="h-4 w-4 text-opal-gold" />
                  {ORDER_FILE_CATEGORY_LABELS[cat]}
                  <span className="text-xs font-normal text-slate-400">/{cat}</span>
                </div>
                {canUpload && (
                  <label className="text-xs text-opal-gold-dark cursor-pointer hover:underline flex items-center gap-1">
                    <Upload className="h-3.5 w-3.5" />
                    העלה לכאן
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void handleFiles(e.target.files, cat);
                        e.target.value = "";
                      }}
                    />
                  </label>
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
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => setPreview(f)}
                          className="w-full flex items-start justify-between gap-3 p-3 text-right hover:bg-opal-gold/5 transition-colors"
                        >
                          <span className="flex items-start gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
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
                          </span>
                          <span className="flex items-center gap-1 shrink-0 text-slate-400">
                            {isPreviewable(f.mimeType, f.fileName) && <Eye className="h-4 w-4 text-opal-gold" />}
                            <ChevronLeft className="h-4 w-4" />
                          </span>
                        </button>
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

      <FilePreviewModal file={preview} onClose={() => setPreview(null)} />
    </>
  );
}
