"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { downloadInventoryReport } from "@/components/inventory/InventoryReportsScreen";
import { BarcodeScanBox, InventoryMediaProvider, MediaFace, useInventoryMedia } from "@/components/inventory/InventoryMedia";
import { MEDIA_LEAF } from "@/lib/inventory/inventory-media-shared";

export type InventoryModuleType =
  | "ZIRCONIA"
  | "TITANIUM"
  | "BMMA"
  | "DRILLS"
  | "IMPLANTS"
  | "CLINIC_MATERIALS"
  | "OTHER_MATERIALS"
  | "DOCTOR_PARTS";

type StockView = "cards" | "table" | "count" | "history";

type Item = {
  id: string;
  name: string;
  modelName: string;
  kindName: string;
  colorName: string;
  sizeName: string;
  barcode: string;
  quantity: number | null;
};

type CountRow = {
  id: string;
  serial: number;
  status: "DRAFT" | "APPROVED" | "CANCELLED";
  notes: string;
  counterName: string;
  location: string;
  countedItems: number;
  changedItems: number;
  unchangedItems: number;
  differenceTotal: number;
  lineCount: number;
  createdByName: string;
  approvedByName: string;
  createdAt: string;
  approvedAt: string | null;
  cancelledAt: string | null;
};

type CountLine = {
  itemId: string;
  name: string;
  modelName: string;
  kindName: string;
  colorName: string;
  sizeName: string;
  barcode: string;
  quantityAtStart: number | null;
  countedQuantity: number | null;
  quantityBeforeApproval: number | null;
  difference: number | null;
  quantityAfter: number | null;
  notes: string;
  liveQuantity: number | null;
};

type CountDetail = CountRow & { inventoryType: InventoryModuleType; lines: CountLine[] };
type Movement = { id: string; action: string; quantityBefore: number; quantityChange: number; quantityAfter: number; reason: string; userName: string; orderSerial: string; countSerial: number | null; createdAt: string };

const ACTION: Record<string, string> = {
  IN: "הוספת מלאי",
  OUT: "הפחתת מלאי",
  SET: "שינוי ידני",
  COUNT: "ספירת מלאי",
  STOCK_IN: "הוספת מלאי",
  STOCK_OUT: "הפחתת מלאי",
  STOCK_COUNT: "ספירת מלאי",
  ORDER_CONSUMPTION: "הפחתה מהזמנה",
  ORDER_ADJUSTMENT: "התאמת הזמנה",
  ORDER_RETURN: "החזרה מהזמנה",
  MANUAL_CORRECTION: "שינוי ידני",
};

const STATUS: Record<CountRow["status"], string> = { DRAFT: "טיוטה", APPROVED: "מאושרת", CANCELLED: "מבוטלת" };

const views = new Map<string, StockView>();
const listeners = new Set<() => void>();

function emitViews() {
  listeners.forEach((listener) => listener());
}

export function useInventoryView(type: InventoryModuleType): [StockView, (mode: StockView) => void] {
  const mode = useSyncExternalStore<StockView>(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => views.get(type) ?? "cards",
    () => "cards",
  );
  const setMode = useCallback((next: StockView) => {
    views.set(type, next);
    emitViews();
  }, [type]);
  return [mode, setMode];
}

async function requestCounts(type: InventoryModuleType, input?: { method?: "GET" | "POST"; query?: string; body?: unknown }) {
  const res = await fetch(`/api/inventory/counts${input?.query ?? `?type=${type}`}`, {
    method: input?.method ?? "GET",
    credentials: "include",
    headers: input?.body ? { "Content-Type": "application/json" } : undefined,
    body: input?.body ? JSON.stringify(input.body) : undefined,
  });
  const json = (await res.json()) as { success: boolean; data?: { canEdit?: boolean; items?: Item[]; counts?: CountRow[]; count?: CountDetail; movements?: Movement[] }; error?: { message?: string } };
  if (!json.success || !json.data) throw new Error(json.error?.message ?? "השמירה נכשלה");
  return json.data;
}

function openExport(type: InventoryModuleType, kind: "table" | "sheet" | "report", format: "html" | "pdf" | "xlsx", extra?: { blind?: boolean; countId?: string }) {
  const params = new URLSearchParams({ type, kind, format });
  if (extra?.blind) params.set("blind", "1");
  if (extra?.countId) params.set("countId", extra.countId);
  window.open(`/api/inventory/counts/export?${params.toString()}`, "_blank", "noopener,noreferrer");
}

const pendingScans = new Map<InventoryModuleType, { entityId: string; code: string }>();

function rememberScan(type: InventoryModuleType, hit: { entityId: string; code: string }) {
  pendingScans.set(type, hit);
}

function takeScan(type: InventoryModuleType) {
  const hit = pendingScans.get(type) ?? null;
  if (hit) pendingScans.delete(type);
  return hit;
}

export function StockButtons({ type }: { type: InventoryModuleType }) {
  const [mode, setMode] = useInventoryView(type);
  const [scanError, setScanError] = useState<string | null>(null);
  return (
    <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto">
      {mode === "cards" && (
        <div className="w-full sm:w-80">
          <BarcodeScanBox onFound={(hit) => {
            if (hit.module !== type) {
              setScanError("הברקוד שייך לקטגוריית מלאי אחרת");
              return;
            }
            setScanError(null);
            rememberScan(type, hit);
            setMode("table");
          }} />
          {scanError && <p className="mt-1 text-xs text-red-700">{scanError}</p>}
        </div>
      )}
      <ModeButton active={mode === "cards"} onClick={() => setMode("cards")}>כרטיסים</ModeButton>
      <ModeButton active={mode === "table"} onClick={() => setMode("table")}>תצוגת טבלה</ModeButton>
      <ModeButton active={mode === "count"} onClick={() => setMode("count")}>ספירת מלאי</ModeButton>
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700">הדפסה</summary>
        <div className="absolute left-0 z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-lg">
          <MenuButton onClick={() => openExport(type, "table", "html")}>הדפס טבלת מלאי</MenuButton>
          <MenuButton onClick={() => openExport(type, "sheet", "html")}>הדפס דף ספירה</MenuButton>
          <MenuButton onClick={() => openExport(type, "sheet", "html", { blind: true })}>דף ספירה עיוור</MenuButton>
          <MenuButton onClick={() => openExport(type, "table", "pdf")}>ייצוא PDF</MenuButton>
          <MenuButton onClick={() => openExport(type, "sheet", "pdf")}>PDF דף ספירה</MenuButton>
          <MenuButton onClick={() => openExport(type, "table", "xlsx")}>ייצוא Excel</MenuButton>
          <MenuButton onClick={() => openExport(type, "sheet", "xlsx")}>Excel דף ספירה</MenuButton>
          <MenuButton onClick={() => void downloadInventoryReport({ kind: type === "DRILLS" ? "drills" : "current-stock", scope: "filtered", categories: type, images: "1", barcodes: "1" }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "הפקת הדוח נכשלה"))}>PDF מלאי הקטגוריה</MenuButton>
        </div>
      </details>
      <ModeButton active={mode === "history"} onClick={() => setMode("history")}>היסטוריה</ModeButton>
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${active ? "border-opal-gold bg-opal-gold text-white" : "border-slate-200 bg-white text-slate-700"}`}>{children}</button>;
}

function MenuButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="block w-full rounded-lg px-2 py-1.5 text-right hover:bg-slate-50">{children}</button>;
}

export function InventoryModule({ type, title, children }: { type: InventoryModuleType; title: string; children: ReactNode }) {
  const [mode, setMode] = useInventoryView(type);
  return (
    <InventoryMediaProvider module={type}>
      {mode === "cards" ? children : <InventoryStockPanel type={type} title={title} mode={mode} onMode={setMode} />}
    </InventoryMediaProvider>
  );
}

function qtyLabel(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : String(value);
}

export function InventoryStockPanel({ type, title, mode, onMode }: { type: InventoryModuleType; title: string; mode: Exclude<StockView, "cards">; onMode: (mode: StockView) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [count, setCount] = useState<CountDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState({ counterName: "", location: "", notes: "" });
  const [query, setQuery] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [movements, setMovements] = useState<{ title: string; rows: Movement[] } | null>(null);
  const [focusId, setFocusId] = useState("");
  const [scanAdds, setScanAdds] = useState(false);
  const media = useInventoryMedia();

  const load = useCallback(async () => {
    const data = await requestCounts(type);
    setItems(data.items ?? []);
    setCounts(data.counts ?? []);
    setCanEdit(Boolean(data.canEdit));
  }, [type]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestCounts(type);
        if (cancelled) return;
        setItems(data.items ?? []);
        setCounts(data.counts ?? []);
        setCanEdit(Boolean(data.canEdit));
        const draft = (data.counts ?? []).find((row) => row.status === "DRAFT");
        if (mode === "count" && draft) {
          const opened = await requestCounts(type, { query: `?type=${type}&countId=${draft.id}` });
          if (!cancelled && opened.count) openCount(opened.count);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [type, mode]);

  function openCount(next: CountDetail) {
    setCount(next);
    setMeta({ counterName: next.counterName, location: next.location, notes: next.notes });
    setDrafts(Object.fromEntries(next.lines.map((line) => [line.itemId, line.countedQuantity === null ? "" : String(line.countedQuantity)])));
  }

  const term = query.trim().toLocaleLowerCase("he");
  const modelNames = useMemo(() => [...new Set(items.map((item) => item.modelName).filter(Boolean))], [items]);
  const codeOf = useCallback((id: string, fallback = "") => media.byId.get(id)?.barcode || fallback, [media.byId]);
  const matches = (value: string) => (!term || value.toLocaleLowerCase("he").includes(term)) && (!modelFilter || value.includes(modelFilter));
  const visibleItems = useMemo(() => items.filter((item) => matches(`${item.name} ${item.modelName} ${item.kindName} ${item.colorName} ${item.sizeName} ${item.barcode} ${codeOf(item.id)}`) && (!modelFilter || item.modelName === modelFilter)), [items, term, modelFilter, codeOf]);
  const visibleLines = useMemo(() => (count?.lines ?? []).filter((line) => matches(`${line.name} ${line.modelName} ${line.kindName} ${line.colorName} ${line.sizeName} ${line.barcode} ${codeOf(line.itemId)}`) && (!modelFilter || line.modelName === modelFilter)), [count, term, modelFilter, codeOf]);

  useEffect(() => {
    const hit = takeScan(type);
    if (!hit) return;
    setQuery(hit.code);
    setModelFilter("");
    setFocusId(hit.entityId);
  }, [type]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`count-row-${focusId}`)?.scrollIntoView({ block: "center" });
    document.getElementById(`stock-row-${focusId}`)?.scrollIntoView({ block: "center" });
    document.getElementById(`count-qty-${focusId}`)?.focus();
  }, [focusId, visibleLines, visibleItems]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  function linePayload() {
    return (count?.lines ?? []).map((line) => ({
      itemId: line.itemId,
      countedQuantity: drafts[line.itemId]?.trim() === "" || drafts[line.itemId] === undefined ? null : Number(drafts[line.itemId]),
      notes: line.notes,
    }));
  }

  const summary = useMemo(() => {
    const filled = (count?.lines ?? []).filter((line) => drafts[line.itemId]?.trim() !== "" && drafts[line.itemId] !== undefined);
    let changed = 0;
    let unchanged = 0;
    let total = 0;
    for (const line of filled) {
      const next = Number(drafts[line.itemId]);
      const difference = next - (line.quantityAtStart ?? 0);
      if (next === line.quantityAtStart) unchanged += 1;
      else changed += 1;
      total += difference;
    }
    return { counted: filled.length, changed, unchanged, total };
  }, [count, drafts]);

  const stale = (count?.lines ?? []).some((line) => line.liveQuantity !== line.quantityAtStart);

  function onScan(hit: { module: string; entityId: string; code: string }) {
    if (hit.module !== type) {
      setError("הברקוד שייך לקטגוריית מלאי אחרת");
      return;
    }
    setError(null);
    setQuery(hit.code);
    setModelFilter("");
    setFocusId(hit.entityId);
    const line = count?.lines.find((row) => row.itemId === hit.entityId);
    if (count?.status === "DRAFT" && !line) setError("המוצר לא נכלל בספירה הפתוחה");
    if (scanAdds && line) {
      setDrafts((current) => {
        const raw = current[hit.entityId] ?? "";
        const next = raw.trim() === "" ? 1 : Number(raw) + 1;
        return Number.isInteger(next) ? { ...current, [hit.entityId]: String(next) } : current;
      });
    }
  }

  return (
    <>
      <Header title={title} description="טבלה, ספירה והדפסה" actions={<StockButtons type={type} />} />
      {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!canEdit && !loading && <p className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">צפייה בלבד. ספירה ועדכון כמות זמינים למנהל.</p>}
      <div className="mb-3 space-y-2">
        <BarcodeScanBox onFound={onScan} />
        {count?.status === "DRAFT" && <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={scanAdds} onChange={(event) => setScanAdds(event.target.checked)} />לאחר סריקה, הוסף 1 לכמות שנספרה</label>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש לפי שם, דגם או ברקוד" aria-label="חיפוש לפי שם, דגם או ברקוד" />
        {modelNames.length > 0 && (
          <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} aria-label="סינון לפי דגם" className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm">
            <option value="">כל הדגמים</option>
            {modelNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
        {mode === "table" && canEdit && <Button disabled={busy} onClick={() => onMode("count")}>ספירת מלאי חדשה</Button>}
      </div>
      </div>
      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-opal-gold" /></div> : mode === "history" ? (
        <div className="space-y-2">
          {counts.length === 0 && <p className="text-sm text-slate-500">אין ספירות</p>}
          {counts.map((row) => (
            <button key={row.id} type="button" className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm" onClick={() => void run(async () => { const data = await requestCounts(type, { query: `?type=${type}&countId=${row.id}` }); if (data.count) openCount(data.count); })}>
              <span className="font-bold">ספירה #{row.serial}</span>
              <span className="mr-2 text-slate-500">{STATUS[row.status]} · {row.createdByName} · {new Date(row.createdAt).toLocaleString("he-IL")}</span>
              <span className="mt-1 block text-xs text-slate-500">{row.lineCount} פריטים · הפרש {row.differenceTotal}{row.approvedAt ? ` · אושר ${new Date(row.approvedAt).toLocaleString("he-IL")} על ידי ${row.approvedByName}` : ""}</span>
            </button>
          ))}
          {count && (
            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold">ספירה #{count.serial} · {STATUS[count.status]}</h2>
                <Button variant="outline" onClick={() => openExport(type, "report", "pdf", { countId: count.id })}>הדפס דוח</Button>
                <Button variant="outline" disabled={busy} onClick={() => void downloadInventoryReport({ kind: "count-full", countId: count.id, scope: "all" })}>PDF ספירה</Button>
                <Button variant="outline" disabled={busy} onClick={() => void downloadInventoryReport({ kind: "differences", countId: count.id, scope: "all" })}>PDF הפרשים</Button>
              </div>
              <LineTable lines={count.lines} drafts={Object.fromEntries(count.lines.map((line) => [line.itemId, line.countedQuantity === null ? "" : String(line.countedQuantity)]))} readOnly showResult />
            </section>
          )}
        </div>
      ) : mode === "count" && count?.status === "DRAFT" ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Input value={meta.counterName} onChange={(event) => setMeta({ ...meta, counterName: event.target.value })} placeholder="שם הסופר" aria-label="שם הסופר" />
            <Input value={meta.location} onChange={(event) => setMeta({ ...meta, location: event.target.value })} placeholder="מיקום" aria-label="מיקום" />
            <Input value={meta.notes} onChange={(event) => setMeta({ ...meta, notes: event.target.value })} placeholder="הערה" aria-label="הערה" />
          </div>
          <p className="text-sm text-slate-600">שדה ריק לא משנה את המלאי. 0 שומר אפס. נספרו {summary.counted} · עם הפרש {summary.changed} · בלי שינוי {summary.unchanged} · סך הפרשים {summary.total}</p>
          {stale && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">המלאי השתנה מאז פתיחת הספירה. רעננו את כמויות הפתיחה לפני האישור.</p>}
          <LineTable lines={visibleLines} drafts={drafts} canEdit={canEdit} onDraft={(itemId, value) => setDrafts({ ...drafts, [itemId]: value })} />
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} variant="outline" onClick={() => void run(async () => { const data = await requestCounts(type, { method: "POST", body: { action: "save", countId: count.id, ...meta, lines: linePayload() } }); if (data.count) openCount(data.count); })}>שמור טיוטה</Button>
              <Button disabled={busy} onClick={() => setConfirmApprove(true)}>אשר ספירה</Button>
              <Button disabled={busy} variant="outline" onClick={() => void run(async () => { const data = await requestCounts(type, { method: "POST", body: { action: "refresh", countId: count.id } }); if (data.count) openCount(data.count); })}>רענון כמויות</Button>
              <Button disabled={busy} variant="danger" onClick={() => void run(async () => { await requestCounts(type, { method: "POST", body: { action: "cancel", countId: count.id } }); setCount(null); await load(); })}>בטל ספירה</Button>
              <Button disabled={busy} variant="outline" onClick={() => void downloadInventoryReport({ kind: "count-full", countId: count.id, scope: "all" })}>PDF ספירה</Button>
              <Button disabled={busy} variant="outline" onClick={() => void downloadInventoryReport({ kind: "count-status", countId: count.id, scope: "all" })}>PDF מצב</Button>
              <Button disabled={busy} variant="outline" onClick={() => void downloadInventoryReport({ kind: "differences", countId: count.id, scope: "all" })}>PDF הפרשים</Button>
              <Button disabled={busy} variant="outline" onClick={() => void downloadInventoryReport({ kind: "uncounted", countId: count.id, scope: "all" })}>PDF שלא נספרו</Button>
            </div>
          )}
        </div>
      ) : mode === "count" ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">ספירה קובעת את הכמות שנמצאה בפועל. היא לא מוסיפה ולא מפחיתה מהיתרה.</p>
          {canEdit && <Button disabled={busy || visibleItems.length === 0} onClick={() => void run(async () => {
            const itemIds = selected.length > 0 ? selected : undefined;
            const data = await requestCounts(type, { method: "POST", body: { action: "create", type, itemIds } });
            if (data.count) openCount(data.count);
          })}>{selected.length > 0 ? `ספירה ל-${selected.length} פריטים` : "ספירת מלאי חדשה"}</Button>}
          <ItemTable items={visibleItems} canEdit={canEdit} allowNegative={type === "DOCTOR_PARTS"} selected={selected} onToggle={(id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} onAdjust={(id, delta) => void run(async () => { await requestCounts(type, { method: "POST", body: { action: "adjust", type, itemId: id, delta } }); await load(); })} onHistory={(item) => void run(async () => { const data = await requestCounts(type, { query: `?type=${type}&history=1&itemId=${item.id}` }); setMovements({ title: item.name, rows: data.movements ?? [] }); })} />
        </div>
      ) : (
        <ItemTable items={visibleItems} canEdit={canEdit} allowNegative={type === "DOCTOR_PARTS"} selected={selected} onToggle={(id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} onAdjust={(id, delta) => void run(async () => { await requestCounts(type, { method: "POST", body: { action: "adjust", type, itemId: id, delta } }); await load(); })} onHistory={(item) => void run(async () => { const data = await requestCounts(type, { query: `?type=${type}&history=1&itemId=${item.id}` }); setMovements({ title: item.name, rows: data.movements ?? [] }); })} />
      )}

      <Modal open={confirmApprove} onClose={() => setConfirmApprove(false)} title="אישור ספירה" className="max-w-sm">
        <p className="text-sm text-slate-700">פריטים שנספרו: {summary.counted}. עם הפרשים: {summary.changed}. בלי שינוי: {summary.unchanged}. סך הפרשים: {summary.total}.</p>
        <p className="mt-2 text-sm text-slate-500">רק שורות עם כמות שנספרה יתעדכנו. שדה ריק יישאר ללא שינוי.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmApprove(false)}>ביטול</Button>
          <Button disabled={busy || !count} onClick={() => void run(async () => {
            if (!count) return;
            await requestCounts(type, { method: "POST", body: { action: "save", countId: count.id, ...meta, lines: linePayload() } });
            const data = await requestCounts(type, { method: "POST", body: { action: "approve", countId: count.id } });
            if (data.count) openCount(data.count);
            setConfirmApprove(false);
            await load();
          })}>אישור ועדכון יתרה</Button>
        </div>
      </Modal>
      <Modal open={Boolean(movements)} onClose={() => setMovements(null)} title={`היסטוריית תנועות${movements ? ` — ${movements.title}` : ""}`} className="max-w-lg">
        {movements && movements.rows.length === 0 ? <p className="text-sm text-slate-500">אין תנועות</p> : (
          <ul className="space-y-2">{movements?.rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <p className="font-medium">{ACTION[row.action] ?? row.action}</p>
              <p>{row.quantityBefore} → {row.quantityAfter} ({row.quantityChange > 0 ? `+${row.quantityChange}` : row.quantityChange})</p>
              <p className="text-xs text-slate-500">{row.userName} · {new Date(row.createdAt).toLocaleString("he-IL")}{row.countSerial ? ` · ספירה #${row.countSerial}` : ""}{row.orderSerial ? ` · ${row.orderSerial}` : ""}</p>
              {row.reason && <p>{row.reason}</p>}
            </li>
          ))}</ul>
        )}
      </Modal>
    </>
  );
}

function ItemTable({ items, canEdit, allowNegative, selected, onToggle, onAdjust, onHistory }: { items: Item[]; canEdit: boolean; allowNegative: boolean; selected: string[]; onToggle: (id: string) => void; onAdjust: (id: string, delta: number) => void; onHistory: (item: Item) => void }) {
  const media = useInventoryMedia();
  const leaf = MEDIA_LEAF[media.module];
  if (items.length === 0) return <p className="text-sm text-slate-500">אין פריטי מלאי</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>{["בחירה", "תמונה", "מוצר", "ברקוד", "כמות", "פעולות"].map((label) => <th key={label} className="px-2 py-2 text-right font-medium">{label}</th>)}</tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} id={`stock-row-${item.id}`} className="border-t border-slate-100">
              <td className="px-2 py-2"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} aria-label={`בחירת ${item.name}`} /></td>
              <td className="px-2 py-2"><MediaFace kind={leaf} id={item.id} name={item.name} canEdit={canEdit} /></td>
              <td className="px-2 py-2 font-medium">{item.name}<span className="mt-0.5 block text-xs font-normal text-slate-500">{[item.modelName, item.kindName, item.colorName, item.sizeName].filter(Boolean).join(" · ")}</span></td>
              <td className="px-2 py-2">{item.barcode || media.byId.get(item.id)?.barcode || "—"}</td>
              <td className="px-2 py-2 font-bold">{qtyLabel(item.quantity)}</td>
              <td className="px-2 py-2">
                <div className="flex gap-1">
                  {canEdit && <button type="button" aria-label="הוספה" className="flex h-7 w-7 items-center justify-center rounded-md border" onClick={() => onAdjust(item.id, 1)}><Plus className="h-3.5 w-3.5" /></button>}
                  {canEdit && <button type="button" aria-label="הפחתה" className="flex h-7 w-7 items-center justify-center rounded-md border" onClick={() => onAdjust(item.id, -1)} disabled={!allowNegative && (item.quantity ?? 0) <= 0}><Minus className="h-3.5 w-3.5" /></button>}
                  <button type="button" className="text-xs text-slate-600 hover:underline" onClick={() => onHistory(item)}>היסטוריה</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineTable({ lines, drafts, onDraft, readOnly, showResult, canEdit = false }: { lines: CountLine[]; drafts: Record<string, string>; onDraft?: (itemId: string, value: string) => void; readOnly?: boolean; showResult?: boolean; canEdit?: boolean }) {
  const media = useInventoryMedia();
  const leaf = MEDIA_LEAF[media.module];
  if (lines.length === 0) return <p className="text-sm text-slate-500">אין שורות בספירה</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>{["תמונה", "מוצר", "ברקוד", "מלאי רשום", "כמות שנספרה", "הפרש", ...(showResult ? ["אחרי אישור"] : [])].map((label) => <th key={label} className="px-2 py-2 text-right font-medium">{label}</th>)}</tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const raw = drafts[line.itemId] ?? "";
            const parsed = raw.trim() === "" ? null : Number(raw);
            const difference = parsed === null || !Number.isInteger(parsed) ? null : parsed - (line.quantityAtStart ?? 0);
            return (
              <tr key={line.itemId} id={`count-row-${line.itemId}`} className="border-t border-slate-100">
                <td className="px-2 py-2"><MediaFace kind={leaf} id={line.itemId} name={line.name} canEdit={canEdit && !readOnly} /></td>
                <td className="px-2 py-2 font-medium">{line.name}<span className="mt-0.5 block text-xs font-normal text-slate-500">{[line.modelName, line.kindName, line.colorName, line.sizeName].filter(Boolean).join(" · ")}</span></td>
                <td className="px-2 py-2">{line.barcode || media.byId.get(line.itemId)?.barcode || "—"}</td>
                <td className="px-2 py-2 font-bold">{qtyLabel(line.liveQuantity ?? line.quantityAtStart)}</td>
                <td className="px-2 py-2">{readOnly ? qtyLabel(line.countedQuantity) : <Input id={`count-qty-${line.itemId}`} inputMode="numeric" value={raw} onChange={(event) => onDraft?.(line.itemId, event.target.value)} aria-label={`כמות שנספרה ${line.name}`} className="h-9 w-24 border-opal-gold bg-amber-50 text-center font-bold" />}</td>
                <td className="px-2 py-2">{showResult ? qtyLabel(line.difference) : difference === null ? "—" : difference}</td>
                {showResult && <td className="px-2 py-2 font-bold">{qtyLabel(line.quantityAfter)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
