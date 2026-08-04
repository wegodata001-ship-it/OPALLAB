"use client";

import { cn } from "@/lib/utils";
import type { ViewerCameraPreset } from "./types";

const PRESETS: { id: ViewerCameraPreset; label: string }[] = [
  { id: "iso", label: "ISO" },
  { id: "top", label: "TOP" },
  { id: "bottom", label: "BOTTOM" },
  { id: "left", label: "LEFT" },
  { id: "right", label: "RIGHT" },
  { id: "front", label: "FRONT" },
  { id: "back", label: "BACK" },
];

type BottomToolbarProps = {
  onPreset: (p: ViewerCameraPreset) => void;
  active?: ViewerCameraPreset | null;
};

export function BottomToolbar({ onPreset, active }: BottomToolbarProps) {
  return (
    <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
      <div
        className={cn(
          "flex items-center gap-0.5 px-1.5 py-0.5",
          "rounded-[18px] bg-white/5 backdrop-blur-xl border border-white/10",
          "shadow-[0_8px_28px_rgba(0,0,0,0.25)]",
        )}
      >
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.label}
            className={cn(
              "h-7 px-2 text-[10px] tracking-wide text-white/65 hover:text-white transition-all duration-200 rounded-lg hover:bg-white/8",
              active === p.id && "text-opal-gold",
            )}
            onClick={() => onPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
