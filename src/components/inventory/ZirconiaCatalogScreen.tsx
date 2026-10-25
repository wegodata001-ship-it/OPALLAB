"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, Plus, Search } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { InventoryModule, StockButtons } from "@/components/inventory/InventoryStockTools";
import { MediaFace } from "@/components/inventory/InventoryMedia";
import type { ZirconiaColorNode, ZirconiaHeightNode, ZirconiaMovementRow, ZirconiaStockModel } from "@/lib/inventory/zirconia-stock";

type CatalogResponse = {
  canEdit: boolean;
  models: ZirconiaStockModel[];
  notice?: string | null;
  movements?: ZirconiaMovementRow[];
};

type StockFilter = "all" | "low" | "zero";
type QtyMode = "set" | "add" | "subtract";

type NameDialog =
  | null
  | { type: "model" | "variant" | "color" | "height" }
  | { type: "rename-model" | "rename-variant" | "rename-color"; id: string; value: string }
  | { type: "rename-height"; ids: string[]; value: string }
  | { type: "delete"; kind: string; id?: string; ids?: string[]; name: string };

type CellEdit = {
  colorId: string;
  colorName: string;
  label: string;
  heightId: string | null;
  quantity: number | null;
  mode: QtyMode;
  value: string;
};

const ACTION_LABEL: Record<string, string> = { IN: "הכנסה", OUT: "הפחתה", SET: "קביעת כמות", COUNT: "ספירת מלאי" };
const LOW_KEY = "opal-zirconia-low-threshold";

async function requestCatalog(input: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; query?: string }): Promise<CatalogResponse> {
  const res = await fetch(`/api/inventory/zirconia${input.query ?? ""}`, {
    method: input.method,
    credentials: "include",
    headers: input.body ? { "Content-Type": "application/json" } : undefined,
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
  const json = (await res.json()) as { success: boolean; data?: CatalogResponse; error?: { message?: string } };
  if (!json.success || !json.data) throw new Error(json.error?.message ?? "השמירה נכשלה");
  return json.data;
}

function heightSort(a: string, b: string) {
  const rank = (label: string) => {
    const match = label.match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
  };
  return rank(a) - rank(b) || a.localeCompare(b, "he");
}

function quantityClass(quantity: number | null, threshold: number) {
  if (quantity == null) return "text-slate-400";
  if (quantity <= 0) return "bg-red-50 text-red-700";
  if (quantity <= threshold) return "bg-orange-50 text-orange-700";
  return "text-slate-900";
}

function previewQuantity(current: number | null, mode: QtyMode, raw: string) {
  if (!/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw);
  if (mode === "set") return value;
  const base = current ?? 0;
  return mode === "add" ? base + value : base - value;
}

export function ZirconiaCatalogScreen() {
  const [models, setModels] = useState<ZirconiaStockModel[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [modelId, setModelId] = useState<string | null>(null);
  const [scope, setScope] = useState<string>("model");
  const [colorQuery, setColorQuery] = useState("");
  const [heightFilter, setHeightFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [threshold, setThreshold] = useState(5);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<NameDialog>(null);
  const [draftName, setDraftName] = useState("");
  const [edit, setEdit] = useState<CellEdit | null>(null);
  const [history, setHistory] = useState<{ title: string; rows: ZirconiaMovementRow[] } | null>(null);

  const applyCatalog = useCallback((data: CatalogResponse) => {
    setModels(data.models);
    setCanEdit(data.canEdit);
    if (data.notice) setNotice(data.notice);
  }, []);

  const run = useCallback(async (action: () => Promise<CatalogResponse>) => {
    setBusy(true);
    setError(null);
    try {
      applyCatalog(await action());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
      return false;
    } finally {
      setBusy(false);
    }
  }, [applyCatalog]);

  useEffect(() => {
    const stored = window.localStorage.getItem(LOW_KEY);
    const parsed = stored == null ? 5 : Number(stored);
    if (Number.isInteger(parsed) && parsed >= 0) setThreshold(parsed);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestCatalog({ method: "GET" });
        if (!cancelled) applyCatalog(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applyCatalog]);

  const model = models.find((item) => item.id === modelId) ?? null;
  const variant = model?.variants.find((item) => item.id === scope) ?? null;
  const colors = variant ? variant.colors : model?.legacyColors ?? [];

  useEffect(() => {
    if (loading || models.length === 0) return;
    if (models.some((item) => item.id === modelId)) return;
    setModelId(models[0].id);
    setScope(models[0].variants[0]?.id ?? "model");
  }, [loading, models, modelId]);

  useEffect(() => {
    if (!model) return;
    if (scope === "model" || model.variants.some((item) => item.id === scope)) return;
    setScope(model.variants[0]?.id ?? "model");
  }, [model, scope]);

  const labels = useMemo(
    () => [...new Set(colors.flatMap((color) => color.heights.map((height) => height.label)))].sort(heightSort),
    [colors],
  );
  const visibleLabels = heightFilter === "all" ? labels : labels.filter((label) => label === heightFilter);
  const term = colorQuery.trim().toLocaleLowerCase("he");
  const rows = useMemo(() => colors.filter((color) => {
    if (term && !color.name.toLocaleLowerCase("he").includes(term)) return false;
    if (stockFilter === "all") return true;
    return visibleLabels.some((label) => {
      const height = color.heights.find((item) => item.label === label);
      if (!height || height.quantity == null) return false;
      if (stockFilter === "zero") return height.quantity <= 0;
      return height.quantity > 0 && height.quantity <= threshold;
    });
  }), [colors, term, stockFilter, visibleLabels, threshold]);

  const summary = useMemo(() => {
    const cells = colors.flatMap((color) => color.heights);
    return {
      colors: colors.length,
      heights: labels.length,
      active: cells.filter((cell) => (cell.quantity ?? 0) > 0).length,
      units: cells.reduce((sum, cell) => sum + (cell.quantity ?? 0), 0),
      low: cells.filter((cell) => cell.quantity != null && cell.quantity > 0 && cell.quantity <= threshold).length,
    };
  }, [colors, labels.length, threshold]);

  const columnTotals = visibleLabels.map((label) => rows.reduce((sum, color) => sum + (color.heights.find((height) => height.label === label)?.quantity ?? 0), 0));
  const grandTotal = columnTotals.reduce((sum, value) => sum + value, 0);
  const preview = edit ? previewQuantity(edit.quantity, edit.mode, edit.value) : null;
  const hasLegacy = Boolean(model && (model.legacyColors.length > 0 || model.legacyHeights.length > 0 || model.legacyAttributes.length > 0));

  const chooseModel = (next: ZirconiaStockModel) => {
    setModelId(next.id);
    setScope(next.variants[0]?.id ?? "model");
    setColorQuery("");
    setHeightFilter("all");
    setStockFilter("all");
    setEdit(null);
  };

  const openHistory = async (heightId: string, title: string) => {
    setHistory({ title, rows: [] });
    try {
      const data = await requestCatalog({ method: "GET", query: `?history=1&heightId=${encodeURIComponent(heightId)}` });
      setHistory({ title, rows: data.movements ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת ההיסטוריה");
      setHistory(null);
    }
  };

  const saveCell = async () => {
    if (!edit || preview == null || preview < 0) {
      setError("יש להזין כמות תקינה");
      return;
    }
    const amount = Number(edit.value);
    let ok = false;
    if (!edit.heightId) {
      if (edit.mode === "subtract") {
        setError("אין מלאי להפחתה בשילוב הזה");
        return;
      }
      ok = await run(() => requestCatalog({
        method: "POST",
        body: { kind: "height", colorId: edit.colorId, label: edit.label, quantity: edit.mode === "set" ? preview : amount },
      }));
    } else if (edit.mode === "set") {
      ok = await run(() => requestCatalog({ method: "PATCH", body: { kind: "height", id: edit.heightId, quantity: preview } }));
    } else {
      ok = await run(() => requestCatalog({
        method: "POST",
        body: { kind: "adjust", id: edit.heightId, delta: edit.mode === "add" ? amount : -amount },
      }));
    }
    if (ok) setEdit(null);
  };

  const submitName = async () => {
    const name = draftName.trim();
    if (!name || !dialog) return;
    let ok = false;
    if (dialog.type === "model") ok = await run(() => requestCatalog({ method: "POST", body: { kind: "model", name } }));
    else if (dialog.type === "variant") ok = await run(() => requestCatalog({ method: "POST", body: { kind: "variant", modelId: model?.id, name } }));
    else if (dialog.type === "color") {
      ok = await run(() => requestCatalog({
        method: "POST",
        body: variant ? { kind: "color", variantId: variant.id, name } : { kind: "color", modelId: model?.id, name },
      }));
    } else if (dialog.type === "height") {
      ok = await run(() => requestCatalog({ method: "POST", body: { kind: "height-column", colorIds: colors.map((color) => color.id), label: name } }));
    } else if (dialog.type === "rename-model") ok = await run(() => requestCatalog({ method: "PATCH", body: { kind: "model", id: dialog.id, name } }));
    else if (dialog.type === "rename-variant") ok = await run(() => requestCatalog({ method: "PATCH", body: { kind: "variant", id: dialog.id, name } }));
    else if (dialog.type === "rename-color") ok = await run(() => requestCatalog({ method: "PATCH", body: { kind: "color", id: dialog.id, name } }));
    else if (dialog.type === "rename-height") ok = await run(() => requestCatalog({ method: "PATCH", body: { kind: "height-column", ids: dialog.ids, label: name } }));
    if (ok) setDialog(null);
  };

  return (
    <InventoryModule type="ZIRCONIA" title="מלאי זרקוניה">
      <Header
        title="מלאי זרקוניה"
        description="טבלת מלאי לפי צבע וגובה"
        actions={<div className="flex flex-wrap items-center justify-end gap-2"><StockButtons type="ZIRCONIA" /></div>}
      />
      {error && <p className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}
      {!canEdit && !loading && <p className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">צפייה בלבד. עריכה זמינה למנהל.</p>}

      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-opal-gold" /></div> : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">דגם</span>
            {models.map((item) => (
              <button key={item.id} type="button" onClick={() => chooseModel(item)} className={`rounded-full border px-3 py-1 text-sm font-bold ${item.id === model?.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-800"}`}>{item.name}</button>
            ))}
            {canEdit && <Button variant="outline" className="h-8 px-2" onClick={() => { setDraftName(""); setDialog({ type: "model" }); }}><Plus className="h-3.5 w-3.5" />דגם</Button>}
            {canEdit && model && <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => { setDraftName(model.name); setDialog({ type: "rename-model", id: model.id, value: model.name }); }}>עריכת שם הדגם</button>}
          </div>

          {model && (model.variants.length > 0 || hasLegacy) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">תת-דגם</span>
              {model.variants.map((item) => (
                <button key={item.id} type="button" onClick={() => { setScope(item.id); setEdit(null); setHeightFilter("all"); }} className={`rounded-full border px-3 py-1 text-sm ${item.id === scope ? "border-opal-gold bg-opal-gold-light font-bold text-slate-900" : "border-slate-200 bg-white"}`}>{item.name}</button>
              ))}
              {hasLegacy && <button type="button" onClick={() => { setScope("model"); setEdit(null); setHeightFilter("all"); }} className={`rounded-full border px-3 py-1 text-sm ${scope === "model" ? "border-amber-400 bg-amber-50 font-bold" : "border-slate-200 bg-white"}`}>ללא תת-דגם</button>}
              {canEdit && <Button variant="outline" className="h-8 px-2" onClick={() => { setDraftName(""); setDialog({ type: "variant" }); }}><Plus className="h-3.5 w-3.5" />תת-דגם</Button>}
              {canEdit && variant && <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => { setDraftName(variant.name); setDialog({ type: "rename-variant", id: variant.id, value: variant.name }); }}>עריכת שם</button>}
            </div>
          )}

          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <Stat label="צבעים" value={summary.colors} />
            <Stat label="גבהים" value={summary.heights} />
            <Stat label="שילובים פעילים" value={summary.active} />
            <Stat label="יחידות" value={summary.units} />
            <Stat label="מלאי נמוך" value={summary.low} />
            <label className="flex items-center gap-1 text-slate-500">
              סף נמוך
              <input
                inputMode="numeric"
                aria-label="סף מלאי נמוך"
                value={threshold}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isInteger(next) || next < 0) return;
                  setThreshold(next);
                  window.localStorage.setItem(LOW_KEY, String(next));
                }}
                className="h-7 w-14 rounded-md border border-slate-200 text-center font-bold text-slate-900"
              />
            </label>
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={colorQuery} onChange={(event) => setColorQuery(event.target.value)} placeholder="חיפוש צבע" aria-label="חיפוש לפי צבע" className="h-9 pr-9" />
            </div>
            <select aria-label="סינון לפי גובה" value={heightFilter} onChange={(event) => setHeightFilter(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">
              <option value="all">כל הגבהים</option>
              {labels.map((label) => <option key={label} value={label}>{label}</option>)}
            </select>
            {(["all", "low", "zero"] as const).map((filter) => (
              <button key={filter} type="button" onClick={() => setStockFilter(filter)} className={`h-9 rounded-md border px-2 text-sm ${stockFilter === filter ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
                {filter === "all" ? "הכל" : filter === "low" ? "מלאי נמוך" : "אזל"}
              </button>
            ))}
            {canEdit && <Button className="h-9" onClick={() => { setDraftName(""); setDialog({ type: "color" }); }} disabled={!model}><Plus className="h-3.5 w-3.5" />צבע</Button>}
            {canEdit && <Button variant="outline" className="h-9" onClick={() => { setDraftName(""); setDialog({ type: "height" }); }} disabled={colors.length === 0}><Plus className="h-3.5 w-3.5" />גובה</Button>}
          </div>

          {edit && (
            <form className="flex flex-wrap items-end gap-2 rounded-xl border border-opal-gold/50 bg-opal-gold-light px-3 py-2" onSubmit={(event) => { event.preventDefault(); void saveCell(); }}>
              <div className="min-w-36">
                <p className="text-xs text-slate-500">שילוב</p>
                <p className="text-sm font-bold text-slate-900">{edit.colorName} × {edit.label}</p>
                <p className="text-xs text-slate-500">נוכחי: {edit.quantity == null ? "—" : edit.quantity}</p>
              </div>
              <label className="text-xs text-slate-600">
                פעולה
                <select aria-label="סוג עדכון כמות" value={edit.mode} onChange={(event) => setEdit({ ...edit, mode: event.target.value as QtyMode })} className="mt-1 block h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">
                  <option value="set">קביעת כמות</option>
                  <option value="add">הוספה</option>
                  <option value="subtract">הפחתה</option>
                </select>
              </label>
              <label className="text-xs text-slate-600">
                כמות
                <input autoFocus inputMode="numeric" aria-label="כמות לעדכון" value={edit.value} onChange={(event) => setEdit({ ...edit, value: event.target.value })} className="mt-1 block h-9 w-20 rounded-md border border-slate-200 bg-white text-center text-sm font-bold" />
              </label>
              <p className="pb-2 text-sm">התוצאה: <span className="font-bold">{preview == null ? "—" : preview}</span></p>
              {edit.heightId && <button type="button" className="mb-1 text-slate-500" aria-label="היסטוריה" onClick={() => void openHistory(edit.heightId!, `${edit.colorName} × ${edit.label}`)}><History className="h-4 w-4" /></button>}
              {edit.heightId && <MediaFace kind="height" id={edit.heightId} name={`${edit.colorName} ${edit.label}`} canEdit={canEdit} />}
              <Button type="submit" className="h-9" disabled={busy || preview == null || preview < 0}>שמירה</Button>
              <Button type="button" variant="outline" className="h-9" onClick={() => setEdit(null)}>סגירה</Button>
            </form>
          )}

          {colors.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-sm text-slate-500">אין צבעים בדגם שנבחר. הוסיפו צבע כדי לפתוח את טבלת המלאי.</p>
          ) : (
            <div className="max-h-[72vh] overflow-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky right-0 top-0 z-30 border-b border-slate-700 bg-slate-900 px-3 py-2 text-right font-medium text-white">צבע</th>
                    {visibleLabels.map((label) => {
                      const ids = colors.flatMap((color) => color.heights.filter((height) => height.label === label).map((height) => height.id));
                      return (
                        <th key={label} className="sticky top-0 z-20 min-w-20 border-b border-slate-700 bg-slate-900 px-2 py-2 text-center font-medium text-white">
                          <span>{label}</span>
                          {canEdit && ids.length > 0 && (
                            <span className="mt-1 flex justify-center gap-2 text-[11px] font-normal text-slate-300">
                              <button type="button" onClick={() => { setDraftName(label); setDialog({ type: "rename-height", ids, value: label }); }}>עריכה</button>
                              <button type="button" className="text-red-200" onClick={() => setDialog({ type: "delete", kind: "height-column", ids, name: label })}>הסרה</button>
                            </span>
                          )}
                        </th>
                      );
                    })}
                    <th className="sticky left-0 top-0 z-30 border-b border-slate-700 bg-slate-900 px-3 py-2 text-center font-medium text-white">סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((color) => {
                    const rowTotal = visibleLabels.reduce((sum, label) => sum + (color.heights.find((height) => height.label === label)?.quantity ?? 0), 0);
                    return (
                      <tr key={color.id}>
                        <th className="sticky right-0 z-10 border-b border-slate-100 bg-white px-3 py-1.5 text-right font-medium text-slate-900">
                          <span className="flex items-center gap-2">
                            <MediaFace kind="color" id={color.id} name={color.name} canEdit={canEdit} />
                            <span>
                              <span className="block">{color.name}</span>
                              {canEdit && (
                                <span className="flex gap-2 text-[11px] font-normal text-slate-500">
                                  <button type="button" onClick={() => { setDraftName(color.name); setDialog({ type: "rename-color", id: color.id, value: color.name }); }}>עריכה</button>
                                  <button type="button" className="text-red-600" onClick={() => setDialog({ type: "delete", kind: "color", id: color.id, name: color.name })}>מחיקה</button>
                                </span>
                              )}
                            </span>
                          </span>
                        </th>
                        {visibleLabels.map((label) => {
                          const height = color.heights.find((item) => item.label === label) ?? null;
                          return <td key={label} className="border-b border-slate-100 p-1 text-center">{cellButton(color, label, height)}</td>;
                        })}
                        <td className="sticky left-0 z-10 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-center text-base font-bold text-slate-900">{rowTotal}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={visibleLabels.length + 2} className="px-3 py-6 text-center text-slate-500">אין צבעים תואמים לסינון</td></tr>}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr>
                      <th className="sticky right-0 bottom-0 z-10 border-t border-slate-200 bg-opal-gold-light px-3 py-2 text-right font-bold">סה״כ</th>
                      {columnTotals.map((total, index) => <td key={visibleLabels[index]} className="sticky bottom-0 border-t border-slate-200 bg-opal-gold-light px-2 py-2 text-center font-bold">{total}</td>)}
                      <td className="sticky bottom-0 left-0 z-10 border-t border-slate-200 bg-opal-gold-light px-3 py-2 text-center text-base font-bold">{grandTotal}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {scope === "model" && model && model.legacyHeights.length > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              גבהים שלא שויכו לצבע נשארו ללא שיוך: {model.legacyHeights.map((height) => height.label).join(" · ")}. הם לא שובצו אוטומטית לצבע.
            </p>
          )}
        </div>
      )}

      <Modal open={dialog != null && dialog.type !== "delete"} onClose={() => setDialog(null)} title={dialogTitle(dialog)} className="max-w-sm">
        {dialog && dialog.type !== "delete" && (
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submitName(); }}>
            <Input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder={dialog.type === "height" || dialog.type === "rename-height" ? "גובה" : "שם"} aria-label="שם" />
            {dialog.type === "height" && <p className="text-xs text-slate-500">הגובה יתווסף לכל צבע בדגם הנוכחי בלי כמות, עד שתקבעו מלאי בתא.</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
              <Button type="submit" disabled={busy || !draftName.trim()}>שמירה</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(history)} onClose={() => setHistory(null)} title={`היסטוריית תנועות${history?.title ? ` — ${history.title}` : ""}`} className="max-w-lg">
        {history && history.rows.length === 0 ? <p className="text-sm text-slate-500">אין תנועות</p> : (
          <ul className="space-y-2">
            {history?.rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium">{ACTION_LABEL[row.action] ?? row.action}</p>
                <p>{row.quantityBefore} → {row.quantityAfter} ({row.quantityChange > 0 ? `+${row.quantityChange}` : row.quantityChange})</p>
                <p className="text-xs text-slate-500">{row.userName} · {new Date(row.createdAt).toLocaleString("he-IL")}</p>
                {row.reason && <p>{row.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal open={dialog?.type === "delete"} onClose={() => setDialog(null)} title="אישור מחיקה" className="max-w-sm">
        {dialog?.type === "delete" && (
          <>
            <p className="text-sm text-slate-700">להסיר את «{dialog.name}»? אם קיימת כמות או היסטוריית מלאי, המחיקה תיחסם והנתונים יישמרו.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
              <Button type="button" variant="danger" disabled={busy} onClick={() => {
                const query = dialog.kind === "height-column"
                  ? `?kind=height-column&ids=${encodeURIComponent((dialog.ids ?? []).join(","))}`
                  : `?kind=${dialog.kind}&id=${encodeURIComponent(dialog.id ?? "")}`;
                void run(() => requestCatalog({ method: "DELETE", query })).then((ok) => { if (ok) setDialog(null); });
              }}>מחיקה</Button>
            </div>
          </>
        )}
      </Modal>
    </InventoryModule>
  );

  function cellButton(color: ZirconiaColorNode, label: string, height: ZirconiaHeightNode | null) {
    const selected = edit?.colorId === color.id && edit.label === label;
    return (
      <button
        type="button"
        disabled={!canEdit}
        aria-label={`${color.name} גובה ${label}`}
        onClick={() => setEdit({ colorId: color.id, colorName: color.name, label, heightId: height?.id ?? null, quantity: height?.quantity ?? null, mode: "set", value: "" })}
        className={`h-9 w-full rounded-md text-base font-bold tabular-nums ${quantityClass(height?.quantity ?? null, threshold)} ${selected ? "ring-2 ring-opal-gold" : ""} ${canEdit ? "hover:bg-slate-50" : ""}`}
      >
        {height?.quantity == null ? "—" : height.quantity}
      </button>
    );
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div><dt className="inline text-slate-500">{label} </dt><dd className="inline font-bold text-slate-900">{value}</dd></div>;
}

function dialogTitle(dialog: NameDialog) {
  if (!dialog || dialog.type === "delete") return "";
  if (dialog.type === "model") return "הוספת דגם";
  if (dialog.type === "variant") return "הוספת תת-דגם";
  if (dialog.type === "color") return "הוספת צבע";
  if (dialog.type === "height") return "הוספת גובה";
  if (dialog.type === "rename-height") return "עריכת גובה";
  return "עריכת שם";
}
