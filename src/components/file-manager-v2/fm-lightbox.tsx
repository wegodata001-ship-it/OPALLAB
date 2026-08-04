"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Globe,
  Maximize2,
  Minimize2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OPAL3DViewer, type SceneAsset } from "@/components/viewer/OPAL3DViewer";
import { cn } from "@/lib/utils";
import type { FmFile } from "@/lib/file-manager-v2/types";
import { isDentalWebViewMesh, openDentalWebView } from "@/lib/orders/dental-webview";

type FmLightboxProps = {
  files: FmFile[];
  index: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDownload: (index: number) => void;
};

export function FmLightbox({ files, index, onClose, onNavigate, onDownload }: FmLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const file = index != null ? files[index] : null;
  const hasPrev = index != null && index > 0;
  const hasNext = index != null && index < files.length - 1;

  const sceneFiles = useMemo((): SceneAsset[] => {
    return files
      .filter((f) => f.kind === "model3d")
      .map((f) => ({
        id: f.fileId || f.id,
        fileName: f.fileName,
        file: f.localFile ?? null,
        fileId: f.fileId,
        fileSize: f.fileSize,
        primary: file ? f.id === file.id : false,
      }));
  }, [files, file]);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [index]);

  useEffect(() => {
    if (index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasNext) onNavigate(index + 1);
      if (e.key === "ArrowRight" && hasPrev) onNavigate(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onClose, onNavigate]);

  const goPrev = useCallback(() => {
    if (index != null && hasPrev) onNavigate(index - 1);
  }, [index, hasPrev, onNavigate]);

  const goNext = useCallback(() => {
    if (index != null && hasNext) onNavigate(index + 1);
  }, [index, hasNext, onNavigate]);

  if (index == null || !file) return null;

  const canViewModel =
    file.kind === "model3d" && (file.localFile || file.fileId || sceneFiles.length > 0);

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div
        className={cn(
          "relative flex flex-col bg-white shadow-2xl overflow-hidden",
          fullscreen
            ? "w-full h-full rounded-none"
            : "w-full max-w-5xl max-h-[92vh] rounded-2xl mx-3",
        )}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0 gap-2">
          <p className="text-sm font-semibold truncate flex-1">{file.fileName}</p>
          <div className="flex items-center gap-1 shrink-0">
            {file.kind === "image" && (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRotation((r) => r + 90)}>
                  <RotateCw className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setFullscreen((f) => !f)}>
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onDownload(index)} title="הורדה">
              <Download className="h-4 w-4" />
            </Button>
            {isDentalWebViewMesh(file.fileName) && (
              <Button type="button" variant="ghost" size="sm" onClick={openDentalWebView} title="Open WebView">
                <Globe className="h-4 w-4" />
                <span className="mr-1 hidden sm:inline text-xs">Open WebView</span>
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 bg-slate-900 flex items-center justify-center overflow-hidden">
          {hasPrev && (
            <button
              type="button"
              className="absolute right-2 z-10 h-10 w-10 rounded-full bg-white/90 shadow flex items-center justify-center"
              onClick={goPrev}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              className="absolute left-2 z-10 h-10 w-10 rounded-full bg-white/90 shadow flex items-center justify-center"
              onClick={goNext}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {canViewModel && (
            <OPAL3DViewer
              key={`fm-v3-${file.id}`}
              sceneFiles={sceneFiles.length ? sceneFiles : undefined}
              file={file.localFile}
              fileName={file.fileName}
              fileId={file.fileId}
              fileSize={file.fileSize}
              className={fullscreen ? "min-h-[calc(100vh-80px)] w-full" : "min-h-[420px] w-full"}
              onDownload={() => onDownload(index)}
              onOpenWebView={
                isDentalWebViewMesh(file.fileName) ? openDentalWebView : undefined
              }
            />
          )}
          {file.kind === "model3d" && !canViewModel && file.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.previewUrl} alt="" className="max-h-[70vh] object-contain" />
          )}
          {file.kind === "image" && file.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.previewUrl}
              alt={file.fileName}
              className="max-w-full max-h-[70vh] object-contain transition-transform duration-200"
              style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
            />
          )}
          {file.kind === "pdf" && file.previewUrl && (
            <iframe
              title={file.fileName}
              src={file.previewUrl}
              className="w-full h-[70vh] bg-white"
            />
          )}
          {file.kind === "video" && file.previewUrl && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={file.previewUrl} controls className="max-h-[70vh] max-w-full" />
          )}
          {!["image", "model3d", "pdf", "video"].includes(file.kind) && (
            <p className="text-white text-sm">{file.fileName}</p>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 py-2 shrink-0">
          {index + 1} / {files.length}
        </p>
      </div>
    </div>
  );
}
