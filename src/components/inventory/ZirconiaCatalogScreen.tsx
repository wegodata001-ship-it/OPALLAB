"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type {
  ZirconiaAttributeNode,
  ZirconiaCatalogKind,
  ZirconiaModelNode,
  ZirconiaValueNode,
} from "@/lib/inventory/zirconia-catalog";
import { cn } from "@/lib/utils";

type CatalogResponse = {
  canEdit: boolean;
  models: ZirconiaModelNode[];
};

type PendingDelete = {
  kind: ZirconiaCatalogKind;
  id: string;
  name: string;
};

async function requestCatalog(input: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: string;
}): Promise<CatalogResponse> {
  const res = await fetch(`/api/inventory/zirconia${input.query ?? ""}`, {
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
  if (!json.success || !json.data) {
    throw new Error(json.error?.message ?? "שגיאה בשמירה");
  }
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

  useEffect(() => {
    setDraft(value);
  }, [value]);

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
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={cn(
        "min-w-0 rounded-lg border border-opal-gold bg-white px-2 py-1 text-slate-900 outline-none",
        inputClassName,
      )}
    />
  );
}

export function ZirconiaCatalogScreen() {
  const [models, setModels] = useState<ZirconiaModelNode[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [newModel, setNewModel] = useState("");
  const [showNewModel, setShowNewModel] = useState(false);
  const [newAttribute, setNewAttribute] = useState("");
  const [newValues, setNewValues] = useState<Record<string, string>>({});

  const applyCatalog = useCallback((data: CatalogResponse, preferId?: string) => {
    setModels(data.models);
    setCanEdit(data.canEdit);
    setSelectedId((current) => {
      const wanted = preferId ?? current;
      if (wanted && data.models.some((model) => model.id === wanted)) return wanted;
      return data.models[0]?.id ?? null;
    });
  }, []);

  const run = useCallback(
    async (action: () => Promise<CatalogResponse>, preferId?: string) => {
      setBusy(true);
      setError(null);
      try {
        applyCatalog(await action(), preferId);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה בשמירה");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [applyCatalog],
  );

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
    return () => {
      cancelled = true;
    };
  }, [applyCatalog]);

  const selected = models.find((model) => model.id === selectedId) ?? null;

  const reorder = (kind: ZirconiaCatalogKind, ids: string[], parent?: { modelId?: string; attributeId?: string }) =>
    run(() =>
      requestCatalog({
        method: "PATCH",
        body: { kind, orderedIds: ids, ...parent },
      }),
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
      <Header title="מלאי זירקונים" description="הגדרת דגמים, מאפיינים וערכים" />

      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
      {!canEdit && !loading && (
        <p className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          צפייה בלבד. עריכה זמינה למנהל.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-opal-gold" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {models.map((model, index) => {
              const selectedCard = model.id === selected?.id;
              return (
                <div
                  key={model.id}
                  className={cn(
                    "rounded-2xl border bg-white p-5 shadow-sm transition",
                    selectedCard ? "border-opal-gold ring-2 ring-opal-gold/30" : "border-slate-200 hover:border-opal-gold/60",
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex w-full cursor-pointer items-center gap-3 text-right"
                    onClick={() => setSelectedId(model.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(model.id);
                      }
                    }}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-opal-gold">
                      {index + 1}
                    </span>
                    <EditableName
                      value={model.name}
                      canEdit={canEdit}
                      onSave={(name) =>
                        void run(() => requestCatalog({ method: "PATCH", body: { kind: "model", id: model.id, name } }))
                      }
                      className="text-xl font-bold text-slate-900"
                      inputClassName="text-xl font-bold"
                    />
                  </div>
                  {canEdit && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || index === 0}
                        aria-label="הזז להתחלה"
                        onClick={() => {
                          const ids = moveId(models.map((item) => item.id), model.id, -1);
                          if (ids) void reorder("model", ids);
                        }}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || index === models.length - 1}
                        aria-label="הזז לסוף"
                        onClick={() => {
                          const ids = moveId(models.map((item) => item.id), model.id, 1);
                          if (ids) void reorder("model", ids);
                        }}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-red-600"
                        disabled={busy}
                        onClick={() => setPendingDelete({ kind: "model", id: model.id, name: model.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                        מחיקה
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            {canEdit && (
              <div className="rounded-2xl border border-dashed border-opal-gold/50 bg-white p-5">
                {showNewModel ? (
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = newModel.trim();
                      if (!name) return;
                      void run(() => requestCatalog({ method: "POST", body: { kind: "model", name } })).then((ok) => {
                        if (!ok) return;
                        setNewModel("");
                        setShowNewModel(false);
                      });
                    }}
                  >
                    <input
                      autoFocus
                      value={newModel}
                      onChange={(event) => setNewModel(event.target.value)}
                      placeholder="שם הדגם"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={busy || !newModel.trim()}>
                        שמירה
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setShowNewModel(false)}>
                        ביטול
                      </Button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="flex h-full min-h-28 w-full items-center justify-center gap-2 text-sm font-medium text-opal-gold-dark"
                    onClick={() => setShowNewModel(true)}
                  >
                    <Plus className="h-4 w-4" />
                    הוסף דגם
                  </button>
                )}
              </div>
            )}
          </div>

          {selected && (
            <section className="mt-8 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900">מאפיינים — {selected.name}</h2>
              </div>

              {selected.attributes.length === 0 && (
                <p className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  אין מאפיינים לדגם זה
                </p>
              )}

              {selected.attributes.map((attribute, index) => (
                <AttributeCard
                  key={attribute.id}
                  attribute={attribute}
                  index={index}
                  total={selected.attributes.length}
                  canEdit={canEdit}
                  busy={busy}
                  draft={newValues[attribute.id] ?? ""}
                  onDraft={(value) => setNewValues((current) => ({ ...current, [attribute.id]: value }))}
                  onRename={(name) =>
                    void run(() =>
                      requestCatalog({ method: "PATCH", body: { kind: "attribute", id: attribute.id, name } }),
                    )
                  }
                  onMove={(direction) => {
                    const ids = moveId(
                      selected.attributes.map((item) => item.id),
                      attribute.id,
                      direction,
                    );
                    if (ids) void reorder("attribute", ids, { modelId: selected.id });
                  }}
                  onDelete={() => setPendingDelete({ kind: "attribute", id: attribute.id, name: attribute.name })}
                  onRenameValue={(value, label) =>
                    void run(() => requestCatalog({ method: "PATCH", body: { kind: "value", id: value.id, name: label } }))
                  }
                  onMoveValue={(value, direction) => {
                    const ids = moveId(
                      attribute.values.map((item) => item.id),
                      value.id,
                      direction,
                    );
                    if (ids) void reorder("value", ids, { attributeId: attribute.id });
                  }}
                  onDeleteValue={(value) =>
                    setPendingDelete({ kind: "value", id: value.id, name: value.label })
                  }
                  onAddValue={() => {
                    const name = (newValues[attribute.id] ?? "").trim();
                    if (!name) return;
                    void run(() =>
                      requestCatalog({
                        method: "POST",
                        body: { kind: "value", attributeId: attribute.id, name },
                      }),
                    ).then((ok) => {
                      if (ok) setNewValues((current) => ({ ...current, [attribute.id]: "" }));
                    });
                  }}
                />
              ))}

              {canEdit && (
                <form
                  className="flex flex-col gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-4 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = newAttribute.trim();
                    if (!name) return;
                    void run(() =>
                      requestCatalog({
                        method: "POST",
                        body: { kind: "attribute", modelId: selected.id, name },
                      }),
                    ).then((ok) => {
                      if (ok) setNewAttribute("");
                    });
                  }}
                >
                  <input
                    value={newAttribute}
                    onChange={(event) => setNewAttribute(event.target.value)}
                    placeholder="שם מאפיין חדש"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <Button type="submit" size="sm" disabled={busy || !newAttribute.trim()}>
                    <Plus className="h-4 w-4" />
                    הוסף מאפיין
                  </Button>
                </form>
              )}
            </section>
          )}
        </>
      )}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="אישור מחיקה"
        className="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            למחוק את «{pendingDelete?.name}»? אם קיימות רשומות מקושרות, המחיקה תיחסם.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)} disabled={busy}>
              ביטול
            </Button>
            <Button type="button" variant="danger" onClick={() => void confirmDelete()} disabled={busy}>
              מחיקה
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function AttributeCard({
  attribute,
  index,
  total,
  canEdit,
  busy,
  draft,
  onDraft,
  onRename,
  onMove,
  onDelete,
  onRenameValue,
  onMoveValue,
  onDeleteValue,
  onAddValue,
}: {
  attribute: ZirconiaAttributeNode;
  index: number;
  total: number;
  canEdit: boolean;
  busy: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onRename: (name: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onRenameValue: (value: ZirconiaValueNode, label: string) => void;
  onMoveValue: (value: ZirconiaValueNode, direction: -1 | 1) => void;
  onDeleteValue: (value: ZirconiaValueNode) => void;
  onAddValue: () => void;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <EditableName
          value={attribute.name}
          canEdit={canEdit}
          onSave={onRename}
          className="text-base font-bold text-slate-900"
        />
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy || index === 0} aria-label="הזז למעלה" onClick={() => onMove(-1)}>
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy || index === total - 1} aria-label="הזז למטה" onClick={() => onMove(1)}>
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" className="text-red-600" disabled={busy} onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
              מחיקה
            </Button>
          </div>
        )}
      </div>

      <ul className="mt-4 space-y-2">
        {attribute.values.length === 0 && (
          <li className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">אין ערכים</li>
        )}
        {attribute.values.map((value, valueIndex) => (
          <li key={value.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2">
            <EditableName
              value={value.label}
              canEdit={canEdit}
              onSave={(label) => onRenameValue(value, label)}
              className="text-sm font-medium text-slate-800"
            />
            {canEdit && (
              <div className="flex gap-1">
                <Button type="button" size="icon" variant="ghost" disabled={busy || valueIndex === 0} aria-label="הזז למעלה" onClick={() => onMoveValue(value, -1)}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" disabled={busy || valueIndex === attribute.values.length - 1} aria-label="הזז למטה" onClick={() => onMoveValue(value, 1)}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="text-red-600" disabled={busy} aria-label="מחיקה" onClick={() => onDeleteValue(value)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            onAddValue();
          }}
        >
          <input
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            placeholder="ערך חדש"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <Button type="submit" size="sm" variant="outline" disabled={busy || !draft.trim()}>
            <Plus className="h-4 w-4" />
            הוסף ערך
          </Button>
        </form>
      )}
    </article>
  );
}
