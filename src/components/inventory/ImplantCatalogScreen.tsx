"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Loader2, Minus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

type HeightNode = {
  id: string;
  label: string;
  quantity: number;
  minQuantity: number;
  sortOrder: number;
  archivedAt: string | null;
};
type TypeNode = { id: string; name: string; sortOrder: number; archivedAt: string | null; heights: HeightNode[] };
type ModelNode = { id: string; name: string; sortOrder: number; archivedAt: string | null; types: TypeNode[] };
type BrandNode = { id: string; name: string; sortOrder: number; archivedAt: string | null; models: ModelNode[] };
type Summary = { totalQuantity: number; modelCount: number; typeCount: number; lowStockCount: number; outOfStockCount: number };
type CatalogResponse = { canEdit: boolean; notice: string | null; summary: Summary; brands: BrandNode[] };
type MovementRow = {
  id: string;
  action: "IN" | "OUT" | "SET";
  quantityBefore: number;
  delta: number;
  balanceAfter: number;
  reason: string;
  performedByName: string;
  createdAt: string;
};
type Level = "brand" | "model" | "type" | "height";
type StockFilter = "all" | "ok" | "low" | "out";
type Dialog =
  | { mode: "add"; kind: Level }
  | { mode: "edit"; kind: Exclude<Level, "height">; id: string }
  | { mode: "edit-height"; id: string }
  | { mode: "history"; id: string; label: string };

const FILTERS: { id: StockFilter; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "ok", label: "תקין" },
  { id: "low", label: "נמוך" },
  { id: "out", label: "אזל" },
];

function active<T extends { archivedAt: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => !row.archivedAt);
}

function stockState(height: Pick<HeightNode, "quantity" | "minQuantity">): Exclude<StockFilter, "all"> {
  if (height.quantity === 0) return "out";
  if (height.minQuantity > 0 && height.quantity <= height.minQuantity) return "low";
  return "ok";
}

function moveId(ids: string[], id: string, direction: -1 | 1): string[] | null {
  const index = ids.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return null;
  const copy = [...ids];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

function qtyOf(heights: HeightNode[]): number {
  return active(heights).reduce((sum, height) => sum + height.quantity, 0);
}

async function requestCatalog(input: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; query?: string }): Promise<CatalogResponse> {
  const res = await fetch(`/api/inventory/implants${input.query ?? ""}`, {
    method: input.method,
    credentials: "include",
    headers: input.body ? { "Content-Type": "application/json" } : undefined,
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
  const json = (await res.json()) as { success: boolean; data?: CatalogResponse; error?: { message?: string } };
  if (!json.success || !json.data) throw new Error(json.error?.message ?? "שגיאה בשמירה");
  return json.data;
}

export function ImplantCatalogScreen() {
  const [brands, setBrands] = useState<BrandNode[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: Level; id: string; name: string } | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftQty, setDraftQty] = useState("0");
  const [draftMin, setDraftMin] = useState("0");
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const apply = useCallback((data: CatalogResponse) => {
    setBrands(data.brands);
    setSummary(data.summary);
    setCanEdit(data.canEdit);
    if (data.notice) setNotice(data.notice);
  }, []);

  const run = useCallback(
    async (action: () => Promise<CatalogResponse>) => {
      setBusy(true);
      setError(null);
      try {
        apply(await action());
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה בשמירה");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestCatalog({ method: "GET" });
        if (!cancelled) apply(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const activeBrands = useMemo(() => active(brands), [brands]);
  const brand = activeBrands.find((item) => item.id === brandId) ?? null;
  const model = brand ? active(brand.models).find((item) => item.id === modelId) ?? null : null;
  const type = model ? active(model.types).find((item) => item.id === typeId) ?? null : null;

  useEffect(() => {
    if (brandId && !brand) {
      setBrandId(null);
      setModelId(null);
      setTypeId(null);
    } else if (modelId && !model) {
      setModelId(null);
      setTypeId(null);
    } else if (typeId && !type) {
      setTypeId(null);
    }
  }, [brand, brandId, model, modelId, type, typeId]);

  const searchHits = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("he");
    if (!term) return [];
    const hits: { key: string; label: string; brandId: string; modelId?: string; typeId?: string }[] = [];
    for (const item of activeBrands) {
      if (item.name.toLocaleLowerCase("he").includes(term)) hits.push({ key: item.id, label: item.name, brandId: item.id });
      for (const child of active(item.models)) {
        if (child.name.toLocaleLowerCase("he").includes(term)) {
          hits.push({ key: child.id, label: `${item.name} / ${child.name}`, brandId: item.id, modelId: child.id });
        }
        for (const kind of active(child.types)) {
          if (kind.name.toLocaleLowerCase("he").includes(term)) {
            hits.push({ key: kind.id, label: `${item.name} / ${child.name} / ${kind.name}`, brandId: item.id, modelId: child.id, typeId: kind.id });
          }
          for (const height of active(kind.heights)) {
            if (height.label.toLocaleLowerCase("he").includes(term)) {
              hits.push({
                key: height.id,
                label: `${item.name} / ${child.name} / ${kind.name} / ${height.label}`,
                brandId: item.id,
                modelId: child.id,
                typeId: kind.id,
              });
            }
          }
        }
      }
    }
    return hits.slice(0, 30);
  }, [activeBrands, query]);

  const flatHeights = useMemo(() => {
    const rows: (HeightNode & { path: string; brandId: string; modelId: string; typeId: string })[] = [];
    for (const item of activeBrands) {
      for (const child of active(item.models)) {
        for (const kind of active(child.types)) {
          for (const height of active(kind.heights)) {
            if (stockFilter !== "all" && stockState(height) !== stockFilter) continue;
            const path = `${item.name} / ${child.name} / ${kind.name}`;
            if (query.trim() && !`${path} ${height.label}`.toLocaleLowerCase("he").includes(query.trim().toLocaleLowerCase("he"))) continue;
            rows.push({ ...height, path, brandId: item.id, modelId: child.id, typeId: kind.id });
          }
        }
      }
    }
    return rows;
  }, [activeBrands, query, stockFilter]);

  function openAdd(kind: Level) {
    setDraftName("");
    setDraftQty("0");
    setDraftMin("0");
    setDialog({ mode: "add", kind });
  }

  function openEdit(kind: Exclude<Level, "height">, id: string, name: string) {
    setDraftName(name);
    setDialog({ mode: "edit", kind, id });
  }

  function openHeightEdit(height: HeightNode) {
    setDraftName(height.label);
    setDraftQty(String(height.quantity));
    setDraftMin(String(height.minQuantity));
    setDialog({ mode: "edit-height", id: height.id });
  }

  async function saveDialog() {
    if (!dialog || dialog.mode === "history") return;
    let ok = false;
    if (dialog.mode === "add" && dialog.kind === "brand") ok = await run(() => requestCatalog({ method: "POST", body: { kind: "brand", name: draftName } }));
    if (dialog.mode === "add" && dialog.kind === "model" && brand) {
      ok = await run(() => requestCatalog({ method: "POST", body: { kind: "model", parentId: brand.id, name: draftName } }));
    }
    if (dialog.mode === "add" && dialog.kind === "type" && model) {
      ok = await run(() => requestCatalog({ method: "POST", body: { kind: "type", parentId: model.id, name: draftName } }));
    }
    if (dialog.mode === "add" && dialog.kind === "height" && type) {
      ok = await run(() =>
        requestCatalog({
          method: "POST",
          body: { kind: "height", parentId: type.id, label: draftName, quantity: Number(draftQty), minQuantity: Number(draftMin), reason },
        }),
      );
    }
    if (dialog.mode === "edit") ok = await run(() => requestCatalog({ method: "PATCH", body: { kind: dialog.kind, id: dialog.id, name: draftName } }));
    if (dialog.mode === "edit-height") {
      ok = await run(() =>
        requestCatalog({
          method: "PATCH",
          body: { kind: "height", id: dialog.id, label: draftName, quantity: Number(draftQty), minQuantity: Number(draftMin), reason },
        }),
      );
    }
    if (ok) setDialog(null);
  }

  async function reorder(kind: Level, ids: string[], id: string, direction: -1 | 1, parentId?: string) {
    const orderedIds = moveId(ids, id, direction);
    if (!orderedIds) return;
    await run(() => requestCatalog({ method: "PATCH", body: { kind, orderedIds, parentId } }));
  }

  async function changeQuantity(id: string, patch: { delta?: number; quantity?: number }) {
    if (patch.delta !== undefined) {
      await run(() =>
        requestCatalog({
          method: "POST",
          body: { kind: "stock", heightId: id, action: patch.delta! > 0 ? "IN" : "OUT", quantity: Math.abs(patch.delta!), reason },
        }),
      );
      return;
    }
    await run(() => requestCatalog({ method: "POST", body: { kind: "stock", heightId: id, action: "SET", quantity: patch.quantity, reason } }));
  }

  async function openHistory(height: { id: string; label: string }) {
    setDialog({ mode: "history", id: height.id, label: height.label });
    setMovements([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/inventory/implants?heightId=${encodeURIComponent(height.id)}`, { credentials: "include" });
      const json = (await res.json()) as { success: boolean; data?: { movements: MovementRow[] }; error?: { message?: string } };
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "שגיאה בטעינת ההיסטוריה");
      setMovements(json.data.movements);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת ההיסטוריה");
    } finally {
      setHistoryLoading(false);
    }
  }

  function goTo(next: { brandId: string | null; modelId?: string | null; typeId?: string | null }) {
    setBrandId(next.brandId || null);
    setModelId(next.modelId ?? null);
    setTypeId(next.typeId ?? null);
    setQuery("");
    setStockFilter("all");
  }

  const archived = !brand
    ? brands.filter((item) => item.archivedAt).map((item) => ({ kind: "brand" as const, id: item.id, name: item.name }))
    : !model
      ? brand.models.filter((item) => item.archivedAt).map((item) => ({ kind: "model" as const, id: item.id, name: item.name }))
      : !type
        ? model.types.filter((item) => item.archivedAt).map((item) => ({ kind: "type" as const, id: item.id, name: item.name }))
        : type.heights.filter((item) => item.archivedAt).map((item) => ({ kind: "height" as const, id: item.id, name: item.label }));

  const showSearch = query.trim().length > 0 && stockFilter === "all";
  const showFlat = stockFilter !== "all";

  return (
    <>
      <Header
        title="מלאי שתלים"
        description="חברה, דגם, סוג וגובה"
        actions={
          <Link href="/inventory" className="text-sm font-medium text-slate-600 underline-offset-4 hover:text-opal-gold-dark hover:underline">
            חזרה למלאי
          </Link>
        }
      />

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען מלאי שתלים
        </div>
      ) : (
        <div className="space-y-4">
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p>}

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["כמות שתלים", summary?.totalQuantity ?? 0],
              ["דגמים", summary?.modelCount ?? 0],
              ["סוגים", summary?.typeCount ?? 0],
              ["מלאי נמוך", summary?.lowStockCount ?? 0],
              ["אזל", summary?.outOfStockCount ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-slate-900 px-3 py-3 text-white">
                <p className="text-xs text-slate-300">{label}</p>
                <p className="text-xl font-bold">{value}</p>
              </div>
            ))}
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש חברה, דגם, סוג או גובה" className="pr-9" aria-label="חיפוש" />
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setStockFilter(filter.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm",
                    stockFilter === filter.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {!showSearch && !showFlat && (
            <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
              <Crumb label="מלאי שתלים" onClick={() => goTo({ brandId: null })} current={!brand} />
              {brand && (
                <>
                  <span>/</span>
                  <Crumb label={brand.name} current={!model} onClick={() => goTo({ brandId: brand.id })} />
                </>
              )}
              {brand && model && (
                <>
                  <span>/</span>
                  <Crumb label={model.name} current={!type} onClick={() => goTo({ brandId: brand.id, modelId: model.id })} />
                </>
              )}
              {brand && model && type && (
                <>
                  <span>/</span>
                  <Crumb label={type.name} current onClick={() => goTo({ brandId: brand.id, modelId: model.id, typeId: type.id })} />
                </>
              )}
            </nav>
          )}

          {showSearch ? (
            searchHits.length === 0 ? (
              <Empty text="לא נמצאו תוצאות" />
            ) : (
              <div className="space-y-2">
                {searchHits.map((hit) => (
                  <button key={hit.key} type="button" onClick={() => goTo(hit)} className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-right font-medium hover:border-opal-gold">
                    {hit.label}
                  </button>
                ))}
              </div>
            )
          ) : showFlat ? (
            flatHeights.length === 0 ? (
              <Empty text="אין פריטים במצב זה" />
            ) : (
              <HeightTable
                rows={flatHeights.map((row) => ({ ...row, note: row.path }))}
                canEdit={canEdit}
                busy={busy}
                onQuantity={changeQuantity}
                onEdit={(row) => openHeightEdit(row)}
                onDelete={(row) => setPendingDelete({ kind: "height", id: row.id, name: row.label })}
                onHistory={openHistory}
                onOpen={(row) => {
                  const match = flatHeights.find((item) => item.id === row.id);
                  if (match) goTo(match);
                }}
              />
            )
          ) : !brand ? (
            <LevelGrid
              title="חברות"
              addLabel="הוסף חברה"
              canEdit={canEdit}
              busy={busy}
              empty="אין חברות"
              onAdd={() => openAdd("brand")}
              items={activeBrands.map((item) => ({
                id: item.id,
                title: item.name,
                meta: `${active(item.models).length} דגמים · ${qtyOf(active(item.models).flatMap((child) => active(child.types).flatMap((kind) => kind.heights)))} במלאי`,
              }))}
              onOpen={(id) => goTo({ brandId: id })}
              onEdit={(id, title) => openEdit("brand", id, title)}
              onDelete={(id, title) => setPendingDelete({ kind: "brand", id, name: title })}
              onReorder={(id, direction) => void reorder("brand", activeBrands.map((item) => item.id), id, direction)}
            />
          ) : !model ? (
            <LevelGrid
              title={brand.name}
              addLabel="הוסף דגם"
              canEdit={canEdit}
              busy={busy}
              empty="אין דגמים"
              onAdd={() => openAdd("model")}
              items={active(brand.models).map((item) => ({
                id: item.id,
                title: item.name,
                meta: `${active(item.types).length} סוגים · ${qtyOf(active(item.types).flatMap((kind) => kind.heights))} במלאי`,
              }))}
              onOpen={(id) => goTo({ brandId: brand.id, modelId: id })}
              onEdit={(id, title) => openEdit("model", id, title)}
              onDelete={(id, title) => setPendingDelete({ kind: "model", id, name: title })}
              onReorder={(id, direction) => void reorder("model", active(brand.models).map((item) => item.id), id, direction, brand.id)}
            />
          ) : !type ? (
            <LevelGrid
              title={model.name}
              addLabel="הוסף סוג"
              canEdit={canEdit}
              busy={busy}
              empty="אין סוגים"
              onAdd={() => openAdd("type")}
              items={active(model.types).map((item) => ({
                id: item.id,
                title: item.name,
                meta: `${active(item.heights).length} גבהים · ${qtyOf(item.heights)} במלאי`,
              }))}
              onOpen={(id) => goTo({ brandId: brand.id, modelId: model.id, typeId: id })}
              onEdit={(id, title) => openEdit("type", id, title)}
              onDelete={(id, title) => setPendingDelete({ kind: "type", id, name: title })}
              onReorder={(id, direction) => void reorder("type", active(model.types).map((item) => item.id), id, direction, model.id)}
            />
          ) : (
            <section className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-bold text-slate-900">{type.name}</h2>
                {canEdit && (
                  <Button size="sm" onClick={() => openAdd("height")} disabled={busy}>
                    <Plus className="h-4 w-4" />
                    הוסף גובה
                  </Button>
                )}
              </div>
              {canEdit && (
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="סיבה לשינוי הכמות (אופציונלי)" aria-label="סיבה" />
              )}
              {active(type.heights).length === 0 ? (
                <Empty text="אין גבהים" />
              ) : (
                <HeightTable
                  rows={active(type.heights)}
                  canEdit={canEdit}
                  busy={busy}
                  onQuantity={changeQuantity}
                  onEdit={openHeightEdit}
                  onDelete={(row) => setPendingDelete({ kind: "height", id: row.id, name: row.label })}
                  onHistory={openHistory}
                  onReorder={(id, direction) => void reorder("height", active(type.heights).map((item) => item.id), id, direction, type.id)}
                />
              )}
            </section>
          )}

          {!showSearch && !showFlat && archived.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-bold text-slate-700">ארכיון</h3>
              <ul className="space-y-2">
                {archived.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <span>{item.name}</span>
                    {canEdit && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: item.kind, id: item.id, restore: true } }))}>
                        שחזור
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <Modal open={Boolean(dialog && dialog.mode !== "history")} onClose={() => setDialog(null)} title={dialogTitle(dialog)} className="max-w-md">
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder={dialog?.mode === "edit-height" || (dialog?.mode === "add" && dialog.kind === "height") ? "גובה / מידה" : "שם"}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
          />
          {dialog?.mode === "edit-height" || (dialog?.mode === "add" && dialog.kind === "height") ? (
            <>
              <Input inputMode="numeric" placeholder="כמות" value={draftQty} onChange={(event) => setDraftQty(event.target.value)} />
              <Input inputMode="numeric" placeholder="כמות מינימום" value={draftMin} onChange={(event) => setDraftMin(event.target.value)} />
            </>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
          <Button onClick={() => void saveDialog()} disabled={busy}>שמירה</Button>
        </div>
      </Modal>

      <Modal open={dialog?.mode === "history"} onClose={() => setDialog(null)} title={dialog?.mode === "history" ? `היסטוריה · ${dialog.label}` : ""} className="max-w-lg">
        {historyLoading ? (
          <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />טוען</div>
        ) : movements.length === 0 ? (
          <p className="text-sm text-slate-500">אין תנועות</p>
        ) : (
          <ul className="space-y-2">
            {movements.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium">{row.quantityBefore} → {row.balanceAfter} ({row.delta > 0 ? `+${row.delta}` : row.delta})</p>
                {row.reason && <p className="text-slate-600">{row.reason}</p>}
                <p className="text-xs text-slate-400">{row.performedByName} · {new Date(row.createdAt).toLocaleString("he-IL")}</p>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} title="אישור מחיקה" className="max-w-md">
        <p className="text-sm text-slate-600">האם למחוק את {pendingDelete?.name}? רשומה עם מלאי או תנועות תועבר לארכיון. רמה עם פריטים פעילים לא תימחק.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPendingDelete(null)}>ביטול</Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (!pendingDelete) return;
              void run(() => requestCatalog({ method: "DELETE", query: `?kind=${pendingDelete.kind}&id=${encodeURIComponent(pendingDelete.id)}` })).then((ok) => {
                if (ok) setPendingDelete(null);
              });
            }}
          >
            מחק
          </Button>
        </div>
      </Modal>
    </>
  );
}

function dialogTitle(dialog: Dialog | null): string {
  if (!dialog || dialog.mode === "history") return "";
  if (dialog.mode === "edit-height") return "עריכת גובה";
  const names = { brand: "חברה", model: "דגם", type: "סוג", height: "גובה" };
  return dialog.mode === "add" ? `הוספת ${names[dialog.kind]}` : `עריכת ${names[dialog.kind]}`;
}

function Crumb({ label, onClick, current }: { label: string; onClick: () => void; current?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-md px-1 py-0.5", current ? "font-bold text-slate-900" : "hover:text-opal-gold-dark")}>
      {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">{text}</p>;
}

function LevelGrid({
  title,
  addLabel,
  canEdit,
  busy,
  empty,
  items,
  onAdd,
  onOpen,
  onEdit,
  onDelete,
  onReorder,
}: {
  title: string;
  addLabel: string;
  canEdit: boolean;
  busy: boolean;
  empty: string;
  items: { id: string; title: string; meta: string }[];
  onAdd: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string, title: string) => void;
  onDelete: (id: string, title: string) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {canEdit && (
          <Button size="sm" onClick={onAdd} disabled={busy}>
            <Plus className="h-4 w-4" />
            {addLabel}
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <Empty text={empty} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <button type="button" onClick={() => onOpen(item.id)} className="min-w-0 flex-1 text-right">
                <span className="block text-lg font-bold text-slate-900">{item.title}</span>
                <span className="text-xs text-slate-500">{item.meta}</span>
              </button>
              {canEdit && (
                <div className="flex shrink-0">
                  <IconButton label="למעלה" onClick={() => onReorder(item.id, -1)}><ChevronUp className="h-4 w-4" /></IconButton>
                  <IconButton label="למטה" onClick={() => onReorder(item.id, 1)}><ChevronDown className="h-4 w-4" /></IconButton>
                  <IconButton label="עריכה" onClick={() => onEdit(item.id, item.title)}><Pencil className="h-4 w-4" /></IconButton>
                  <IconButton label="מחיקה" onClick={() => onDelete(item.id, item.title)}><Trash2 className="h-4 w-4" /></IconButton>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function HeightTable({
  rows,
  canEdit,
  busy,
  onQuantity,
  onEdit,
  onDelete,
  onHistory,
  onReorder,
  onOpen,
}: {
  rows: (HeightNode & { note?: string })[];
  canEdit: boolean;
  busy: boolean;
  onQuantity: (id: string, patch: { delta?: number; quantity?: number }) => Promise<void>;
  onEdit: (row: HeightNode) => void;
  onDelete: (row: HeightNode) => void;
  onHistory: (row: HeightNode) => void;
  onReorder?: (id: string, direction: -1 | 1) => void;
  onOpen?: (row: HeightNode) => void;
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-right font-medium">גובה</th>
              <th className="px-4 py-3 text-right font-medium">כמות</th>
              <th className="px-4 py-3 text-right font-medium">עדכון כמות</th>
              <th className="px-4 py-3 text-right font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  {onOpen ? (
                    <button type="button" className="text-right font-medium text-slate-900" onClick={() => onOpen(row)}>{row.label}</button>
                  ) : (
                    <p className="font-medium text-slate-900">{row.label}</p>
                  )}
                  <p className="text-xs text-slate-500">{row.note ?? `מינימום ${row.minQuantity}`}</p>
                </td>
                <td className="px-4 py-3"><QtyBadge row={row} /></td>
                <td className="px-4 py-3">{canEdit && <QuantityControl item={row} disabled={busy} onChange={onQuantity} />}</td>
                <td className="px-4 py-3"><HeightActions row={row} canEdit={canEdit} busy={busy} onEdit={onEdit} onDelete={onDelete} onHistory={onHistory} onReorder={onReorder} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-900">{row.label}</p>
                <p className="text-xs text-slate-500">{row.note ?? `מינימום ${row.minQuantity}`}</p>
              </div>
              <QtyBadge row={row} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {canEdit && <QuantityControl item={row} disabled={busy} onChange={onQuantity} />}
              <HeightActions row={row} canEdit={canEdit} busy={busy} onEdit={onEdit} onDelete={onDelete} onHistory={onHistory} onReorder={onReorder} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function QtyBadge({ row }: { row: Pick<HeightNode, "quantity" | "minQuantity"> }) {
  const state = stockState(row);
  return (
    <span className={cn("rounded-full px-3 py-1 text-sm font-bold", state === "out" ? "bg-red-50 text-red-700" : state === "low" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")}>
      {row.quantity}
    </span>
  );
}

function HeightActions({
  row,
  canEdit,
  busy,
  onEdit,
  onDelete,
  onHistory,
  onReorder,
}: {
  row: HeightNode;
  canEdit: boolean;
  busy: boolean;
  onEdit: (row: HeightNode) => void;
  onDelete: (row: HeightNode) => void;
  onHistory: (row: HeightNode) => void;
  onReorder?: (id: string, direction: -1 | 1) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onHistory(row)}>היסטוריה</Button>
      {canEdit && onReorder && (
        <>
          <IconButton label="למעלה" onClick={() => onReorder(row.id, -1)}><ChevronUp className="h-4 w-4" /></IconButton>
          <IconButton label="למטה" onClick={() => onReorder(row.id, 1)}><ChevronDown className="h-4 w-4" /></IconButton>
        </>
      )}
      {canEdit && <IconButton label="עריכה" onClick={() => onEdit(row)}><Pencil className="h-4 w-4" /></IconButton>}
      {canEdit && <IconButton label="מחיקה" onClick={() => onDelete(row)}><Trash2 className="h-4 w-4" /></IconButton>}
    </div>
  );
}

function QuantityControl({
  item,
  disabled,
  onChange,
}: {
  item: HeightNode;
  disabled: boolean;
  onChange: (id: string, patch: { delta?: number; quantity?: number }) => Promise<void>;
}) {
  const [draft, setDraft] = useState(String(item.quantity));
  useEffect(() => setDraft(String(item.quantity)), [item.quantity]);
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="הוספת כמות" disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-50" onClick={() => void onChange(item.id, { delta: 1 })}>
        <Plus className="h-4 w-4" />
      </button>
      <input
        inputMode="numeric"
        aria-label={`כמות ${item.label}`}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (Number(draft) !== item.quantity) void onChange(item.id, { quantity: Number(draft) });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="h-8 w-16 rounded-lg border border-slate-200 text-center text-sm font-bold outline-none focus:border-opal-gold"
      />
      <button type="button" aria-label="הפחתת כמות" disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-50" onClick={() => void onChange(item.id, { delta: -1 })}>
        <Minus className="h-4 w-4" />
      </button>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800" onClick={onClick}>
      {children}
    </button>
  );
}
