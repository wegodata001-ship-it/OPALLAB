"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Loader2, Minus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { InventoryModule, StockButtons } from "@/components/inventory/InventoryStockTools";
import { BarcodeScanBox, MediaFace, useInventoryMedia } from "@/components/inventory/InventoryMedia";
import { barcodeMarkup } from "@/lib/inventory/barcode-svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { expandImplantMatches, filterImplantTree, implantStockState, toggleImplantId, type ImplantStockFilter } from "@/lib/inventory/implant-tree";
import { cn } from "@/lib/utils";

type HeightNode = {
  id: string;
  label: string;
  unit: string;
  notes: string;
  quantity: number;
  minQuantity: number;
  sortOrder: number;
  archivedAt: string | null;
};
type TypeNode = { id: string; name: string; sortOrder: number; archivedAt: string | null; heights: HeightNode[] };
type ModelNode = { id: string; name: string; sortOrder: number; archivedAt: string | null; types: TypeNode[] };
type BrandNode = { id: string; name: string; sortOrder: number; archivedAt: string | null; models: ModelNode[] };
type Summary = { totalQuantity: number; modelCount: number; typeCount: number; lowStockCount: number; outOfStockCount: number };
type CatalogResponse = { canEdit: boolean; canCount: boolean; notice: string | null; summary: Summary; brands: BrandNode[] };
type SizeFocus = { id: string; label: string; path: string; quantity: number; barcode: string };
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
type Dialog =
  | { mode: "add"; kind: Level; parentId?: string }
  | { mode: "edit"; kind: Exclude<Level, "height">; id: string }
  | { mode: "edit-height"; id: string }
  | { mode: "history"; id: string; label: string };

const FILTERS: { id: ImplantStockFilter; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "ok", label: "תקין" },
  { id: "low", label: "נמוך" },
  { id: "out", label: "אזל" },
];

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

function qtyOf(heights: HeightNode[]): number {
  return active(heights).reduce((sum, height) => sum + height.quantity, 0);
}

function locateHeight(rows: BrandNode[], id: string) {
  for (const brand of rows) {
    for (const model of brand.models) {
      for (const type of model.types) {
        const height = type.heights.find((item) => item.id === id);
        if (height) return { brand, model, type, height, path: `${brand.name} / ${model.name} / ${type.name}` };
      }
    }
  }
  return null;
}

function pathForType(rows: BrandNode[], typeId: string) {
  for (const brand of rows) {
    for (const model of brand.models) {
      const type = model.types.find((item) => item.id === typeId);
      if (type) return `${brand.name} / ${model.name} / ${type.name}`;
    }
  }
  return "";
}

const BARCODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function suggestBarcode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `OP${[...bytes].map((value) => BARCODE_ALPHABET[value % BARCODE_ALPHABET.length]).join("")}`;
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
  const [canCount, setCanCount] = useState(false);
  const media = useInventoryMedia();
  const [openBrands, setOpenBrands] = useState<string[]>([]);
  const [openModels, setOpenModels] = useState<string[]>([]);
  const [openTypes, setOpenTypes] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<ImplantStockFilter>("all");
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
  const [draftUnit, setDraftUnit] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftBarcode, setDraftBarcode] = useState("");
  const [savedBarcode, setSavedBarcode] = useState("");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [focus, setFocus] = useState<SizeFocus | null>(null);
  const [counted, setCounted] = useState("");
  const [countNote, setCountNote] = useState<string | null>(null);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const apply = useCallback((data: CatalogResponse) => {
    setBrands(data.brands);
    setSummary(data.summary);
    setCanEdit(data.canEdit);
    setCanCount(data.canCount);
    if (data.notice) setNotice(data.notice);
  }, []);

  const run = useCallback(async (action: () => Promise<CatalogResponse>) => {
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
  }, [apply]);

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
    return () => { cancelled = true; };
  }, [apply]);

  const barcodeHeightIds = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("he");
    const ids = new Set<string>();
    if (!term) return ids;
    for (const [id, record] of media.byId) {
      if (record.entityKind === "height" && record.barcode.toLocaleLowerCase("he").includes(term)) ids.add(id);
    }
    return ids;
  }, [media.byId, query]);

  const visible = useMemo(() => filterImplantTree(brands, query, stockFilter, barcodeHeightIds) as BrandNode[], [brands, query, stockFilter, barcodeHeightIds]);

  useEffect(() => {
    if (!query.trim() && stockFilter === "all") return;
    const next = expandImplantMatches(brands, query, stockFilter, barcodeHeightIds);
    setOpenBrands(next.brands);
    setOpenModels(next.models);
    setOpenTypes(next.types);
  }, [brands, query, stockFilter, barcodeHeightIds]);

  function resetDraftMedia() {
    setDraftUnit("");
    setDraftNotes("");
    setDraftBarcode("");
    setSavedBarcode("");
    setDraftFile(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  function openAdd(kind: Level, parentId?: string) {
    setDraftName("");
    setDraftQty("0");
    setDraftMin("0");
    resetDraftMedia();
    setDialog({ mode: "add", kind, parentId });
  }

  function openEdit(kind: Exclude<Level, "height">, id: string, name: string) {
    setDraftName(name);
    setDialog({ mode: "edit", kind, id });
  }

  function openHeightEdit(height: HeightNode) {
    setDraftName(height.label);
    setDraftQty(String(height.quantity));
    setDraftMin(String(height.minQuantity));
    resetDraftMedia();
    setDraftUnit(height.unit);
    setDraftNotes(height.notes);
    const code = media.byId.get(height.id)?.barcode ?? "";
    setDraftBarcode(code);
    setSavedBarcode(code);
    setDialog({ mode: "edit-height", id: height.id });
  }

  async function chooseSizeImage(file: File | null) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("אפשר להעלות JPG, PNG או WEBP");
      return;
    }
    if (file.size > 6_000_000) {
      setError("גודל התמונה גדול מדי");
      return;
    }
    setDraftFile(file);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  async function suggestFreeBarcode() {
    if (savedBarcode.trim()) return;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = suggestBarcode();
      const res = await fetch(`/api/inventory/media?code=${encodeURIComponent(code)}`, { credentials: "include" });
      const json = (await res.json()) as { success?: boolean; data?: { match: unknown } };
      if (json.success && !json.data?.match) {
        setDraftBarcode(code);
        return;
      }
    }
    setError("לא הצלחנו ליצור ברקוד פנוי");
  }

  function printDraftBarcode() {
    const graphic = barcodeMarkup(draftBarcode);
    if (!graphic.svg) {
      setError("אי אפשר להדפיס את הברקוד הזה כ־Code 128");
      return;
    }
    const popup = window.open("", "_blank", "noopener,width=420,height=320");
    if (!popup) return;
    popup.document.write(`<!doctype html><html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding:16px">${graphic.svg}<p>${draftName}</p><p>${draftBarcode}</p><script>print()<\/script></body></html>`);
    popup.document.close();
  }

  function openSizeFocus(heightId: string, barcode = "") {
    const found = locateHeight(brands, heightId);
    if (!found) {
      setError("המידה לא נמצאה");
      return;
    }
    setOpenBrands((current) => current.includes(found.brand.id) ? current : [...current, found.brand.id]);
    setOpenModels((current) => current.includes(found.model.id) ? current : [...current, found.model.id]);
    setOpenTypes((current) => current.includes(found.type.id) ? current : [...current, found.type.id]);
    setFocus({
      id: found.height.id,
      label: found.height.label,
      path: found.path,
      quantity: found.height.quantity,
      barcode: barcode || media.byId.get(found.height.id)?.barcode || "",
    });
    setCounted("");
    setCountNote("הסריקה לא שינתה את כמות המלאי.");
  }

  async function saveCount() {
    if (!focus) return;
    const value = Number(counted);
    if (!Number.isInteger(value) || value < 0) {
      setError("כמות שנספרה אינה תקינה");
      return;
    }
    const before = focus.quantity;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/counts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "count-item", type: "IMPLANTS", itemId: focus.id, countedQuantity: value }),
      });
      const json = (await res.json()) as { success?: boolean; data?: { itemCount?: { difference: number | null } }; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? "שמירת הספירה נכשלה");
      const fresh = await requestCatalog({ method: "GET" });
      apply(fresh);
      const after = locateHeight(fresh.brands, focus.id)?.height.quantity;
      const difference = json.data?.itemCount?.difference;
      setCountNote(`נספר ${value}. הפרש ${difference ?? "—"}. הכמות במלאי נשארה ${after ?? before}. הספירה ממתינה לאישור מנהל.`);
      if (after !== undefined) setFocus((current) => current ? { ...current, quantity: after } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת הספירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function saveDialog() {
    if (!dialog || dialog.mode === "history") return;
    let ok = false;
    if (dialog.mode === "add" && dialog.kind === "brand") ok = await run(() => requestCatalog({ method: "POST", body: { kind: "brand", name: draftName } }));
    if (dialog.mode === "add" && dialog.kind === "model" && dialog.parentId) {
      ok = await run(() => requestCatalog({ method: "POST", body: { kind: "model", parentId: dialog.parentId, name: draftName } }));
    }
    if (dialog.mode === "add" && dialog.kind === "type" && dialog.parentId) {
      ok = await run(() => requestCatalog({ method: "POST", body: { kind: "type", parentId: dialog.parentId, name: draftName } }));
    }
    if (dialog.mode === "add" && dialog.kind === "height" && dialog.parentId) {
      const parentId = dialog.parentId;
      ok = await run(async () => {
        const form = new FormData();
        form.set("kind", "height");
        form.set("parentId", parentId);
        form.set("label", draftName);
        form.set("unit", draftUnit);
        form.set("notes", draftNotes);
        form.set("quantity", draftQty.trim() === "" ? "0" : draftQty);
        form.set("minQuantity", draftMin.trim() === "" ? "0" : draftMin);
        form.set("barcode", draftBarcode);
        form.set("reason", reason);
        if (draftFile) form.set("file", draftFile);
        const res = await fetch("/api/inventory/implants", { method: "POST", credentials: "include", body: form });
        const json = (await res.json()) as { success: boolean; data?: CatalogResponse; error?: { message?: string } };
        if (!json.success || !json.data) throw new Error(json.error?.message ?? "שגיאה בשמירה");
        return json.data;
      });
      if (ok) await media.reload();
    }
    if (dialog.mode === "edit") ok = await run(() => requestCatalog({ method: "PATCH", body: { kind: dialog.kind, id: dialog.id, name: draftName } }));
    if (dialog.mode === "edit-height") {
      const heightId = dialog.id;
      ok = await run(() => requestCatalog({
        method: "PATCH",
        body: { kind: "height", id: heightId, label: draftName, unit: draftUnit, notes: draftNotes, minQuantity: Number(draftMin), reason },
      }));
      if (ok && draftBarcode.trim() !== savedBarcode.trim()) {
        const response = await fetch("/api/inventory/media", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: draftBarcode.trim() ? "barcode" : "clear-barcode",
            module: "IMPLANTS",
            entityKind: "height",
            entityId: heightId,
            code: draftBarcode.trim(),
          }),
        });
        const json = (await response.json()) as { success?: boolean; error?: { message?: string } };
        if (!json.success) setError(json.error?.message ?? "שמירת הברקוד נכשלה");
      }
      if (ok && draftFile) {
        const previousId = media.byId.get(heightId)?.images.find((image) => image.isPrimary)?.id;
        const form = new FormData();
        form.set("module", "IMPLANTS");
        form.set("entityKind", "height");
        form.set("entityId", heightId);
        form.set("file", draftFile);
        form.set("makePrimary", "1");
        const response = await fetch("/api/inventory/media", { method: "POST", credentials: "include", body: form });
        const json = (await response.json()) as { success?: boolean; error?: { message?: string } };
        if (!json.success) setError(json.error?.message ?? "העלאת התמונה נכשלה");
        else if (previousId) await fetch(`/api/inventory/media?imageId=${previousId}`, { method: "DELETE", credentials: "include" });
      }
      if (ok) await media.reload();
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
      await run(() => requestCatalog({
        method: "POST",
        body: { kind: "stock", heightId: id, action: patch.delta! > 0 ? "IN" : "OUT", quantity: Math.abs(patch.delta!), reason },
      }));
      return;
    }
    await run(() => requestCatalog({ method: "POST", body: { kind: "stock", heightId: id, action: "SET", quantity: patch.quantity, reason: reason || "קביעת כמות" } }));
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

  const archivedBrands = brands.filter((item) => item.archivedAt);

  return (
    <InventoryModule type="IMPLANTS" title="מלאי שתלים">
      <Header
        title="מלאי שתלים"
        description="חברה, דגם, סוג שתל ומידה"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StockButtons type="IMPLANTS" onLeafScan={(hit) => {
              if (hit.entityKind !== "height") {
                setError("הברקוד לא מזהה מידה סופית");
                return;
              }
              setError(null);
              openSizeFocus(hit.entityId, hit.code);
            }} />
            <Link href="/inventory" className="text-sm font-medium text-slate-600 underline-offset-4 hover:text-opal-gold-dark hover:underline">חזרה למלאי</Link>
          </div>
        }
      />
      {loading ? (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />טוען מלאי שתלים</div>
      ) : (
        <div className="space-y-3">
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}
          <dl className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <Stat label="כמות" value={summary?.totalQuantity ?? 0} />
            <Stat label="דגמים" value={summary?.modelCount ?? 0} />
            <Stat label="סוגים" value={summary?.typeCount ?? 0} />
            <Stat label="נמוך" value={summary?.lowStockCount ?? 0} />
            <Stat label="אזל" value={summary?.outOfStockCount ?? 0} />
          </dl>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש חברה, דגם, סוג או מידה" className="h-9 pr-9" aria-label="חיפוש" />
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((filter) => (
                <button key={filter.id} type="button" onClick={() => setStockFilter(filter.id)} className={cn("h-9 rounded-full border px-3 text-sm", stockFilter === filter.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700")}>
                  {filter.label}
                </button>
              ))}
            </div>
            {canEdit && <Button className="h-9" onClick={() => openAdd("brand")} disabled={busy}><Plus className="h-4 w-4" />חברה</Button>}
          </div>
          {canEdit && <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="סיבה לשינוי כמות (אופציונלי)" aria-label="סיבה" className="h-9" />}

          {visible.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">לא נמצאו פריטים</p> : (
            <div className="space-y-2">
              {visible.map((brand) => {
                const source = brands.find((item) => item.id === brand.id);
                const opened = openBrands.includes(brand.id);
                return (
                  <section key={brand.id}>
                    <Row
                      open={opened}
                      title={brand.name}
                      meta={`${brand.models.length} דגמים`}
                      kind="brand"
                      imageSize="card"
                      id={brand.id}
                      canEdit={canEdit}
                      busy={busy}
                      onToggle={() => setOpenBrands((current) => toggleImplantId(current, brand.id))}
                      onEdit={() => openEdit("brand", brand.id, brand.name)}
                      onDelete={() => setPendingDelete({ kind: "brand", id: brand.id, name: brand.name })}
                      onUp={() => void reorder("brand", active(brands).map((item) => item.id), brand.id, -1)}
                      onDown={() => void reorder("brand", active(brands).map((item) => item.id), brand.id, 1)}
                    />
                    <Collapse open={opened}>
                      <div className="space-y-2 py-2 ps-3 sm:ps-6">
                        {brand.models.map((model) => {
                          const modelOpen = openModels.includes(model.id);
                          return (
                            <div key={model.id}>
                              <Row
                                open={modelOpen}
                                title={model.name}
                                meta={`${model.types.length} סוגים`}
                                kind="model"
                                imageSize="thumb"
                                id={model.id}
                                canEdit={canEdit}
                                busy={busy}
                                onToggle={() => setOpenModels((current) => toggleImplantId(current, model.id))}
                                onEdit={() => openEdit("model", model.id, model.name)}
                                onDelete={() => setPendingDelete({ kind: "model", id: model.id, name: model.name })}
                                onUp={() => void reorder("model", active(source?.models ?? []).map((item) => item.id), model.id, -1, brand.id)}
                                onDown={() => void reorder("model", active(source?.models ?? []).map((item) => item.id), model.id, 1, brand.id)}
                              />
                              <Collapse open={modelOpen}>
                                <div className="space-y-2 py-2 ps-3 sm:ps-6">
                                  {model.types.map((type) => {
                                    const typeOpen = openTypes.includes(type.id);
                                    return (
                                      <div key={type.id}>
                                        <Row
                                          open={typeOpen}
                                          title={type.name}
                                          meta={`${type.heights.length} מידות · ${qtyOf(type.heights)} במלאי`}
                                          kind="type"
                                          imageSize="thumb"
                                          id={type.id}
                                          canEdit={canEdit}
                                          busy={busy}
                                          onToggle={() => setOpenTypes((current) => toggleImplantId(current, type.id))}
                                          onEdit={() => openEdit("type", type.id, type.name)}
                                          onDelete={() => setPendingDelete({ kind: "type", id: type.id, name: type.name })}
                                          onUp={() => void reorder("type", active(source?.models.find((item) => item.id === model.id)?.types ?? []).map((item) => item.id), type.id, -1, model.id)}
                                          onDown={() => void reorder("type", active(source?.models.find((item) => item.id === model.id)?.types ?? []).map((item) => item.id), type.id, 1, model.id)}
                                        />
                                        <Collapse open={typeOpen}>
                                          <div className="py-2 sm:-ms-12">
                                            {type.heights.length === 0 ? <p className="px-3 text-sm text-slate-500">אין מידות</p> : (
                                              <HeightCards
                                                rows={type.heights}
                                                canEdit={canEdit}
                                                canCount={canCount}
                                                busy={busy}
                                                barcodeOf={(id) => media.byId.get(id)?.barcode ?? ""}
                                                onQuantity={changeQuantity}
                                                onEdit={openHeightEdit}
                                                onDelete={(row) => setPendingDelete({ kind: "height", id: row.id, name: row.label })}
                                                onHistory={openHistory}
                                                onCount={(row) => openSizeFocus(row.id)}
                                                onReorder={(id, direction) => void reorder("height", type.heights.map((item) => item.id), id, direction, type.id)}
                                              />
                                            )}
                                            {canEdit && <Button variant="outline" className="mt-2 h-9" disabled={busy} onClick={() => openAdd("height", type.id)}><Plus className="h-4 w-4" />הוסף מידה</Button>}
                                            <Archive rows={(source?.models.find((item) => item.id === model.id)?.types.find((item) => item.id === type.id)?.heights ?? []).filter((item) => item.archivedAt).map((item) => ({ id: item.id, name: item.label }))} kind="height" canEdit={canEdit} busy={busy} onRestore={(id) => void run(() => requestCatalog({ method: "PATCH", body: { kind: "height", id, restore: true } }))} />
                                          </div>
                                        </Collapse>
                                      </div>
                                    );
                                  })}
                                  {canEdit && <Button variant="outline" className="h-9" disabled={busy} onClick={() => openAdd("type", model.id)}><Plus className="h-4 w-4" />הוסף סוג שתל</Button>}
                                  <Archive rows={(source?.models.find((item) => item.id === model.id)?.types ?? []).filter((item) => item.archivedAt).map((item) => ({ id: item.id, name: item.name }))} kind="type" canEdit={canEdit} busy={busy} onRestore={(id) => void run(() => requestCatalog({ method: "PATCH", body: { kind: "type", id, restore: true } }))} />
                                </div>
                              </Collapse>
                            </div>
                          );
                        })}
                        {canEdit && <Button variant="outline" className="h-9" disabled={busy} onClick={() => openAdd("model", brand.id)}><Plus className="h-4 w-4" />הוסף דגם</Button>}
                        <Archive rows={(source?.models ?? []).filter((item) => item.archivedAt).map((item) => ({ id: item.id, name: item.name }))} kind="model" canEdit={canEdit} busy={busy} onRestore={(id) => void run(() => requestCatalog({ method: "PATCH", body: { kind: "model", id, restore: true } }))} />
                      </div>
                    </Collapse>
                  </section>
                );
              })}
            </div>
          )}
          <Archive rows={archivedBrands.map((item) => ({ id: item.id, name: item.name }))} kind="brand" canEdit={canEdit} busy={busy} onRestore={(id) => void run(() => requestCatalog({ method: "PATCH", body: { kind: "brand", id, restore: true } }))} />
        </div>
      )}

      <Modal open={Boolean(dialog && dialog.mode !== "history" && !isHeightDialog(dialog))} onClose={() => setDialog(null)} title={dialogTitle(dialog)} className="max-w-md">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">שם
            <Input autoFocus className="mt-1" value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label="שם" />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
          <Button onClick={() => void saveDialog()} disabled={busy || !draftName.trim()}>שמירה</Button>
        </div>
      </Modal>

      <Modal open={isHeightDialog(dialog)} onClose={() => setDialog(null)} title={dialog?.mode === "edit-height" ? "עריכת מידה" : "הוספת מידה"} className="max-w-xl">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{dialog && (dialog.mode === "add" && dialog.kind === "height" && dialog.parentId ? pathForType(brands, dialog.parentId) : dialog.mode === "edit-height" ? locateHeight(brands, dialog.id)?.path : "")}</p>
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
            <p className="mb-2 text-sm font-medium text-slate-700">תמונת המידה</p>
            <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-2xl bg-white">
              {previewUrl || (dialog?.mode === "edit-height" ? media.byId.get(dialog.id)?.images.find((image) => image.isPrimary)?.url : "") ? <img src={previewUrl || media.byId.get(dialog?.mode === "edit-height" ? dialog.id : "")?.images.find((image) => image.isPrimary)?.url || ""} alt="" className="max-h-48 w-full object-contain" /> : <span className="text-sm text-slate-400">הוסף תמונה</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">העלאה
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void chooseSizeImage(event.target.files?.[0] ?? null)} />
              </label>
              <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">צילום
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => void chooseSizeImage(event.target.files?.[0] ?? null)} />
              </label>
              {previewUrl && <Button type="button" variant="outline" onClick={() => { setDraftFile(null); setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; }); }}>הסרת תמונה</Button>}
            </div>
          </div>
          <label className="block text-sm font-medium text-slate-700">מידה
            <Input className="mt-1" value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label="מידה" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">יחידת מידה
              <Input className="mt-1" value={draftUnit} onChange={(event) => setDraftUnit(event.target.value)} aria-label="יחידת מידה" placeholder="מ״מ" />
            </label>
            <label className="block text-sm font-medium text-slate-700">{dialog?.mode === "edit-height" ? "סף מלאי נמוך" : "כמות התחלתית"}
              <Input className="mt-1" inputMode="numeric" value={dialog?.mode === "edit-height" ? draftMin : draftQty} onChange={(event) => (dialog?.mode === "edit-height" ? setDraftMin(event.target.value) : setDraftQty(event.target.value))} aria-label={dialog?.mode === "edit-height" ? "סף מלאי נמוך" : "כמות התחלתית"} />
            </label>
          </div>
          {dialog?.mode === "add" && (
            <label className="block text-sm font-medium text-slate-700">סף מלאי נמוך
              <Input className="mt-1" inputMode="numeric" value={draftMin} onChange={(event) => setDraftMin(event.target.value)} aria-label="סף מלאי נמוך" />
            </label>
          )}
          {dialog?.mode === "edit-height" && <p className="text-xs text-slate-500">שינוי כמות נעשה מכפתורי ההוספה וההפחתה בכרטיס, ונרשם כתנועת מלאי.</p>}
          <label className="block text-sm font-medium text-slate-700">ברקוד
            <Input className="mt-1" value={draftBarcode} onChange={(event) => setDraftBarcode(event.target.value)} aria-label="ברקוד" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy || Boolean(savedBarcode.trim())} onClick={() => void suggestFreeBarcode()}>צור ברקוד</Button>
            <Button type="button" variant="outline" disabled={!draftBarcode.trim()} onClick={printDraftBarcode}>הדפסת מדבקה</Button>
          </div>
          {savedBarcode.trim() && <p className="text-xs text-slate-500">ברקוד קיים לא מוחלף אוטומטית. אפשר לערוך אותו ידנית.</p>}
          <BarcodeScanBox videoId="implant-size-barcode" onCapture={(code) => setDraftBarcode(code)} />
          <label className="block text-sm font-medium text-slate-700">הערות
            <textarea className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} aria-label="הערות" />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDialog(null)}>ביטול</Button>
          <Button onClick={() => void saveDialog()} disabled={busy || !draftName.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}שמירת מידה</Button>
        </div>
      </Modal>

      <Modal open={Boolean(focus)} onClose={() => setFocus(null)} title="ספירת מידה" className="max-w-lg">
        {focus && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MediaFace kind="height" id={focus.id} name={focus.label} canEdit={false} size="thumb" />
              <div>
                <p className="text-sm text-slate-500">{focus.path}</p>
                <p className="font-bold text-slate-900">{focus.label}</p>
                <p className="text-sm text-slate-600">ברקוד {focus.barcode || "אין"}</p>
                <p className="text-sm text-slate-600">כמות במערכת {focus.quantity}</p>
              </div>
            </div>
            <p className="text-sm text-slate-500">סריקה לבדה אינה משנה כמות. ההפרש נשמר לספירה וממתין לאישור מנהל.</p>
            {canCount && (
              <label className="block text-sm font-medium text-slate-700">כמות שנספרה
                <Input className="mt-1" inputMode="numeric" value={counted} onChange={(event) => setCounted(event.target.value)} aria-label="כמות שנספרה" />
              </label>
            )}
            {countNote && <p className="text-sm text-slate-700">{countNote}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFocus(null)}>סגירה</Button>
              {canCount && <Button disabled={busy} onClick={() => void saveCount()}>שמירת ספירה</Button>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={dialog?.mode === "history"} onClose={() => setDialog(null)} title={dialog?.mode === "history" ? `היסטוריה · ${dialog.label}` : ""} className="max-w-lg">
        {historyLoading ? <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />טוען</div> : movements.length === 0 ? <p className="text-sm text-slate-500">אין תנועות</p> : (
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
        <p className="text-sm text-slate-600">למחוק את {pendingDelete?.name}? רמה עם פריטים פעילים לא תימחק. מידה עם מלאי או תנועות תועבר לארכיון.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPendingDelete(null)}>ביטול</Button>
          <Button variant="danger" disabled={busy} onClick={() => {
            if (!pendingDelete) return;
            void run(() => requestCatalog({ method: "DELETE", query: `?kind=${pendingDelete.kind}&id=${encodeURIComponent(pendingDelete.id)}` })).then((ok) => { if (ok) setPendingDelete(null); });
          }}>מחק</Button>
        </div>
      </Modal>
    </InventoryModule>
  );
}

function isHeightDialog(dialog: Dialog | null): boolean {
  if (!dialog || dialog.mode === "history") return false;
  return dialog.mode === "edit-height" || (dialog.mode === "add" && dialog.kind === "height");
}

function dialogTitle(dialog: Dialog | null): string {
  if (!dialog || dialog.mode === "history") return "";
  if (dialog.mode === "edit-height") return "עריכת מידה";
  const names = { brand: "חברה", model: "דגם", type: "סוג שתל", height: "מידה" };
  return dialog.mode === "add" ? `הוספת ${names[dialog.kind]}` : `עריכת ${names[dialog.kind]}`;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div><dt className="inline text-slate-500">{label} </dt><dd className="inline font-bold text-slate-900">{value}</dd></div>;
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

function Row({ open, title, meta, kind, imageSize = "card", id, canEdit, busy, onToggle, onEdit, onDelete, onUp, onDown }: {
  open: boolean;
  title: string;
  meta: string;
  kind: "brand" | "model" | "type";
  imageSize?: "card" | "thumb";
  id: string;
  canEdit: boolean;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-xl border bg-white px-3 py-2", open ? "border-opal-gold" : "border-slate-200")}>
      <MediaFace kind={kind} id={id} name={title} canEdit={canEdit} size={imageSize} />
      <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-right" aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-slate-900">{title}</span>
          <span className="text-xs text-slate-500">{meta}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300", open && "rotate-180")} />
      </button>
      {canEdit && (
        <div className="flex shrink-0">
          <IconButton label="למעלה" disabled={busy} onClick={onUp}><ChevronUp className="h-4 w-4" /></IconButton>
          <IconButton label="למטה" disabled={busy} onClick={onDown}><ChevronDown className="h-4 w-4" /></IconButton>
          <IconButton label="עריכה" disabled={busy} onClick={onEdit}><Pencil className="h-4 w-4" /></IconButton>
          <IconButton label="מחיקה" disabled={busy} onClick={onDelete}><Trash2 className="h-4 w-4" /></IconButton>
        </div>
      )}
    </div>
  );
}

function Archive({ rows, kind, canEdit, busy, onRestore }: { rows: { id: string; name: string }[]; kind: Level; canEdit: boolean; busy: boolean; onRestore: (id: string) => void }) {
  if (rows.length === 0) return null;
  const label = kind === "brand" ? "חברות בארכיון" : kind === "model" ? "דגמים בארכיון" : kind === "type" ? "סוגים בארכיון" : "מידות בארכיון";
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <p className="mb-1 font-medium text-slate-600">{label}</p>
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-2 py-1">
          <span>{row.name}</span>
          {canEdit && <button type="button" className="text-xs text-slate-600 hover:underline" disabled={busy} onClick={() => onRestore(row.id)}>שחזור</button>}
        </div>
      ))}
    </div>
  );
}

function HeightCards({ rows, canEdit, canCount, busy, barcodeOf, onQuantity, onEdit, onDelete, onHistory, onCount, onReorder }: {
  rows: HeightNode[];
  canEdit: boolean;
  canCount: boolean;
  busy: boolean;
  barcodeOf: (id: string) => string;
  onQuantity: (id: string, patch: { delta?: number; quantity?: number }) => Promise<void>;
  onEdit: (row: HeightNode) => void;
  onDelete: (row: HeightNode) => void;
  onHistory: (row: HeightNode) => void;
  onCount: (row: HeightNode) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {rows.map((row) => {
        const barcode = barcodeOf(row.id);
        return (
          <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start gap-3">
              <MediaFace kind="height" id={row.id} name={row.label} canEdit={canEdit} size="thumb" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{row.label}{row.unit ? ` ${row.unit}` : ""}</p>
                    <p className="truncate text-xs text-slate-500" title={barcode || undefined}>ברקוד {barcode || "אין"}</p>
                    {row.notes && <p className="truncate text-xs text-slate-400">{row.notes}</p>}
                  </div>
                  <QtyBadge row={row} />
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              {canEdit && <QuantityControl item={row} disabled={busy} onChange={onQuantity} />}
              <div className="flex flex-wrap items-center gap-1">
                {canCount && <button type="button" className="text-xs text-slate-600 hover:underline" disabled={busy} onClick={() => onCount(row)}>ספירת מלאי</button>}
                <HeightActions row={row} canEdit={canEdit} busy={busy} onEdit={onEdit} onDelete={onDelete} onHistory={onHistory} onReorder={onReorder} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function QtyBadge({ row }: { row: Pick<HeightNode, "quantity" | "minQuantity"> }) {
  const state = implantStockState(row);
  return <span className={cn("rounded-full px-3 py-1 text-sm font-bold", state === "out" ? "bg-red-50 text-red-700" : state === "low" ? "bg-orange-50 text-orange-700" : "text-slate-900")}>{row.quantity}{state === "out" ? " · אפס" : ""}</span>;
}

function HeightActions({ row, canEdit, busy, onEdit, onDelete, onHistory, onReorder }: {
  row: HeightNode;
  canEdit: boolean;
  busy: boolean;
  onEdit: (row: HeightNode) => void;
  onDelete: (row: HeightNode) => void;
  onHistory: (row: HeightNode) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" className="text-xs text-slate-600 hover:underline" disabled={busy} onClick={() => onHistory(row)}>היסטוריה</button>
      {canEdit && <IconButton label="למעלה" disabled={busy} onClick={() => onReorder(row.id, -1)}><ChevronUp className="h-4 w-4" /></IconButton>}
      {canEdit && <IconButton label="למטה" disabled={busy} onClick={() => onReorder(row.id, 1)}><ChevronDown className="h-4 w-4" /></IconButton>}
      {canEdit && <IconButton label="עריכה" disabled={busy} onClick={() => onEdit(row)}><Pencil className="h-4 w-4" /></IconButton>}
      {canEdit && <IconButton label="מחיקה" disabled={busy} onClick={() => onDelete(row)}><Trash2 className="h-4 w-4" /></IconButton>}
    </div>
  );
}

function QuantityControl({ item, disabled, onChange }: { item: HeightNode; disabled: boolean; onChange: (id: string, patch: { delta?: number; quantity?: number }) => Promise<void> }) {
  const [draft, setDraft] = useState(String(item.quantity));
  useEffect(() => setDraft(String(item.quantity)), [item.quantity]);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" aria-label="הוספת כמות" disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white" onClick={() => void onChange(item.id, { delta: 1 })}><Plus className="h-4 w-4" /></button>
      <button type="button" aria-label="הפחתת כמות" disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white" onClick={() => void onChange(item.id, { delta: -1 })}><Minus className="h-4 w-4" /></button>
      <input inputMode="numeric" aria-label={`קביעת כמות ${item.label}`} value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} className="h-8 w-16 rounded-lg border border-slate-200 text-center text-sm font-bold outline-none focus:border-opal-gold" />
      <button type="button" className="h-8 rounded-lg bg-opal-gold px-2 text-xs font-medium text-white disabled:opacity-50" disabled={disabled || !Number.isInteger(Number(draft)) || Number(draft) < 0} onClick={() => void onChange(item.id, { quantity: Number(draft) })}>קבע כמות</button>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" aria-label={label} disabled={disabled} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40" onClick={onClick}>{children}</button>;
}
