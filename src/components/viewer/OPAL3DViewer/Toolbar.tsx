"use client";

import {
  Aperture,
  Box,
  Camera,
  Focus,
  Fullscreen,
  Grid3x3,
  Home,
  Moon,
  Move3d,
  Ruler,
  Sun,
  Square,
  Circle,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
  ViewerCameraPreset,
  ViewerProjection,
  ViewerRenderMode,
  ViewerTheme,
} from "./types";

type ToolbarProps = {
  theme: ViewerTheme;
  projection: ViewerProjection;
  renderMode: ViewerRenderMode;
  measuring: boolean;
  measureLabel?: string | null;
  onTheme: (t: ViewerTheme) => void;
  onProjection: (p: ViewerProjection) => void;
  onRenderMode: (m: ViewerRenderMode) => void;
  onPreset: (p: ViewerCameraPreset) => void;
  onHome: () => void;
  onReset: () => void;
  onFullscreen: () => void;
  onScreenshot: () => void;
  onToggleMeasure: () => void;
};

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-opal-gold text-white"
          : "bg-black/40 text-white/90 hover:bg-black/55",
      )}
    >
      {children}
    </button>
  );
}

export function Toolbar({
  theme,
  projection,
  renderMode,
  measuring,
  measureLabel,
  onTheme,
  onProjection,
  onRenderMode,
  onPreset,
  onHome,
  onReset,
  onFullscreen,
  onScreenshot,
  onToggleMeasure,
}: ToolbarProps) {
  return (
    <>
      <div className="absolute top-2 inset-x-2 z-20 flex flex-wrap gap-1.5 justify-center pointer-events-none">
        <div className="pointer-events-auto flex flex-wrap gap-1.5 rounded-xl bg-black/35 backdrop-blur-sm p-1.5 max-w-full">
          <Chip title="Home" onClick={onHome}>
            <Home className="h-3.5 w-3.5" /> Home
          </Chip>
          <Chip title="Reset Camera" onClick={onReset}>
            <Focus className="h-3.5 w-3.5" /> Reset
          </Chip>
          <Chip title="Fullscreen" onClick={onFullscreen}>
            <Fullscreen className="h-3.5 w-3.5" /> Fullscreen
          </Chip>
          <Chip title="Screenshot" onClick={onScreenshot}>
            <Camera className="h-3.5 w-3.5" /> Screenshot
          </Chip>
          <Chip
            title="Wireframe"
            active={renderMode === "wireframe"}
            onClick={() => onRenderMode("wireframe")}
          >
            <Grid3x3 className="h-3.5 w-3.5" /> Wireframe
          </Chip>
          <Chip
            title="Transparent"
            active={renderMode === "transparent"}
            onClick={() => onRenderMode("transparent")}
          >
            <Circle className="h-3.5 w-3.5" /> Transparent
          </Chip>
          <Chip
            title="X-Ray"
            active={renderMode === "xray"}
            onClick={() => onRenderMode("xray")}
          >
            <Aperture className="h-3.5 w-3.5" /> X-Ray
          </Chip>
          <Chip
            title="Shaded"
            active={renderMode === "shaded"}
            onClick={() => onRenderMode("shaded")}
          >
            <Box className="h-3.5 w-3.5" /> Shaded
          </Chip>
          <Chip
            title="Perspective"
            active={projection === "perspective"}
            onClick={() => onProjection("perspective")}
          >
            <Move3d className="h-3.5 w-3.5" /> Perspective
          </Chip>
          <Chip
            title="Orthographic"
            active={projection === "orthographic"}
            onClick={() => onProjection("orthographic")}
          >
            <Square className="h-3.5 w-3.5" /> Ortho
          </Chip>
          <Chip
            title="Dark"
            active={theme === "dark"}
            onClick={() => onTheme("dark")}
          >
            <Moon className="h-3.5 w-3.5" /> Dark
          </Chip>
          <Chip
            title="Light"
            active={theme === "light"}
            onClick={() => onTheme("light")}
          >
            <Sun className="h-3.5 w-3.5" /> Light
          </Chip>
          <Chip
            title="Measurements"
            active={measuring}
            onClick={onToggleMeasure}
          >
            <Ruler className="h-3.5 w-3.5" /> Measurements
            {measureLabel ? ` · ${measureLabel}` : ""}
          </Chip>
        </div>
      </div>

      <div className="absolute bottom-2 inset-x-2 z-20 flex flex-wrap gap-1.5 justify-center pointer-events-none">
        <div className="pointer-events-auto flex flex-wrap gap-1 rounded-xl bg-black/35 backdrop-blur-sm p-1.5">
          {(
            [
              ["top", "Top"],
              ["bottom", "Bottom"],
              ["left", "Left"],
              ["right", "Right"],
              ["front", "Front"],
              ["back", "Back"],
              ["iso", "ISO"],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} title={label} onClick={() => onPreset(id)}>
              {label}
            </Chip>
          ))}
        </div>
      </div>
    </>
  );
}
