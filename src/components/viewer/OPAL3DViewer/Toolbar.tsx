"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Download,
  ExternalLink,
  Eye,
  Focus,
  Home,
  Maximize2,
  Minimize2,
  Settings2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VIEW_MODE_ORDER } from "./Presets";
import type {
  DentalViewMode,
  ViewerBackground,
  ViewerProjection,
  ViewerRenderMode,
} from "./types";

export type AdvancedAction =
  | "manual"
  | "grid"
  | "wireframe"
  | "xray"
  | "lighting"
  | "transparency"
  | "measurements"
  | "section"
  | "orthographic"
  | "perspective"
  | "rotateEnv"
  | "bg:darkGray"
  | "bg:lightGray"
  | "bg:whiteStudio"
  | "bg:gradientGray"
  | "bg:transparent";

type ChromeActions = {
  onClose?: () => void;
  onFullscreen?: () => void;
  isFullscreen?: boolean;
  onOpenExternal?: () => void;
  onDownload?: () => void;
};

type ToolbarProps = ChromeActions & {
  projection: ViewerProjection;
  renderMode: ViewerRenderMode;
  viewMode: DentalViewMode;
  background: ViewerBackground;
  gridVisible: boolean;
  measuring: boolean;
  sectionOn: boolean;
  manualOpen: boolean;
  onHome: () => void;
  onFitAll: () => void;
  onScreenshot: () => void;
  onViewMode: (m: DentalViewMode) => void;
  onAdvanced: (action: AdvancedAction) => void;
};

const glass =
  "rounded-[18px] bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_8px_28px_rgba(0,0,0,0.28)]";

function IconBtn({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/80",
        "transition-all duration-200 ease-out hover:bg-white/10 hover:text-white hover:scale-[1.04]",
        active && "bg-opal-gold text-slate-900 hover:bg-opal-gold hover:text-slate-900 shadow-sm",
      )}
    >
      {children}
    </button>
  );
}

const ADVANCED_ITEMS: { id: AdvancedAction; label: string }[] = [
  { id: "manual", label: "Manual Alignment" },
  { id: "grid", label: "Grid" },
  { id: "wireframe", label: "Wireframe" },
  { id: "xray", label: "X-Ray" },
  { id: "lighting", label: "Lighting" },
  { id: "transparency", label: "Transparency" },
  { id: "measurements", label: "Measurements" },
  { id: "section", label: "Section" },
  { id: "orthographic", label: "Orthographic" },
  { id: "perspective", label: "Perspective" },
  { id: "rotateEnv", label: "Rotate Environment" },
];

const BG_ITEMS: { id: AdvancedAction; label: string; bg: ViewerBackground }[] = [
  { id: "bg:darkGray", label: "Dark Gray", bg: "darkGray" },
  { id: "bg:lightGray", label: "Light Gray", bg: "lightGray" },
  { id: "bg:whiteStudio", label: "White Studio", bg: "whiteStudio" },
  { id: "bg:gradientGray", label: "Gradient Gray", bg: "gradientGray" },
  { id: "bg:transparent", label: "Transparent", bg: "transparent" },
];

const VIEW_LABELS: Record<DentalViewMode, string> = {
  dental: "Dental",
  scan: "Scan",
  cad: "CAD",
  xray: "X-Ray",
  wireframe: "Wireframe",
  clay: "Clay",
  monochrome: "Monochrome",
};

export function Toolbar({
  onClose,
  onFullscreen,
  isFullscreen,
  onOpenExternal,
  onDownload,
  projection,
  renderMode,
  viewMode,
  background,
  gridVisible,
  measuring,
  sectionOn,
  manualOpen,
  onHome,
  onFitAll,
  onScreenshot,
  onViewMode,
  onAdvanced,
}: ToolbarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!advancedOpen && !displayOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setAdvancedOpen(false);
        setDisplayOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [advancedOpen, displayOpen]);

  const activeFlag = (id: AdvancedAction): boolean => {
    if (id === "manual") return manualOpen;
    if (id === "grid") return gridVisible;
    if (id === "wireframe") return renderMode === "wireframe" || viewMode === "wireframe";
    if (id === "xray") return renderMode === "xray" || viewMode === "xray";
    if (id === "transparency") return renderMode === "transparent";
    if (id === "measurements") return measuring;
    if (id === "section") return sectionOn;
    if (id === "orthographic") return projection === "orthographic";
    if (id === "perspective") return projection === "perspective";
    if (id.startsWith("bg:")) return background === id.slice(3);
    return false;
  };

  const hasChrome = Boolean(onClose || onFullscreen || onOpenExternal || onDownload);

  return (
    <div ref={rootRef} className="absolute top-0 inset-x-0 z-30 pointer-events-none">
      {hasChrome && (
        <div className={cn("absolute top-2 left-2 pointer-events-auto flex items-center gap-0.5 px-1 py-0.5", glass)}>
          {onClose && (
            <IconBtn title="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconBtn>
          )}
          {onFullscreen && (
            <IconBtn title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={onFullscreen}>
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </IconBtn>
          )}
          {onOpenExternal && (
            <IconBtn title="Open in new window" onClick={onOpenExternal}>
              <ExternalLink className="h-4 w-4" />
            </IconBtn>
          )}
          {onDownload && (
            <IconBtn title="Download" onClick={onDownload}>
              <Download className="h-4 w-4" />
            </IconBtn>
          )}
        </div>
      )}

      <div
        className={cn(
          "absolute top-2 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-0.5 px-1 py-0.5",
          glass,
        )}
      >
        <IconBtn title="Home" onClick={onHome}>
          <Home className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="Fit All" onClick={onFitAll}>
          <Focus className="h-4 w-4" />
        </IconBtn>
        <div className="relative">
          <IconBtn
            title="Display"
            active={displayOpen}
            onClick={() => {
              setDisplayOpen((v) => !v);
              setAdvancedOpen(false);
            }}
          >
            <Eye className="h-4 w-4" />
          </IconBtn>
          {displayOpen && (
            <div className={cn("absolute top-full left-1/2 mt-2 -translate-x-1/2 w-40 py-1.5", glass)}>
              <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-white/35">View</p>
              {VIEW_MODE_ORDER.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={cn(
                    "flex w-full items-center px-3 py-1.5 text-left text-[11px] text-white/80 hover:bg-white/8 transition-colors",
                    viewMode === m && "text-opal-gold",
                  )}
                  onClick={() => {
                    onViewMode(m);
                    setDisplayOpen(false);
                  }}
                >
                  {VIEW_LABELS[m]}
                </button>
              ))}
            </div>
          )}
        </div>
        <IconBtn title="Screenshot" onClick={onScreenshot}>
          <Camera className="h-4 w-4" />
        </IconBtn>
        <div className="relative">
          <IconBtn
            title="Advanced"
            active={advancedOpen || manualOpen || measuring || sectionOn || gridVisible}
            onClick={() => {
              setAdvancedOpen((v) => !v);
              setDisplayOpen(false);
            }}
          >
            <Settings2 className="h-4 w-4" />
          </IconBtn>
          {advancedOpen && (
            <div className={cn("absolute top-full left-1/2 mt-2 -translate-x-1/2 w-52 py-1.5 max-h-[70vh] overflow-auto", glass)}>
              <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-white/35">Advanced</p>
              {ADVANCED_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] text-white/80 hover:bg-white/8",
                    activeFlag(item.id) && "text-opal-gold",
                  )}
                  onClick={() => {
                    onAdvanced(item.id);
                    if (item.id !== "rotateEnv") setAdvancedOpen(false);
                  }}
                >
                  <span>{item.label}</span>
                  {activeFlag(item.id) && <span className="text-[9px] text-opal-gold/90">ON</span>}
                </button>
              ))}
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-white/35">Background</p>
              {BG_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center px-3 py-1.5 text-left text-[11px] text-white/80 hover:bg-white/8",
                    background === item.bg && "text-opal-gold",
                  )}
                  onClick={() => {
                    onAdvanced(item.id);
                    setAdvancedOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
