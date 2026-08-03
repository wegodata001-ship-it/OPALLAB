"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrderFile } from "@/lib/types";
import { FILE_TYPE_LABELS } from "@/lib/constants/labels";
import {
  buildFileViewUrl,
  getOrderFileFolderId,
  getPreviewKind,
  isDentalScanHtml,
} from "@/lib/file-utils";
import { Button } from "@/components/ui/button";
import { OPAL3DViewer, type SceneAsset } from "@/components/viewer/OPAL3DViewer";
import {
  X,
  Download,
  ExternalLink,
  RefreshCw,
  Maximize2,
  Minimize2,
  Box,
  FileWarning,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FilePreviewModalProps {
  file: OrderFile | null;
  /** All mesh files for the order — loaded together as a dental scene. */
  sceneFiles?: OrderFile[];
  /** @deprecated use sceneFiles */
  relatedFiles?: OrderFile[];
  onClose: () => void;
}

export function FilePreviewModal({
  file,
  sceneFiles = [],
  relatedFiles = [],
  onClose,
}: FilePreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isScanViewer, setIsScanViewer] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const previewKind = file ? getPreviewKind(file.mimeType, file.fileName) : "none";
  const folderId = file ? getOrderFileFolderId(file) : "";
  const viewUrl = useMemo(() => {
    if (!file || previewKind === "none" || previewKind === "plx" || previewKind === "dcm") return null;
    return buildFileViewUrl(file.orderId, folderId);
  }, [file, folderId, previewKind]);

  const downloadUrl = file?.dataUrl ?? viewUrl;

  const dentalScene = useMemo((): SceneAsset[] => {
    if (!file) return [];
    const pool = sceneFiles.length ? sceneFiles : relatedFiles.length ? relatedFiles : [file];
    const byId = new Map<string, OrderFile>();
    for (const f of pool) byId.set(f.id, f);
    if (!byId.has(file.id)) byId.set(file.id, file);
    return [...byId.values()].map((f) => ({
      id: f.id,
      fileName: f.fileName,
      fileId: f.id,
      fileSize: f.fileSize ?? undefined,
      url: buildFileViewUrl(f.orderId, getOrderFileFolderId(f)),
      slotKey: f.slotKey,
      category: f.category,
      primary: f.id === file.id,
    }));
  }, [file, sceneFiles, relatedFiles]);

  useEffect(() => {
    if (!file) return;
    setLoading(previewKind !== "zip" && previewKind !== "plx" && previewKind !== "model3d");
    setError(false);
    setIsScanViewer(false);
    setRefreshKey((k) => k + 1);
  }, [file, previewKind]);

  useEffect(() => {
    if (!file || previewKind !== "html" || !viewUrl) return;
    let cancelled = false;
    fetch(viewUrl, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("fetch failed");
        const scanHeader = res.headers.get("X-Opal-Scan-Viewer");
        if (scanHeader === "1") {
          if (!cancelled) setIsScanViewer(true);
          return;
        }
        const text = await res.text();
        if (!cancelled) setIsScanViewer(isDentalScanHtml(text));
      })
      .catch(() => {
        if (!cancelled) setIsScanViewer(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, previewKind, viewUrl, refreshKey]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setError(false);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleIframeLoad = useCallback(() => {
    setLoading(false);
    setError(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setLoading(false);
    setError(true);
  }, []);

  if (!file) return null;

  const title =
    isScanViewer && previewKind === "html"
      ? "צפייה בסריקה תלת־ממדית"
      : previewKind === "model3d" || previewKind === "zip"
        ? "OPAL Dental Scene"
        : file.fileName;

  const modalClass = cn(
    "bg-white shadow-2xl flex flex-col transition-all",
    isFullscreen
      ? "fixed inset-0 z-[60] w-screen h-screen rounded-none"
      : "relative rounded-2xl w-[90vw] h-[90vh] max-w-[90vw] max-h-[90vh]",
  );

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/70",
        isFullscreen && "p-0",
        !isFullscreen && "p-4",
      )}
      onClick={onClose}
    >
      <div className={modalClass} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 p-4 border-b shrink-0">
          <div className="min-w-0">
            <p className="font-bold text-slate-900 truncate">{title}</p>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              {(previewKind === "model3d" || previewKind === "zip" || isScanViewer) && (
                <Box className="h-3.5 w-3.5 text-opal-gold" />
              )}
              {FILE_TYPE_LABELS[file.fileType]}
              {(previewKind === "model3d" || previewKind === "zip") && dentalScene.length > 1
                ? ` · ${dentalScene.length} meshes`
                : ""}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {downloadUrl && (
              <a href={downloadUrl} download={file.fileName} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" title="הורדה">
                  <Download className="h-4 w-4" />
                </Button>
              </a>
            )}
            {viewUrl && (
              <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" title="פתיחה בלשונית חדשה">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            )}
            {(previewKind === "html" || previewKind === "pdf") && (
              <Button variant="outline" size="sm" title="רענון" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              title={isFullscreen ? "יציאה ממסך מלא" : "מסך מלא"}
              onClick={() => setIsFullscreen((v) => !v)}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" title="סגירה" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative bg-slate-50 min-h-0">
          {loading && previewKind !== "zip" && previewKind !== "plx" && previewKind !== "model3d" && !error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/90">
              <div className="text-center">
                <div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-opal-gold border-t-transparent" />
                <p className="text-sm text-slate-500 mt-3">טוען תצוגה מקדימה...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <FileWarning className="h-12 w-12 mx-auto mb-3 text-amber-500" />
                <p className="font-medium text-slate-800">לא ניתן להציג את הקובץ</p>
                <p className="text-sm text-slate-500 mt-2">
                  ייתכן שחסרים קבצים נלווים או שהקובץ פגום.
                </p>
                {downloadUrl && (
                  <a href={downloadUrl} download={file.fileName} className="inline-block mt-4">
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4" />
                      הורד קובץ
                    </Button>
                  </a>
                )}
              </div>
            </div>
          )}

          {previewKind === "image" && viewUrl && !error && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={refreshKey}
              src={viewUrl}
              alt={file.fileName}
              className="w-full h-full object-contain p-4"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          )}

          {(previewKind === "pdf" || previewKind === "html") && viewUrl && !error && (
            <iframe
              key={refreshKey}
              ref={iframeRef}
              src={viewUrl}
              title={file.fileName}
              className="w-full h-full border-0 bg-white"
              sandbox={
                previewKind === "html"
                  ? "allow-scripts allow-same-origin allow-downloads"
                  : undefined
              }
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          )}

          {(previewKind === "model3d" || previewKind === "zip") && !error && (
            <OPAL3DViewer
              key={`v3-${refreshKey}`}
              sceneFiles={dentalScene}
              fileId={file.id}
              fileSize={file.fileSize ?? undefined}
              url={viewUrl ?? undefined}
              fileName={file.fileName}
              onLoaded={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError(true);
              }}
            />
          )}

          {previewKind === "dcm" && (
            <div className="flex items-center justify-center h-full p-8 text-center">
              <div>
                <p className="font-medium text-slate-800">קובץ DCM (DICOM)</p>
                <p className="text-sm text-slate-500 mt-2">
                  ניתן להוריד ולפתוח בתוכנת DICOM ייעודית. תצוגת נפח רפואי אינה זמינה כאן.
                </p>
                {downloadUrl && (
                  <a href={downloadUrl} download={file.fileName} className="inline-block mt-4">
                    <Button>
                      <Download className="h-4 w-4" />
                      הורדה
                    </Button>
                  </a>
                )}
              </div>
            </div>
          )}

          {previewKind === "plx" && (
            <div className="flex items-center justify-center h-full p-8 text-center">
              <div>
                <p className="font-medium text-slate-800">קובץ PLX</p>
                <p className="text-sm text-slate-500 mt-2">אין Viewer ייעודי — ניתן להוריד את הקובץ</p>
                {downloadUrl && (
                  <a href={downloadUrl} download={file.fileName} className="inline-block mt-4">
                    <Button>
                      <Download className="h-4 w-4" />
                      הורדה
                    </Button>
                  </a>
                )}
              </div>
            </div>
          )}

          {previewKind === "none" && (
            <div className="flex items-center justify-center h-full p-8 text-center text-slate-500">
              <div>
                <p>אין תצוגה מקדימה לקובץ זה</p>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={file.fileName}
                    className="text-opal-gold-dark underline text-sm mt-2 inline-block"
                  >
                    הורדת קובץ
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
