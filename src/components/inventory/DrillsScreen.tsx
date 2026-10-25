"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Minus, Plus } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { InventoryModule, StockButtons, useInventoryView } from "@/components/inventory/InventoryStockTools";
import { BarcodeScanBox, MediaFace } from "@/components/inventory/InventoryMedia";
import { DRILL_CATALOG_ID } from "@/lib/inventory/inventory-media-shared";

type Bit = { id: string; label: string; quantity: number | null; updatedAt: string; updatedByName: string };
type DrillTypeRow = { id: string; name: string; note: string; active: boolean; updatedAt: string; bits: Bit[] };
type Machine = { id: string; name: string; description: string; active: boolean; updatedAt: string; types: DrillTypeRow[] };
type QtyMode = "add" | "subtract" | "set";
type ReportKind = "all" | "model" | "material" | "number" | "zero" | "count" | "movements";

const REPORT_KIND: Record<ReportKind, string> = {
  all: "כל המלאי",
  model: "לפי דגם",
  material: "לפי חומר",
  number: "לפי מספר מקדח",
  zero: "פריטים בכמות אפס",
  count: "דוח ספירת מלאי",
  movements: "היסטוריית תנועות",
};

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

async function requestCountsHistory(itemId: string, title: string) {
  const response = await fetch(`/api/inventory/counts?type=DRILLS&history=1&itemId=${itemId}`, { credentials: "include" });
  const json = (await response.json()) as { success: boolean; data?: { movements: { id: string; action: string; quantityBefore: number; quantityChange: number; quantityAfter: number; reason: string; userName: string; createdAt: string }[] }; error?: { message?: string } };
  if (!json.success || !json.data) throw new Error(json.error?.message ?? "היסטוריה לא נטענה");
  return { title, rows: json.data.movements };
}

function totalOf(types: DrillTypeRow[]) {
  return types.filter((type) => type.active).reduce((sum, type) => sum + type.bits.reduce((inner, bit) => inner + (bit.quantity ?? 0), 0), 0);
}

export function DrillsScreen() {
  const [, setMode] = useInventoryView("DRILLS");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [openTypes, setOpenTypes] = useState<string[]>([]);
  const [focusBit, setFocusBit] = useState<string | null>(null);
  const [showScan, setShowScan] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [report, setReport] = useState<{ kind: ReportKind; model: string; material: string; number: string; from: string; to: string; format: "pdf" | "xlsx" }>({
    kind: "all", model: "", material: "", number: "", from: "", to: "", format: "pdf",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", description: "", quantity: "", barcode: "", reason: "" });
  const [dialog, setDialog] = useState<
    | { type: "model" }
    | { type: "material" }
    | { type: "rename-model"; id: string }
    | { type: "rename-material"; id: string }
    | { type: "rename-bit"; id: string }
    | { type: "qty"; mode: QtyMode; bitId: string; model: string; material: string; number: string; current: number | null }
    | { type: "delete"; kind: "machine" | "type" | "bit"; id: string; name: string }
    | null
  >(null);
  const [history, setHistory] = useState<{ title: string; rows: { id: string; action: string; quantityBefore: number; quantityChange: number; quantityAfter: number; reason: string; userName: string; createdAt: string }[] | null } | null>(null);
  const [historyBit, setHistoryBit] = useState("");

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
  const machine = activeMachines.find((item) => item.id === machineId) ?? activeMachines[0] ?? null;
  const materials = machine?.types.filter((type) => type.active) ?? [];
  const materialNames = useMemo(() => [...new Set(activeMachines.flatMap((item) => item.types.filter((type) => type.active).map((type) => type.name)))], [activeMachines]);
  const numberNames = useMemo(() => [...new Set(materials.flatMap((type) => type.bits.map((bit) => bit.label)))].sort((a, b) => a.localeCompare(b, "en")), [materials]);

  useEffect(() => {
    if (!machineId && activeMachines[0]) setMachineId(activeMachines[0].id);
  }, [activeMachines, machineId]);

  async function run(action: () => Promise<{ archived?: boolean } | void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      apply(await requestDrills());
      if (result && "archived" in result && result.archived) setNotice("הפריט הוסר מהרשימה הפעילה. היסטוריית התנועות נשמרה.");
      setDialog(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const previewBits = useMemo(() => {
    return activeMachines.flatMap((item) => item.types.filter((type) => type.active).flatMap((type) => type.bits.map((bit) => ({
      model: item.name, material: type.name, number: bit.label, quantity: bit.quantity,
    })))).filter((row) => {
      if (report.model && row.model !== report.model) return false;
      if (report.material && row.material !== report.material) return false;
      if (report.kind === "number" && report.number && row.number !== report.number) return false;
      if (report.kind === "zero" && row.quantity !== 0) return false;
      return true;
    });
  }, [activeMachines, report]);

  async function produceReport() {
    if ((report.kind === "model" && !report.model) || (report.kind === "material" && !report.material) || (report.kind === "number" && !report.number)) {
      setError("יש לבחור את הסינון המתאים לסוג הדוח");
      return;
    }
    const kind = report.kind === "count" ? "count-full" : report.kind === "movements" ? "movements" : "drills";
    const params: Record<string, string> = { format: report.format, kind };
    if (report.model) params.models = report.model;
    if (report.material) params.materials = report.material;
    if (report.kind === "number" && report.number) params.numbers = report.number;
    if (report.kind === "zero") params.zero = "1";
    if (report.from) params.from = report.from;
    if (report.to) params.to = report.to;
    await downloadDrillFile(params);
  }

  return (
    <InventoryModule type="DRILLS" title="מלאי מקדחים">
      <Header title="מלאי מקדחים" description="דגם, חומר ומספר מקדח" actions={<StockButtons type="DRILLS" />} />
      {error && <p className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>}
      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-opal-gold" /></div> : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
            <Button variant="outline" className="h-9" onClick={() => { setReport((current) => ({ ...current, model: machine?.name ?? "" })); setShowReports(true); }}>דוחות וייצוא</Button>
            <Button variant="outline" className="h-9" onClick={() => { setHistoryBit(materials[0]?.bits[0]?.id ?? ""); setHistory({ title: machine?.name ?? "תנועות", rows: null }); }}>היסטוריית תנועות</Button>
            <Button variant="outline" className="h-9" onClick={() => setMode("count")}>ספירת מלאי</Button>
            <Button variant="outline" className="h-9" onClick={() => setShowScan((value) => !value)}>סריקת ברקוד</Button>
            <span className="ms-auto flex items-center gap-2">
              <MediaFace kind="catalog" id={DRILL_CATALOG_ID} name="מלאי מקדחים" canEdit={canEdit} />
            </span>
          </div>
          {showScan && (
            <BarcodeScanBox onFound={(hit) => {
              if (hit.module !== "DRILLS" || hit.entityKind !== "bit") {
                setError("הברקוד אינו שייך למספר מקדח");
                return;
              }
              const found = activeMachines.flatMap((item) => item.types.flatMap((type) => type.bits.map((bit) => ({ machineId: item.id, typeId: type.id, bit })))).find((item) => item.bit.id === hit.entityId);
              if (!found) { setError("המספר לא נמצא במלאי הפעיל"); return; }
              setError(null);
              setMachineId(found.machineId);
              setOpenTypes([found.typeId]);
              setFocusBit(found.bit.id);
            }} />
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {activeMachines.map((item) => (
              <article key={item.id} className={`rounded-xl border bg-white p-3 ${item.id === machine?.id ? "border-opal-gold shadow-sm" : "border-slate-200"}`}>
                <div className="flex items-start gap-2">
                  <MediaFace kind="machine" id={item.id} name={item.name} canEdit={canEdit} />
                  <button type="button" className="min-w-0 flex-1 text-right" onClick={() => { setMachineId(item.id); setOpenTypes([]); setFocusBit(null); }}>
                    <span className="block text-lg font-bold text-slate-900">{item.name}</span>
                    <span className="text-sm text-slate-500">סה״כ {totalOf(item.types)} · {item.types.filter((type) => type.active).length} חומרים</span>
                  </button>
                </div>
                {canEdit && (
                  <div className="mt-2 flex gap-3 text-xs">
                    <button type="button" className="text-slate-600 hover:underline" onClick={() => { setDraft({ name: item.name, description: item.description, quantity: "", barcode: "", reason: "" }); setDialog({ type: "rename-model", id: item.id }); }}>עריכת שם</button>
                    <button type="button" className="text-red-600 hover:underline" onClick={() => setDialog({ type: "delete", kind: "machine", id: item.id, name: item.name })}>מחיקה</button>
                  </div>
                )}
              </article>
            ))}
          </div>
          {canEdit && <Button variant="outline" className="h-9" onClick={() => { setDraft({ name: "", description: "", quantity: "", barcode: "", reason: "" }); setDialog({ type: "model" }); }}><Plus className="h-4 w-4" />דגם</Button>}

          {machine && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">{machine.name}</h2>
                {canEdit && <Button className="h-9" onClick={() => { setDraft({ name: "", description: "", quantity: "", barcode: "", reason: "" }); setDialog({ type: "material" }); }}><Plus className="h-4 w-4" />סוג חומר</Button>}
              </div>
              {materials.map((type) => {
                const opened = openTypes.includes(type.id);
                const units = type.bits.reduce((sum, bit) => sum + (bit.quantity ?? 0), 0);
                const zeros = type.bits.filter((bit) => bit.quantity === 0).length;
                return (
                  <div key={type.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <MediaFace kind="type" id={type.id} name={type.name} canEdit={canEdit} />
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-right" onClick={() => setOpenTypes((current) => current.includes(type.id) ? current.filter((id) => id !== type.id) : [...current, type.id])}>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-slate-900">{type.name}</span>
                          <span className="text-xs text-slate-500">{type.bits.length} מספרים · {units} יחידות{zeros > 0 ? ` · ${zeros} באפס` : ""}</span>
                        </span>
                        <ChevronDown className={`h-4 w-4 text-slate-500 transition ${opened ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                    {opened && (
                      <div className="space-y-2 border-t border-slate-100 px-3 py-2">
                        {canEdit && (
                          <div className="flex gap-3 text-xs">
                            <button type="button" className="text-slate-600 hover:underline" onClick={() => { setDraft({ name: type.name, description: type.note, quantity: "", barcode: "", reason: "" }); setDialog({ type: "rename-material", id: type.id }); }}>עריכת שם החומר</button>
                            <button type="button" className="text-red-600 hover:underline" onClick={() => setDialog({ type: "delete", kind: "type", id: type.id, name: type.name })}>מחיקת חומר</button>
                          </div>
                        )}
                        {type.bits.length === 0 && <p className="text-sm text-slate-500">אין מספרי מקדחים. אפשר להוסיף למטה.</p>}
                        {type.bits.map((bit) => (
                          <article key={bit.id} className={`rounded-lg border p-2 ${focusBit === bit.id ? "border-opal-gold" : bit.quantity === 0 ? "border-red-200 bg-red-50" : "border-slate-100"}`}>
                            <div className="flex items-center gap-2">
                              <MediaFace kind="bit" id={bit.id} name={`${machine.name} ${type.name} ${bit.label}`} canEdit={canEdit} />
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-slate-900">{bit.label}</p>
                                <p className={`text-lg font-bold ${bit.quantity === 0 ? "text-red-700" : "text-slate-900"}`}>{bit.quantity ?? "—"}{bit.quantity === 0 ? " · אפס" : ""}</p>
                                <p className="text-xs text-slate-500">{new Date(bit.updatedAt).toLocaleString("he-IL")}{bit.updatedByName ? ` · ${bit.updatedByName}` : ""}</p>
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {canEdit && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setDraft({ name: "", description: "", quantity: "", barcode: "", reason: "" }); setDialog({ type: "qty", mode: "add", bitId: bit.id, model: machine.name, material: type.name, number: bit.label, current: bit.quantity }); }}><Plus className="h-3.5 w-3.5" />הוספה</Button>}
                              {canEdit && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setDraft({ name: "", description: "", quantity: "", barcode: "", reason: "" }); setDialog({ type: "qty", mode: "subtract", bitId: bit.id, model: machine.name, material: type.name, number: bit.label, current: bit.quantity }); }}><Minus className="h-3.5 w-3.5" />הפחתה</Button>}
                              {canEdit && <button type="button" className="text-xs text-slate-700 hover:underline" onClick={() => { setDraft({ name: "", description: "", quantity: "", barcode: "", reason: "" }); setDialog({ type: "qty", mode: "set", bitId: bit.id, model: machine.name, material: type.name, number: bit.label, current: bit.quantity }); }}>קביעת כמות</button>}
                              <button type="button" className="text-xs text-slate-700 hover:underline" onClick={() => void requestCountsHistory(bit.id, `${machine.name} / ${type.name} / ${bit.label}`).then(setHistory).catch((err: unknown) => setError(err instanceof Error ? err.message : "היסטוריה לא נטענה"))}>היסטוריה</button>
                              {canEdit && <button type="button" className="text-xs text-slate-700 hover:underline" onClick={() => { setDraft({ name: bit.label, description: "", quantity: "", barcode: "", reason: "" }); setDialog({ type: "rename-bit", id: bit.id }); }}>עריכת מספר</button>}
                              {canEdit && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setDialog({ type: "delete", kind: "bit", id: bit.id, name: bit.label })}>מחיקה</button>}
                            </div>
                          </article>
                        ))}
                        {canEdit && (
                          <form className="flex flex-wrap gap-2" onSubmit={(event) => {
                            event.preventDefault();
                            const form = event.currentTarget;
                            const input = form.elements.namedItem("number") as HTMLInputElement;
                            const label = input.value.trim();
                            if (!label) return;
                            void run(() => requestDrills({ method: "POST", body: { kind: "bit", typeId: type.id, name: label, quantity: 0 } })).then((ok) => { if (ok) input.value = ""; });
                          }}>
                            <Input name="number" placeholder="מספר מקדח, למשל T5" aria-label={`מספר חדש ל${type.name}`} className="h-9 max-w-48" />
                            <Button type="submit" variant="outline" className="h-9" disabled={busy}><Plus className="h-3.5 w-3.5" />הוסף מספר</Button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}

      <Modal open={showReports} onClose={() => setShowReports(false)} title="דוחות וייצוא" className="max-w-lg">
        <div className="space-y-3">
          <label className="block text-sm">סוג הדוח
            <select aria-label="סוג הדוח" value={report.kind} onChange={(event) => setReport({ ...report, kind: event.target.value as ReportKind })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2">
              {(Object.keys(REPORT_KIND) as ReportKind[]).map((kind) => <option key={kind} value={kind}>{REPORT_KIND[kind]}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-sm">דגם
              <select aria-label="סינון דגם" value={report.model} onChange={(event) => setReport({ ...report, model: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2">
                <option value="">כל הדגמים</option>
                {activeMachines.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-sm">חומר
              <select aria-label="סינון חומר" value={report.material} onChange={(event) => setReport({ ...report, material: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2">
                <option value="">כל החומרים</option>
                {materialNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>
          {report.kind === "number" && (
            <label className="block text-sm">מספר מקדח
              <select aria-label="מספר מקדח" value={report.number} onChange={(event) => setReport({ ...report, number: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2">
                <option value="">בחרו מספר</option>
                {numberNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          )}
          {(report.kind === "movements" || report.kind === "count") && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">מתאריך<input type="date" aria-label="מתאריך" value={report.from} onChange={(event) => setReport({ ...report, from: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2" /></label>
              <label className="text-sm">עד תאריך<input type="date" aria-label="עד תאריך" value={report.to} onChange={(event) => setReport({ ...report, to: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2" /></label>
            </div>
          )}
          <fieldset className="flex gap-4 text-sm">
            <legend className="mb-1">פורמט</legend>
            <label><input type="radio" name="drill-format" checked={report.format === "pdf"} onChange={() => setReport({ ...report, format: "pdf" })} /> PDF</label>
            <label><input type="radio" name="drill-format" checked={report.format === "xlsx"} onChange={() => setReport({ ...report, format: "xlsx" })} /> Excel</label>
          </fieldset>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-bold">{REPORT_KIND[report.kind]} · {previewBits.length} פריטים · סה״כ {previewBits.reduce((sum, row) => sum + (row.quantity ?? 0), 0)}</p>
            <ul className="mt-2 space-y-1">
              {previewBits.slice(0, 8).map((row) => <li key={`${row.model}-${row.material}-${row.number}`}>{row.model} / {row.material} / {row.number} · {row.quantity ?? "—"}</li>)}
            </ul>
            {previewBits.length > 8 && <p className="mt-1 text-xs text-slate-500">ועוד {previewBits.length - 8} פריטים בדוח המלא.</p>}
            {(report.kind === "count" || report.kind === "movements") && <p className="mt-2 text-xs text-slate-500">הקובץ כולל את הספירות או התנועות השמורות לפי הסינון, עם לוגו, תאריך וסיכום.</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowReports(false)}>סגירה</Button>
            <Button disabled={busy} onClick={() => void produceReport().catch((err: unknown) => setError(err instanceof Error ? err.message : "הפקת הדוח נכשלה"))}>הפק דוח</Button>
          </div>
        </div>
      </Modal>

      <Modal open={dialog?.type === "model" || dialog?.type === "rename-model"} onClose={() => setDialog(null)} title={dialog?.type === "rename-model" ? "עריכת דגם" : "הוספת דגם"} className="max-w-sm">
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          if (dialog?.type === "rename-model") void run(() => requestDrills({ method: "PATCH", body: { kind: "machine", id: dialog.id, name: draft.name, description: draft.description } }));
          else void run(() => requestDrills({ method: "POST", body: { kind: "machine", name: draft.name, description: draft.description, active: true } }));
        }}>
          <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="שם דגם" aria-label="שם דגם" />
          <Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="תיאור" aria-label="תיאור" />
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>ביטול</Button><Button type="submit" disabled={busy || !draft.name.trim()}>שמירה</Button></div>
        </form>
      </Modal>

      <Modal open={dialog?.type === "material" || dialog?.type === "rename-material"} onClose={() => setDialog(null)} title={dialog?.type === "rename-material" ? "עריכת חומר" : "הוספת חומר"} className="max-w-sm">
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          if (!machine) return;
          if (dialog?.type === "rename-material") void run(() => requestDrills({ method: "PATCH", body: { kind: "type", id: dialog.id, name: draft.name, description: draft.description } }));
          else void run(() => requestDrills({ method: "POST", body: { kind: "type", machineId: machine.id, name: draft.name, note: draft.description } }));
        }}>
          <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="שם חומר" aria-label="שם חומר" />
          <Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="הערה" aria-label="הערה" />
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>ביטול</Button><Button type="submit" disabled={busy || !draft.name.trim()}>שמירה</Button></div>
        </form>
      </Modal>

      <Modal open={dialog?.type === "rename-bit"} onClose={() => setDialog(null)} title="עריכת מספר מקדח" className="max-w-sm">
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          if (dialog?.type !== "rename-bit") return;
          void run(() => requestDrills({ method: "PATCH", body: { kind: "bit", id: dialog.id, name: draft.name } }));
        }}>
          <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="מספר מקדח" aria-label="מספר מקדח" />
          <p className="text-xs text-slate-500">שינוי המספר לא משנה את הכמות ואת היסטוריית התנועות.</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>ביטול</Button><Button type="submit" disabled={busy || !draft.name.trim()}>שמירה</Button></div>
        </form>
      </Modal>

      <Modal open={dialog?.type === "qty"} onClose={() => setDialog(null)} title={dialog?.type === "qty" && dialog.mode === "add" ? "הוספת כמות" : dialog?.type === "qty" && dialog.mode === "subtract" ? "הפחתת כמות" : "קביעת כמות"} className="max-w-sm">
        {dialog?.type === "qty" && (
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            const amount = Number(draft.quantity);
            if (!Number.isInteger(amount) || amount < 0 || (dialog.mode !== "set" && amount === 0)) return;
            const body = dialog.mode === "set"
              ? { kind: "adjust", bitId: dialog.bitId, quantity: amount, reason: draft.reason || "ספירת מלאי בפועל" }
              : { kind: "adjust", bitId: dialog.bitId, delta: dialog.mode === "add" ? amount : -amount, reason: draft.reason };
            void run(() => requestDrills({ method: "POST", body }));
          }}>
            <p className="text-sm">{dialog.model} / {dialog.material} / {dialog.number}</p>
            <p className="text-sm">כמות נוכחית: {dialog.current ?? "—"}</p>
            <Input value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} inputMode="numeric" placeholder={dialog.mode === "set" ? "כמות בפועל" : "כמות לשינוי"} aria-label="כמות" />
            {dialog.mode !== "set" && Number.isInteger(Number(draft.quantity)) && draft.quantity.trim() !== "" && (
              <p className="text-sm font-medium">התוצאה: {(dialog.current ?? 0) + (dialog.mode === "add" ? Number(draft.quantity) : -Number(draft.quantity))}</p>
            )}
            {dialog.mode === "set" && <p className="text-xs text-slate-500">הפעולה קובעת את הכמות שבמלאי. היא לא מוסיפה על הכמות הקיימת.</p>}
            <Input value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="הערה" aria-label="הערה" />
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>ביטול</Button><Button type="submit" disabled={busy || draft.quantity.trim() === ""}>שמירה</Button></div>
          </form>
        )}
      </Modal>

      <Modal open={dialog?.type === "delete"} onClose={() => setDialog(null)} title="אישור מחיקה" className="max-w-sm">
        {dialog?.type === "delete" && (
          <div className="space-y-3">
            <p className="text-sm">למחוק את {dialog.name}? אם יש מלאי חיובי המחיקה תיחסם. אם יש תנועות, הפריט יוסר מהרשימה והתיעוד יישמר.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
              <Button variant="danger" disabled={busy} onClick={() => void run(() => requestDrills({ method: "DELETE", query: `?kind=${dialog.kind}&id=${dialog.id}` }))}>מחיקה</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(history)} onClose={() => setHistory(null)} title={history ? `היסטוריה — ${history.title}` : "היסטוריה"} className="max-w-lg">
        {history && history.rows === null && (
          <div className="space-y-3">
            <label className="block text-sm">מספר מקדח
              <select aria-label="מספר להיסטוריה" value={historyBit} onChange={(event) => setHistoryBit(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2">
                <option value="">בחרו מספר</option>
                {materials.flatMap((type) => type.bits.map((bit) => <option key={bit.id} value={bit.id}>{type.name} / {bit.label}</option>))}
              </select>
            </label>
            <Button disabled={!historyBit} onClick={() => {
              const bit = materials.flatMap((type) => type.bits.map((item) => ({ type, item }))).find((row) => row.item.id === historyBit);
              if (!bit || !machine) return;
              void requestCountsHistory(bit.item.id, `${machine.name} / ${bit.type.name} / ${bit.item.label}`).then(setHistory).catch((err: unknown) => setError(err instanceof Error ? err.message : "היסטוריה לא נטענה"));
            }}>הצגת תנועות</Button>
          </div>
        )}
        {history && history.rows !== null && history.rows.length === 0 && <p className="text-sm text-slate-500">אין תנועות</p>}
        {history && history.rows !== null && history.rows.length > 0 && (
          <ul className="space-y-2">{history.rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <p className="font-medium">{row.action}</p>
              <p>{row.quantityBefore} → {row.quantityAfter} ({row.quantityChange > 0 ? `+${row.quantityChange}` : row.quantityChange})</p>
              <p className="text-xs text-slate-500">{row.userName} · {new Date(row.createdAt).toLocaleString("he-IL")}</p>
              {row.reason && <p>{row.reason}</p>}
            </li>
          ))}</ul>
        )}
      </Modal>
    </InventoryModule>
  );
}
