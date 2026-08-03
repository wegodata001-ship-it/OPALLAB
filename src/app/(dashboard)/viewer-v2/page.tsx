"use client";

import { useCallback, useMemo, useState } from "react";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { OPAL3DViewer, type SceneAsset } from "@/components/viewer/OPAL3DViewer";

/**
 * QA sandbox for OPAL 3D Viewer V3 — Dental Scene Viewer.
 * Drop multiple lab meshes to simulate a full patient scene.
 */
export default function ViewerV3QaPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const onPick = useCallback((list: FileList | null) => {
    const next = list ? Array.from(list) : [];
    setFiles(next);
    setError(null);
    setLoaded(false);
  }, []);

  const sceneFiles = useMemo(
    (): SceneAsset[] =>
      files.map((f, i) => ({
        id: `${f.name}-${f.size}-${i}`,
        fileName: f.name,
        file: f,
        fileSize: f.size,
        primary: i === 0,
      })),
    [files],
  );

  return (
    <>
      <Header
        title="OPAL 3D Viewer V3 — Dental Scene QA"
        description="Babylon.js Exocad-style scene. טען Upper/Lower/Bite יחד."
      />

      <Card className="mb-4">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-slate-600">
            בחר מספר קבצים (STL / OBJ / PLY / GLB / GLTF / ZIP) — כולם ייטענו כסצנת מטופל אחת.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-lg bg-opal-gold px-4 py-2 text-sm font-medium text-white hover:bg-opal-gold-dark">
              בחירת קבצי סצנה
              <input
                type="file"
                multiple
                accept=".stl,.obj,.ply,.glb,.gltf,.zip"
                className="sr-only"
                onChange={(e) => onPick(e.target.files)}
              />
            </label>
            {files.length > 0 && (
              <p className="text-sm text-slate-700">
                {files.length} files
                {loaded ? " · ✓ Scene ready" : ""}
              </p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          {files.length > 0 && (
            <ul className="text-xs text-slate-500 space-y-0.5">
              {files.map((f) => (
                <li key={`${f.name}-${f.size}`}>
                  {f.name} · {(f.size / (1024 * 1024)).toFixed(1)} MB
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="h-[min(70vh,720px)] rounded-xl border overflow-hidden bg-slate-950">
        {sceneFiles.length ? (
          <OPAL3DViewer
            key={sceneFiles.map((s) => s.id).join("|")}
            sceneFiles={sceneFiles}
            onLoaded={() => setLoaded(true)}
            onError={(m) => {
              setError(m);
              setLoaded(false);
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400 text-sm">
            בחר קבצים כדי לפתוח OPAL 3D Viewer V3
          </div>
        )}
      </div>
    </>
  );
}
