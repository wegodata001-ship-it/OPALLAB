"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Minus, Plus, Search } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { InventoryModule, StockButtons, queueInventoryScan, useInventoryView } from "@/components/inventory/InventoryStockTools";
import { BarcodeScanBox, MediaFace, useInventoryMedia } from "@/components/inventory/InventoryMedia";
import { barcodeMarkup } from "@/lib/inventory/barcode-svg";
import { cn } from "@/lib/utils";

type Part = { id: string; name: string; code: string; quantity: number; unit: string; notes: string; minQuantity: number | null };
type PartFocus = { id: string; name: string; code: string; quantity: number; barcode: string };
type Movement = {
  id: string;
  partName: string;
  orderSerial: string;
  operationId: string;
  type: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  userName: string;
  reason: string;
  source: string;
  createdAt: string;
};
type Summary = { partCount: number; totalQuantity: number; negativeCount: number; movementCount: number };

const TYPE_LABEL: Record<string, string> = {
  STOCK_IN: "הכנסת מלאי",
  STOCK_OUT: "הפחתה ידנית",
  ORDER_CONSUMPTION: "הפחתה מהזמנה",
  ORDER_ADJUSTMENT: "התאמת הזמנה",
  ORDER_RETURN: "החזרה מהזמנה",
  MANUAL_CORRECTION: "תיקון ספירה",
  STOCK_COUNT: "ספירת מלאי",
};

const BARCODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function suggestBarcode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `OP${[...bytes].map((value) => BARCODE_ALPHABET[value % BARCODE_ALPHABET.length]).join("")}`;
}

function stockStatus(part: Pick<Part, "quantity" | "minQuantity">) {
  if (part.quantity < 0) return "שלילי";
  if (part.quantity === 0) return "אזל";
  if (part.minQuantity !== null && part.minQuantity > 0 && part.quantity < part.minQuantity) return "חוסר";
  return "תקין";
}

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

async function requestParts(input: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; query?: string }) {
  const form = typeof FormData !== "undefined" && input.body instanceof FormData;
  const res = await fetch(`/api/inventory/doctor-parts${input.query ?? ""}`, {
    method: input.method ?? "GET",
    credentials: "include",
    headers: input.body && !form ? { "Content-Type": "application/json" } : undefined,
    body: form ? input.body as FormData : input.body ? JSON.stringify(input.body) : undefined,
  });
  const json = (await res.json()) as { success: boolean; data?: { parts?: Part[]; summary?: Summary; canEdit?: boolean; movements?: Movement[]; notice?: string | null }; error?: { message?: string } };
  if (!json.success || !json.data) throw new Error(json.error?.message ?? "שגיאה בשמירה");
  return json.data;
}

export function DoctorPartsScreen() {
  const [, setStockMode] = useInventoryView("DOCTOR_PARTS");
  const media = useInventoryMedia();
  const [parts, setParts] = useState<Part[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "add" | "history" | { type: "edit"; part: Part } | { type: "delete"; part: Part }>(null);
  const [draft, setDraft] = useState({ name: "", code: "", quantity: "0", unit: "", notes: "", minQuantity: "", barcode: "" });
  const [savedBarcode, setSavedBarcode] = useState("");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [focus, setFocus] = useState<PartFocus | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);

  const load = useCallback(async () => {
    const data = await requestParts({ query: `?from=${from}&to=${to}T23:59:59` });
    setParts(data.parts ?? []);
    setSummary(data.summary ?? null);
    setCanEdit(Boolean(data.canEdit));
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestParts({ query: `?from=${from}&to=${to}T23:59:59` });
        if (cancelled) return;
        setParts(data.parts ?? []);
        setSummary(data.summary ?? null);
        setCanEdit(Boolean(data.canEdit));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("he");
    if (!term) return parts;
    return parts.filter((part) => `${part.name} ${part.code} ${part.notes} ${media.byId.get(part.id)?.barcode ?? ""}`.toLocaleLowerCase("he").includes(term));
  }, [parts, query, media.byId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירה");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function resetMedia() {
    setSavedBarcode("");
    setDraftFile(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  function openAdd() {
    resetMedia();
    setDraft({ name: "", code: "", quantity: "0", unit: "", notes: "", minQuantity: "", barcode: "" });
    setDialog("add");
  }

  function openEdit(part: Part) {
    resetMedia();
    const code = media.byId.get(part.id)?.barcode ?? "";
    setSavedBarcode(code);
    setDraft({ name: part.name, code: part.code, quantity: String(part.quantity), unit: part.unit, notes: part.notes, minQuantity: part.minQuantity === null ? "" : String(part.minQuantity), barcode: code });
    setDialog({ type: "edit", part });
  }

  function chooseImage(file: File | null) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("אפשר להעלות JPG, PNG או WEBP");
      return;
    }
    if (file.size > 6_000_000) {
      setError("גודל התמונה גדול מדי");
      return;
    }
    setDraftFile(file);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  async function suggestFreeBarcode() {
    if (savedBarcode.trim()) return;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = suggestBarcode();
      const res = await fetch(`/api/inventory/media?code=${encodeURIComponent(code)}`, { credentials: "include" });
      const json = (await res.json()) as { success?: boolean; data?: { match: unknown } };
      if (json.success && !json.data?.match) {
        setDraft((current) => ({ ...current, barcode: code }));
        return;
      }
    }
    setError("לא הצלחנו ליצור ברקוד פנוי");
  }

  function printBarcode(code: string, title: string) {
    const graphic = barcodeMarkup(code);
    if (!graphic.svg) {
      setError("אי אפשר להדפיס את הברקוד הזה כ־Code 128");
      return;
    }
    const popup = window.open("", "_blank", "noopener,width=420,height=320");
    if (!popup) return;
    popup.document.write(`<!doctype html><html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding:16px">${graphic.svg}<p>${title}</p><p>${code}</p><script>print()<\/script></body></html>`);
    popup.document.close();
  }

  function openFocus(part: Part, barcode = media.byId.get(part.id)?.barcode ?? "") {
    setFocus({ id: part.id, name: part.name, code: part.code, quantity: part.quantity, barcode });
  }

  async function savePart() {
    const editing = typeof dialog === "object" && dialog?.type === "edit" ? dialog.part : null;
    const ok = await run(async () => {
      if (!editing) {
        const form = new FormData();
        form.set("name", draft.name);
        form.set("code", draft.code);
        form.set("quantity", draft.quantity.trim() === "" ? "0" : draft.quantity);
        form.set("unit", draft.unit);
        form.set("notes", draft.notes);
        form.set("minQuantity", draft.minQuantity);
        form.set("barcode", draft.barcode);
        if (draftFile) form.set("file", draftFile);
        await requestParts({ method: "POST", body: form });
        return;
      }
      await requestParts({
        method: "PATCH",
        body: {
          id: editing.id,
          name: draft.name,
          code: draft.code,
          unit: draft.unit,
          notes: draft.notes,
          minQuantity: draft.minQuantity.trim() === "" ? null : Number(draft.minQuantity),
        },
      });
      if (draft.barcode.trim() !== savedBarcode.trim()) {
        const response = await fetch("/api/inventory/media", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: draft.barcode.trim() ? "barcode" : "clear-barcode",
            module: "DOCTOR_PARTS",
            entityKind: "part",
            entityId: editing.id,
            code: draft.barcode.trim(),
          }),
        });
        const json = (await response.json()) as { success?: boolean; error?: { message?: string } };
        if (!json.success) throw new Error(json.error?.message ?? "שמירת הברקוד נכשלה");
      }
      if (draftFile) {
        const previousId = media.byId.get(editing.id)?.images.find((image) => image.isPrimary)?.id;
        const form = new FormData();
        form.set("module", "DOCTOR_PARTS");
        form.set("entityKind", "part");
        form.set("entityId", editing.id);
        form.set("file", draftFile);
        form.set("makePrimary", "1");
        const response = await fetch("/api/inventory/media", { method: "POST", credentials: "include", body: form });
        const json = (await response.json()) as { success?: boolean; error?: { message?: string } };
        if (!json.success) throw new Error(json.error?.message ?? "העלאת התמונה נכשלה");
        if (previousId) await fetch(`/api/inventory/media?imageId=${previousId}`, { method: "DELETE", credentials: "include" });
      }
    });
    if (ok) {
      await media.reload();
      setDialog(null);
    }
  }

  async function openHistory(partId?: string) {
    setDialog("history");
    setMovements([]);
    try {
      const data = await requestParts({ query: `?history=1&from=${from}&to=${to}T23:59:59${partId ? `&partId=${encodeURIComponent(partId)}` : ""}` });
      setMovements(data.movements ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת ההיסטוריה");
    }
  }

  return (
    <InventoryModule type="DOCTOR_PARTS" title="חלקים רופאים">
    <>
      <Header
        title="חלקים רופאים"
        description="מלאי חופשי המחובר להזמנות"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StockButtons type="DOCTOR_PARTS" onLeafScan={(hit) => {
              if (hit.entityKind !== "part") {
                setError("הברקוד לא מזהה חלק");
                return;
              }
              const part = parts.find((item) => item.id === hit.entityId);
              if (!part) {
                setError("החלק לא נמצא");
                return;
              }
              setError(null);
              openFocus(part, hit.code);
            }} />
            <Link href="/inventory" className="text-sm font-medium text-slate-600 hover:underline">חזרה למלאי</Link>
          </div>
        }
      />
      {loading ? (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />טוען</div>
      ) : (
        <div className="space-y-4">
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p>}
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              ["סוגי חלקים", summary?.partCount ?? 0],
              ["סך יתרות", summary?.totalQuantity ?? 0],
              ["מלאי שלילי", summary?.negativeCount ?? 0],
              ["תנועות בתקופה", summary?.movementCount ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-slate-900 px-3 py-3 text-white">
                <p className="text-xs text-slate-300">{label}</p>
                <p className={cn("text-xl font-bold", label === "מלאי שלילי" && Number(value) > 0 && "text-red-300")}>{value}</p>
              </div>
            ))}
          </section>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש חלק" className="pr-9" aria-label="חיפוש חלק" />
            </div>
            <Input type="date" aria-label="מתאריך" value={from} onChange={(event) => setFrom(event.target.value)} className="lg:w-40" />
            <Input type="date" aria-label="עד תאריך" value={to} onChange={(event) => setTo(event.target.value)} className="lg:w-40" />
            {canEdit && (
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4" />הוסף חלק
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" disabled={parts.length === 0} onClick={() => setStockMode("count")}>
                ספירת מלאי
              </Button>
            )}
            <Button variant="outline" onClick={() => void openHistory()}>היסטוריית תנועות</Button>
          </div>
          {visible.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">{parts.length === 0 ? "אין חלקים עדיין" : "לא נמצאו חלקים"}</p>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">חלק</th>
                      <th className="px-3 py-2 text-right font-medium">ברקוד</th>
                      <th className="px-3 py-2 text-right font-medium">כמות</th>
                      <th className="px-3 py-2 text-right font-medium">יחידה</th>
                      <th className="px-3 py-2 text-right font-medium">סטטוס</th>
                      <th className="px-3 py-2 text-right font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((part) => (
                      <PartRow key={part.id} part={part} barcode={media.byId.get(part.id)?.barcode ?? ""} canEdit={canEdit} busy={busy} onDelta={(delta) => void run(() => requestParts({ method: "PATCH", body: { id: part.id, delta } }).then(() => undefined))} onQuantity={(quantity) => void run(() => requestParts({ method: "PATCH", body: { id: part.id, quantity } }).then(() => undefined))} onHistory={() => void openHistory(part.id)} onEdit={() => openEdit(part)} onCount={() => { queueInventoryScan("DOCTOR_PARTS", { entityId: part.id, code: media.byId.get(part.id)?.barcode ?? "" }); setStockMode("count"); }} onDelete={() => setDialog({ type: "delete", part })} />
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-3 md:hidden">
                {visible.map((part) => (
                  <li key={part.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <PartBody part={part} barcode={media.byId.get(part.id)?.barcode ?? ""} canEdit={canEdit} busy={busy} onDelta={(delta) => void run(() => requestParts({ method: "PATCH", body: { id: part.id, delta } }).then(() => undefined))} onQuantity={(quantity) => void run(() => requestParts({ method: "PATCH", body: { id: part.id, quantity } }).then(() => undefined))} onHistory={() => void openHistory(part.id)} onEdit={() => openEdit(part)} onCount={() => { queueInventoryScan("DOCTOR_PARTS", { entityId: part.id, code: media.byId.get(part.id)?.barcode ?? "" }); setStockMode("count"); }} onDelete={() => setDialog({ type: "delete", part })} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <Modal open={dialog === "add" || (typeof dialog === "object" && dialog?.type === "edit")} onClose={() => setDialog(null)} title={dialog === "add" ? "הוספת חלק" : "עריכת חלק"} className="max-w-xl">
        <div className="space-y-3">
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
            <p className="mb-2 text-sm font-medium text-slate-700">תמונת חלק</p>
            <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-2xl bg-white">
              {previewUrl || (typeof dialog === "object" && dialog?.type === "edit" ? media.byId.get(dialog.part.id)?.images.find((image) => image.isPrimary)?.url : "") ? (
                <img src={previewUrl || (typeof dialog === "object" && dialog?.type === "edit" ? media.byId.get(dialog.part.id)?.images.find((image) => image.isPrimary)?.url : "") || ""} alt="" className="max-h-48 w-full object-contain" />
              ) : <span className="text-sm text-slate-400">הוסף תמונה</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">העלאה
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => chooseImage(event.target.files?.[0] ?? null)} />
              </label>
              <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">צילום
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => chooseImage(event.target.files?.[0] ?? null)} />
              </label>
              {previewUrl && <Button type="button" variant="outline" onClick={() => { setDraftFile(null); setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; }); }}>הסרת תמונה</Button>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">שם חלק
              <Input className="mt-1" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} aria-label="שם חלק" />
            </label>
            <label className="block text-sm font-medium text-slate-700">קוד חלק
              <Input className="mt-1" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} aria-label="קוד חלק" />
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">ברקוד חלק
            <Input className="mt-1" value={draft.barcode} onChange={(event) => setDraft({ ...draft, barcode: event.target.value })} aria-label="ברקוד חלק" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy || Boolean(savedBarcode.trim())} onClick={() => void suggestFreeBarcode()}>צור ברקוד</Button>
            <Button type="button" variant="outline" disabled={!draft.barcode.trim()} onClick={() => printBarcode(draft.barcode, draft.name || "חלק")}>הדפסת מדבקה</Button>
          </div>
          {savedBarcode.trim() && <p className="text-xs text-slate-500">ברקוד שמור לא מוחלף אוטומטית. אפשר לשנות אותו ידנית.</p>}
          <BarcodeScanBox videoId="doctor-part-barcode" onCapture={(code) => setDraft((current) => ({ ...current, barcode: code }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">{dialog === "add" ? "כמות התחלתית" : "כמות נוכחית"}
              <Input className="mt-1" inputMode="numeric" value={draft.quantity} disabled={dialog !== "add"} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} aria-label="כמות" />
            </label>
            <label className="block text-sm font-medium text-slate-700">יחידת מידה
              <Input className="mt-1" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} aria-label="יחידת מידה" />
            </label>
          </div>
          {dialog !== "add" && <p className="text-xs text-slate-500">שינוי כמות נעשה מהטבלה ונרשם כתנועת מלאי.</p>}
          <label className="block text-sm font-medium text-slate-700">כמות מינימום להתראת חוסר
            <Input className="mt-1" inputMode="numeric" value={draft.minQuantity} onChange={(event) => setDraft({ ...draft, minQuantity: event.target.value })} aria-label="כמות מינימום" />
          </label>
          <label className="block text-sm font-medium text-slate-700">הערות
            <textarea className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} aria-label="הערות" />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
          <Button disabled={busy || !draft.name.trim()} onClick={() => void savePart()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}שמירה</Button>
        </div>
      </Modal>

      <Modal open={Boolean(focus)} onClose={() => setFocus(null)} title="חלק שנסרק" className="max-w-lg">
        {focus && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MediaFace kind="part" id={focus.id} name={focus.name} canEdit={false} size="thumb" />
              <div>
                <p className="font-bold text-slate-900">{focus.name}</p>
                <p className="text-sm text-slate-600">קוד חלק {focus.code || "אין"}</p>
                <p className="text-sm text-slate-600">ברקוד {focus.barcode || "אין"}</p>
                <p className="text-sm text-slate-600">כמות {focus.quantity}</p>
              </div>
            </div>
            <p className="text-sm text-slate-500">הסריקה לא שינתה את כמות המלאי.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setFocus(null)}>סגירה</Button>
              <Button variant="outline" onClick={() => { queueInventoryScan("DOCTOR_PARTS", { entityId: focus.id, code: focus.barcode }); setFocus(null); setStockMode("count"); }}>ספירת מלאי</Button>
              {canEdit && <Button disabled={busy} onClick={() => void run(() => requestParts({ method: "PATCH", body: { id: focus.id, delta: 1 } }).then(() => setFocus((current) => current ? { ...current, quantity: current.quantity + 1 } : current)))}>הוספת כמות</Button>}
              {canEdit && <Button variant="outline" disabled={busy} onClick={() => void run(() => requestParts({ method: "PATCH", body: { id: focus.id, delta: -1 } }).then(() => setFocus((current) => current ? { ...current, quantity: current.quantity - 1 } : current)))}>הפחתת כמות</Button>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={dialog === "history"} onClose={() => setDialog(null)} title="היסטוריית תנועות" className="max-w-lg">
        {movements.length === 0 ? <p className="text-sm text-slate-500">אין תנועות</p> : (
          <ul className="space-y-2">
            {movements.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium">{row.partName} · {TYPE_LABEL[row.type] ?? row.type}</p>
                <p>{row.quantityBefore} → {row.quantityAfter} ({row.quantityChange > 0 ? `+${row.quantityChange}` : row.quantityChange})</p>
                <p className="text-xs text-slate-500">{row.userName} · {row.source === "ORDER" ? "הזמנה" : row.source === "COUNT" ? "ספירה" : "שינוי ידני"}{row.orderSerial ? ` · ${row.orderSerial}` : ""} · {new Date(row.createdAt).toLocaleString("he-IL")}</p>
                <p className="text-[11px] text-slate-400">{row.operationId}</p>
                {row.reason && <p className="text-slate-600">{row.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal open={typeof dialog === "object" && dialog?.type === "delete"} onClose={() => setDialog(null)} title="מחיקת חלק" className="max-w-sm">
        <p className="text-sm text-slate-600">האם למחוק את החלק?</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
          <Button variant="danger" disabled={busy} onClick={() => {
            if (typeof dialog !== "object" || dialog?.type !== "delete") return;
            void run(async () => {
              const data = await requestParts({ method: "DELETE", query: `?id=${encodeURIComponent(dialog.part.id)}` });
              if (data.notice) setNotice(data.notice);
              setDialog(null);
            });
          }}>מחק</Button>
        </div>
      </Modal>
    </>
    </InventoryModule>
  );
}

function PartRow(props: PartActions & { part: Part; barcode: string }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <MediaFace kind="part" id={props.part.id} name={props.part.name} canEdit={props.canEdit} size="thumb" />
          <div className="min-w-0">
            <p className="font-medium">{props.part.name}</p>
            <p className="text-xs text-slate-500">קוד {props.part.code || "אין"}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-slate-600">{props.barcode || "אין"}</td>
      <td className="px-3 py-2"><Qty value={props.part.quantity} /></td>
      <td className="px-3 py-2 text-slate-600">{props.part.unit || "—"}</td>
      <td className="px-3 py-2"><Status part={props.part} /></td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {props.canEdit && <QtyControl part={props.part} disabled={props.busy} onDelta={props.onDelta} onQuantity={props.onQuantity} />}
          <Button size="sm" variant="ghost" onClick={props.onHistory}>היסטוריה</Button>
          {props.canEdit && <RowButtons {...props} />}
        </div>
      </td>
    </tr>
  );
}

function PartBody(props: PartActions & { part: Part; barcode: string }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <MediaFace kind="part" id={props.part.id} name={props.part.name} canEdit={props.canEdit} size="thumb" />
          <div>
            <p className="font-bold">{props.part.name}</p>
            <p className="text-xs text-slate-500">קוד {props.part.code || "אין"}</p>
            <p className="text-xs text-slate-500">ברקוד {props.barcode || "אין"}</p>
            <p className="text-xs text-slate-500">{props.part.unit || "ללא יחידה"}</p>
          </div>
        </div>
        <div className="text-left">
          <Qty value={props.part.quantity} />
          <Status part={props.part} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {props.canEdit && <QtyControl part={props.part} disabled={props.busy} onDelta={props.onDelta} onQuantity={props.onQuantity} />}
        <Button size="sm" variant="ghost" onClick={props.onHistory}>היסטוריה</Button>
        {props.canEdit && <RowButtons {...props} />}
      </div>
    </>
  );
}

function Status({ part }: { part: Pick<Part, "quantity" | "minQuantity"> }) {
  const label = stockStatus(part);
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", label === "תקין" ? "bg-emerald-50 text-emerald-700" : label === "חוסר" ? "bg-orange-50 text-orange-700" : "bg-red-50 text-red-700")}>{label}</span>;
}

type PartActions = {
  canEdit: boolean;
  busy: boolean;
  onDelta: (delta: number) => void;
  onQuantity: (quantity: number) => void;
  onHistory: () => void;
  onEdit: () => void;
  onCount: () => void;
  onDelete: () => void;
};

function RowButtons(props: PartActions) {
  return (
    <>
      <Button size="sm" variant="outline" onClick={props.onCount}>ספירה</Button>
      <Button size="sm" variant="ghost" onClick={props.onEdit}>עריכה</Button>
      <Button size="sm" variant="ghost" onClick={props.onDelete}>מחיקה</Button>
    </>
  );
}

function Qty({ value }: { value: number }) {
  return <span className={cn("font-bold", value < 0 && "text-red-600")}>{value}</span>;
}

function QtyControl({ part, disabled, onDelta, onQuantity }: { part: Part; disabled: boolean; onDelta: (delta: number) => void; onQuantity: (quantity: number) => void }) {
  const [draft, setDraft] = useState(String(part.quantity));
  useEffect(() => setDraft(String(part.quantity)), [part.quantity]);
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="הוספה" disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-lg border" onClick={() => onDelta(1)}><Plus className="h-4 w-4" /></button>
      <input value={draft} disabled={disabled} aria-label={`כמות ${part.name}`} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (Number(draft) !== part.quantity && draft.trim() !== "" && Number.isInteger(Number(draft))) onQuantity(Number(draft)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="h-8 w-16 rounded-lg border text-center text-sm font-bold" />
      <button type="button" aria-label="הפחתה" disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-lg border" onClick={() => onDelta(-1)}><Minus className="h-4 w-4" /></button>
    </div>
  );
}
