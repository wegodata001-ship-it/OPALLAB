"use client";

import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SceneLayerId, SceneTreeNode } from "./types";
import { LAYER_LABELS, LAYER_ORDER } from "./Utils";

type SceneTreeProps = {
  nodes: SceneTreeNode[];
  onToggleVisible: (meshId: string) => void;
  onToggleLayer: (layer: SceneLayerId) => void;
  layerVisibility: Record<string, boolean>;
};

/**
 * Minimal Models panel — glass side panel, eye toggles only.
 */
export function SceneTree({
  nodes,
  onToggleVisible,
  onToggleLayer,
  layerVisibility,
}: SceneTreeProps) {
  const byLayer = new Map<SceneLayerId, SceneTreeNode[]>();
  for (const n of nodes) {
    const list = byLayer.get(n.layer) ?? [];
    list.push(n);
    byLayer.set(n.layer, list);
  }
  const layers = LAYER_ORDER.filter((id) => (byLayer.get(id)?.length ?? 0) > 0);
  if (!layers.length) return null;

  return (
    <aside
      className={cn(
        "absolute top-14 left-2 z-20 w-36 max-h-[50vh] overflow-auto px-2.5 py-2 text-white",
        "rounded-[18px] bg-white/5 backdrop-blur-xl border border-white/10",
        "shadow-[0_8px_28px_rgba(0,0,0,0.25)]",
      )}
    >
      <p className="text-[10px] tracking-wide text-white/40 mb-1.5">Models ({nodes.length})</p>
      <ul className="space-y-1">
        {layers.map((layer) => {
          const list = byLayer.get(layer) ?? [];
          const layerOn = layerVisibility[layer] !== false;
          return (
            <li key={layer}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-lg px-0.5 py-0.5 text-[11px] text-white/80 hover:text-white transition-colors",
                  !layerOn && "opacity-40",
                )}
                title={layerOn ? "Hide" : "Show"}
                onClick={() => onToggleLayer(layer)}
              >
                {layerOn ? (
                  <Eye className="h-3.5 w-3.5 shrink-0 text-white/55" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 shrink-0 text-white/35" />
                )}
                <span className="truncate">{LAYER_LABELS[layer]}</span>
              </button>
              {list.length > 1 && (
                <ul className="mt-0.5 space-y-0.5 pl-5">
                  {list.map((n) => (
                    <li key={n.meshId}>
                      <button
                        type="button"
                        title={n.visible ? "Hide" : "Show"}
                        onClick={() => onToggleVisible(n.meshId)}
                        className={cn(
                          "flex w-full items-center gap-1 text-[10px] text-white/55 hover:text-white truncate",
                          !n.visible && "opacity-35",
                        )}
                      >
                        {n.visible ? (
                          <Eye className="h-3 w-3 shrink-0" />
                        ) : (
                          <EyeOff className="h-3 w-3 shrink-0" />
                        )}
                        <span className="truncate">{n.displayName}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
