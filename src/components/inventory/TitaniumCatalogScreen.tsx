"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  History,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { InventoryModule, StockButtons } from "@/components/inventory/InventoryStockTools";
import { MediaFace } from "@/components/inventory/InventoryMedia";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TITANIUM_HUB_LAST_INDEX } from "@/lib/inventory/titanium-constants";
import type {
  TitaniumCatalogKind,
  TitaniumModelNode,
  TitaniumRadiusNode,
  TitaniumSizeNode,
} from "@/lib/inventory/titanium-catalog";
import { titaniumQuantityTotal, toggleTitaniumId } from "@/lib/inventory/titanium-tree";
import { cn } from "@/lib/utils";

type Category = {
  id: string;
  name: string;
  details: string;
  hubSortOrder: number;
  archivedAt: string | null;
};

type CatalogResponse = {
  canEdit: boolean;
  notice: string | null;
  category: Category;
  models: TitaniumModelNode[];
};

type PendingDelete = {
  kind: Exclude<TitaniumCatalogKind, "category"> | "category";
  id: string;
  name: string;
};

type Movement = {
  id: string;
  action: string;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  reason: string;
  userName: string;
  createdAt: string;
};

const ACTION_LABEL: Record<string, string> = {
  IN: "הוספה",
  OUT: "הפחתה",
  SET: "עריכה",
  COUNT: "ספירה",
};

async function requestCatalog(input: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: string;
}): Promise<CatalogResponse> {
  const res = await fetch(`/api/inventory/titanium${input.query ?? ""}`, {
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

function moveId(ids: string[], id: string, direction: -1 | 1): string[] | null {
  const index = ids.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return null;
  const copy = [...ids];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

function active<T extends { archivedAt: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => !row.archivedAt);
}

function formatQty(value: number | null): string {
  return value === null ? "—" : String(value);
}

function modelSizes(model: TitaniumModelNode): TitaniumSizeNode[] {
  return active(model.radii).flatMap((radius) => active(radius.sizes));
}

function EditableName({
  value,
  canEdit,
  onSave,
  onOpen,
  className,
}: {
  value: string;
  canEdit: boolean;
  onSave: (next: string) => void;
  onOpen?: () => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (!editing) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        {onOpen ? (
          <button type="button" className={className} onClick={onOpen}>{value}</button>
        ) : (
          <span className={className}>{value}</span>
        )}
        {canEdit && (
          <button
            type="button"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
            aria-label={`עריכת ${value}`}
            onClick={(event) => {
              event.stopPropagation();
              setEditing(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      aria-label="שם"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        setEditing(false);
        if (next && next !== value) onSave(next);
        else setDraft(value);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="min-w-0 rounded-lg border border-opal-gold bg-white px-2 py-1 text-slate-900 outline-none"
    />
  );
}

export function TitaniumCatalogScreen() {
  const [category, setCategory] = useState<Category | null>(null);
  const [models, setModels] = useState<TitaniumModelNode[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [openModels, setOpenModels] = useState<string[]>([]);
  const [openRadii, setOpenRadii] = useState<string[]>([]);
  const [arrange, setArrange] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [detailsDraft, setDetailsDraft] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newRadius, setNewRadius] = useState<Record<string, string>>({});
  const [newSizes, setNewSizes] = useState<Record<string, string>>({});
  const [countDrafts, setCountDrafts] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<{ title: string; rows: Movement[] } | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const apply = useCallback((data: CatalogResponse) => {
    setCategory(data.category);
    setModels(data.models);
    setCanEdit(data.canEdit);
    setDetailsDraft(data.category.details);
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

  const visibleModels = active(models);
  const archivedModels = models.filter((model) => model.archivedAt);
  const archivedRadii = models.flatMap((model) =>
    model.radii.filter((radius) => radius.archivedAt).map((radius) => ({ ...radius, modelName: model.name })),
  );
  const archivedSizes = models.flatMap((model) =>
    model.radii.flatMap((radius) =>
      radius.sizes.filter((size) => size.archivedAt).map((size) => ({ ...size, modelName: model.name, radiusName: radius.name })),
    ),
  );
  const allSizes = visibleModels.flatMap(modelSizes);
  const totalUnits = titaniumQuantityTotal(allSizes);
  const radiusCount = visibleModels.reduce((sum, model) => sum + active(model.radii).length, 0);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    const ok = await run(() =>
      requestCatalog({
        method: "DELETE",
        query: `?kind=${target.kind}&id=${encodeURIComponent(target.id)}`,
      }),
    );
    if (ok) setPendingDelete(null);
  };

  const adjust = (id: string, body: { delta?: number; quantity?: number; count?: boolean }) => {
    void run(() => requestCatalog({ method: "POST", body: { kind: "stock", id, ...body } }));
  };

  const openHistory = async (size: TitaniumSizeNode) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/counts?type=TITANIUM&history=1&itemId=${encodeURIComponent(size.id)}`, { credentials: "include" });
      const json = (await res.json()) as { success: boolean; data?: { movements?: Movement[] }; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? "שגיאה בטעינת היסטוריה");
      setHistory({ title: size.label, rows: json.data?.movements ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת היסטוריה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <InventoryModule type="TITANIUM" title="מלאי טיטניום">
      <>
        <Header title={category?.name ?? "מלאי טיטניום"} description="דגם, רדיוס, גודל וכמות" actions={<StockButtons type="TITANIUM" />} />

        {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>}
        {!canEdit && !loading && (
          <p className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">צפייה בלבד. עריכת המלאי זמינה למנהל. ספירת מלאי נשארת בכפתור למעלה.</p>
        )}

        {loading || !category ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-opal-gold" />
          </div>
        ) : (
          <div className="space-y-3">
            <section className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <MediaFace kind="category" id={category.id} name={category.name} canEdit={canEdit && !category.archivedAt} />
                <EditableName
                  value={category.name}
                  canEdit={canEdit && !category.archivedAt}
                  onSave={(name) => void run(() => requestCatalog({ method: "PATCH", body: { kind: "category", name } }))}
                  className="text-base font-bold text-slate-900"
                />
                <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <Stat label="דגמים" value={String(visibleModels.length)} />
                  <Stat label="רדיוסים" value={String(radiusCount)} />
                  <Stat label="גדלים" value={String(allSizes.length)} />
                  <Stat label="כמות" value={formatQty(totalUnits)} />
                </dl>
                {canEdit && !category.archivedAt && (
                  <Button type="button" size="sm" variant={arrange ? "default" : "outline"} className="ms-auto" onClick={() => setArrange((value) => !value)}>
                    {arrange ? "סיום עריכה" : "מצב עריכה"}
                  </Button>
                )}
                {canEdit && category.archivedAt && (
                  <Button type="button" size="sm" variant="outline" className="ms-auto" disabled={busy} onClick={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: "category", restore: true } }))}>
                    <RotateCcw className="h-4 w-4" />
                    שחזור קטגוריה
                  </Button>
                )}
              </div>
              {arrange && canEdit && !category.archivedAt && (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  <label className="block text-xs font-medium text-slate-600">פרטי הקטגוריה</label>
                  <textarea
                    value={detailsDraft}
                    onChange={(event) => setDetailsDraft(event.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  {detailsDraft !== category.details && (
                    <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: "category", details: detailsDraft } }))}>
                      שמירת פרטים
                    </Button>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span>מיקום במסך המלאי: {category.hubSortOrder + 1} מתוך {TITANIUM_HUB_LAST_INDEX + 1}</span>
                    <Button type="button" size="sm" variant="outline" disabled={busy || category.hubSortOrder === 0} aria-label="הזז קדימה" onClick={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: "category", hubSortOrder: category.hubSortOrder - 1 } }))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={busy || category.hubSortOrder >= TITANIUM_HUB_LAST_INDEX} aria-label="הזז אחורה" onClick={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: "category", hubSortOrder: category.hubSortOrder + 1 } }))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="text-red-600" disabled={busy} onClick={() => setPendingDelete({ kind: "category", id: category.id, name: category.name })}>
                      ארכוב קטגוריה
                    </Button>
                  </div>
                </div>
              )}
              {category.archivedAt && <p className="mt-2 text-sm text-amber-800">הקטגוריה בארכיון. הנתונים נשמרו.</p>}
            </section>

            {!category.archivedAt && (
              <div className="space-y-2">
                {visibleModels.map((model, index) => {
                  const radii = active(model.radii);
                  const open = openModels.includes(model.id);
                  const units = titaniumQuantityTotal(modelSizes(model));
                  return (
                    <article key={model.id} className={cn("rounded-xl border bg-white shadow-sm", open ? "border-opal-gold" : "border-slate-200")}>
                      <div className="flex items-center gap-2 px-3 py-2">
                        <MediaFace kind="model" id={model.id} name={model.name} canEdit={canEdit} />
                        <div className="min-w-0 flex-1">
                          <EditableName
                            value={model.name}
                            canEdit={canEdit}
                            onOpen={() => setOpenModels((current) => toggleTitaniumId(current, model.id))}
                            onSave={(name) => void run(() => requestCatalog({ method: "PATCH", body: { kind: "model", id: model.id, name } }))}
                            className="truncate text-base font-bold text-slate-900"
                          />
                          <button type="button" className="flex w-full items-center gap-2 text-right text-xs text-slate-500" aria-expanded={open} onClick={() => setOpenModels((current) => toggleTitaniumId(current, model.id))}>
                            <span className="min-w-0 flex-1">{radii.length} רדיוסים · {formatQty(units)} יח׳</span>
                            <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300", open && "rotate-180")} />
                          </button>
                        </div>
                        {canEdit && (
                          <div className="flex shrink-0">
                            {arrange && (
                              <>
                                <IconButton label="הזז למעלה" disabled={busy || index === 0} onClick={() => { const ids = moveId(visibleModels.map((item) => item.id), model.id, -1); if (ids) void run(() => requestCatalog({ method: "PATCH", body: { kind: "model", orderedIds: ids } })); }}><ChevronUp className="h-4 w-4" /></IconButton>
                                <IconButton label="הזז למטה" disabled={busy || index === visibleModels.length - 1} onClick={() => { const ids = moveId(visibleModels.map((item) => item.id), model.id, 1); if (ids) void run(() => requestCatalog({ method: "PATCH", body: { kind: "model", orderedIds: ids } })); }}><ChevronDown className="h-4 w-4" /></IconButton>
                              </>
                            )}
                            <IconButton label="מחיקה" disabled={busy} onClick={() => setPendingDelete({ kind: "model", id: model.id, name: model.name })}><Trash2 className="h-4 w-4" /></IconButton>
                          </div>
                        )}
                      </div>
                      <Collapse open={open}>
                        <div className="space-y-2 border-t border-slate-100 px-3 py-2 ps-3 sm:ps-6">
                          {radii.length === 0 && <p className="text-sm text-slate-500">אין רדיוסים לדגם זה</p>}
                          {radii.map((radius, radiusIndex) => (
                            <RadiusBranch
                              key={radius.id}
                              radius={radius}
                              open={openRadii.includes(radius.id)}
                              index={radiusIndex}
                              total={radii.length}
                              canEdit={canEdit}
                              arrange={arrange}
                              busy={busy}
                              sizeDraft={newSizes[radius.id] ?? ""}
                              countDrafts={countDrafts}
                              onToggle={() => setOpenRadii((current) => toggleTitaniumId(current, radius.id))}
                              onRename={(name) => void run(() => requestCatalog({ method: "PATCH", body: { kind: "radius", id: radius.id, name } }))}
                              onMove={(direction) => { const ids = moveId(radii.map((item) => item.id), radius.id, direction); if (ids) void run(() => requestCatalog({ method: "PATCH", body: { kind: "radius", modelId: model.id, orderedIds: ids } })); }}
                              onDelete={() => setPendingDelete({ kind: "radius", id: radius.id, name: radius.name })}
                              onSizeDraft={(value) => setNewSizes((current) => ({ ...current, [radius.id]: value }))}
                              onAddSize={() => {
                                const name = (newSizes[radius.id] ?? "").trim();
                                if (!name) return;
                                void run(() => requestCatalog({ method: "POST", body: { kind: "size", radiusId: radius.id, name } })).then((ok) => {
                                  if (ok) setNewSizes((current) => ({ ...current, [radius.id]: "" }));
                                });
                              }}
                              onRenameSize={(size, label) => void run(() => requestCatalog({ method: "PATCH", body: { kind: "size", id: size.id, name: label } }))}
                              onMoveSize={(size, direction) => { const ids = moveId(active(radius.sizes).map((item) => item.id), size.id, direction); if (ids) void run(() => requestCatalog({ method: "PATCH", body: { kind: "size", radiusId: radius.id, orderedIds: ids } })); }}
                              onDeleteSize={(size) => setPendingDelete({ kind: "size", id: size.id, name: size.label })}
                              onAdjust={adjust}
                              onCountDraft={(id, value) => setCountDrafts((current) => ({ ...current, [id]: value }))}
                              onHistory={(size) => void openHistory(size)}
                            />
                          ))}
                          {canEdit && (
                            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => {
                              event.preventDefault();
                              const name = (newRadius[model.id] ?? "").trim();
                              if (!name) return;
                              void run(() => requestCatalog({ method: "POST", body: { kind: "radius", modelId: model.id, name } })).then((ok) => {
                                if (ok) setNewRadius((current) => ({ ...current, [model.id]: "" }));
                              });
                            }}>
                              <input value={newRadius[model.id] ?? ""} onChange={(event) => setNewRadius((current) => ({ ...current, [model.id]: event.target.value }))} placeholder="רדיוס חדש" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                              <Button type="submit" size="sm" disabled={busy || !(newRadius[model.id] ?? "").trim()}><Plus className="h-4 w-4" />הוסף רדיוס</Button>
                            </form>
                          )}
                        </div>
                      </Collapse>
                    </article>
                  );
                })}
                {canEdit && (
                  <form className="flex flex-col gap-2 rounded-xl border border-dashed border-opal-gold/50 bg-white px-3 py-2 sm:flex-row" onSubmit={(event) => {
                    event.preventDefault();
                    const name = newModel.trim();
                    if (!name) return;
                    void run(() => requestCatalog({ method: "POST", body: { kind: "model", name } })).then((ok) => { if (ok) setNewModel(""); });
                  }}>
                    <input value={newModel} onChange={(event) => setNewModel(event.target.value)} placeholder="דגם חדש" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <Button type="submit" size="sm" disabled={busy || !newModel.trim()}><Plus className="h-4 w-4" />הוסף דגם</Button>
                  </form>
                )}
              </div>
            )}

            {canEdit && (archivedModels.length > 0 || archivedRadii.length > 0 || archivedSizes.length > 0) && (
              <section className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <button type="button" className="text-sm font-semibold text-slate-700" onClick={() => setShowArchive((value) => !value)}>
                  ארכיון ({archivedModels.length + archivedRadii.length + archivedSizes.length})
                </button>
                {showArchive && (
                  <ul className="mt-2 space-y-2 text-sm">
                    {archivedModels.map((model) => (
                      <ArchiveRow key={model.id} label={`דגם: ${model.name}`} busy={busy} onRestore={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: "model", id: model.id, restore: true } }))} />
                    ))}
                    {archivedRadii.map((radius) => (
                      <ArchiveRow key={radius.id} label={`רדיוס: ${radius.name} (${radius.modelName})`} busy={busy} onRestore={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: "radius", id: radius.id, restore: true } }))} />
                    ))}
                    {archivedSizes.map((size) => (
                      <ArchiveRow key={size.id} label={`גודל: ${size.label} (${size.modelName} / ${size.radiusName}) · ${formatQty(size.quantity)}`} busy={busy} onRestore={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: "size", id: size.id, restore: true } }))} />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}

        <Modal open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} title="אישור מחיקה" className="max-w-md">
          <div className="space-y-4">
            <p className="text-sm text-slate-700">למחוק את «{pendingDelete?.name}»? רמה עם פריטים מקושרים, או גודל עם מלאי או היסטוריה, תועבר לארכיון והכמות תישמר.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPendingDelete(null)} disabled={busy}>ביטול</Button>
              <Button type="button" variant="danger" onClick={() => void confirmDelete()} disabled={busy}>אישור</Button>
            </div>
          </div>
        </Modal>

        <Modal open={Boolean(history)} onClose={() => setHistory(null)} title={`היסטוריית מלאי — ${history?.title ?? ""}`} className="max-w-lg">
          <div className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {history && history.rows.length === 0 && <p className="text-slate-500">אין תנועות לגודל זה.</p>}
            {history?.rows.map((row) => (
              <div key={row.id} className="rounded-lg border border-slate-100 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{ACTION_LABEL[row.action] ?? row.action}</span>
                  <span className="text-xs text-slate-500">{new Date(row.createdAt).toLocaleString("he-IL")}</span>
                </div>
                <p className="text-slate-600">{row.quantityBefore} ← {row.quantityAfter} ({row.quantityChange > 0 ? `+${row.quantityChange}` : row.quantityChange})</p>
                <p className="text-xs text-slate-500">{row.userName}{row.reason ? ` · ${row.reason}` : ""}</p>
              </div>
            ))}
          </div>
        </Modal>
      </>
    </InventoryModule>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><dt className="inline">{label} </dt><dd className="inline font-bold text-slate-900">{value}</dd></div>;
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40">
      {children}
    </button>
  );
}

function ArchiveRow({ label, busy, onRestore }: { label: string; busy: boolean; onRestore: () => void }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRestore}>שחזור</Button>
    </li>
  );
}

function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => { if (open) setMounted(true); }, [open]);
  return (
    <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")} onTransitionEnd={(event) => { if (event.target === event.currentTarget && !open) setMounted(false); }}>
      <div className="min-h-0 overflow-hidden">{mounted ? children : null}</div>
    </div>
  );
}

function RadiusBranch({
  radius,
  open,
  index,
  total,
  canEdit,
  arrange,
  busy,
  sizeDraft,
  countDrafts,
  onToggle,
  onRename,
  onMove,
  onDelete,
  onSizeDraft,
  onAddSize,
  onRenameSize,
  onMoveSize,
  onDeleteSize,
  onAdjust,
  onCountDraft,
  onHistory,
}: {
  radius: TitaniumRadiusNode;
  open: boolean;
  index: number;
  total: number;
  canEdit: boolean;
  arrange: boolean;
  busy: boolean;
  sizeDraft: string;
  countDrafts: Record<string, string>;
  onToggle: () => void;
  onRename: (name: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onSizeDraft: (value: string) => void;
  onAddSize: () => void;
  onRenameSize: (size: TitaniumSizeNode, label: string) => void;
  onMoveSize: (size: TitaniumSizeNode, direction: -1 | 1) => void;
  onDeleteSize: (size: TitaniumSizeNode) => void;
  onAdjust: (id: string, body: { delta?: number; quantity?: number; count?: boolean }) => void;
  onCountDraft: (id: string, value: string) => void;
  onHistory: (size: TitaniumSizeNode) => void;
}) {
  const sizes = active(radius.sizes);
  const units = titaniumQuantityTotal(sizes);
  return (
    <div className={cn("rounded-lg border bg-slate-50", open ? "border-opal-gold/60" : "border-slate-200")}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <MediaFace kind="radius" id={radius.id} name={radius.name} canEdit={canEdit} />
        <div className="min-w-0 flex-1">
          <EditableName value={radius.name} canEdit={canEdit} onOpen={onToggle} onSave={onRename} className="font-semibold text-slate-900" />
          <button type="button" className="flex w-full items-center gap-2 text-right text-xs text-slate-500" aria-expanded={open} onClick={onToggle}>
            <span className="min-w-0 flex-1">{sizes.length} גדלים · {formatQty(units)} יח׳</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300", open && "rotate-180")} />
          </button>
        </div>
        {canEdit && (
          <div className="flex shrink-0">
            {arrange && (
              <>
                <IconButton label="הזז למעלה" disabled={busy || index === 0} onClick={() => onMove(-1)}><ChevronUp className="h-4 w-4" /></IconButton>
                <IconButton label="הזז למטה" disabled={busy || index === total - 1} onClick={() => onMove(1)}><ChevronDown className="h-4 w-4" /></IconButton>
              </>
            )}
            <IconButton label="מחיקה" disabled={busy} onClick={onDelete}><Trash2 className="h-4 w-4" /></IconButton>
          </div>
        )}
      </div>
      <Collapse open={open}>
        <div className="space-y-2 border-t border-slate-200 px-2 py-2">
          {sizes.length === 0 && <p className="text-sm text-slate-500">אין גדלים</p>}
          <div className="space-y-2">
            {sizes.map((size, sizeIndex) => (
              <div key={size.id} className="rounded-lg border border-slate-200 bg-white p-2">
                <SizeControls
                  size={size}
                  sizeIndex={sizeIndex}
                  total={sizes.length}
                  canEdit={canEdit}
                  arrange={arrange}
                  busy={busy}
                  draft={countDrafts[size.id] ?? ""}
                  onRename={(label) => onRenameSize(size, label)}
                  onMove={(direction) => onMoveSize(size, direction)}
                  onDelete={() => onDeleteSize(size)}
                  onAdjust={onAdjust}
                  onDraft={(value) => onCountDraft(size.id, value)}
                  onHistory={() => onHistory(size)}
                />
              </div>
            ))}
          </div>
          {canEdit && (
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); onAddSize(); }}>
              <input value={sizeDraft} onChange={(event) => onSizeDraft(event.target.value)} placeholder="גודל חדש" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              <Button type="submit" size="sm" variant="outline" disabled={busy || !sizeDraft.trim()}><Plus className="h-4 w-4" />הוסף גודל</Button>
            </form>
          )}
        </div>
      </Collapse>
    </div>
  );
}

type SizeControlProps = {
  size: TitaniumSizeNode;
  sizeIndex: number;
  total: number;
  canEdit: boolean;
  arrange: boolean;
  busy: boolean;
  draft: string;
  onRename: (label: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onAdjust: (id: string, body: { delta?: number; quantity?: number; count?: boolean }) => void;
  onDraft: (value: string) => void;
  onHistory: () => void;
};

function SizeControls({ size, sizeIndex, total, canEdit, arrange, busy, draft, onRename, onMove, onDelete, onAdjust, onDraft, onHistory }: SizeControlProps) {
  const parsed = Number(draft);
  const exact = draft.trim() !== "" && Number.isInteger(parsed) && parsed >= 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MediaFace kind="size" id={size.id} name={size.label} canEdit={canEdit} />
      <EditableName value={size.label} canEdit={canEdit} onSave={onRename} className="text-sm font-medium text-slate-800" />
      <span className={cn("min-w-8 text-center text-sm font-bold", size.quantity === 0 ? "text-red-600" : "text-slate-900")}>{formatQty(size.quantity)}</span>
      {canEdit && (
        <>
          <button type="button" aria-label="הוספה" disabled={busy} className="rounded-lg bg-opal-gold px-2 py-1 text-xs font-medium text-white disabled:opacity-50" onClick={() => onAdjust(size.id, { delta: 1 })}><Plus className="inline h-3.5 w-3.5" /> הוספה</button>
          <button type="button" aria-label="הפחתה" disabled={busy || (size.quantity ?? 0) <= 0} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-50" onClick={() => onAdjust(size.id, { delta: -1 })}><Minus className="inline h-3.5 w-3.5" /> הפחתה</button>
          <input inputMode="numeric" value={draft} onChange={(event) => onDraft(event.target.value)} aria-label={`כמות ${size.label}`} placeholder="כמות" className="h-8 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm" />
          <button type="button" disabled={busy || !exact} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-50" onClick={() => onAdjust(size.id, { quantity: parsed })}>עריכה</button>
          <button type="button" disabled={busy || !exact} className="rounded-lg border border-opal-gold bg-opal-gold-light px-2 py-1 text-xs font-medium text-slate-900 disabled:opacity-50" onClick={() => onAdjust(size.id, { quantity: parsed, count: true })}>ספירה</button>
        </>
      )}
      <button type="button" aria-label="היסטוריה" className="rounded-md p-1.5 text-slate-500 hover:bg-white" onClick={onHistory}><History className="h-4 w-4" /></button>
      {canEdit && arrange && (
        <>
          <IconButton label="הזז למעלה" disabled={busy || sizeIndex === 0} onClick={() => onMove(-1)}><ChevronUp className="h-4 w-4" /></IconButton>
          <IconButton label="הזז למטה" disabled={busy || sizeIndex === total - 1} onClick={() => onMove(1)}><ChevronDown className="h-4 w-4" /></IconButton>
        </>
      )}
      {canEdit && <IconButton label="מחיקה" disabled={busy} onClick={onDelete}><Trash2 className="h-4 w-4" /></IconButton>}
    </div>
  );
}
