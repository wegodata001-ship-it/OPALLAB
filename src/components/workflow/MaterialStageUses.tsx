"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MATERIAL_STAGE_LABELS, type MaterialOption, type MaterialRevisionView, type MaterialStage, type MaterialUseView } from "@/lib/workflow/material-usage-shared";

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) throw new Error(body?.error?.message || "הפעולה נכשלה");
  return body.data as T;
}

export function MaterialStageUses({
  orderId,
  stage,
  canRecord,
  uses,
  onChanged,
}: {
  orderId: string;
  stage: MaterialStage;
  canRecord: boolean;
  uses: MaterialUseView[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<MaterialOption[]>([]);
  const [modelKey, setModelKey] = useState("");
  const [colorId, setColorId] = useState("");
  const [heightId, setHeightId] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [history, setHistory] = useState<MaterialRevisionView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const models = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of options) map.set(option.modelKey, option.modelName);
    return [...map.entries()].map(([key, name]) => ({ key, name }));
  }, [options]);
  const colors = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of options) if (option.modelKey === modelKey) map.set(option.colorId, option.colorName);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [options, modelKey]);
  const heights = useMemo(() => options.filter((option) => option.modelKey === modelKey && option.colorId === colorId), [options, modelKey, colorId]);
  const selected = heights.find((option) => option.heightId === heightId) ?? null;

  async function openDialog() {
    setOpen(true);
    setError(null);
    setEditingId(null);
    setHistory(null);
    if (!canRecord) return;
    try {
      setOptions(await readJson<MaterialOption[]>(await fetch("/api/workflow/materials?options=1", { credentials: "include" })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת המלאי נכשלה");
    }
  }

  function resetForm() {
    setEditingId(null);
    setModelKey("");
    setColorId("");
    setHeightId("");
    setNotes("");
    setHistory(null);
  }

  function beginEdit(use: MaterialUseView) {
    const option = options.find((item) => item.heightId === use.heightId);
    setEditingId(use.id);
    setModelKey(option?.modelKey ?? "");
    setColorId(option?.colorId ?? "");
    setHeightId(use.heightId);
    setNotes(use.notes);
    setHistory(null);
  }

  async function save() {
    if (!heightId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload = editingId
        ? { id: editingId, heightId, notes }
        : { orderId, stage, heightId, notes };
      await readJson(await fetch("/api/workflow/materials", {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }));
      resetForm();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy || !window.confirm("להסיר את תיעוד החומר?")) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(await fetch("/api/workflow/materials", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }));
      if (editingId === id) resetForm();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההסרה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function showHistory(id: string) {
    setHistory(await readJson<MaterialRevisionView[]>(await fetch(`/api/workflow/materials?useId=${id}`, { credentials: "include" })));
  }

  if (!canRecord && uses.length === 0) return null;

  return (
    <div className="mt-2 border-t border-slate-200 pt-2 text-right">
      {uses.map((use) => (
        <p key={use.id} className="text-[10px] leading-4 text-slate-700">
          {use.modelName} · {use.colorName} · {use.heightLabel}
        </p>
      ))}
      <button type="button" className="mt-1 text-[10px] font-medium text-slate-800 underline" onClick={() => void openDialog()}>
        בחירת חומר ששימש בייצור
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`חומר לייצור · ${MATERIAL_STAGE_LABELS[stage]}`} className="max-w-md">
        <div className="space-y-3 text-sm">
          <p className="text-xs text-slate-500">תיעוד שימוש בלבד. הכמות במלאי לא משתנה.</p>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p>}
          <ul className="space-y-2">
            {uses.length === 0 && <li className="text-slate-400">עדיין לא תועד חומר בשלב זה</li>}
            {uses.map((use) => (
              <li key={use.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="font-medium">{use.modelName} · {use.colorName} · {use.heightLabel}</p>
                <p className="text-xs text-slate-500">{use.recordedByName} · {new Date(use.recordedAt).toLocaleString("he-IL")}</p>
                {use.barcode && <p className="text-xs text-slate-500">ברקוד {use.barcode}</p>}
                {use.notes && <p className="text-xs text-slate-600">{use.notes}</p>}
                <div className="mt-1 flex gap-3 text-xs">
                  <button type="button" className="underline" onClick={() => void showHistory(use.id)}>היסטוריה</button>
                  {use.canEdit && canRecord && <button type="button" className="underline" onClick={() => beginEdit(use)}>עריכה</button>}
                  {use.canEdit && <button type="button" className="text-red-600 underline" onClick={() => void remove(use.id)}>הסרה</button>}
                </div>
              </li>
            ))}
          </ul>
          {history && (
            <div className="rounded-lg bg-slate-50 p-2 text-xs">
              {history.map((revision) => (
                <p key={revision.id}>{revision.actionLabel}: {revision.modelName} · {revision.colorName} · {revision.heightLabel} · {revision.userName}</p>
              ))}
            </div>
          )}
          {canRecord && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium">{editingId ? "עריכת בחירה" : "הוספת חומר"}</p>
              <select aria-label="דגם זירקוניה" value={modelKey} onChange={(event) => { setModelKey(event.target.value); setColorId(""); setHeightId(""); }} className="h-9 w-full rounded-lg border px-2">
                <option value="">דגם</option>
                {models.map((model) => <option key={model.key} value={model.key}>{model.name}</option>)}
              </select>
              <select aria-label="צבע" value={colorId} onChange={(event) => { setColorId(event.target.value); setHeightId(""); }} className="h-9 w-full rounded-lg border px-2">
                <option value="">צבע</option>
                {colors.map((color) => <option key={color.id} value={color.id}>{color.name}</option>)}
              </select>
              <select aria-label="גובה" value={heightId} onChange={(event) => setHeightId(event.target.value)} className="h-9 w-full rounded-lg border px-2">
                <option value="">גובה</option>
                {heights.map((height) => <option key={height.heightId} value={height.heightId}>{height.heightLabel}</option>)}
              </select>
              {models.length === 0 && <p className="text-xs text-slate-500">אין שילובי דגם, צבע וגובה במלאי הזירקוניה. הרשימה נטענת מהמלאי הקיים.</p>}
              {selected && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  {selected.imageUrl && <img src={selected.imageUrl} alt="" className="h-28 w-28 rounded-2xl bg-white object-contain" />}
                  <span>{selected.barcode ? `ברקוד ${selected.barcode}` : "אין ברקוד"}</span>
                </div>
              )}
              <input aria-label="הערות" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="הערות" className="h-9 w-full rounded-lg border px-2" />
              <div className="flex gap-2">
                <Button disabled={busy || !heightId} onClick={() => void save()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  שמירה
                </Button>
                {editingId && <Button variant="outline" onClick={resetForm}>חומר נוסף</Button>}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
