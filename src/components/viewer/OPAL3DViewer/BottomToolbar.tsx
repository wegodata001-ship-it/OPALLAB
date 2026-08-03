"use client";

import { Button } from "@/components/ui/button";
import type { ViewerCameraPreset } from "./types";

const PRESETS: { id: ViewerCameraPreset; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "iso", label: "Iso" },
];

type BottomToolbarProps = {
  onPreset: (p: ViewerCameraPreset) => void;
};

export function BottomToolbar({ onPreset }: BottomToolbarProps) {
  return (
    <div className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 flex flex-col items-center gap-1">
      <div className="flex items-center gap-0.5 rounded-xl bg-black/55 backdrop-blur px-1.5 py-1 border border-white/10">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="ghost"
            size="sm"
            title={p.label}
            className="h-7 px-2 text-[11px] text-white/90 hover:text-white"
            onClick={() => onPreset(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <p className="text-[10px] text-white/50 select-none">
        LMB Rotate · RMB Pan · Wheel Zoom · Dbl-click Zoom to selection
      </p>
    </div>
  );
}
