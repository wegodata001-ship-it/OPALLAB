"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Eraser, Save, X } from "lucide-react";

type SignaturePadModalProps = {
  open: boolean;
  title?: string;
  defaultSignerName?: string;
  onCancel: () => void;
  onSave: (result: { dataUrl: string; signerName: string }) => void;
};

export function SignaturePadModal({
  open,
  title = "חתימת מקבל",
  defaultSignerName = "",
  onCancel,
  onSave,
}: SignaturePadModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [hasStroke, setHasStroke] = useState(false);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setHasStroke(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSignerName(defaultSignerName);
    const id = requestAnimationFrame(() => resizeCanvas());
    return () => cancelAnimationFrame(id);
  }, [open, defaultSignerName, resizeCanvas]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasStroke(true);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const clear = () => resizeCanvas();

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) return;
    onSave({
      dataUrl: canvas.toDataURL("image/png"),
      signerName: signerName.trim(),
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-bold text-slate-900">{title}</p>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <Label>שם החותם (אופציונלי)</Label>
            <Input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="שם מקבל המשלוח"
            />
          </div>
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full h-48 touch-none cursor-crosshair bg-white"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
          </div>
          <p className="text-xs text-slate-400 text-center">חתימה באצבע או בעכבר · אופציונלי</p>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              ביטול
            </Button>
            <Button type="button" variant="outline" onClick={clear}>
              <Eraser className="h-4 w-4" />
              נקה
            </Button>
            <Button type="button" disabled={!hasStroke} onClick={save}>
              <Save className="h-4 w-4" />
              שמור
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
