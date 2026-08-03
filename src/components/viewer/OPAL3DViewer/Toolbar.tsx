"use client";

import {
  Aperture,
  Camera,
  Crosshair,
  Eye,
  Home,
  Maximize2,
  Moon,
  Move3D,
  Ruler,
  Scan,
  Grid3x3,
  Sun,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  explode: boolean;
  section: boolean;
  onHome: () => void;
  onProjection: (p: ViewerProjection) => void;
  onRenderMode: (m: ViewerRenderMode) => void;
  onTheme: (t: ViewerTheme) => void;
  onMeasure: () => void;
  onScreenshot: () => void;
  onFullscreen: () => void;
  onReset: () => void;
  onExplode: () => void;
  onSection: () => void;
  onPreset?: (p: ViewerCameraPreset) => void;
};

function ToolBtn({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      size="sm"
      title={title}
      onClick={onClick}
      className={cn("h-8 w-8 p-0", active && "bg-opal-gold text-slate-900 hover:bg-opal-gold/90")}
    >
      {children}
    </Button>
  );
}

export function Toolbar({
  theme,
  projection,
  renderMode,
  measuring,
  explode,
  section,
  onHome,
  onProjection,
  onRenderMode,
  onTheme,
  onMeasure,
  onScreenshot,
  onFullscreen,
  onReset,
  onExplode,
  onSection,
}: ToolbarProps) {
  return (
    <div className="absolute top-2 left-1/2 z-20 -translate-x-1/2 flex items-center gap-0.5 rounded-xl bg-black/55 backdrop-blur px-1.5 py-1 border border-white/10">
      <ToolBtn title="Home" onClick={onHome}>
        <Home className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn
        title="Perspective"
        active={projection === "perspective"}
        onClick={() => onProjection("perspective")}
      >
        <Move3D className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn
        title="Orthographic"
        active={projection === "orthographic"}
        onClick={() => onProjection("orthographic")}
      >
        <Square className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn
        title="Wireframe"
        active={renderMode === "wireframe"}
        onClick={() => onRenderMode(renderMode === "wireframe" ? "shaded" : "wireframe")}
      >
        <Grid3x3 className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn
        title="Transparent"
        active={renderMode === "transparent"}
        onClick={() => onRenderMode(renderMode === "transparent" ? "shaded" : "transparent")}
      >
        <Eye className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn
        title="X-Ray"
        active={renderMode === "xray"}
        onClick={() => onRenderMode(renderMode === "xray" ? "shaded" : "xray")}
      >
        <Scan className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn
        title={theme === "dark" ? "Light" : "Dark"}
        onClick={() => onTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </ToolBtn>
      <ToolBtn title="Measurements" active={measuring} onClick={onMeasure}>
        <Ruler className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn title="Screenshot 4K" onClick={onScreenshot}>
        <Camera className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn title="Fullscreen" onClick={onFullscreen}>
        <Maximize2 className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn title="Reset Camera" onClick={onReset}>
        <Crosshair className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn title="Explode" active={explode} onClick={onExplode}>
        <Aperture className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn title="Section" active={section} onClick={onSection}>
        <Scan className="h-4 w-4 rotate-90" />
      </ToolBtn>
    </div>
  );
}
