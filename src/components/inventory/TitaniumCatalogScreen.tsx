"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TITANIUM_HUB_LAST_INDEX } from "@/lib/inventory/titanium-constants";
import type {
  TitaniumCatalogKind,
  TitaniumModelNode,
  TitaniumRadiusNode,
  TitaniumSizeNode,
} from "@/lib/inventory/titanium-catalog";
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

function EditableName({
  value,
  canEdit,
  onSave,
  className,
  inputClassName,
}: {
  value: string;
  canEdit: boolean;
  onSave: (next: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (!editing) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <span className={className}>{value}</span>
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
      className={cn("min-w-0 rounded-lg border border-opal-gold bg-white px-2 py-1 text-slate-900 outline-none", inputClassName)}
    />
  );
}

export function TitaniumCatalogScreen() {
  const [category, setCategory] = useState<Category | null>(null);
  const [models, setModels] = useState<TitaniumModelNode[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openRadiusId, setOpenRadiusId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [detailsDraft, setDetailsDraft] = useState("");
  const [showNewModel, setShowNewModel] = useState(false);
  const [newModel, setNewModel] = useState("");
  const [newRadius, setNewRadius] = useState("");
  const [newSizes, setNewSizes] = useState<Record<string, string>>({});
  const [showArchive, setShowArchive] = useState(false);

  const apply = useCallback((data: CatalogResponse, preferId?: string) => {
    setCategory(data.category);
    setModels(data.models);
    setCanEdit(data.canEdit);
    setDetailsDraft(data.category.details);
    if (data.notice) setNotice(data.notice);
    setSelectedId((current) => {
      const activeModels = data.models.filter((model) => !model.archivedAt);
      const wanted = preferId ?? current;
      if (wanted && activeModels.some((model) => model.id === wanted)) return wanted;
      return activeModels[0]?.id ?? null;
    });
  }, []);

  const run = useCallback(
    async (action: () => Promise<CatalogResponse>, preferId?: string) => {
      setBusy(true);
      setError(null);
      try {
        apply(await action(), preferId);
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
  const selected = visibleModels.find((model) => model.id === selectedId) ?? null;
  const visibleRadii = selected ? active(selected.radii) : [];
  const archivedModels = models.filter((model) => model.archivedAt);
  const archivedRadii = models.flatMap((model) =>
    model.radii.filter((radius) => radius.archivedAt).map((radius) => ({ ...radius, modelName: model.name })),
  );

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

  return (
    <>
      <Header title={category?.name ?? "מלאי טיטניום"} description="דגמים, רדיוסים וגדלים" />

      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</p>}
      {!canEdit && !loading && (
        <p className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">צפייה בלבד. עריכה זמינה למנהל.</p>
      )}

      {loading || !category ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-opal-gold" />
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">קטגוריה</p>
                <EditableName
                  value={category.name}
                  canEdit={canEdit && !category.archivedAt}
                  onSave={(name) => void run(() => requestCatalog({ method: "PATCH", body: { kind: "category", name } }))}
                  className="text-xl font-bold text-slate-900"
                  inputClassName="text-xl font-bold"
                />
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  {category.archivedAt ? (
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: "category", restore: true } }))}>
                      <RotateCcw className="h-4 w-4" />
                      שחזור קטגוריה
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="outline" className="text-red-600" disabled={busy} onClick={() => setPendingDelete({ kind: "category", id: category.id, name: category.name })}>
                      <Trash2 className="h-4 w-4" />
                      ארכוב
                    </Button>
                  )}
                </div>
              )}
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">פרטי הקטגוריה</label>
            <textarea
              value={detailsDraft}
              disabled={!canEdit || Boolean(category.archivedAt)}
              onChange={(event) => setDetailsDraft(event.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
            />
            {canEdit && !category.archivedAt && detailsDraft !== category.details && (
              <Button type="button" size="sm" className="mt-2" disabled={busy} onClick={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: "category", details: detailsDraft } }))}>
                שמירת פרטים
              </Button>
            )}

            {canEdit && !category.archivedAt && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>מיקום במסך המלאי: {category.hubSortOrder + 1} מתוך {TITANIUM_HUB_LAST_INDEX + 1}</span>
                <Button type="button" size="sm" variant="outline" disabled={busy || category.hubSortOrder === 0} aria-label="הזז קדימה" onClick={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: "category", hubSortOrder: category.hubSortOrder - 1 } }))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy || category.hubSortOrder >= TITANIUM_HUB_LAST_INDEX} aria-label="הזז אחורה" onClick={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: "category", hubSortOrder: category.hubSortOrder + 1 } }))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            )}
            {category.archivedAt && <p className="mt-3 text-sm text-amber-800">הקטגוריה בארכיון. הנתונים נשמרו.</p>}
          </section>

          {!category.archivedAt && (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleModels.map((model, index) => (
                  <div key={model.id} className={cn("rounded-2xl border bg-white p-5 shadow-sm", model.id === selected?.id ? "border-opal-gold ring-2 ring-opal-gold/30" : "border-slate-200")}>
                    <div className="flex w-full cursor-pointer items-center gap-3 text-right" onClick={() => { setSelectedId(model.id); setOpenRadiusId(null); }}>
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-opal-gold">{index + 1}</span>
                      <EditableName
                        value={model.name}
                        canEdit={canEdit}
                        onSave={(name) => void run(() => requestCatalog({ method: "PATCH", body: { kind: "model", id: model.id, name } }))}
                        className="text-xl font-bold text-slate-900"
                        inputClassName="text-xl font-bold"
                      />
                    </div>
                    {canEdit && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" disabled={busy || index === 0} aria-label="הזז להתחלה" onClick={() => { const ids = moveId(visibleModels.map((item) => item.id), model.id, -1); if (ids) void run(() => requestCatalog({ method: "PATCH", body: { kind: "model", orderedIds: ids } })); }}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={busy || index === visibleModels.length - 1} aria-label="הזז לסוף" onClick={() => { const ids = moveId(visibleModels.map((item) => item.id), model.id, 1); if (ids) void run(() => requestCatalog({ method: "PATCH", body: { kind: "model", orderedIds: ids } })); }}>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="text-red-600" disabled={busy} onClick={() => setPendingDelete({ kind: "model", id: model.id, name: model.name })}>
                          <Trash2 className="h-4 w-4" />
                          מחיקה
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <div className="rounded-2xl border border-dashed border-opal-gold/50 bg-white p-5">
                    {showNewModel ? (
                      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const name = newModel.trim(); if (!name) return; void run(() => requestCatalog({ method: "POST", body: { kind: "model", name } })).then((ok) => { if (!ok) return; setNewModel(""); setShowNewModel(false); }); }}>
                        <input autoFocus value={newModel} onChange={(event) => setNewModel(event.target.value)} placeholder="שם הדגם" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" disabled={busy || !newModel.trim()}>שמירה</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setShowNewModel(false)}>ביטול</Button>
                        </div>
                      </form>
                    ) : (
                      <button type="button" className="flex min-h-28 w-full items-center justify-center gap-2 text-sm font-medium text-opal-gold-dark" onClick={() => setShowNewModel(true)}>
                        <Plus className="h-4 w-4" />
                        הוסף דגם
                      </button>
                    )}
                  </div>
                )}
              </div>

              {selected && (
                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900">רדיוסים — {selected.name}</h2>
                  {visibleRadii.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">אין רדיוסים לדגם זה</p>}
                  {visibleRadii.map((radius, index) => (
                    <RadiusAccordion
                      key={radius.id}
                      radius={radius}
                      open={openRadiusId === radius.id}
                      index={index}
                      total={visibleRadii.length}
                      canEdit={canEdit}
                      busy={busy}
                      sizeDraft={newSizes[radius.id] ?? ""}
                      onToggle={() => setOpenRadiusId((current) => (current === radius.id ? null : radius.id))}
                      onRename={(name) => void run(() => requestCatalog({ method: "PATCH", body: { kind: "radius", id: radius.id, name } }))}
                      onMove={(direction) => { const ids = moveId(visibleRadii.map((item) => item.id), radius.id, direction); if (ids) void run(() => requestCatalog({ method: "PATCH", body: { kind: "radius", modelId: selected.id, orderedIds: ids } })); }}
                      onDelete={() => setPendingDelete({ kind: "radius", id: radius.id, name: radius.name })}
                      onSizeDraft={(value) => setNewSizes((current) => ({ ...current, [radius.id]: value }))}
                      onAddSize={() => { const name = (newSizes[radius.id] ?? "").trim(); if (!name) return; void run(() => requestCatalog({ method: "POST", body: { kind: "size", radiusId: radius.id, name } })).then((ok) => { if (ok) setNewSizes((current) => ({ ...current, [radius.id]: "" })); }); }}
                      onRenameSize={(size, label) => void run(() => requestCatalog({ method: "PATCH", body: { kind: "size", id: size.id, name: label } }))}
                      onMoveSize={(size, direction) => { const ids = moveId(active(radius.sizes).map((item) => item.id), size.id, direction); if (ids) void run(() => requestCatalog({ method: "PATCH", body: { kind: "size", radiusId: radius.id, orderedIds: ids } })); }}
                      onDeleteSize={(size) => setPendingDelete({ kind: "size", id: size.id, name: size.label })}
                    />
                  ))}
                  {canEdit && (
                    <form className="flex flex-col gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-4 sm:flex-row" onSubmit={(event) => { event.preventDefault(); const name = newRadius.trim(); if (!name) return; void run(() => requestCatalog({ method: "POST", body: { kind: "radius", modelId: selected.id, name } })).then((ok) => { if (ok) setNewRadius(""); }); }}>
                      <input value={newRadius} onChange={(event) => setNewRadius(event.target.value)} placeholder="רדיוס חדש" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                      <Button type="submit" size="sm" disabled={busy || !newRadius.trim()}><Plus className="h-4 w-4" />הוסף רדיוס</Button>
                    </form>
                  )}
                </section>
              )}
            </>
          )}

          {canEdit && (archivedModels.length > 0 || archivedRadii.length > 0) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <button type="button" className="text-sm font-semibold text-slate-700" onClick={() => setShowArchive((value) => !value)}>
                ארכיון ({archivedModels.length + archivedRadii.length})
              </button>
              {showArchive && (
                <ul className="mt-3 space-y-2 text-sm">
                  {archivedModels.map((model) => (
                    <li key={model.id} className="flex items-center justify-between gap-2">
                      <span>דגם: {model.name}</span>
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: "model", id: model.id, restore: true } }))}>שחזור</Button>
                    </li>
                  ))}
                  {archivedRadii.map((radius) => (
                    <li key={radius.id} className="flex items-center justify-between gap-2">
                      <span>רדיוס: {radius.name} ({radius.modelName})</span>
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => requestCatalog({ method: "PATCH", body: { kind: "radius", id: radius.id, restore: true } }))}>שחזור</Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      <Modal open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} title="אישור מחיקה" className="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-slate-700">למחוק את «{pendingDelete?.name}»? אם קיימים נתונים מקושרים, הרשומה תועבר לארכיון במקום להימחק.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)} disabled={busy}>ביטול</Button>
            <Button type="button" variant="danger" onClick={() => void confirmDelete()} disabled={busy}>אישור</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function RadiusAccordion({
  radius,
  open,
  index,
  total,
  canEdit,
  busy,
  sizeDraft,
  onToggle,
  onRename,
  onMove,
  onDelete,
  onSizeDraft,
  onAddSize,
  onRenameSize,
  onMoveSize,
  onDeleteSize,
}: {
  radius: TitaniumRadiusNode;
  open: boolean;
  index: number;
  total: number;
  canEdit: boolean;
  busy: boolean;
  sizeDraft: string;
  onToggle: () => void;
  onRename: (name: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onSizeDraft: (value: string) => void;
  onAddSize: () => void;
  onRenameSize: (size: TitaniumSizeNode, label: string) => void;
  onMoveSize: (size: TitaniumSizeNode, direction: -1 | 1) => void;
  onDeleteSize: (size: TitaniumSizeNode) => void;
}) {
  const sizes = active(radius.sizes);
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-right">
          <button type="button" className="rounded-md p-1" onClick={onToggle} aria-expanded={open} aria-label={open ? "סגירת רדיוס" : "פתיחת רדיוס"}>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-opal-gold transition", open && "rotate-180")} />
          </button>
          <EditableName value={radius.name} canEdit={canEdit} onSave={onRename} className="font-bold text-slate-900" />
          <button type="button" className="text-xs text-slate-400" onClick={onToggle}>{sizes.length} גדלים</button>
        </div>
        {canEdit && (
          <div className="flex gap-1">
            <Button type="button" size="icon" variant="ghost" disabled={busy || index === 0} aria-label="הזז למעלה" onClick={() => onMove(-1)}><ChevronUp className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="ghost" disabled={busy || index === total - 1} aria-label="הזז למטה" onClick={() => onMove(1)}><ChevronDown className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="ghost" className="text-red-600" disabled={busy} aria-label="מחיקה" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
      {open && (
        <div className="space-y-2 border-t border-slate-100 px-4 py-3">
          {sizes.length === 0 && <p className="text-sm text-slate-500">אין גדלים</p>}
          {sizes.map((size, sizeIndex) => (
            <div key={size.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2">
              <EditableName value={size.label} canEdit={canEdit} onSave={(label) => onRenameSize(size, label)} className="text-sm font-medium text-slate-800" />
              {canEdit && (
                <div className="flex gap-1">
                  <Button type="button" size="icon" variant="ghost" disabled={busy || sizeIndex === 0} aria-label="הזז למעלה" onClick={() => onMoveSize(size, -1)}><ChevronUp className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" disabled={busy || sizeIndex === sizes.length - 1} aria-label="הזז למטה" onClick={() => onMoveSize(size, 1)}><ChevronDown className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="text-red-600" disabled={busy} aria-label="מחיקה" onClick={() => onDeleteSize(size)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          ))}
          {canEdit && (
            <form className="flex flex-col gap-2 pt-1 sm:flex-row" onSubmit={(event) => { event.preventDefault(); onAddSize(); }}>
              <input value={sizeDraft} onChange={(event) => onSizeDraft(event.target.value)} placeholder="גודל חדש" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <Button type="submit" size="sm" variant="outline" disabled={busy || !sizeDraft.trim()}><Plus className="h-4 w-4" />הוסף גודל</Button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}
