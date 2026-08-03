"use client";

import { useCallback, useState } from "react";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { OPAL3DViewer } from "@/components/viewer/OPAL3DViewer";

/**
 * QA sandbox for OPAL 3D Viewer V2 (Babylon.js).
 * Drop real lab STL/OBJ/PLY/GLB files here — does not replace the production viewer.
 */
export default function ViewerV2QaPage() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const onPick = useCallback((list: FileList | null) => {
    const f = list?.[0] ?? null;
    setFile(f);
    setError(null);
    setLoaded(false);
  }, []);

  return (
    <>
      <Header
        title="OPAL 3D Viewer V2 — QA"
        description="בדיקת Babylon.js במקביל ל-Viewer הישן. אין החלפה עד שכל הבדיקות עוברות."
      />

      <Card className="mb-4">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-slate-600">
            העלה קבצים אמיתיים מהמעבדה: STL / OBJ / PLY / GLB / GLTF (כולל מעל 100MB).
            יעד QA: לפחות 10 מכל סוג לפני החלפת ה-Viewer הישן.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-lg bg-opal-gold px-4 py-2 text-sm font-medium text-white hover:bg-opal-gold-dark">
              בחירת קובץ מודל
              <input
                type="file"
                accept=".stl,.obj,.ply,.glb,.gltf"
                className="sr-only"
                onChange={(e) => onPick(e.target.files)}
              />
            </label>
            {file && (
              <p className="text-sm text-slate-700">
                {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
                {loaded ? " · ✓ נטען" : ""}
              </p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </CardContent>
      </Card>

      <div className="h-[min(70vh,720px)] rounded-xl border overflow-hidden bg-slate-950">
        {file ? (
          <OPAL3DViewer
            key={`${file.name}-${file.size}-${file.lastModified}`}
            file={file}
            fileName={file.name}
            fileSize={file.size}
            onLoaded={() => setLoaded(true)}
            onError={(m) => {
              setError(m);
              setLoaded(false);
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400 text-sm">
            בחר קובץ כדי לפתוח ב-OPAL 3D Viewer V2
          </div>
        )}
      </div>
    </>
  );
}
