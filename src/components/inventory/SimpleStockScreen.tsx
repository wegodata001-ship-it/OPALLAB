"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Minus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { InventoryModule, StockButtons } from "@/components/inventory/InventoryStockTools";
import { MediaFace } from "@/components/inventory/InventoryMedia";

type StockKind = "CLINIC_MATERIALS" | "OTHER_MATERIALS";

type StockItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  note: string;
};

type StockResponse = {
  canEdit: boolean;
  items: StockItem[];
};

async function requestStock(input: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  kind: StockKind;
  body?: unknown;
  query?: string;
}): Promise<StockResponse> {
  const query = input.query ?? `?kind=${input.kind}`;
  const res = await fetch(`/api/inventory/simple-stock${query}`, {
    method: input.method,
    credentials: "include",
    headers: input.body ? { "Content-Type": "application/json" } : undefined,
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
  const json = (await res.json()) as {
    success: boolean;
    data?: StockResponse;
    error?: { message?: string };
  };
  if (!json.success || !json.data) throw new Error(json.error?.message ?? "שגיאה בשמירה");
  return json.data;
}

export function SimpleStockScreen({ kind, title }: { kind: StockKind; title: string }) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StockItem | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftQty, setDraftQty] = useState("0");
  const [draftUnit, setDraftUnit] = useState("");
  const [draftNote, setDraftNote] = useState("");

  const apply = useCallback((data: StockResponse) => {
    setItems(data.items);
    setCanEdit(data.canEdit);
  }, []);

  const run = useCallback(
    async (action: () => Promise<StockResponse>) => {
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
        const data = await requestStock({ method: "GET", kind });
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
  }, [apply, kind]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("he");
    if (!term) return items;
    return items.filter((item) =>
      [item.name, item.unit, item.note].join(" ").toLocaleLowerCase("he").includes(term),
    );
  }, [items, query]);

  function openAdd() {
    setDraftName("");
    setDraftQty("0");
    setDraftUnit("");
    setDraftNote("");
    setAdding(true);
  }

  function openEdit(item: StockItem) {
    setDraftName(item.name);
    setDraftQty(String(item.quantity));
    setDraftUnit(item.unit);
    setDraftNote(item.note);
    setEditing(item);
  }

  async function saveProduct() {
    const quantity = Number(draftQty);
    const body = { name: draftName, quantity, unit: draftUnit, note: draftNote };
    const ok = editing
      ? await run(() => requestStock({ method: "PATCH", kind, body: { id: editing.id, ...body } }))
      : await run(() => requestStock({ method: "POST", kind, body: { kind, ...body } }));
    if (ok) {
      setAdding(false);
      setEditing(null);
    }
  }

  async function changeQuantity(id: string, patch: { delta?: number; quantity?: number }) {
    await run(() => requestStock({ method: "PATCH", kind, body: { id, ...patch } }));
  }

  return (
    <InventoryModule type={kind} title={title}>
    <>
      <Header
        title={title}
        description="הוספת מוצר, כמות ועדכון מיידי"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StockButtons type={kind} />
            <Link href="/inventory" className="text-sm font-medium text-slate-600 underline-offset-4 hover:text-opal-gold-dark hover:underline">
              חזרה למלאי
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש מוצר"
            className="pr-9"
            aria-label="חיפוש מוצר"
          />
        </div>
        {canEdit && (
          <Button onClick={openAdd} disabled={busy}>
            <Plus className="h-4 w-4" />
            הוסף מוצר
          </Button>
        )}
      </div>

      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען מוצרים
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
          {items.length === 0 ? "אין מוצרים עדיין" : "לא נמצאו מוצרים"}
        </p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">שם מוצר</th>
                  <th className="px-4 py-3 text-right font-medium">כמות</th>
                  <th className="px-4 py-3 text-right font-medium">עדכון כמות</th>
                  <th className="px-4 py-3 text-right font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MediaFace kind="item" id={item.id} name={item.name} canEdit={canEdit} />
                        <div>
                          <p className="font-medium text-slate-900">{item.name}</p>
                          {item.note && <p className="text-xs text-slate-500">{item.note}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {item.quantity}
                      {item.unit && <span className="mr-1 text-xs font-normal text-slate-500">{item.unit}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit && (
                        <QuantityControl item={item} disabled={busy} onChange={changeQuantity} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit && <RowActions item={item} disabled={busy} onEdit={openEdit} onDelete={setPendingDelete} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {visible.map((item) => (
              <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <MediaFace kind="item" id={item.id} name={item.name} canEdit={canEdit} />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">{item.name}</p>
                      {item.note && <p className="text-xs text-slate-500">{item.note}</p>}
                    </div>
                  </div>
                  <p className="shrink-0 text-lg font-bold text-slate-900">
                    {item.quantity}
                    {item.unit && <span className="mr-1 text-xs font-normal text-slate-500">{item.unit}</span>}
                  </p>
                </div>
                {canEdit && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <QuantityControl item={item} disabled={busy} onChange={changeQuantity} />
                    <RowActions item={item} disabled={busy} onEdit={openEdit} onDelete={setPendingDelete} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        open={adding || Boolean(editing)}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        title={editing ? "עריכת מוצר" : "הוספת מוצר"}
        className="max-w-md"
      >
        <div className="space-y-3">
          <Field label="שם מוצר">
            <Input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} />
          </Field>
          <Field label="כמות">
            <Input inputMode="numeric" value={draftQty} onChange={(event) => setDraftQty(event.target.value)} />
          </Field>
          <Field label="יחידת מידה">
            <Input value={draftUnit} onChange={(event) => setDraftUnit(event.target.value)} />
          </Field>
          <Field label="הערה">
            <Input value={draftNote} onChange={(event) => setDraftNote(event.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setAdding(false);
              setEditing(null);
            }}
          >
            ביטול
          </Button>
          <Button onClick={() => void saveProduct()} disabled={busy}>
            שמור מוצר
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} title="מחיקת מוצר" className="max-w-sm">
        <p className="text-sm text-slate-600">האם למחוק את המוצר?</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPendingDelete(null)}>
            ביטול
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (!pendingDelete) return;
              void run(() =>
                requestStock({
                  method: "DELETE",
                  kind,
                  query: `?kind=${kind}&id=${encodeURIComponent(pendingDelete.id)}`,
                }),
              ).then((ok) => {
                if (ok) setPendingDelete(null);
              });
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function QuantityControl({
  item,
  disabled,
  onChange,
}: {
  item: StockItem;
  disabled: boolean;
  onChange: (id: string, patch: { delta?: number; quantity?: number }) => Promise<void>;
}) {
  const [draft, setDraft] = useState(String(item.quantity));
  useEffect(() => setDraft(String(item.quantity)), [item.quantity]);

  function commit() {
    const quantity = Number(draft);
    if (quantity === item.quantity) return;
    void onChange(item.id, { quantity });
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="הוספת כמות"
        disabled={disabled}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-opal-gold disabled:opacity-50"
        onClick={() => void onChange(item.id, { delta: 1 })}
      >
        <Plus className="h-4 w-4" />
      </button>
      <input
        inputMode="numeric"
        aria-label={`כמות ${item.name}`}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="h-8 w-16 rounded-lg border border-slate-200 bg-white text-center text-sm font-bold text-slate-900 outline-none focus:border-opal-gold"
      />
      <button
        type="button"
        aria-label="הפחתת כמות"
        disabled={disabled}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-opal-gold disabled:opacity-50"
        onClick={() => void onChange(item.id, { delta: -1 })}
      >
        <Minus className="h-4 w-4" />
      </button>
    </div>
  );
}

function RowActions({
  item,
  disabled,
  onEdit,
  onDelete,
}: {
  item: StockItem;
  disabled: boolean;
  onEdit: (item: StockItem) => void;
  onDelete: (item: StockItem) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="עריכה"
        disabled={disabled}
        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
        onClick={() => onEdit(item)}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="מחיקה"
        disabled={disabled}
        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        onClick={() => onDelete(item)}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
