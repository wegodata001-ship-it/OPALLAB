import { getFileExtension } from "@/lib/file-utils";

/** External dental mesh viewer — user downloads from OPAL, then Add Mesh there. */
export const DENTAL_WEBVIEW_URL = "https://webview.dental/";

const WEBVIEW_MESH_EXTS = new Set(["stl", "obj", "ply"]);

export function isDentalWebViewMesh(fileName?: string | null): boolean {
  if (!fileName) return false;
  return WEBVIEW_MESH_EXTS.has(getFileExtension(fileName));
}

export function openDentalWebView(): void {
  if (typeof window === "undefined") return;
  window.open(DENTAL_WEBVIEW_URL, "_blank", "noopener,noreferrer");
}
