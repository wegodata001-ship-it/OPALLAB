"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Minus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { InventoryModule, StockButtons, queueInventoryScan, useInventoryView } from "@/components/inventory/InventoryStockTools";
import { BarcodeScanBox, MediaFace, useInventoryMedia } from "@/components/inventory/InventoryMedia";
import { barcodeMarkup } from "@/lib/inventory/barcode-svg";

type StockKind = "CLINIC_MATERIALS" | "OTHER_MATERIALS";

type StockItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  note: string;
  minQuantity?: number | null;
};

type HistoryRow = {
  id: string;
  action: string;
  delta: number;
  balanceAfter: number;
  userName: string;
  createdAt: string;
};

const LAYOUT_KEY = "opal-clinic-product-view";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

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
  const [draftMin, setDraftMin] = useState("");
  const [draftBarcode, setDraftBarcode] = useState("");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [customUnit, setCustomUnit] = useState(false);
  const [layout, setLayout] = useState<"cards" | "table">("cards");
  const [scanned, setScanned] = useState<StockItem | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[] | null>(null);
  const [historyTitle, setHistoryTitle] = useState("");
  const [, setMode] = useInventoryView(kind);
  const media = useInventoryMedia();

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
    if (kind !== "CLINIC_MATERIALS") return;
    const saved = window.localStorage.getItem(LAYOUT_KEY);
    if (saved === "cards" || saved === "table") setLayout(saved);
  }, [kind]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

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

  function resetDraft() {
    setDraftName("");
    setDraftQty("0");
    setDraftUnit("");
    setDraftNote("");
    setDraftMin("");
    setDraftBarcode("");
    setCustomUnit(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setDraftFile(null);
  }

  function openAdd() {
    resetDraft();
    setAdding(true);
  }

  function openEdit(item: StockItem) {
    resetDraft();
    setDraftName(item.name);
    setDraftQty(String(item.quantity));
    setDraftUnit(item.unit);
    setDraftNote(item.note);
    setDraftMin(item.minQuantity == null ? "" : String(item.minQuantity));
    setDraftBarcode(media.byId.get(item.id)?.barcode ?? "");
    setEditing(item);
  }

  function chooseImage(file: File | null) {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("אפשר להעלות JPG, PNG או WEBP");
      return;
    }
    if (file.size > 6_000_000) {
      setError("גודל התמונה גדול מדי");
      return;
    }
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setDraftFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function saveProduct() {
    if (kind !== "CLINIC_MATERIALS") {
      const quantity = Number(draftQty);
      const body = { name: draftName, quantity, unit: draftUnit, note: draftNote };
      const ok = editing
        ? await run(() => requestStock({ method: "PATCH", kind, body: { id: editing.id, ...body } }))
        : await run(() => requestStock({ method: "POST", kind, body: { kind, ...body } }));
      if (ok) {
        setAdding(false);
        setEditing(null);
      }
      return;
    }
    const minQuantity = draftMin.trim() === "" ? null : Number(draftMin);
    if (minQuantity !== null && (!Number.isInteger(minQuantity) || minQuantity < 0)) {
      setError("כמות המינימום אינה תקינה");
      return;
    }
    if (editing) {
      const ok = await run(() => requestStock({
        method: "PATCH",
        kind,
        body: { id: editing.id, name: draftName, unit: draftUnit, note: draftNote, minQuantity },
      }));
      if (!ok) return;
      try {
        if (draftFile) {
          const current = media.byId.get(editing.id)?.images.find((image) => image.isPrimary) ?? media.byId.get(editing.id)?.images[0];
          const form = new FormData();
          form.set("module", kind);
          form.set("entityKind", "item");
          form.set("entityId", editing.id);
          form.set("file", draftFile);
          form.set("makePrimary", "1");
          const uploaded = await fetch("/api/inventory/media", { method: "POST", credentials: "include", body: form });
          const uploadedBody = await uploaded.json();
          if (!uploaded.ok || !uploadedBody.success) throw new Error(uploadedBody?.error?.message ?? "העלאת התמונה נכשלה");
          if (current) await fetch(`/api/inventory/media?imageId=${encodeURIComponent(current.id)}`, { method: "DELETE", credentials: "include" });
        }
        const previous = media.byId.get(editing.id)?.barcode ?? "";
        if (draftBarcode.trim() !== previous) {
          const response = await fetch("/api/inventory/media", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draftBarcode.trim()
              ? { action: "barcode", module: kind, entityKind: "item", entityId: editing.id, code: draftBarcode.trim() }
              : { action: "clear-barcode", module: kind, entityKind: "item", entityId: editing.id }),
          });
          const body = await response.json();
          if (!response.ok || !body.success) throw new Error(body?.error?.message ?? "שמירת הברקוד נכשלה");
        }
        await media.reload();
        setAdding(false);
        setEditing(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "השמירה נכשלה");
      }
      return;
    }
    const quantity = draftQty.trim() === "" ? 0 : Number(draftQty);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("הכמות אינה תקינה");
      return;
    }
    const form = new FormData();
    form.set("kind", kind);
    form.set("name", draftName);
    form.set("quantity", String(quantity));
    form.set("unit", draftUnit);
    form.set("note", draftNote);
    form.set("minQuantity", minQuantity == null ? "" : String(minQuantity));
    form.set("barcode", draftBarcode.trim());
    if (draftFile) form.set("file", draftFile);
    const ok = await run(async () => {
      const response = await fetch("/api/inventory/simple-stock", { method: "POST", credentials: "include", body: form });
      const json = await response.json() as { success: boolean; data?: StockResponse; error?: { message?: string } };
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "שגיאה בשמירה");
      return json.data;
    });
    if (ok) {
      await media.reload();
      setAdding(false);
      setEditing(null);
    }
  }

  async function changeQuantity(id: string, patch: { delta?: number; quantity?: number }) {
    await run(() => requestStock({ method: "PATCH", kind, body: { id, ...patch } }));
  }

  async function openHistory(item: StockItem) {
    setHistoryTitle(item.name);
    setHistoryRows([]);
    try {
      const response = await fetch(`/api/inventory/simple-stock?kind=${kind}&history=1&id=${encodeURIComponent(item.id)}`, { credentials: "include" });
      const json = await response.json() as { success?: boolean; data?: { history?: HistoryRow[] }; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? "שגיאה בטעינת ההיסטוריה");
      setHistoryRows(json.data?.history ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת ההיסטוריה");
      setHistoryRows(null);
    }
  }

  async function generateBarcode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      let body = "";
      for (const byte of bytes) body += alphabet[byte % alphabet.length];
      const code = `OP${body}`;
      const response = await fetch(`/api/inventory/media?code=${encodeURIComponent(code)}`, { credentials: "include" });
      const json = await response.json() as { success?: boolean; data?: { match?: unknown } };
      if (json.success && !json.data?.match) {
        setDraftBarcode(code);
        setError(null);
        return;
      }
    }
    setError("לא הצלחנו ליצור ברקוד פנוי");
  }

  function printBarcode(code: string) {
    const graphic = barcodeMarkup(code);
    if (!graphic.svg) {
      setError("אי אפשר להדפיס את הברקוד הזה כ־Code 128");
      return;
    }
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return;
    popup.document.write(`<html dir="rtl"><body style="font-family:Arial;text-align:center">${graphic.svg}<script>print()<\/script></body></html>`);
    popup.document.close();
  }

  return (
    <InventoryModule type={kind} title={title}>
    <>
      <Header
        title={title}
        description="הוספת מוצר, כמות ועדכון מיידי"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StockButtons type={kind} onLeafScan={kind === "CLINIC_MATERIALS" ? (hit) => {
              if (hit.module !== kind) {
                setError("הברקוד שייך לקטגוריית מלאי אחרת. הסריקה לא שינתה כמות.");
                return;
              }
              const found = items.find((item) => item.id === hit.entityId);
              if (!found) {
                setError("הברקוד לא מזהה מוצר בחומרים למרפאה. הסריקה לא שינתה כמות.");
                return;
              }
              setError(null);
              setScanned(found);
            } : undefined} />
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
        {kind === "CLINIC_MATERIALS" && (
          <div className="flex gap-1">
            <button type="button" className={`rounded-lg border px-2 py-1.5 text-xs ${layout === "cards" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} onClick={() => { setLayout("cards"); window.localStorage.setItem(LAYOUT_KEY, "cards"); }}>כרטיסים</button>
            <button type="button" className={`rounded-lg border px-2 py-1.5 text-xs ${layout === "table" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} onClick={() => { setLayout("table"); window.localStorage.setItem(LAYOUT_KEY, "table"); }}>טבלה</button>
          </div>
        )}
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
      ) : kind === "CLINIC_MATERIALS" ? (
        layout === "cards" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => <ClinicCard key={item.id} item={item} canEdit={canEdit} busy={busy} barcode={media.byId.get(item.id)?.barcode ?? ""} onEdit={openEdit} onDelete={setPendingDelete} onHistory={(row) => void openHistory(row)} onDelta={(id, delta) => void changeQuantity(id, { delta })} />)}
          </div>
        ) : (
          <ClinicTable items={visible} canEdit={canEdit} busy={busy} barcodeOf={(id) => media.byId.get(id)?.barcode ?? ""} onEdit={openEdit} onDelete={setPendingDelete} onHistory={(row) => void openHistory(row)} onDelta={(id, delta) => void changeQuantity(id, { delta })} />
        )
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
                        <MediaFace kind="item" id={item.id} name={item.name} canEdit={canEdit} size="thumb" />
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
        className="max-w-xl"
      >
        {kind === "CLINIC_MATERIALS" ? (
          <ClinicForm
            editing={Boolean(editing)}
            currentImage={editing ? media.byId.get(editing.id)?.images.find((image) => image.isPrimary)?.url ?? media.byId.get(editing.id)?.images[0]?.url ?? null : null}
            previewUrl={previewUrl}
            name={draftName}
            barcode={draftBarcode}
            quantity={draftQty}
            unit={draftUnit}
            customUnit={customUnit}
            units={[...new Set(items.map((item) => item.unit).filter(Boolean))]}
            minQuantity={draftMin}
            note={draftNote}
            busy={busy}
            onName={setDraftName}
            onBarcode={setDraftBarcode}
            onQuantity={setDraftQty}
            onUnit={(value) => { setCustomUnit(value === "__new"); setDraftUnit(value === "__new" ? "" : value); }}
            onCustomUnit={setDraftUnit}
            onMin={setDraftMin}
            onNote={setDraftNote}
            onFile={chooseImage}
            onClearFile={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setDraftFile(null); }}
            onGenerate={() => void generateBarcode()}
            onPrint={() => printBarcode(draftBarcode)}
            onRemoveImage={editing ? () => {
              const image = media.byId.get(editing.id)?.images.find((row) => row.isPrimary) ?? media.byId.get(editing.id)?.images[0];
              if (!image) return;
              void fetch(`/api/inventory/media?imageId=${encodeURIComponent(image.id)}`, { method: "DELETE", credentials: "include" }).then(() => media.reload());
            } : undefined}
          />
        ) : (
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
        )}
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
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            שמור מוצר
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(scanned)} onClose={() => setScanned(null)} title={scanned?.name ?? "מוצר"} className="max-w-md">
        {scanned && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">הסריקה זיהתה את המוצר ולא שינתה את הכמות.</p>
            <MediaFace kind="item" id={scanned.id} name={scanned.name} canEdit={canEdit} />
            <p className="text-lg font-bold">{scanned.name}</p>
            <p>כמות נוכחית: <span className="font-bold">{scanned.quantity}</span> {scanned.unit}</p>
            <p className="text-sm text-slate-500">ברקוד: {media.byId.get(scanned.id)?.barcode || "—"}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { queueInventoryScan(kind, { entityId: scanned.id, code: media.byId.get(scanned.id)?.barcode ?? "" }); setScanned(null); setMode("count"); }}>ספירת מלאי</Button>
              {canEdit && <Button onClick={() => { void changeQuantity(scanned.id, { delta: 1 }); setScanned({ ...scanned, quantity: scanned.quantity + 1 }); }}>הוספת כמות</Button>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={historyRows != null} onClose={() => setHistoryRows(null)} title={`היסטוריית מלאי${historyTitle ? ` — ${historyTitle}` : ""}`} className="max-w-md">
        {historyRows && historyRows.length === 0 ? <p className="text-sm text-slate-500">אין תנועות</p> : (
          <ul className="space-y-2">
            {historyRows?.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium">{row.action === "IN" ? "הוספה" : row.action === "OUT" ? "הפחתה" : row.action === "SET" ? "קביעת כמות" : row.action === "COUNT" ? "ספירה" : row.action}</p>
                <p>יתרה {row.balanceAfter} ({row.delta > 0 ? `+${row.delta}` : row.delta})</p>
                <p className="text-xs text-slate-500">{row.userName} · {new Date(row.createdAt).toLocaleString("he-IL")}</p>
              </li>
            ))}
          </ul>
        )}
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

function stockStatus(item: StockItem) {
  if (item.quantity <= 0) return { label: "אזל", className: "bg-red-50 text-red-700" };
  if (item.minQuantity != null && item.minQuantity > 0 && item.quantity < item.minQuantity) return { label: "חוסר", className: "bg-orange-50 text-orange-700" };
  return { label: "תקין", className: "bg-emerald-50 text-emerald-700" };
}

function ClinicCard(props: {
  item: StockItem;
  canEdit: boolean;
  busy: boolean;
  barcode: string;
  onEdit: (item: StockItem) => void;
  onDelete: (item: StockItem) => void;
  onHistory: (item: StockItem) => void;
  onDelta: (id: string, delta: number) => void;
}) {
  const status = stockStatus(props.item);
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3">
      <MediaFace kind="item" id={props.item.id} name={props.item.name} canEdit={props.canEdit} />
      <p className="mt-2 font-bold text-slate-900">{props.item.name}</p>
      <p className="text-sm text-slate-600">{props.item.quantity} {props.item.unit || "יח׳"}</p>
      <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{props.barcode || "אין ברקוד"}</p>
      {props.canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <button type="button" aria-label="הוספת כמות" className="flex h-8 w-8 items-center justify-center rounded-lg border" disabled={props.busy} onClick={() => props.onDelta(props.item.id, 1)}><Plus className="h-4 w-4" /></button>
          <button type="button" aria-label="הפחתת כמות" className="flex h-8 w-8 items-center justify-center rounded-lg border" disabled={props.busy || props.item.quantity <= 0} onClick={() => props.onDelta(props.item.id, -1)}><Minus className="h-4 w-4" /></button>
          <button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={() => props.onEdit(props.item)}>עריכה</button>
          <button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={() => props.onHistory(props.item)}>היסטוריה</button>
          <button type="button" aria-label="מחיקה" className="rounded-lg p-1 text-red-600" onClick={() => props.onDelete(props.item)}><Trash2 className="h-4 w-4" /></button>
        </div>
      )}
    </article>
  );
}

function ClinicTable(props: {
  items: StockItem[];
  canEdit: boolean;
  busy: boolean;
  barcodeOf: (id: string) => string;
  onEdit: (item: StockItem) => void;
  onDelete: (item: StockItem) => void;
  onHistory: (item: StockItem) => void;
  onDelta: (id: string, delta: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>{["תמונה", "מוצר", "ברקוד", "כמות", "סטטוס", "פעולות"].map((label) => <th key={label} className="px-3 py-2 text-right font-medium">{label}</th>)}</tr>
        </thead>
        <tbody>
          {props.items.map((item) => {
            const status = stockStatus(item);
            return (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-3 py-2"><MediaFace kind="item" id={item.id} name={item.name} canEdit={props.canEdit} size="thumb" /></td>
                <td className="px-3 py-2 font-medium">{item.name}<span className="block text-xs font-normal text-slate-500">{item.unit || "יח׳"}</span></td>
                <td className="px-3 py-2">{props.barcodeOf(item.id) || "—"}</td>
                <td className="px-3 py-2 font-bold">{item.quantity}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span></td>
                <td className="px-3 py-2">
                  {props.canEdit && (
                    <div className="flex gap-1">
                      <button type="button" aria-label="הוספת כמות" disabled={props.busy} onClick={() => props.onDelta(item.id, 1)}><Plus className="h-4 w-4" /></button>
                      <button type="button" aria-label="הפחתת כמות" disabled={props.busy || item.quantity <= 0} onClick={() => props.onDelta(item.id, -1)}><Minus className="h-4 w-4" /></button>
                      <button type="button" className="text-xs" onClick={() => props.onEdit(item)}>עריכה</button>
                      <button type="button" className="text-xs" onClick={() => props.onHistory(item)}>היסטוריה</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClinicForm(props: {
  editing: boolean;
  currentImage: string | null;
  previewUrl: string | null;
  name: string;
  barcode: string;
  quantity: string;
  unit: string;
  customUnit: boolean;
  units: string[];
  minQuantity: string;
  note: string;
  busy: boolean;
  onName: (value: string) => void;
  onBarcode: (value: string) => void;
  onQuantity: (value: string) => void;
  onUnit: (value: string) => void;
  onCustomUnit: (value: string) => void;
  onMin: (value: string) => void;
  onNote: (value: string) => void;
  onFile: (file: File | null) => void;
  onClearFile: () => void;
  onGenerate: () => void;
  onPrint: () => void;
  onRemoveImage?: () => void;
}) {
  const shown = props.previewUrl || props.currentImage;
  const graphic = props.barcode ? barcodeMarkup(props.barcode) : null;
  return (
    <div className="space-y-3 overflow-x-hidden">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">תמונת מוצר</p>
        <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-2xl bg-white">
          {shown ? <img src={shown} alt="" className="max-h-48 w-full object-contain" /> : <span className="text-sm text-slate-400">הוסף תמונה</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
            בחירה מהמחשב
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => props.onFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
            צילום מהטלפון
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => props.onFile(event.target.files?.[0] ?? null)} />
          </label>
          {props.previewUrl && <button type="button" className="text-sm text-red-600" onClick={props.onClearFile}>הסרת התמונה שנבחרה</button>}
          {props.editing && props.currentImage && props.onRemoveImage && <button type="button" className="text-sm text-red-600" onClick={props.onRemoveImage}>הסרת התמונה השמורה</button>}
        </div>
      </div>
      <Field label="שם מוצר">
        <Input autoFocus value={props.name} onChange={(event) => props.onName(event.target.value)} aria-label="שם מוצר" />
      </Field>
      <Field label="ברקוד">
        <Input value={props.barcode} onChange={(event) => props.onBarcode(event.target.value)} aria-label="ברקוד" placeholder="אפשר להשאיר ריק" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-9" disabled={props.busy} onClick={props.onGenerate}>צור ברקוד</Button>
          {props.barcode && <Button type="button" variant="outline" className="h-9" onClick={props.onPrint}>הדפסת מדבקה</Button>}
        </div>
        <div className="mt-2">
          <BarcodeScanBox onCapture={props.onBarcode} videoId="clinic-barcode-video" />
        </div>
        {graphic?.svg && <div className="mt-2 overflow-hidden" dangerouslySetInnerHTML={{ __html: graphic.svg }} />}
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={props.editing ? "כמות נוכחית" : "כמות התחלתית"}>
          <Input inputMode="numeric" value={props.quantity} disabled={props.editing} onChange={(event) => props.onQuantity(event.target.value)} aria-label="כמות" />
        </Field>
        <Field label="יחידת מידה">
          <select aria-label="יחידת מידה" value={props.customUnit ? "__new" : props.unit} onChange={(event) => props.onUnit(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
            <option value="">ללא</option>
            {props.units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            <option value="__new">יחידה חדשה</option>
          </select>
          {props.customUnit && <Input className="mt-2" value={props.unit} onChange={(event) => props.onCustomUnit(event.target.value)} aria-label="יחידת מידה חדשה" placeholder="יחידת מידה חדשה" />}
        </Field>
      </div>
      {props.editing && <p className="text-xs text-slate-500">שינוי כמות נעשה בכפתורי הוספה והפחתה, ונרשם בהיסטוריית המלאי.</p>}
      <Field label="כמות מינימום להתראה">
        <Input inputMode="numeric" value={props.minQuantity} onChange={(event) => props.onMin(event.target.value)} aria-label="כמות מינימום" placeholder="לא חובה" />
      </Field>
      <Field label="הערות">
        <Input value={props.note} onChange={(event) => props.onNote(event.target.value)} aria-label="הערות" />
      </Field>
    </div>
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
