"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { StockButtons, InventoryModule } from "@/components/inventory/InventoryStockTools";
import { MediaFace, useInventoryMedia } from "@/components/inventory/InventoryMedia";
import { DRILL_CATALOG_ID } from "@/lib/inventory/inventory-media-shared";

type Bit = { id: string; label: string; quantity: number | null; updatedAt: string };
type DrillTypeRow = { id: string; name: string; note: string; active: boolean; updatedAt: string; bits: Bit[] };
type Machine = { id: string; name: string; description: string; active: boolean; updatedAt: string; types: DrillTypeRow[] };
type QtyMode = "add" | "subtract" | "set";

async function requestDrills(input?: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; query?: string }) {
  const res = await fetch(`/api/inventory/drills${input?.query ?? ""}`, {
    method: input?.method ?? "GET",
    credentials: "include",
    headers: input?.body ? { "Content-Type": "application/json" } : undefined,
    body: input?.body ? JSON.stringify(input.body) : undefined,
  });
  const json = (await res.json()) as { success: boolean; data?: { canEdit: boolean; machines: Machine[]; archived?: boolean }; error?: { message?: string } };
  if (!json.success || !json.data) throw new Error(json.error?.message ?? "השמירה נכשלה");
  return json.data;
}

async function downloadDrillFile(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/inventory/drills/export?${query.toString()}`, { credentials: "include" });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || (!type.includes("pdf") && !type.includes("sheet"))) {
    const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(json?.error?.message ?? "הפקת הדוח נכשלה");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `opal-drills-${params.kind}.${params.format === "xlsx" ? "xlsx" : "pdf"}`;
  link.click();
  URL.revokeObjectURL(url);
}

function totalOf(machine: Machine) {
  return machine.types.filter((type) => type.active).reduce((sum, type) => sum + type.bits.reduce((inner, bit) => inner + (bit.quantity ?? 0), 0), 0);
}

export function DrillsScreen() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", description: "", quantity: "", barcode: "", reason: "" });
  const [dialog, setDialog] = useState<
    | { type: "model" }
    | { type: "drill-type" }
    | { type: "rename-model"; id: string }
    | { type: "rename-type"; id: string }
    | { type: "qty"; mode: QtyMode; bitId: string; model: string; drillType: string; current: number | null }
    | { type: "delete"; kind: "machine" | "type"; id: string; name: string }
    | null
  >(null);
  const [history, setHistory] = useState<{ title: string; rows: { id: string; action: string; quantityBefore: number; quantityChange: number; quantityAfter: number; reason: string; userName: string; createdAt: string }[] } | null>(null);

  const apply = useCallback((data: { canEdit: boolean; machines: Machine[] }) => {
    setMachines(data.machines);
    setCanEdit(data.canEdit);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestDrills();
        if (!cancelled) apply(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apply]);

  const activeMachines = machines.filter((machine) => machine.active);
  const machine = machines.find((item) => item.id === machineId) ?? null;
  const visibleTypes = useMemo(() => {
    const source = machine ? [machine] : activeMachines;
    return source.flatMap((item) => item.types.filter((type) => type.active && (!typeFilter || type.name === typeFilter)).map((type) => ({ ...type, model: item.name, modelId: item.id })));
  }, [machine, activeMachines, typeFilter]);
  const typeNames = useMemo(() => [...new Set(activeMachines.flatMap((item) => item.types.filter((type) => type.active).map((type) => type.name)))], [activeMachines]);

  async function run(action: () => Promise<{ archived?: boolean } | void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      apply(await requestDrills());
      if (result && "archived" in result && result.archived) setNotice("הפריט הועבר לארכיון כי יש לו מלאי, תנועות, או שהוא חלק מהמבנה הראשי.");
      setDialog(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openQty(mode: QtyMode, bit: Bit, modelName: string, typeName: string) {
    setDraft({ name: "", description: "", quantity: "", barcode: "", reason: "" });
    setDialog({ type: "qty", mode, bitId: bit.id, model: modelName, drillType: typeName, current: bit.quantity });
  }

  const reportButtons = [
    ["כל המלאי", { kind: "drills" }],
    ["לפי דגם", { kind: "drills", models: machine?.name ?? modelFilter }],
    ["לפי סוג", { kind: "drills", materials: typeFilter }],
    ["ספירה", { kind: "count-full" }],
    ["הפרשים", { kind: "differences" }],
    ["תנועות", { kind: "movements" }],
    ["כמות אפס", { kind: "drills", zero: "1" }],
  ] as const;

  return (
    <InventoryModule type="DRILLS" title="מלאי מקדחים">
      <>
        <Header
          title="מלאי מקדחים"
          description="דגם מקדח, סוג מקדח וכמות"
          actions={<StockButtons type="DRILLS" />}
        />
        {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>}
        {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-opal-gold" /></div> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <MediaFace kind="catalog" id={DRILL_CATALOG_ID} name="מלאי מקדחים" canEdit={canEdit} />
                <div>
                  <p className="text-xs text-slate-500">קטגוריה</p>
                  <h2 className="text-lg font-bold">מלאי מקדחים</h2>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {reportButtons.map(([label, params]) => (
                  <span key={label} className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void downloadDrillFile({ format: "pdf", ...params }).catch((err: unknown) => setError(err instanceof Error ? err.message : "הפקת הדוח נכשלה"))}>PDF {label}</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void downloadDrillFile({ format: "xlsx", ...params }).catch((err: unknown) => setError(err instanceof Error ? err.message : "הפקת הדוח נכשלה"))}>Excel</Button>
                  </span>
                ))}
              </div>
            </div>

            <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
              <button type="button" className="font-medium text-slate-900" onClick={() => setMachineId(null)}>מלאי מקדחים</button>
              {machine && <><span>/</span><span className="text-slate-900">{machine.name}</span></>}
            </nav>

            {!machine ? (
              <>
                <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} aria-label="סינון לפי דגם" className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm">
                  <option value="">כל הדגמים</option>
                  {activeMachines.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {activeMachines.filter((item) => !modelFilter || item.name === modelFilter).map((item) => (
                    <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <MediaFace kind="machine" id={item.id} name={item.name} canEdit={canEdit} />
                        <button type="button" className="min-w-0 flex-1 text-right" onClick={() => setMachineId(item.id)}>
                          <span className="block text-xl font-bold text-slate-900">{item.name}</span>
                          <span className="mt-1 block text-sm text-slate-500">סה״כ מלאי {totalOf(item)}</span>
                          <span className="block text-xs text-slate-500">{item.types.filter((type) => type.active).length} סוגים</span>
                        </button>
                      </div>
                      {item.description && <p className="mt-2 text-xs text-slate-500">{item.description}</p>}
                      {canEdit && (
                        <div className="mt-3 flex gap-2 text-xs">
                          <button type="button" className="text-slate-600 hover:underline" onClick={() => { setDraft({ name: item.name, description: item.description, quantity: "", barcode: "", reason: "" }); setDialog({ type: "rename-model", id: item.id }); }}>עריכה</button>
                          <button type="button" className="text-red-600 hover:underline" onClick={() => setDialog({ type: "delete", kind: "machine", id: item.id, name: item.name })}>מחיקה</button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
                {canEdit && <Button onClick={() => { setDraft({ name: "", description: "", quantity: "", barcode: "", reason: "" }); setDialog({ type: "model" }); }}><Plus className="h-4 w-4" />הוסף דגם מקדח</Button>}
              </>
            ) : (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MediaFace kind="machine" id={machine.id} name={machine.name} canEdit={canEdit} />
                    <h2 className="text-xl font-bold">{machine.name}</h2>
                  </div>
                  {canEdit && <Button onClick={() => { setDraft({ name: "", description: "", quantity: "0", barcode: "", reason: "" }); setDialog({ type: "drill-type" }); }}><Plus className="h-4 w-4" />הוסף סוג מקדח</Button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="סינון לפי סוג" className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm">
                    <option value="">כל הסוגים</option>
                    {typeNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <TypeTable
                  rows={visibleTypes}
                  canEdit={canEdit}
                  busy={busy}
                  onAdd={(row, bit) => openQty("add", bit, row.model, row.name)}
                  onSubtract={(row, bit) => openQty("subtract", bit, row.model, row.name)}
                  onSet={(row, bit) => openQty("set", bit, row.model, row.name)}
                  onEdit={(row) => { setDraft({ name: row.name, description: row.note, quantity: "", barcode: "", reason: "" }); setDialog({ type: "rename-type", id: row.id }); }}
                  onDelete={(row) => setDialog({ type: "delete", kind: "type", id: row.id, name: row.name })}
                  onHistory={(row, bit) => void requestCountsHistory(bit.id, `${row.model} / ${row.name}`).then(setHistory).catch((err: unknown) => setError(err instanceof Error ? err.message : "היסטוריה לא נטענה"))}
                />
                {machine.types.some((type) => !type.active) && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                    <p className="mb-2 font-medium">סוגים בארכיון</p>
                    {machine.types.filter((type) => !type.active).map((type) => (
                      <div key={type.id} className="flex items-center justify-between gap-2 py-1">
                        <span>{type.name}</span>
                        {canEdit && <button type="button" className="text-xs text-slate-600 hover:underline" onClick={() => void run(() => requestDrills({ method: "PATCH", body: { kind: "type", id: type.id, active: true } }))}>שחזור</button>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {machines.some((item) => !item.active) && !machine && (
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <p className="mb-2 font-medium">דגמים לא פעילים</p>
                {machines.filter((item) => !item.active).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 py-1">
                    <span>{item.name}</span>
                    {canEdit && <button type="button" className="text-xs text-slate-600 hover:underline" onClick={() => void run(() => requestDrills({ method: "PATCH", body: { kind: "machine", id: item.id, active: true } }))}>הפעלה</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Modal open={dialog?.type === "model" || dialog?.type === "rename-model"} onClose={() => setDialog(null)} title={dialog?.type === "rename-model" ? "עריכת דגם" : "הוספת דגם מקדח"} className="max-w-sm">
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            if (dialog?.type === "rename-model") void run(() => requestDrills({ method: "PATCH", body: { kind: "machine", id: dialog.id, name: draft.name, description: draft.description } }));
            else void run(() => requestDrills({ method: "POST", body: { kind: "machine", name: draft.name, description: draft.description, active: true } }));
          }}>
            <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="שם דגם" aria-label="שם דגם" />
            <Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="תיאור" aria-label="תיאור" />
            <p className="text-xs text-slate-500">אחרי השמירה אפשר להוסיף תמונה ישירות על כרטיס הדגם. הדגם נוצר כפעיל.</p>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>ביטול</Button><Button type="submit" disabled={busy || !draft.name.trim()}>שמירה</Button></div>
          </form>
        </Modal>

        <Modal open={dialog?.type === "drill-type" || dialog?.type === "rename-type"} onClose={() => setDialog(null)} title={dialog?.type === "rename-type" ? "עריכת סוג" : "הוספת סוג מקדח"} className="max-w-sm">
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            if (!machine) return;
            if (dialog?.type === "rename-type") void run(() => requestDrills({ method: "PATCH", body: { kind: "type", id: dialog.id, name: draft.name, description: draft.description } }));
            else void run(() => requestDrills({ method: "POST", body: { kind: "type", machineId: machine.id, name: draft.name, note: draft.description, quantity: Number(draft.quantity || 0), barcode: draft.barcode } }));
          }}>
            <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="שם סוג" aria-label="שם סוג" />
            {dialog?.type === "drill-type" && (
              <>
                <Input value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} inputMode="numeric" placeholder="כמות התחלתית" aria-label="כמות התחלתית" />
                <Input value={draft.barcode} onChange={(event) => setDraft({ ...draft, barcode: event.target.value })} placeholder="ברקוד" aria-label="ברקוד" />
              </>
            )}
            <Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="הערות" aria-label="הערות" />
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>ביטול</Button><Button type="submit" disabled={busy || !draft.name.trim()}>שמירה</Button></div>
          </form>
        </Modal>

        <Modal open={dialog?.type === "qty"} onClose={() => setDialog(null)} title={dialog?.type === "qty" && dialog.mode === "add" ? "הוספת כמות" : dialog?.type === "qty" && dialog.mode === "subtract" ? "הפחתת כמות" : "שינוי כמות"} className="max-w-sm">
          {dialog?.type === "qty" && (
            <form className="space-y-3" onSubmit={(event) => {
              event.preventDefault();
              const amount = Number(draft.quantity);
              if (!Number.isInteger(amount) || amount < 0 || (dialog.mode !== "set" && amount === 0)) return;
              const body = dialog.mode === "set"
                ? { kind: "adjust", bitId: dialog.bitId, quantity: amount, reason: draft.reason }
                : { kind: "adjust", bitId: dialog.bitId, delta: dialog.mode === "add" ? amount : -amount, reason: draft.reason };
              void run(() => requestDrills({ method: "POST", body }));
            }}>
              <p className="text-sm text-slate-700">דגם: {dialog.model}</p>
              <p className="text-sm text-slate-700">סוג: {dialog.drillType}</p>
              <p className="text-sm text-slate-700">כמות קיימת: {dialog.current ?? "—"}</p>
              <Input value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} inputMode="numeric" placeholder={dialog.mode === "set" ? "כמות חדשה" : "כמות"} aria-label="כמות" />
              {dialog.mode !== "set" && Number.isInteger(Number(draft.quantity)) && (
                <p className="text-sm font-medium">כמות חדשה: {(dialog.current ?? 0) + (dialog.mode === "add" ? Number(draft.quantity) : -Number(draft.quantity))}</p>
              )}
              <Input value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="הערה" aria-label="הערה" />
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>ביטול</Button><Button type="submit" disabled={busy || draft.quantity.trim() === ""}>שמירה</Button></div>
            </form>
          )}
        </Modal>

        <Modal open={dialog?.type === "delete"} onClose={() => setDialog(null)} title="מחיקה" className="max-w-sm">
          {dialog?.type === "delete" && (
            <div className="space-y-3">
              <p className="text-sm">למחוק את {dialog.name}? אם יש מלאי או תנועות, הפריט יועבר לארכיון.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
                <Button variant="danger" disabled={busy} onClick={() => void run(() => requestDrills({ method: "DELETE", query: `?kind=${dialog.kind}&id=${dialog.id}` }))}>מחיקה</Button>
              </div>
            </div>
          )}
        </Modal>

        <Modal open={Boolean(history)} onClose={() => setHistory(null)} title={history ? `היסטוריה — ${history.title}` : "היסטוריה"} className="max-w-lg">
          {history && history.rows.length === 0 ? <p className="text-sm text-slate-500">אין תנועות</p> : (
            <ul className="space-y-2">{history?.rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium">{row.action}</p>
                <p>{row.quantityBefore} → {row.quantityAfter} ({row.quantityChange > 0 ? `+${row.quantityChange}` : row.quantityChange})</p>
                <p className="text-xs text-slate-500">{row.userName} · {new Date(row.createdAt).toLocaleString("he-IL")}</p>
                {row.reason && <p>{row.reason}</p>}
              </li>
            ))}</ul>
          )}
        </Modal>
      </>
    </InventoryModule>
  );
}

async function requestCountsHistory(itemId: string, title: string) {
  const response = await fetch(`/api/inventory/counts?type=DRILLS&history=1&itemId=${itemId}`, { credentials: "include" });
  const json = (await response.json()) as { success: boolean; data?: { movements: { id: string; action: string; quantityBefore: number; quantityChange: number; quantityAfter: number; reason: string; userName: string; createdAt: string }[] }; error?: { message?: string } };
  if (!json.success || !json.data) throw new Error(json.error?.message ?? "היסטוריה לא נטענה");
  return { title, rows: json.data.movements };
}

function TypeTable({
  rows,
  canEdit,
  busy,
  onAdd,
  onSubtract,
  onSet,
  onEdit,
  onDelete,
  onHistory,
}: {
  rows: { id: string; name: string; note: string; model: string; bits: Bit[] }[];
  canEdit: boolean;
  busy: boolean;
  onAdd: (row: { name: string; model: string }, bit: Bit) => void;
  onSubtract: (row: { name: string; model: string }, bit: Bit) => void;
  onSet: (row: { name: string; model: string }, bit: Bit) => void;
  onEdit: (row: { id: string; name: string; note: string }) => void;
  onDelete: (row: { id: string; name: string }) => void;
  onHistory: (row: { name: string; model: string }, bit: Bit) => void;
}) {
  const media = useInventoryMedia();
  const flat = rows.flatMap((row) => (row.bits.length > 0 ? row.bits.map((bit) => ({ row, bit })) : []));
  if (flat.length === 0) return <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">אין סוגים פעילים</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>{["תמונה", "סוג מקדח", "כמות במלאי", "ברקוד", "עודכן", "פעולות"].map((label) => <th key={label} className="px-3 py-2 text-right font-medium">{label}</th>)}</tr>
        </thead>
        <tbody>
          {flat.map(({ row, bit }) => (
            <tr key={bit.id} className="border-t border-slate-100">
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <MediaFace kind="type" id={row.id} name={row.name} canEdit={canEdit} />
                  <MediaFace kind="bit" id={bit.id} name={`${row.model} / ${row.name}`} canEdit={canEdit} />
                </div>
              </td>
              <td className="px-3 py-2 font-medium">{row.name}{bit.label !== row.name ? <span className="mr-1 text-xs text-slate-500">{bit.label}</span> : null}{row.note ? <span className="mt-0.5 block text-xs font-normal text-slate-500">{row.note}</span> : null}</td>
              <td className="px-3 py-2 text-lg font-bold">{bit.quantity ?? "—"}</td>
              <td className="px-3 py-2">{media.byId.get(bit.id)?.barcode || "—"}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{new Date(bit.updatedAt).toLocaleString("he-IL")}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {canEdit && <Button size="sm" variant="outline" disabled={busy} onClick={() => onAdd(row, bit)}><Plus className="h-3.5 w-3.5" />הוסף כמות</Button>}
                  {canEdit && <Button size="sm" variant="outline" disabled={busy} onClick={() => onSubtract(row, bit)}><Minus className="h-3.5 w-3.5" />הפחתה</Button>}
                  {canEdit && <button type="button" className="text-xs text-slate-600 hover:underline" onClick={() => onSet(row, bit)}>שינוי כמות</button>}
                  <button type="button" className="text-xs text-slate-600 hover:underline" onClick={() => onHistory(row, bit)}>היסטוריה</button>
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
