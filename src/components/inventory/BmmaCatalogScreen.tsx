"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Archive, ChevronDown, ChevronUp, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { InventoryModule, StockButtons } from "@/components/inventory/InventoryStockTools";
import { MediaFace } from "@/components/inventory/InventoryMedia";
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

type ColorNode = {
  id: string;
  name: string;
  colorCode: string;
  sortOrder: number;
  archivedAt: string | null;
  heights: HeightNode[];
};

type ModelNode = {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  colors: ColorNode[];
};

type Summary = {
  totalQuantity: number;
  colorCount: number;
  heightCount: number;
  lowStockCount: number;
  outOfStockCount: number;
};

type CatalogResponse = {
  canEdit: boolean;
  notice: string | null;
  category: { id: string; name: string };
  summary: Summary;
  models: ModelNode[];
  directColors: ColorNode[];
};

type MovementRow = {
  id: string;
  action: "IN" | "OUT" | "SET";
  quantity: number;
  delta: number;
  balanceAfter: number;
  reason: string;
  performedByName: string;
  createdAt: string;
};

type DeleteTarget = { kind: "model" | "color" | "height"; id: string; name: string };

const DIRECT = "direct";

async function requestCatalog(input: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: string;
}): Promise<CatalogResponse> {
  const res = await fetch(`/api/inventory/bmma${input.query ?? ""}`, {
    method: input.method,
    credentials: "include",
    headers: input.body ? { "Content-Type": "application/json" } : undefined,
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
  const json = (await res.json()) as {
    success: boolean;
    data?: CatalogResponse;
    error?: { message?: string };
  };
  if (!json.success || !json.data) throw new Error(json.error?.message ?? "שגיאה בשמירה");
  return json.data;
}

function active<T extends { archivedAt: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => !row.archivedAt);
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

function stockTone(height: HeightNode): string {
  if (height.quantity === 0) return "bg-red-50 text-red-700";
  if (height.minQuantity > 0 && height.quantity <= height.minQuantity) return "bg-amber-50 text-amber-800";
  return "bg-emerald-50 text-emerald-800";
}

const ACTION_LABEL = { IN: "הוספה", OUT: "הפחתה", SET: "תיקון", COUNT: "ספירת מלאי" } as const;

export function BmmaCatalogScreen() {
  const [category, setCategory] = useState<{ id: string; name: string } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [models, setModels] = useState<ModelNode[]>([]);
  const [directColors, setDirectColors] = useState<ColorNode[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [scopeId, setScopeId] = useState<string>(DIRECT);
  const [colorId, setColorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [dialog, setDialog] = useState<
    | null
    | { type: "model" }
    | { type: "color" }
    | { type: "height" }
    | { type: "edit-category" }
    | { type: "edit-model"; id: string; name: string }
    | { type: "edit-color"; id: string; name: string; colorCode: string }
    | { type: "edit-height"; id: string; label: string; minQuantity: number }
    | { type: "stock"; id: string; label: string; quantity: number }
    | { type: "history"; id: string; label: string }
  >(null);
  const [draftName, setDraftName] = useState("");
  const [draftCode, setDraftCode] = useState("");
  const [draftMin, setDraftMin] = useState("0");
  const [stockAction, setStockAction] = useState<"IN" | "OUT" | "SET">("IN");
  const [stockQty, setStockQty] = useState("");
  const [stockReason, setStockReason] = useState("");
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const apply = useCallback((data: CatalogResponse) => {
    setCategory(data.category);
    setSummary(data.summary);
    setModels(data.models);
    setDirectColors(data.directColors);
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

  const activeModels = useMemo(() => active(models), [models]);
  const scopeColors = useMemo(() => {
    if (scopeId === DIRECT) return active(directColors);
    return active(models.find((model) => model.id === scopeId)?.colors ?? []);
  }, [scopeId, directColors, models]);
  const selectedColor = scopeColors.find((color) => color.id === colorId) ?? null;
  const activeHeights = selectedColor ? active(selectedColor.heights) : [];

  useEffect(() => {
    if (scopeId !== DIRECT && !activeModels.some((model) => model.id === scopeId)) setScopeId(DIRECT);
  }, [scopeId, activeModels]);

  useEffect(() => {
    if (!colorId || !scopeColors.some((color) => color.id === colorId)) setColorId(scopeColors[0]?.id ?? null);
  }, [colorId, scopeColors]);

  const modelIdForScope = scopeId === DIRECT ? null : scopeId;

  function openAdd(type: "model" | "color" | "height") {
    setDraftName("");
    setDraftCode("");
    setDraftMin("0");
    setDialog({ type });
  }

  async function submitDialog() {
    if (!dialog) return;
    const name = draftName.trim();
    let ok = false;
    if (dialog.type === "model") ok = await run(() => requestCatalog({ method: "POST", body: { kind: "model", name } }));
    if (dialog.type === "color") {
      ok = await run(() =>
        requestCatalog({ method: "POST", body: { kind: "color", name, colorCode: draftCode, modelId: modelIdForScope } }),
      );
    }
    if (dialog.type === "height" && selectedColor) {
      ok = await run(() =>
        requestCatalog({
          method: "POST",
          body: { kind: "height", colorId: selectedColor.id, label: name, minQuantity: Number(draftMin) },
        }),
      );
    }
    if (dialog.type === "edit-category") ok = await run(() => requestCatalog({ method: "PATCH", body: { kind: "category", name } }));
    if (dialog.type === "edit-model") {
      ok = await run(() => requestCatalog({ method: "PATCH", body: { kind: "model", id: dialog.id, name } }));
    }
    if (dialog.type === "edit-color") {
      ok = await run(() =>
        requestCatalog({ method: "PATCH", body: { kind: "color", id: dialog.id, name, colorCode: draftCode } }),
      );
    }
    if (dialog.type === "edit-height") {
      ok = await run(() =>
        requestCatalog({
          method: "PATCH",
          body: { kind: "height", id: dialog.id, label: name, minQuantity: Number(draftMin) },
        }),
      );
    }
    if (dialog.type === "stock") {
      ok = await run(() =>
        requestCatalog({
          method: "POST",
          body: {
            kind: "stock",
            heightId: dialog.id,
            action: stockAction,
            quantity: Number(stockQty),
            reason: stockReason,
          },
        }),
      );
    }
    if (ok) setDialog(null);
  }

  async function reorder(kind: "model" | "color" | "height", ids: string[], id: string, direction: -1 | 1) {
    const orderedIds = moveId(ids, id, direction);
    if (!orderedIds) return;
    await run(() =>
      requestCatalog({
        method: "PATCH",
        body: {
          kind,
          orderedIds,
          modelId: kind === "color" ? modelIdForScope : undefined,
          colorId: kind === "height" ? selectedColor?.id : undefined,
        },
      }),
    );
  }

  async function openHistory(height: HeightNode) {
    setDialog({ type: "history", id: height.id, label: height.label });
    setMovements([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/inventory/bmma?heightId=${encodeURIComponent(height.id)}`, { credentials: "include" });
      const json = (await res.json()) as { success: boolean; data?: { movements: MovementRow[] }; error?: { message?: string } };
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "שגיאה בטעינת ההיסטוריה");
      setMovements(json.data.movements);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת ההיסטוריה");
    } finally {
      setHistoryLoading(false);
    }
  }

  const archivedItems = useMemo(() => {
    const rows: Array<{ kind: "model" | "color" | "height"; id: string; name: string }> = [];
    for (const model of models) {
      if (model.archivedAt) rows.push({ kind: "model", id: model.id, name: model.name });
      for (const color of model.colors) {
        if (color.archivedAt) rows.push({ kind: "color", id: color.id, name: `${model.name} / ${color.name}` });
        for (const height of color.heights) {
          if (height.archivedAt) rows.push({ kind: "height", id: height.id, name: `${color.name} / ${height.label}` });
        }
      }
    }
    for (const color of directColors) {
      if (color.archivedAt) rows.push({ kind: "color", id: color.id, name: color.name });
      for (const height of color.heights) {
        if (height.archivedAt) rows.push({ kind: "height", id: height.id, name: `${color.name} / ${height.label}` });
      }
    }
    return rows;
  }, [models, directColors]);

  return (
    <InventoryModule type="BMMA" title={category?.name ?? "BMMA"}>
    <>
      <Header
        title={category?.name ?? "BMMA"}
        description="דגמים, צבעים, גבהים וכמויות"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StockButtons type="BMMA" />
            <Link href="/inventory" className="text-sm font-medium text-slate-600 underline-offset-4 hover:text-opal-gold-dark hover:underline">
              חזרה למלאי
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען מלאי BMMA
        </div>
      ) : (
        <div className="space-y-4">
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p>}

          <section className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-opal-gold">קטגוריה</p>
                <div className="mt-1 flex items-center gap-2">
                  {category && <MediaFace kind="category" id={category.id} name={category.name} canEdit={canEdit} />}
                  <h2 className="text-2xl font-bold">{category?.name ?? "BMMA"}</h2>
                  {canEdit && category && (
                    <button
                      type="button"
                      className="rounded-md p-1 text-slate-300 hover:bg-white/10 hover:text-white"
                      aria-label="עריכת שם BMMA"
                      onClick={() => {
                        setDraftName(category.name);
                        setDialog({ type: "edit-category" });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              {canEdit && (
                <Button size="sm" onClick={() => openAdd("model")} disabled={busy}>
                  <Plus className="h-4 w-4" />
                  הוסף דגם
                </Button>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["כמות כוללת", summary?.totalQuantity ?? 0],
                ["צבעים", summary?.colorCount ?? 0],
                ["גבהים", summary?.heightCount ?? 0],
                ["מלאי נמוך", summary?.lowStockCount ?? 0],
                ["אזל", summary?.outOfStockCount ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-white/10 px-3 py-2">
                  <p className="text-xs text-slate-300">{label}</p>
                  <p className="text-xl font-bold">{value}</p>
                </div>
              ))}
            </div>
          </section>

          {activeModels.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-bold text-slate-700">דגמים</h3>
              <div className="flex flex-wrap gap-2">
                <ScopeButton active={scopeId === DIRECT} label="ללא דגם" onClick={() => setScopeId(DIRECT)} />
                {activeModels.map((model) => (
                  <div key={model.id} className="flex items-center gap-1">
                    <MediaFace kind="model" id={model.id} name={model.name} canEdit={canEdit} />
                    <ScopeButton active={scopeId === model.id} label={model.name} onClick={() => setScopeId(model.id)} />
                    {canEdit && (
                      <>
                        <IconButton label="למעלה" onClick={() => void reorder("model", activeModels.map((row) => row.id), model.id, -1)}>
                          <ChevronUp className="h-4 w-4" />
                        </IconButton>
                        <IconButton label="למטה" onClick={() => void reorder("model", activeModels.map((row) => row.id), model.id, 1)}>
                          <ChevronDown className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label="עריכה"
                          onClick={() => {
                            setDraftName(model.name);
                            setDialog({ type: "edit-model", id: model.id, name: model.name });
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton label="מחיקה" onClick={() => setPendingDelete({ kind: "model", id: model.id, name: model.name })}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-700">צבעים</h3>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => openAdd("color")} disabled={busy}>
                    <Plus className="h-4 w-4" />
                    הוסף צבע
                  </Button>
                )}
              </div>
              {scopeColors.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">אין צבעים עדיין</p>
              ) : (
                <ul className="space-y-2">
                  {scopeColors.map((color) => (
                    <li key={color.id}>
                      <div
                        className={cn(
                          "flex items-center gap-2 rounded-xl border px-3 py-2",
                          color.id === colorId ? "border-opal-gold bg-amber-50" : "border-slate-200",
                        )}
                      >
                        <MediaFace kind="color" id={color.id} name={color.name} canEdit={canEdit} />
                        <button type="button" className="min-w-0 flex-1 text-right" onClick={() => setColorId(color.id)}>
                          <span className="flex items-center gap-2 font-medium text-slate-900">
                            <Swatch code={color.colorCode} />
                            {color.name}
                            {color.colorCode && <span className="text-xs text-slate-500">{color.colorCode}</span>}
                          </span>
                        </button>
                        {canEdit && (
                          <div className="flex shrink-0">
                            <IconButton label="למעלה" onClick={() => void reorder("color", scopeColors.map((row) => row.id), color.id, -1)}>
                              <ChevronUp className="h-4 w-4" />
                            </IconButton>
                            <IconButton label="למטה" onClick={() => void reorder("color", scopeColors.map((row) => row.id), color.id, 1)}>
                              <ChevronDown className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                              label="עריכה"
                              onClick={() => {
                                setDraftName(color.name);
                                setDraftCode(color.colorCode);
                                setDialog({ type: "edit-color", id: color.id, name: color.name, colorCode: color.colorCode });
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                            <IconButton label="מחיקה" onClick={() => setPendingDelete({ kind: "color", id: color.id, name: color.name })}>
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-700">
                  גבהים {selectedColor ? `· ${selectedColor.name}` : ""}
                </h3>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => openAdd("height")} disabled={busy || !selectedColor}>
                    <Plus className="h-4 w-4" />
                    הוסף גובה
                  </Button>
                )}
              </div>
              {!selectedColor ? (
                <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">בחרו צבע כדי לנהל גבהים</p>
              ) : activeHeights.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">אין גבהים לצבע זה</p>
              ) : (
                <ul className="space-y-2">
                  {activeHeights.map((height) => (
                    <li key={height.id} className="rounded-xl border border-slate-200 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <MediaFace kind="height" id={height.id} name={height.label} canEdit={canEdit} />
                          <div>
                            <p className="font-medium text-slate-900">{height.label}</p>
                            <p className="text-xs text-slate-500">סף מינימום {height.minQuantity}</p>
                          </div>
                        </div>
                        <span className={cn("rounded-full px-3 py-1 text-sm font-bold", stockTone(height))}>{height.quantity}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" onClick={() => void openHistory(height)}>
                          היסטוריה
                        </Button>
                        {canEdit && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => {
                                setStockAction("IN");
                                setStockQty("");
                                setStockReason("");
                                setDialog({ type: "stock", id: height.id, label: height.label, quantity: height.quantity });
                              }}
                            >
                              עדכן כמות
                            </Button>
                            <IconButton label="למעלה" onClick={() => void reorder("height", activeHeights.map((row) => row.id), height.id, -1)}>
                              <ChevronUp className="h-4 w-4" />
                            </IconButton>
                            <IconButton label="למטה" onClick={() => void reorder("height", activeHeights.map((row) => row.id), height.id, 1)}>
                              <ChevronDown className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                              label="עריכה"
                              onClick={() => {
                                setDraftName(height.label);
                                setDraftMin(String(height.minQuantity));
                                setDialog({ type: "edit-height", id: height.id, label: height.label, minQuantity: height.minQuantity });
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                            <IconButton label="מחיקה" onClick={() => setPendingDelete({ kind: "height", id: height.id, name: height.label })}>
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {archivedItems.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <button type="button" className="flex items-center gap-2 text-sm font-bold text-slate-700" onClick={() => setShowArchive((value) => !value)}>
                <Archive className="h-4 w-4" />
                ארכיון ({archivedItems.length})
              </button>
              {showArchive && (
                <ul className="mt-3 space-y-2">
                  {archivedItems.map((item) => (
                    <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <span>{item.name}</span>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: item.kind, id: item.id, restore: true } }))}
                        >
                          <RotateCcw className="h-4 w-4" />
                          שחזור
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      <Modal
        open={Boolean(dialog && dialog.type !== "history")}
        onClose={() => setDialog(null)}
        title={dialogTitle(dialog)}
        className="max-w-md"
      >
        {dialog?.type === "stock" ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">יתרה נוכחית: {dialog.quantity}</p>
            <div className="grid grid-cols-3 gap-2">
              {(["IN", "OUT", "SET"] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  className={cn(
                    "rounded-lg border px-2 py-2 text-sm",
                    stockAction === action ? "border-opal-gold bg-amber-50 font-bold" : "border-slate-200",
                  )}
                  onClick={() => setStockAction(action)}
                >
                  {ACTION_LABEL[action]}
                </button>
              ))}
            </div>
            <Input inputMode="numeric" placeholder="כמות" value={stockQty} onChange={(event) => setStockQty(event.target.value)} />
            <Input placeholder="סיבה" value={stockReason} onChange={(event) => setStockReason(event.target.value)} />
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder={dialog?.type === "height" || dialog?.type === "edit-height" ? "גובה" : "שם"}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
            />
            {(dialog?.type === "color" || dialog?.type === "edit-color") && (
              <Input placeholder="קוד צבע" value={draftCode} onChange={(event) => setDraftCode(event.target.value)} />
            )}
            {(dialog?.type === "height" || dialog?.type === "edit-height") && (
              <Input inputMode="numeric" placeholder="סף מינימום" value={draftMin} onChange={(event) => setDraftMin(event.target.value)} />
            )}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDialog(null)}>
            ביטול
          </Button>
          <Button onClick={() => void submitDialog()} disabled={busy}>
            שמירה
          </Button>
        </div>
      </Modal>

      <Modal open={dialog?.type === "history"} onClose={() => setDialog(null)} title={dialog?.type === "history" ? `היסטוריה · ${dialog.label}` : ""} className="max-w-lg">
        {historyLoading ? (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            טוען
          </div>
        ) : movements.length === 0 ? (
          <p className="text-sm text-slate-500">אין תנועות</p>
        ) : (
          <ul className="space-y-2">
            {movements.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{ACTION_LABEL[row.action]} · {row.quantity}</span>
                  <span>יתרה {row.balanceAfter}</span>
                </div>
                <p className="text-slate-600">{row.reason}</p>
                <p className="text-xs text-slate-400">
                  {row.performedByName} · {new Date(row.createdAt).toLocaleString("he-IL")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} title="אישור מחיקה" className="max-w-md">
        <p className="text-sm text-slate-600">
          למחוק את {pendingDelete?.name}? רשומה עם תנועות מלאי תועבר לארכיון. דגם או צבע עם פריטים פעילים לא יימחקו.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPendingDelete(null)}>
            ביטול
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (!pendingDelete) return;
              void run(() => requestCatalog({ method: "DELETE", query: `?kind=${pendingDelete.kind}&id=${encodeURIComponent(pendingDelete.id)}` })).then(
                (ok) => {
                  if (ok) setPendingDelete(null);
                },
              );
            }}
          >
            מחק
          </Button>
        </div>
      </Modal>
    </>
    </InventoryModule>
  );
}

function dialogTitle(dialog: { type: string } | null): string {
  switch (dialog?.type) {
    case "model":
      return "הוספת דגם";
    case "color":
      return "הוספת צבע";
    case "height":
      return "הוספת גובה";
    case "edit-category":
      return "עריכת שם BMMA";
    case "edit-model":
      return "עריכת דגם";
    case "edit-color":
      return "עריכת צבע";
    case "edit-height":
      return "עריכת גובה";
    case "stock":
      return "עדכון כמות";
    default:
      return "";
  }
}

function ScopeButton({ active: isActive, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium",
        isActive ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700",
      )}
    >
      {label}
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800" onClick={onClick}>
      {children}
    </button>
  );
}

function Swatch({ code }: { code: string }) {
  const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(code) ? code : "#e2e8f0";
  return <span className="inline-block h-3.5 w-3.5 rounded-full border border-slate-200" style={{ backgroundColor: color }} />;
}
