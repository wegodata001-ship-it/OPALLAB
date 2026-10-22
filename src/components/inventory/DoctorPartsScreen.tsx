"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Minus, Plus, Search } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { InventoryModule, StockButtons, useInventoryView } from "@/components/inventory/InventoryStockTools";
import { MediaFace } from "@/components/inventory/InventoryMedia";
import { cn } from "@/lib/utils";

type Part = { id: string; name: string; code: string; quantity: number; unit: string; notes: string };
type Movement = {
  id: string;
  partName: string;
  orderSerial: string;
  operationId: string;
  type: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  userName: string;
  reason: string;
  source: string;
  createdAt: string;
};
type Summary = { partCount: number; totalQuantity: number; negativeCount: number; movementCount: number };

const TYPE_LABEL: Record<string, string> = {
  STOCK_IN: "הכנסת מלאי",
  STOCK_OUT: "הפחתה ידנית",
  ORDER_CONSUMPTION: "הפחתה מהזמנה",
  ORDER_ADJUSTMENT: "התאמת הזמנה",
  ORDER_RETURN: "החזרה מהזמנה",
  MANUAL_CORRECTION: "תיקון ספירה",
  STOCK_COUNT: "ספירת מלאי",
};

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

async function requestParts(input: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; query?: string }) {
  const res = await fetch(`/api/inventory/doctor-parts${input.query ?? ""}`, {
    method: input.method ?? "GET",
    credentials: "include",
    headers: input.body ? { "Content-Type": "application/json" } : undefined,
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
  const json = (await res.json()) as { success: boolean; data?: { parts?: Part[]; summary?: Summary; canEdit?: boolean; movements?: Movement[]; notice?: string | null }; error?: { message?: string } };
  if (!json.success || !json.data) throw new Error(json.error?.message ?? "שגיאה בשמירה");
  return json.data;
}

export function DoctorPartsScreen() {
  const [, setStockMode] = useInventoryView("DOCTOR_PARTS");
  const [parts, setParts] = useState<Part[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "add" | "history" | { type: "edit"; part: Part } | { type: "delete"; part: Part }>(null);
  const [draft, setDraft] = useState({ name: "", code: "", quantity: "0", unit: "", notes: "", physical: "" });
  const [movements, setMovements] = useState<Movement[]>([]);

  const load = useCallback(async () => {
    const data = await requestParts({ query: `?from=${from}&to=${to}T23:59:59` });
    setParts(data.parts ?? []);
    setSummary(data.summary ?? null);
    setCanEdit(Boolean(data.canEdit));
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestParts({ query: `?from=${from}&to=${to}T23:59:59` });
        if (cancelled) return;
        setParts(data.parts ?? []);
        setSummary(data.summary ?? null);
        setCanEdit(Boolean(data.canEdit));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("he");
    if (!term) return parts;
    return parts.filter((part) => `${part.name} ${part.code} ${part.notes}`.toLocaleLowerCase("he").includes(term));
  }, [parts, query]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירה");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(partId?: string) {
    setDialog("history");
    setMovements([]);
    try {
      const data = await requestParts({ query: `?history=1&from=${from}&to=${to}T23:59:59${partId ? `&partId=${encodeURIComponent(partId)}` : ""}` });
      setMovements(data.movements ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת ההיסטוריה");
    }
  }

  return (
    <InventoryModule type="DOCTOR_PARTS" title="חלקים רופאים">
    <>
      <Header
        title="חלקים רופאים"
        description="מלאי חופשי המחובר להזמנות"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StockButtons type="DOCTOR_PARTS" />
            <Link href="/inventory" className="text-sm font-medium text-slate-600 hover:underline">חזרה למלאי</Link>
          </div>
        }
      />
      {loading ? (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />טוען</div>
      ) : (
        <div className="space-y-4">
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p>}
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              ["סוגי חלקים", summary?.partCount ?? 0],
              ["סך יתרות", summary?.totalQuantity ?? 0],
              ["מלאי שלילי", summary?.negativeCount ?? 0],
              ["תנועות בתקופה", summary?.movementCount ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-slate-900 px-3 py-3 text-white">
                <p className="text-xs text-slate-300">{label}</p>
                <p className={cn("text-xl font-bold", label === "מלאי שלילי" && Number(value) > 0 && "text-red-300")}>{value}</p>
              </div>
            ))}
          </section>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש חלק" className="pr-9" aria-label="חיפוש חלק" />
            </div>
            <Input type="date" aria-label="מתאריך" value={from} onChange={(event) => setFrom(event.target.value)} className="lg:w-40" />
            <Input type="date" aria-label="עד תאריך" value={to} onChange={(event) => setTo(event.target.value)} className="lg:w-40" />
            {canEdit && (
              <Button onClick={() => { setDraft({ name: "", code: "", quantity: "0", unit: "", notes: "", physical: "" }); setDialog("add"); }}>
                <Plus className="h-4 w-4" />הוסף חלק
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" disabled={parts.length === 0} onClick={() => setStockMode("count")}>
                ספירת מלאי
              </Button>
            )}
            <Button variant="outline" onClick={() => void openHistory()}>היסטוריית תנועות</Button>
          </div>
          {visible.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">{parts.length === 0 ? "אין חלקים עדיין" : "לא נמצאו חלקים"}</p>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-right font-medium">שם חלק</th>
                      <th className="px-4 py-3 text-right font-medium">כמות</th>
                      <th className="px-4 py-3 text-right font-medium">הוספה/הפחתה</th>
                      <th className="px-4 py-3 text-right font-medium">היסטוריה</th>
                      <th className="px-4 py-3 text-right font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((part) => (
                      <PartRow key={part.id} part={part} canEdit={canEdit} busy={busy} onDelta={(delta) => void run(() => requestParts({ method: "PATCH", body: { id: part.id, delta } }).then(() => undefined))} onQuantity={(quantity) => void run(() => requestParts({ method: "PATCH", body: { id: part.id, quantity } }).then(() => undefined))} onHistory={() => void openHistory(part.id)} onEdit={() => { setDraft({ name: part.name, code: part.code, quantity: String(part.quantity), unit: part.unit, notes: part.notes, physical: String(part.quantity) }); setDialog({ type: "edit", part }); }} onCount={() => setStockMode("count")} onDelete={() => setDialog({ type: "delete", part })} />
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-3 md:hidden">
                {visible.map((part) => (
                  <li key={part.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <PartBody part={part} canEdit={canEdit} busy={busy} onDelta={(delta) => void run(() => requestParts({ method: "PATCH", body: { id: part.id, delta } }).then(() => undefined))} onQuantity={(quantity) => void run(() => requestParts({ method: "PATCH", body: { id: part.id, quantity } }).then(() => undefined))} onHistory={() => void openHistory(part.id)} onEdit={() => { setDraft({ name: part.name, code: part.code, quantity: String(part.quantity), unit: part.unit, notes: part.notes, physical: String(part.quantity) }); setDialog({ type: "edit", part }); }} onCount={() => setStockMode("count")} onDelete={() => setDialog({ type: "delete", part })} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <Modal open={dialog === "add" || (typeof dialog === "object" && dialog?.type === "edit")} onClose={() => setDialog(null)} title={dialog === "add" ? "הוספת חלק" : "עריכת חלק"} className="max-w-md">
        <div className="space-y-3">
          <Input placeholder="שם חלק" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <Input placeholder="קוד חלק" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} />
          <Input inputMode="numeric" placeholder="כמות" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} />
          <Input placeholder="יחידת מידה" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} />
          <Input placeholder="הערה" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
          <Button disabled={busy} onClick={() => void run(async () => {
            if (dialog === "add") await requestParts({ method: "POST", body: { name: draft.name, code: draft.code, quantity: Number(draft.quantity), unit: draft.unit, notes: draft.notes } });
            else if (typeof dialog === "object" && dialog?.type === "edit") await requestParts({ method: "PATCH", body: { id: dialog.part.id, name: draft.name, code: draft.code, quantity: Number(draft.quantity), unit: draft.unit, notes: draft.notes } });
            setDialog(null);
          })}>שמור חלק</Button>
        </div>
      </Modal>

      <Modal open={dialog === "history"} onClose={() => setDialog(null)} title="היסטוריית תנועות" className="max-w-lg">
        {movements.length === 0 ? <p className="text-sm text-slate-500">אין תנועות</p> : (
          <ul className="space-y-2">
            {movements.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium">{row.partName} · {TYPE_LABEL[row.type] ?? row.type}</p>
                <p>{row.quantityBefore} → {row.quantityAfter} ({row.quantityChange > 0 ? `+${row.quantityChange}` : row.quantityChange})</p>
                <p className="text-xs text-slate-500">{row.userName} · {row.source === "ORDER" ? "הזמנה" : row.source === "COUNT" ? "ספירה" : "שינוי ידני"}{row.orderSerial ? ` · ${row.orderSerial}` : ""} · {new Date(row.createdAt).toLocaleString("he-IL")}</p>
                <p className="text-[11px] text-slate-400">{row.operationId}</p>
                {row.reason && <p className="text-slate-600">{row.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal open={typeof dialog === "object" && dialog?.type === "delete"} onClose={() => setDialog(null)} title="מחיקת חלק" className="max-w-sm">
        <p className="text-sm text-slate-600">האם למחוק את החלק?</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
          <Button variant="danger" disabled={busy} onClick={() => {
            if (typeof dialog !== "object" || dialog?.type !== "delete") return;
            void run(async () => {
              const data = await requestParts({ method: "DELETE", query: `?id=${encodeURIComponent(dialog.part.id)}` });
              if (data.notice) setNotice(data.notice);
              setDialog(null);
            });
          }}>מחק</Button>
        </div>
      </Modal>
    </>
    </InventoryModule>
  );
}

function PartRow(props: PartActions & { part: Part }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <MediaFace kind="part" id={props.part.id} name={props.part.name} canEdit={props.canEdit} />
          <div>
            <p className="font-medium">{props.part.name}</p>
            <p className="text-xs text-slate-500">{[props.part.code, props.part.unit, props.part.notes].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3"><Qty value={props.part.quantity} /></td>
      <td className="px-4 py-3">{props.canEdit && <QtyControl part={props.part} disabled={props.busy} onDelta={props.onDelta} onQuantity={props.onQuantity} />}</td>
      <td className="px-4 py-3"><Button size="sm" variant="ghost" onClick={props.onHistory}>היסטוריה</Button></td>
      <td className="px-4 py-3">{props.canEdit && <RowButtons {...props} />}</td>
    </tr>
  );
}

function PartBody(props: PartActions & { part: Part }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <MediaFace kind="part" id={props.part.id} name={props.part.name} canEdit={props.canEdit} />
          <div>
            <p className="font-bold">{props.part.name}</p>
            <p className="text-xs text-slate-500">{[props.part.code, props.part.notes].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <Qty value={props.part.quantity} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {props.canEdit && <QtyControl part={props.part} disabled={props.busy} onDelta={props.onDelta} onQuantity={props.onQuantity} />}
        <Button size="sm" variant="ghost" onClick={props.onHistory}>היסטוריה</Button>
        {props.canEdit && <RowButtons {...props} />}
      </div>
    </>
  );
}

type PartActions = {
  canEdit: boolean;
  busy: boolean;
  onDelta: (delta: number) => void;
  onQuantity: (quantity: number) => void;
  onHistory: () => void;
  onEdit: () => void;
  onCount: () => void;
  onDelete: () => void;
};

function RowButtons(props: PartActions) {
  return (
    <>
      <Button size="sm" variant="outline" onClick={props.onCount}>ספירה</Button>
      <Button size="sm" variant="ghost" onClick={props.onEdit}>עריכה</Button>
      <Button size="sm" variant="ghost" onClick={props.onDelete}>מחיקה</Button>
    </>
  );
}

function Qty({ value }: { value: number }) {
  return <span className={cn("font-bold", value < 0 && "text-red-600")}>{value}</span>;
}

function QtyControl({ part, disabled, onDelta, onQuantity }: { part: Part; disabled: boolean; onDelta: (delta: number) => void; onQuantity: (quantity: number) => void }) {
  const [draft, setDraft] = useState(String(part.quantity));
  useEffect(() => setDraft(String(part.quantity)), [part.quantity]);
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="הוספה" disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-lg border" onClick={() => onDelta(1)}><Plus className="h-4 w-4" /></button>
      <input value={draft} disabled={disabled} aria-label={`כמות ${part.name}`} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (Number(draft) !== part.quantity && draft.trim() !== "" && Number.isInteger(Number(draft))) onQuantity(Number(draft)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="h-8 w-16 rounded-lg border text-center text-sm font-bold" />
      <button type="button" aria-label="הפחתה" disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-lg border" onClick={() => onDelta(-1)}><Minus className="h-4 w-4" /></button>
    </div>
  );
}
