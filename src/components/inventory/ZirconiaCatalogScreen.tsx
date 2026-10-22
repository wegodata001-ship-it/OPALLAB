"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History, Loader2, Minus, Plus, Search } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { InventoryModule, StockButtons } from "@/components/inventory/InventoryStockTools";
import { MediaFace } from "@/components/inventory/InventoryMedia";
import type { ZirconiaHeightNode, ZirconiaMovementRow, ZirconiaStockModel } from "@/lib/inventory/zirconia-stock";

type CatalogResponse = {
  canEdit: boolean;
  models: ZirconiaStockModel[];
  notice?: string | null;
  movements?: ZirconiaMovementRow[];
};

type View =
  | { level: "models" }
  | { level: "variants"; modelId: string }
  | { level: "legacy"; modelId: string }
  | { level: "colors"; modelId: string; variantId: string }
  | { level: "heights"; modelId: string; variantId: string; colorId: string };

type Dialog =
  | null
  | { type: "model" }
  | { type: "variant" }
  | { type: "color" }
  | { type: "height"; id?: string; label: string; quantity: string; minQuantity: string }
  | { type: "rename"; kind: "model" | "variant" | "color" | "legacy-color" | "legacy-height"; id: string; value: string }
  | { type: "delete"; kind: string; id: string; name: string };

const ACTION_LABEL: Record<string, string> = { IN: "הכנסה", OUT: "הפחתה", SET: "עדכון כמות", COUNT: "ספירת מלאי" };

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

function moveId(ids: string[], id: string, direction: -1 | 1) {
  const index = ids.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return null;
  const copy = [...ids];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

export function ZirconiaCatalogScreen() {
  const [models, setModels] = useState<ZirconiaStockModel[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [view, setView] = useState<View>({ level: "models" });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [draftName, setDraftName] = useState("");
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

  const model = view.level === "models" ? null : models.find((item) => item.id === view.modelId) ?? null;
  const variant = view.level === "colors" || view.level === "heights" ? model?.variants.find((item) => item.id === view.variantId) ?? null : null;
  const color = view.level === "heights" ? variant?.colors.find((item) => item.id === view.colorId) ?? null : null;

  useEffect(() => {
    if (loading) return;
    if (view.level !== "models" && !model) setView({ level: "models" });
    else if ((view.level === "colors" || view.level === "heights") && !variant) setView({ level: "variants", modelId: view.modelId });
    else if (view.level === "heights" && !color) setView({ level: "colors", modelId: view.modelId, variantId: view.variantId });
  }, [loading, model, variant, color, view]);

  const term = query.trim().toLocaleLowerCase("he");
  const visibleModels = useMemo(() => models.filter((item) => !term || item.name.toLocaleLowerCase("he").includes(term)), [models, term]);
  const visibleVariants = useMemo(() => (model?.variants ?? []).filter((item) => !term || item.name.toLocaleLowerCase("he").includes(term)), [model, term]);
  const visibleColors = useMemo(() => (variant?.colors ?? []).filter((item) => !term || item.name.toLocaleLowerCase("he").includes(term)), [variant, term]);
  const visibleHeights = useMemo(() => (color?.heights ?? []).filter((item) => !term || item.label.toLocaleLowerCase("he").includes(term)), [color, term]);

  const addLabel = view.level === "models" ? "הוסף דגם" : view.level === "variants" ? "הוסף תת-דגם" : view.level === "colors" ? "הוסף צבע" : view.level === "heights" ? "הוסף גובה" : "";

  const openAdd = () => {
    setDraftName("");
    if (view.level === "models") setDialog({ type: "model" });
    else if (view.level === "variants") setDialog({ type: "variant" });
    else if (view.level === "colors") setDialog({ type: "color" });
    else if (view.level === "heights") setDialog({ type: "height", label: "", quantity: "0", minQuantity: "" });
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

  return (
    <InventoryModule type="ZIRCONIA" title="מלאי זרקוניה">
    <>
      <Header
        title="מלאי זרקוניה"
        description="דגם, תת-דגם, צבע וגובה"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StockButtons type="ZIRCONIA" />
            {!loading && canEdit && addLabel ? <Button onClick={openAdd} disabled={busy}><Plus className="h-4 w-4" />{addLabel}</Button> : null}
          </div>
        }
      />
      {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}
      {!canEdit && !loading && <p className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">צפייה בלבד. עריכה זמינה למנהל.</p>}

      <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <button type="button" className="font-medium text-slate-900 hover:underline" onClick={() => { setView({ level: "models" }); setQuery(""); }}>מלאי זרקוניה</button>
        {model && <>
          <span>/</span>
          <button type="button" className="hover:underline" onClick={() => { setView({ level: "variants", modelId: model.id }); setQuery(""); }}>{model.name}</button>
        </>}
        {view.level === "legacy" && <><span>/</span><span className="text-slate-900">ללא תת-דגם</span></>}
        {variant && <>
          <span>/</span>
          <button type="button" className="hover:underline" onClick={() => { setView({ level: "colors", modelId: model!.id, variantId: variant.id }); setQuery(""); }}>{variant.name}</button>
        </>}
        {color && <><span>/</span><span className="text-slate-900">{color.name}</span></>}
      </nav>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש" className="pr-9" aria-label="חיפוש" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-opal-gold" /></div>
      ) : view.level === "models" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visibleModels.map((item) => {
            const index = models.findIndex((row) => row.id === item.id);
            return (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <MediaFace kind="model" id={item.id} name={item.name} canEdit={canEdit} />
                <button type="button" className="min-w-0 flex-1 text-right" onClick={() => { setView({ level: "variants", modelId: item.id }); setQuery(""); }}>
                  <span className="block text-lg font-bold text-slate-900">{item.name}</span>
                  <span className="text-xs text-slate-500">{item.variants.length} תתי-דגמים</span>
                </button>
              </div>
              {canEdit && (
                <div className="mt-2 flex gap-1">
                  <IconButton label="הזז להתחלה" disabled={busy || index === 0} onClick={() => { const ids = moveId(models.map((row) => row.id), item.id, -1); if (ids) void run(() => requestCatalog({ method: "PATCH", body: { kind: "model", orderedIds: ids } })); }}><ChevronRight className="h-4 w-4" /></IconButton>
                  <IconButton label="הזז לסוף" disabled={busy || index === models.length - 1} onClick={() => { const ids = moveId(models.map((row) => row.id), item.id, 1); if (ids) void run(() => requestCatalog({ method: "PATCH", body: { kind: "model", orderedIds: ids } })); }}><ChevronLeft className="h-4 w-4" /></IconButton>
                  <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => { setDraftName(item.name); setDialog({ type: "rename", kind: "model", id: item.id, value: item.name }); }}>עריכה</button>
                  <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setDialog({ type: "delete", kind: "model", id: item.id, name: item.name })}>מחיקה</button>
                </div>
              )}
            </article>
            );
          })}
        </div>
      ) : view.level === "variants" && model ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visibleVariants.map((item) => {
              const index = model.variants.findIndex((row) => row.id === item.id);
              return (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start gap-2">
                  <MediaFace kind="variant" id={item.id} name={item.name} canEdit={canEdit} />
                  <button type="button" className="min-w-0 flex-1 text-right" onClick={() => { setView({ level: "colors", modelId: model.id, variantId: item.id }); setQuery(""); }}>
                    <span className="block font-bold text-slate-900">{item.name}</span>
                    <span className="text-xs text-slate-500">{item.colors.length} צבעים</span>
                  </button>
                </div>
                {canEdit && (
                  <div className="mt-2 flex gap-1">
                    <IconButton label="הזז להתחלה" disabled={busy || index === 0} onClick={() => { const ids = moveId(model.variants.map((row) => row.id), item.id, -1); if (ids) void run(() => requestCatalog({ method: "PATCH", body: { kind: "variant", modelId: model.id, orderedIds: ids } })); }}><ChevronRight className="h-4 w-4" /></IconButton>
                    <IconButton label="הזז לסוף" disabled={busy || index === model.variants.length - 1} onClick={() => { const ids = moveId(model.variants.map((row) => row.id), item.id, 1); if (ids) void run(() => requestCatalog({ method: "PATCH", body: { kind: "variant", modelId: model.id, orderedIds: ids } })); }}><ChevronLeft className="h-4 w-4" /></IconButton>
                    <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => { setDraftName(item.name); setDialog({ type: "rename", kind: "variant", id: item.id, value: item.name }); }}>עריכה</button>
                    <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setDialog({ type: "delete", kind: "variant", id: item.id, name: item.name })}>מחיקה</button>
                  </div>
                )}
              </article>
            );
            })}
          </div>
          {(model.legacyColors.length > 0 || model.legacyHeights.length > 0 || model.legacyAttributes.length > 0) && (
            <button type="button" className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-right text-sm text-amber-900" onClick={() => { setView({ level: "legacy", modelId: model.id }); setQuery(""); }}>
              נתונים ללא תת-דגם · {model.legacyColors.length} צבעים · {model.legacyHeights.length} גבהים
            </button>
          )}
          {visibleVariants.length === 0 && <p className="text-sm text-slate-500">אין תתי-דגמים</p>}
        </div>
      ) : view.level === "colors" && variant ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visibleColors.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <MediaFace kind="color" id={item.id} name={item.name} canEdit={canEdit} />
                <button type="button" className="min-w-0 flex-1 text-right" onClick={() => { setView({ level: "heights", modelId: model!.id, variantId: variant.id, colorId: item.id }); setQuery(""); }}>
                  <span className="block font-bold text-slate-900">{item.name}</span>
                  <span className="text-xs text-slate-500">{item.heights.length} גבהים</span>
                </button>
              </div>
              {canEdit && (
                <div className="mt-2 flex gap-2 text-xs">
                  <button type="button" className="text-slate-500 hover:underline" onClick={() => { setDraftName(item.name); setDialog({ type: "rename", kind: "color", id: item.id, value: item.name }); }}>עריכה</button>
                  <button type="button" className="text-red-600 hover:underline" onClick={() => setDialog({ type: "delete", kind: "color", id: item.id, name: item.name })}>מחיקה</button>
                </div>
              )}
            </article>
          ))}
          {visibleColors.length === 0 && <p className="col-span-full text-sm text-slate-500">אין צבעים</p>}
        </div>
      ) : view.level === "heights" && color ? (
        <HeightTable
          rows={visibleHeights}
          canEdit={canEdit}
          busy={busy}
          onDelta={(id, delta) => void run(() => requestCatalog({ method: "POST", body: { kind: "adjust", id, delta } }))}
          onQuantity={(id, quantity) => run(() => requestCatalog({ method: "PATCH", body: { kind: "height", id, quantity } }))}
          onHistory={(row) => void openHistory(row.id, row.label)}
          onEdit={(row) => setDialog({ type: "height", id: row.id, label: row.label, quantity: row.quantity == null ? "" : String(row.quantity), minQuantity: row.minQuantity == null ? "" : String(row.minQuantity) })}
          onDelete={(row) => setDialog({ type: "delete", kind: "height", id: row.id, name: row.label })}
        />
      ) : view.level === "legacy" && model ? (
        <LegacyPanel
          model={model}
          canEdit={canEdit}
          busy={busy}
          onRenameColor={(id, name) => { setDraftName(name); setDialog({ type: "rename", kind: "legacy-color", id, value: name }); }}
          onDeleteColor={(id, name) => setDialog({ type: "delete", kind: "color", id, name })}
          onRenameHeight={(row) => setDialog({ type: "height", id: row.id, label: row.label, quantity: row.quantity == null ? "" : String(row.quantity), minQuantity: row.minQuantity == null ? "" : String(row.minQuantity) })}
          onDeleteHeight={(row) => setDialog({ type: "delete", kind: "height", id: row.id, name: row.label })}
          onQuantity={(id, quantity) => run(() => requestCatalog({ method: "PATCH", body: { kind: "height", id, quantity } }))}
          onDelta={(id, delta) => void run(() => requestCatalog({ method: "POST", body: { kind: "adjust", id, delta } }))}
          onHistory={(row) => void openHistory(row.id, row.label)}
        />
      ) : null}

      <Modal open={dialog?.type === "model" || dialog?.type === "variant" || dialog?.type === "color" || dialog?.type === "rename"} onClose={() => setDialog(null)} title={dialog?.type === "rename" ? "עריכת שם" : addLabel || "הוספה"} className="max-w-sm">
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          const name = draftName.trim();
          if (!name || !dialog) return;
          const body = dialog.type === "rename"
            ? { kind: dialog.kind === "legacy-color" ? "color" : dialog.kind === "legacy-height" ? "height" : dialog.kind, id: dialog.id, name, ...(dialog.kind === "legacy-height" ? { label: name } : {}) }
            : dialog.type === "model"
              ? { kind: "model", name }
              : dialog.type === "variant"
                ? { kind: "variant", modelId: model?.id, name }
                : { kind: "color", variantId: variant?.id, name };
          void run(() => requestCatalog({ method: dialog.type === "rename" ? "PATCH" : "POST", body })).then((ok) => { if (ok) setDialog(null); });
        }}>
          <Input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="שם" aria-label="שם" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
            <Button type="submit" disabled={busy || !draftName.trim()}>שמירה</Button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog?.type === "height"} onClose={() => setDialog(null)} title={dialog?.type === "height" && dialog.id ? "עריכת גובה" : "הוספת גובה"} className="max-w-sm">
        {dialog?.type === "height" && (
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            const quantity = dialog.quantity.trim() === "" ? undefined : Number(dialog.quantity);
            const minQuantity = dialog.minQuantity.trim() === "" ? null : Number(dialog.minQuantity);
            if (!dialog.label.trim() || (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 0)) || (minQuantity != null && (!Number.isInteger(minQuantity) || minQuantity < 0))) {
              setError("יש להזין גובה וכמות תקינה");
              return;
            }
            if (!dialog.id && quantity === undefined) { setError("יש להזין כמות התחלתית"); return; }
            void run(() => requestCatalog({
              method: dialog.id ? "PATCH" : "POST",
              body: dialog.id
                ? { kind: "height", id: dialog.id, label: dialog.label, quantity, minQuantity }
                : { kind: "height", colorId: color?.id, label: dialog.label, quantity, minQuantity },
            })).then((ok) => { if (ok) setDialog(null); });
          }}>
            <Input value={dialog.label} onChange={(event) => setDialog({ ...dialog, label: event.target.value })} placeholder="גובה" aria-label="גובה" />
            <Input inputMode="numeric" value={dialog.quantity} onChange={(event) => setDialog({ ...dialog, quantity: event.target.value })} placeholder="כמות" aria-label="כמות" />
            <Input inputMode="numeric" value={dialog.minQuantity} onChange={(event) => setDialog({ ...dialog, minQuantity: event.target.value })} placeholder="כמות מינימום" aria-label="כמות מינימום" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
              <Button type="submit" disabled={busy}>שמירה</Button>
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
            <p className="text-sm text-slate-700">למחוק את «{dialog.name}»? אם קיימים נתונים מקושרים המחיקה תיחסם. גובה עם היסטוריה יוסר מהרשימה והתנועות יישמרו.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
              <Button type="button" variant="danger" disabled={busy} onClick={() => {
                void run(() => requestCatalog({ method: "DELETE", query: `?kind=${dialog.kind}&id=${encodeURIComponent(dialog.id)}` })).then((ok) => { if (ok) setDialog(null); });
              }}>מחיקה</Button>
            </div>
          </>
        )}
      </Modal>
    </>
    </InventoryModule>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40">{children}</button>;
}

function HeightTable({ rows, canEdit, busy, onDelta, onQuantity, onHistory, onEdit, onDelete }: {
  rows: ZirconiaHeightNode[];
  canEdit: boolean;
  busy: boolean;
  onDelta: (id: string, delta: number) => void;
  onQuantity: (id: string, quantity: number) => Promise<boolean>;
  onHistory: (row: ZirconiaHeightNode) => void;
  onEdit: (row: ZirconiaHeightNode) => void;
  onDelete: (row: ZirconiaHeightNode) => void;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">אין גבהים</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th className="px-3 py-2 text-right font-medium">גובה</th>
            <th className="px-3 py-2 text-right font-medium">כמות</th>
            <th className="px-3 py-2 text-right font-medium">הוספה/הפחתה</th>
            <th className="px-3 py-2 text-right font-medium">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="px-3 py-2 font-medium"><span className="flex items-center gap-2"><MediaFace kind="height" id={row.id} name={row.label} canEdit={canEdit} /><span>{row.label}{row.minQuantity != null ? <span className="mr-1 text-xs text-slate-400">מינ׳ {row.minQuantity}</span> : null}</span></span></td>
              <td className="px-3 py-2 font-bold">{row.quantity == null ? "—" : row.quantity}</td>
              <td className="px-3 py-2">{canEdit && <QtyControl quantity={row.quantity} disabled={busy} onDelta={(delta) => onDelta(row.id, delta)} onQuantity={(quantity) => onQuantity(row.id, quantity)} />}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="text-slate-500" aria-label="היסטוריה" onClick={() => onHistory(row)}><History className="h-4 w-4" /></button>
                  {canEdit && <button type="button" className="text-xs text-slate-600 hover:underline" onClick={() => onEdit(row)}>עריכה</button>}
                  {canEdit && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => onDelete(row)}>מחיקה</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QtyControl({ quantity, disabled, onDelta, onQuantity }: { quantity: number | null; disabled: boolean; onDelta: (delta: number) => void; onQuantity: (quantity: number) => Promise<boolean> }) {
  const [draft, setDraft] = useState(quantity == null ? "" : String(quantity));
  useEffect(() => setDraft(quantity == null ? "" : String(quantity)), [quantity]);
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="הוספה" disabled={disabled} className="flex h-7 w-7 items-center justify-center rounded-md border" onClick={() => onDelta(1)}><Plus className="h-3.5 w-3.5" /></button>
      <input value={draft} disabled={disabled} aria-label="כמות" onChange={(event) => setDraft(event.target.value)} onBlur={() => {
        if (draft.trim() === "" || !Number.isInteger(Number(draft)) || Number(draft) < 0 || Number(draft) === quantity) {
          setDraft(quantity == null ? "" : String(quantity));
          return;
        }
        void onQuantity(Number(draft)).then((ok) => { if (!ok) setDraft(quantity == null ? "" : String(quantity)); });
      }} className="h-7 w-14 rounded-md border text-center text-sm font-bold" />
      <button type="button" aria-label="הפחתה" disabled={disabled || (quantity ?? 0) <= 0} className="flex h-7 w-7 items-center justify-center rounded-md border" onClick={() => onDelta(-1)}><Minus className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function LegacyPanel({ model, canEdit, busy, onRenameColor, onDeleteColor, onRenameHeight, onDeleteHeight, onQuantity, onDelta, onHistory }: {
  model: ZirconiaStockModel;
  canEdit: boolean;
  busy: boolean;
  onRenameColor: (id: string, name: string) => void;
  onDeleteColor: (id: string, name: string) => void;
  onRenameHeight: (row: ZirconiaHeightNode) => void;
  onDeleteHeight: (row: ZirconiaHeightNode) => void;
  onQuantity: (id: string, quantity: number) => Promise<boolean>;
  onDelta: (id: string, delta: number) => void;
  onHistory: (row: ZirconiaHeightNode) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">הנתונים האלה נשמרו לפני תתי-הדגמים ולא שויכו אוטומטית לדגם משנה.</p>
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-800">צבעים</h2>
        {model.legacyColors.length === 0 ? <p className="text-sm text-slate-500">אין צבעים</p> : (
          <ul className="space-y-1">
            {model.legacyColors.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="flex items-center gap-2 font-medium"><MediaFace kind="color" id={item.id} name={item.name} canEdit={canEdit} />{item.name}</span>
                {canEdit && <span className="flex gap-2 text-xs"><button type="button" onClick={() => onRenameColor(item.id, item.name)}>עריכה</button><button type="button" className="text-red-600" onClick={() => onDeleteColor(item.id, item.name)}>מחיקה</button></span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-800">גבהים שלא שויכו לצבע</h2>
        <HeightTable rows={model.legacyHeights} canEdit={canEdit} busy={busy} onDelta={onDelta} onQuantity={onQuantity} onHistory={onHistory} onEdit={onRenameHeight} onDelete={onDeleteHeight} />
      </section>
      {model.legacyAttributes.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-800">מאפיינים שנשמרו</h2>
          <ul className="space-y-1">{model.legacyAttributes.map((item) => <li key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">{item.name}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
