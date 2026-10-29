"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Barcode, Camera, Copy, Drill, Gem, ImagePlus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { barcodeMarkup } from "@/lib/inventory/barcode-svg";
import { canStoreBarcode, type MediaModule } from "@/lib/inventory/inventory-media-shared";

type MediaImage = { id: string; url: string | null; isPrimary: boolean };
type MediaRecord = { entityId: string; entityKind: string; barcode: string; images: MediaImage[] };
type ScanHit = { module: string; entityKind: string; entityId: string; code: string; name?: string };

type MediaState = {
  module: MediaModule;
  byId: Map<string, MediaRecord>;
  reload: () => Promise<void>;
};

const EMPTY_MEDIA: MediaState = {
  module: "ZIRCONIA",
  byId: new Map(),
  reload: async () => undefined,
};

const MediaContext = createContext<MediaState | null>(null);

async function readMedia<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) throw new Error(body?.error?.message || "הפעולה נכשלה");
  return body.data as T;
}

export function useInventoryMedia() {
  return useContext(MediaContext) ?? EMPTY_MEDIA;
}

export function hasInventoryMedia(module: MediaModule) {
  const value = useContext(MediaContext);
  return value?.module === module;
}

export function InventoryMediaProvider({ module, children }: { module: MediaModule; children: ReactNode }) {
  const [byId, setById] = useState<Map<string, MediaRecord>>(new Map());
  const reload = useCallback(async () => {
    const data = await readMedia<{ records: MediaRecord[] }>(await fetch(`/api/inventory/media?module=${module}`, { credentials: "include" }));
    setById(new Map(data.records.map((row) => [row.entityId, row])));
  }, [module]);

  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);

  const value = useMemo(() => ({ module, byId, reload }), [module, byId, reload]);
  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
}

async function compressImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("אפשר להעלות JPG, PNG או WEBP");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
  if (!blob) return file;
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

function KindMark({ kind, module }: { kind: string; module: string }) {
  const className = "h-5 w-5 text-slate-400";
  if (module === "DRILLS" && (kind === "machine" || kind === "type" || kind === "bit")) return <Drill className={className} />;
  if (kind === "variant" || kind === "category") return <Gem className={className} />;
  return <ImagePlus className={className} />;
}

export function MediaFace({ kind, id, name, canEdit = false, size = "card" }: { kind: string; id: string; name: string; canEdit?: boolean; size?: "card" | "thumb" }) {
  const media = useInventoryMedia();
  const record = media.byId.get(id);
  const images = record?.images ?? [];
  const primary = images.find((image) => image.isPrimary) ?? images[0];
  const leaf = canStoreBarcode(media.module, kind);
  const barcode = leaf && record?.entityKind === kind ? record.barcode : "";
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [pending, setPending] = useState<{ file: File; replace: boolean } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setCode(barcode);
  }, [open, barcode]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function choose(file: File | null, replace: boolean) {
    if (!file) return;
    setError(null);
    try {
      const next = await compressImage(file);
      if (preview) URL.revokeObjectURL(preview);
      setPending({ file: next, replace });
      setPreview(URL.createObjectURL(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לקרוא את התמונה");
    }
  }

  async function saveImage() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const replacing = pending.replace && primary;
      if (replacing && primary) {
        await readMedia(await fetch(`/api/inventory/media?imageId=${primary.id}`, { method: "DELETE", credentials: "include" }));
      }
      const form = new FormData();
      form.set("module", media.module);
      form.set("entityKind", kind);
      form.set("entityId", id);
      form.set("file", pending.file);
      form.set("makePrimary", replacing || images.length === 0 ? "1" : "0");
      await readMedia(await fetch("/api/inventory/media", { method: "POST", credentials: "include", body: form }));
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      setPending(null);
      await media.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "העלאת התמונה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await media.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפעולה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  function printLabel() {
    const value = barcode || code;
    if (!value) return;
    const graphic = barcodeMarkup(value);
    if (!graphic.svg) {
      setError("אי אפשר להדפיס את הברקוד הזה כ־Code 128");
      return;
    }
    const popup = window.open("", "_blank", "noopener,width=420,height=320");
    if (!popup) return;
    popup.document.write(`<!doctype html><html dir="rtl"><head><title>מדבקת ברקוד</title></head><body style="font-family:sans-serif;text-align:center;padding:16px">${graphic.svg}<p>${name}</p><p>${value}</p><script>print()<\/script></body></html>`);
    popup.document.close();
  }

  const frame = size === "thumb" ? "h-16 w-16 rounded-xl" : "h-36 w-36 rounded-2xl sm:h-40 sm:w-40";
  const shown = preview || primary?.url || "";

  return (
    <div className="shrink-0" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`flex ${frame} items-center justify-center overflow-hidden border border-slate-200 bg-white p-1`}
        aria-label={primary?.url ? `הגדלת תמונה ${name}` : `תמונה ${name}`}
        onClick={() => (primary?.url ? setZoom(true) : canEdit && setOpen(true))}
      >
        {primary?.url ? (
          <img src={primary.url} alt={name} className="h-full w-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-1 px-1 text-center text-[11px] text-slate-400">
            <KindMark kind={kind} module={media.module} />
            {size === "card" ? (canEdit ? "הוספת תמונה" : "אין תמונה") : null}
          </span>
        )}
      </button>
      {leaf && barcode && <p className={`mt-1 truncate text-center text-[10px] text-slate-500 ${size === "thumb" ? "max-w-16" : "max-w-36"}`} title={barcode}>{barcode}</p>}
      <Modal open={zoom} onClose={() => setZoom(false)} title={name} className="max-w-3xl">
        <div className="flex min-h-80 items-center justify-center rounded-2xl bg-white p-4">
          {shown ? <img src={shown} alt={name} className="max-h-[70vh] w-full object-contain" /> : <KindMark kind={kind} module={media.module} />}
        </div>
        {canEdit && <div className="mt-3 flex justify-end"><Button variant="outline" onClick={() => { setZoom(false); setOpen(true); }}>עריכת תמונה וברקוד</Button></div>}
      </Modal>
      <Modal open={open} onClose={() => setOpen(false)} title={`תמונה וברקוד · ${name}`} className="max-w-lg">
        <div className="space-y-3">
          <div className="flex max-h-96 min-h-56 w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
            {preview ? <img src={preview} alt="" className="max-h-96 w-full object-contain" /> : primary?.url ? <img src={primary.url} alt={name} className="max-h-96 w-full object-contain" /> : <span className="text-sm text-slate-400">אין תמונה. אפשר להעלות או לצלם.</span>}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((image) => (
                <button key={image.id} type="button" className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-white p-1 ${image.isPrimary ? "border-opal-gold" : "border-slate-200"}`} onClick={() => canEdit && void run(async () => { await readMedia(await fetch("/api/inventory/media", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "primary", module: media.module, imageId: image.id }) })); })}>
                  {image.url ? <img src={image.url} alt="" className="h-full w-full object-contain" /> : <KindMark kind={kind} module={media.module} />}
                </button>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-800">הוסף תמונה / צלם תמונה / החלף תמונה</p>
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  הוסף תמונה
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void choose(event.target.files?.[0] ?? null, false)} />
                </label>
                <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  צלם תמונה
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => void choose(event.target.files?.[0] ?? null, false)} />
                </label>
                <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  החלף תמונה
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void choose(event.target.files?.[0] ?? null, true)} />
                </label>
              </div>
              {preview && <Button disabled={busy} onClick={() => void saveImage()}>שמירת תמונה</Button>}
              {primary && <Button variant="outline" className="text-red-600" disabled={busy} onClick={() => void run(async () => { await readMedia(await fetch(`/api/inventory/media?imageId=${primary.id}`, { method: "DELETE", credentials: "include" })); })}><Trash2 className="h-4 w-4" />מחיקת תמונה</Button>}
            </div>
          )}
          {leaf && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-sm font-medium text-slate-800">ברקוד</p>
              <p className="text-sm text-slate-700">{barcode || "אין ברקוד"}</p>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="הזנת ברקוד" aria-label={`ברקוד ${name}`} />
                  <Button disabled={busy || !code.trim()} onClick={() => void run(async () => { await readMedia(await fetch("/api/inventory/media", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "barcode", module: media.module, entityKind: kind, entityId: id, code }) })); })}>שמירה</Button>
                  <Button variant="outline" disabled={busy || Boolean(barcode)} title={barcode ? "ברקוד קיים לא מוחלף אוטומטית" : undefined} onClick={() => void run(async () => { await readMedia(await fetch("/api/inventory/media", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", module: media.module, entityKind: kind, entityId: id }) })); })}>יצירה אוטומטית</Button>
                  {barcode && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await readMedia(await fetch("/api/inventory/media", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear-barcode", module: media.module, entityKind: kind, entityId: id }) })); })}>מחיקה</Button>}
                </div>
              )}
              {barcode && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => void navigator.clipboard.writeText(barcode)}><Copy className="h-4 w-4" />העתקה</Button>
                  <Button variant="outline" onClick={printLabel}><Printer className="h-4 w-4" />הדפסת מדבקה</Button>
                </div>
              )}
            </div>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}

export function BarcodeScanBox({ onFound, onCapture, videoId = "inventory-barcode-video" }: { onFound?: (hit: ScanHit) => void; onCapture?: (code: string) => void; videoId?: string }) {
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const data = await readMedia<{ match: ScanHit | null }>(await fetch(`/api/inventory/media?code=${encodeURIComponent(trimmed)}`, { credentials: "include" }));
      if (!data.match || data.match.module === "LEGACY_HIDDEN") {
        setError(data.match?.module === "LEGACY_HIDDEN" ? "הברקוד שייך למלאי הישן שהוסר מהממשק. הסריקה לא פותחת אותו ולא משנה כמות." : "לא נמצא מוצר עם הברקוד הזה");
        return;
      }
      setCode("");
      onFound?.(data.match);
    } catch (err) {
      setError(err instanceof Error ? err.message : "החיפוש נכשל");
    }
  }

  useEffect(() => {
    if (!camera) return;
    const holder = { stop: false, stream: null as MediaStream | null };
    const video = document.getElementById(videoId) as HTMLVideoElement | null;
    void (async () => {
      const Detector = (window as Window & { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      if (!Detector || !navigator.mediaDevices?.getUserMedia || !video) {
        setError("הדפדפן לא תומך בסריקת מצלמה. אפשר להקליד ברקוד או לסרוק עם קורא חיצוני.");
        setCamera(false);
        return;
      }
      try {
        holder.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (holder.stop) {
          holder.stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = holder.stream;
        await video.play();
        const detector = new Detector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e"] });
        const scan = async () => {
          if (holder.stop) return;
          const found = await detector.detect(video).catch(() => []);
          const value = found.find((row) => row.rawValue)?.rawValue;
          if (value) {
            holder.stop = true;
            setCamera(false);
            await submit(value);
            return;
          }
          window.setTimeout(scan, 250);
        };
        void scan();
      } catch {
        if (!holder.stop) setError("לא ניתן לפתוח את המצלמה");
        setCamera(false);
      }
    })();
    return () => {
      holder.stop = true;
      holder.stream?.getTracks().forEach((track) => track.stop());
    };
  }, [camera, videoId]);

  async function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (onCapture) {
      onCapture(trimmed);
      setCode("");
      setError(null);
      return;
    }
    if (onFound) await lookup(trimmed);
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submit(code); } }} placeholder={onCapture ? "סריקה או הזנת ברקוד" : "סריקה או חיפוש לפי ברקוד"} aria-label="חיפוש לפי ברקוד" />
        <Button type="button" variant="outline" onClick={() => void submit(code)}><Barcode className="h-4 w-4" />{onCapture ? "שימוש בברקוד" : "איתור"}</Button>
        <Button type="button" onClick={() => setCamera((value) => !value)}><Camera className="h-4 w-4" />{camera ? "סגירת מצלמה" : "סריקת מצלמה"}</Button>
      </div>
      {camera && <video id={videoId} className="mt-2 h-40 w-full rounded-lg bg-slate-900 object-cover" muted playsInline />}
    </div>
  );
}
