"use client";

import { Camera, FolderOpen, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FM2_FILES_ACCEPT,
  FM2_IMAGE_ACCEPT,
  FM2_MAX_BATCH,
} from "@/lib/file-manager-v2/constants";

type FmUploadBarProps = {
  isMobile: boolean;
  disabled?: boolean;
  dragActive: boolean;
  onFiles: (files: FileList | File[]) => void;
  onDragActive: (active: boolean) => void;
};

export function FmUploadBar({
  isMobile,
  disabled,
  dragActive,
  onFiles,
  onDragActive,
}: FmUploadBarProps) {
  const pick = (list: FileList | null) => {
    if (!list?.length || disabled) return;
    const arr = Array.from(list).slice(0, FM2_MAX_BATCH);
    if (arr.length) onFiles(arr);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    pick(e.target.files);
    e.target.value = "";
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-dashed px-2 py-2 transition-colors",
        dragActive ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-50/60",
        disabled && "opacity-50 pointer-events-none",
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        onDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDragActive(false);
        pick(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-center gap-2">
        <label
          title="צילום מהמצלמה"
          className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white transition-colors"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-700">
            <Camera className="h-4 w-4" />
          </span>
          <span className="text-[10px] font-medium text-slate-600">צילום</span>
          <input
            type="file"
            accept={FM2_IMAGE_ACCEPT}
            capture={isMobile ? "environment" : undefined}
            className="sr-only"
            disabled={disabled}
            onChange={handleChange}
          />
        </label>

        <label
          title="בחירה מהגלריה"
          className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white transition-colors"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700">
            <ImageIcon className="h-4 w-4" />
          </span>
          <span className="text-[10px] font-medium text-slate-600">גלריה</span>
          <input
            type="file"
            accept={FM2_IMAGE_ACCEPT}
            multiple
            className="sr-only"
            disabled={disabled}
            onChange={handleChange}
          />
        </label>

        <label
          title="העלאת קבצים"
          className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white transition-colors"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <FolderOpen className="h-4 w-4" />
          </span>
          <span className="text-[10px] font-medium text-slate-600">קבצים</span>
          <input
            type="file"
            accept={FM2_FILES_ACCEPT}
            multiple
            className="sr-only"
            disabled={disabled}
            onChange={handleChange}
          />
        </label>
      </div>
    </div>
  );
}
