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
import { InventoryModule, StockButtons, queueInventoryScan } from "@/components/inventory/InventoryStockTools";
import { BarcodeScanBox, InventoryMediaProvider, MediaFace, useInventoryMedia } from "@/components/inventory/InventoryMedia";
import { barcodeMarkup } from "@/lib/inventory/barcode-svg";
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
  const form = typeof FormData !== "undefined" && input.body instanceof FormData;
  const res = await fetch(`/api/inventory/titanium${input.query ?? ""}`, {
    method: input.method,
    credentials: "include",
    headers: input.body && !form ? { "Content-Type": "application/json" } : undefined,
    body: form ? input.body as FormData : input.body ? JSON.stringify(input.body) : undefined,
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

const BARCODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function suggestBarcode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `OP${[...bytes].map((value) => BARCODE_ALPHABET[value % BARCODE_ALPHABET.length]).join("")}`;
}

type RadiusDialog =
  | { mode: "add"; modelId: string; modelName: string }
  | { mode: "edit"; modelName: string; radius: TitaniumRadiusNode };

type ScanFocus = {
  kind: "model" | "radius" | "size";
  id: string;
  title: string;
  path: string;
  quantity: number | null;
  barcode: string;
};

function locateScan(rows: TitaniumModelNode[], kind: string, id: string, barcode = ""): ScanFocus | null {
  for (const model of rows) {
    if (kind === "model" && model.id === id) return { kind: "model", id, title: model.name, path: model.name, quantity: null, barcode };
    for (const radius of model.radii) {
      if (kind === "radius" && radius.id === id) return { kind: "radius", id, title: `רדיוס ${radius.name}`, path: `${model.name} / ${radius.name}`, quantity: null, barcode };
      for (const size of radius.sizes) {
        if (kind === "size" && size.id === id) return { kind: "size", id, title: size.label, path: `${model.name} / ${radius.name} / ${size.label}`, quantity: size.quantity, barcode };
      }
    }
  }
  return null;
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
  return (
    <InventoryMediaProvider module="TITANIUM">
      <TitaniumCatalogBody />
    </InventoryMediaProvider>
  );
}

function TitaniumCatalogBody() {
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
  const [newSizes, setNewSizes] = useState<Record<string, string>>({});
  const [countDrafts, setCountDrafts] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<{ title: string; rows: Movement[] } | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const media = useInventoryMedia();
  const [radiusDialog, setRadiusDialog] = useState<RadiusDialog | null>(null);
  const [radiusName, setRadiusName] = useState("");
  const [radiusBarcode, setRadiusBarcode] = useState("");
  const [savedRadiusBarcode, setSavedRadiusBarcode] = useState("");
  const [radiusFile, setRadiusFile] = useState<File | null>(null);
  const [radiusPreview, setRadiusPreview] = useState<string | null>(null);
  const [focus, setFocus] = useState<ScanFocus | null>(null);
  const [counted, setCounted] = useState("");
  const [countNote, setCountNote] = useState<string | null>(null);

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

  function resetRadiusMedia() {
    setRadiusFile(null);
    setRadiusPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  function openAddRadius(modelId: string, modelName: string) {
    resetRadiusMedia();
    setRadiusName("");
    setRadiusBarcode("");
    setSavedRadiusBarcode("");
    setRadiusDialog({ mode: "add", modelId, modelName });
  }

  function openEditRadius(modelName: string, radius: TitaniumRadiusNode) {
    resetRadiusMedia();
    const code = media.byId.get(radius.id)?.barcode ?? "";
    setRadiusName(radius.name);
    setRadiusBarcode(code);
    setSavedRadiusBarcode(code);
    setRadiusDialog({ mode: "edit", modelName, radius });
  }

  function chooseRadiusImage(file: File | null) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("אפשר להעלות JPG, PNG או WEBP");
      return;
    }
    if (file.size > 6_000_000) {
      setError("גודל התמונה גדול מדי");
      return;
    }
    setRadiusFile(file);
    setRadiusPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  async function suggestFreeBarcode() {
    if (savedRadiusBarcode.trim()) return;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = suggestBarcode();
      const res = await fetch(`/api/inventory/media?code=${encodeURIComponent(code)}`, { credentials: "include" });
      const json = (await res.json()) as { success?: boolean; data?: { match: unknown } };
      if (json.success && !json.data?.match) {
        setRadiusBarcode(code);
        return;
      }
    }
    setError("לא הצלחנו ליצור ברקוד פנוי");
  }

  function printRadiusBarcode() {
    const graphic = barcodeMarkup(radiusBarcode);
    if (!graphic.svg) {
      setError("אי אפשר להדפיס את הברקוד הזה כ־Code 128");
      return;
    }
    const popup = window.open("", "_blank", "noopener,width=420,height=320");
    if (!popup) return;
    popup.document.write(`<!doctype html><html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding:16px">${graphic.svg}<p>${radiusName}</p><p>${radiusBarcode}</p><script>print()<\/script></body></html>`);
    popup.document.close();
  }

  function locate(kind: string, id: string, barcode = ""): ScanFocus | null {
    return locateScan(models, kind, id, barcode || media.byId.get(id)?.barcode || "");
  }

  async function saveRadiusDialog() {
    if (!radiusDialog || !radiusName.trim()) return;
    const ok = await run(async () => {
      if (radiusDialog.mode === "add") {
        const form = new FormData();
        form.set("kind", "radius");
        form.set("modelId", radiusDialog.modelId);
        form.set("name", radiusName);
        form.set("barcode", radiusBarcode);
        if (radiusFile) form.set("file", radiusFile);
        return requestCatalog({ method: "POST", body: form });
      }
      const data = await requestCatalog({ method: "PATCH", body: { kind: "radius", id: radiusDialog.radius.id, name: radiusName } });
      if (radiusBarcode.trim() !== savedRadiusBarcode.trim()) {
        const response = await fetch("/api/inventory/media", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: radiusBarcode.trim() ? "barcode" : "clear-barcode",
            module: "TITANIUM",
            entityKind: "radius",
            entityId: radiusDialog.radius.id,
            code: radiusBarcode.trim(),
          }),
        });
        const json = (await response.json()) as { success?: boolean; error?: { message?: string } };
        if (!json.success) throw new Error(json.error?.message ?? "שמירת הברקוד נכשלה");
      }
      if (radiusFile) {
        const previousId = media.byId.get(radiusDialog.radius.id)?.images.find((image) => image.isPrimary)?.id;
        const form = new FormData();
        form.set("module", "TITANIUM");
        form.set("entityKind", "radius");
        form.set("entityId", radiusDialog.radius.id);
        form.set("file", radiusFile);
        form.set("makePrimary", "1");
        const response = await fetch("/api/inventory/media", { method: "POST", credentials: "include", body: form });
        const json = (await response.json()) as { success?: boolean; error?: { message?: string } };
        if (!json.success) throw new Error(json.error?.message ?? "העלאת התמונה נכשלה");
        if (previousId) await fetch(`/api/inventory/media?imageId=${previousId}`, { method: "DELETE", credentials: "include" });
      }
      return data;
    });
    if (ok) {
      await media.reload();
      setRadiusDialog(null);
    }
  }

  async function saveSizeCount() {
    if (!focus || focus.kind !== "size") return;
    const value = Number(counted);
    if (!Number.isInteger(value) || value < 0) {
      setError("כמות שנספרה אינה תקינה");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/counts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "count-item", type: "TITANIUM", itemId: focus.id, countedQuantity: value }),
      });
      const json = (await res.json()) as { success?: boolean; data?: { itemCount?: { difference: number | null } }; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? "שמירת הספירה נכשלה");
      const fresh = await requestCatalog({ method: "GET" });
      apply(fresh);
      const after = locateScan(fresh.models, "size", focus.id, focus.barcode);
      setCountNote(`נספר ${value}. הפרש ${json.data?.itemCount?.difference ?? "—"}. הכמות במלאי נשארה ${formatQty(after?.quantity ?? focus.quantity)}. הסריקה לא שינתה מלאי.`);
      if (after) setFocus(after);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת הספירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

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
        <Header title={category?.name ?? "מלאי טיטניום"} description="דגם, רדיוס, גודל וכמות" actions={<StockButtons type="TITANIUM" onLeafScan={(hit) => {
          const found = locate(hit.entityKind, hit.entityId, hit.code);
          if (!found) {
            setError("הברקוד לא מזהה פריט טיטניום");
            return;
          }
          setError(null);
          setCounted("");
          setCountNote(found.kind === "size" ? "הסריקה לא שינתה את כמות המלאי." : "הברקוד מזהה את הרדיוס או הדגם, לא גודל ספציפי, ולא משנה כמות.");
          setFocus(found);
          if (found.kind === "size") queueInventoryScan("TITANIUM", { entityId: found.id, code: found.barcode });
        }} />} />

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
                        <MediaFace kind="model" id={model.id} name={model.name} canEdit={canEdit} size="thumb" />
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
                              onEdit={() => openEditRadius(model.name, radius)}
                            />
                          ))}
                          {canEdit && (
                            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openAddRadius(model.id, model.name)}><Plus className="h-4 w-4" />הוסף רדיוס</Button>
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

        <Modal open={Boolean(radiusDialog)} onClose={() => setRadiusDialog(null)} title={radiusDialog?.mode === "edit" ? "עריכת רדיוס" : "הוסף רדיוס"} className="max-w-xl">
          <div className="space-y-3">
            <p className="text-sm text-slate-500">{radiusDialog?.modelName}{radiusDialog?.mode === "edit" ? ` / ${radiusDialog.radius.name}` : ""}</p>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
              <p className="mb-2 text-sm font-medium text-slate-700">תמונת רדיוס</p>
              <div className="flex min-h-32 items-center justify-center overflow-hidden rounded-2xl bg-white">
                {radiusPreview || (radiusDialog?.mode === "edit" ? media.byId.get(radiusDialog.radius.id)?.images.find((image) => image.isPrimary)?.url : "") ? (
                  <img src={radiusPreview || (radiusDialog?.mode === "edit" ? media.byId.get(radiusDialog.radius.id)?.images.find((image) => image.isPrimary)?.url : "") || ""} alt="" className="max-h-40 w-full object-contain" />
                ) : <span className="text-sm text-slate-400">הוסף תמונה</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">העלאה
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => chooseRadiusImage(event.target.files?.[0] ?? null)} />
                </label>
                <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">צילום
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => chooseRadiusImage(event.target.files?.[0] ?? null)} />
                </label>
                {radiusPreview && <Button type="button" variant="outline" onClick={() => { setRadiusFile(null); setRadiusPreview((current) => { if (current) URL.revokeObjectURL(current); return null; }); }}>הסרת תמונה</Button>}
              </div>
            </div>
            <label className="block text-sm font-medium text-slate-700">שם או מספר רדיוס
              <input className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" value={radiusName} onChange={(event) => setRadiusName(event.target.value)} aria-label="שם רדיוס" />
            </label>
            <label className="block text-sm font-medium text-slate-700">ברקוד
              <input className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" value={radiusBarcode} onChange={(event) => setRadiusBarcode(event.target.value)} aria-label="ברקוד" />
            </label>
            <p className="text-xs text-slate-500">ברקוד של רדיוס מזהה את הרדיוס בלבד, לא גודל מסוים. תמונה וברקוד אינם חובה.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy || Boolean(savedRadiusBarcode.trim())} onClick={() => void suggestFreeBarcode()}>צור ברקוד</Button>
              <Button type="button" variant="outline" disabled={!radiusBarcode.trim()} onClick={printRadiusBarcode}>הדפסת מדבקה</Button>
            </div>
            <BarcodeScanBox videoId="titanium-radius-barcode" onCapture={setRadiusBarcode} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRadiusDialog(null)}>ביטול</Button>
            <Button disabled={busy || !radiusName.trim()} onClick={() => void saveRadiusDialog()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}שמירה</Button>
          </div>
        </Modal>

        <Modal open={Boolean(focus)} onClose={() => setFocus(null)} title="פריט שנסרק" className="max-w-lg">
          {focus && (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <MediaFace kind={focus.kind} id={focus.id} name={focus.title} canEdit={false} size="thumb" />
                <div>
                  <p className="text-sm text-slate-500">{focus.path}</p>
                  <p className="font-bold text-slate-900">{focus.title}</p>
                  <p className="text-sm text-slate-600">ברקוד {focus.barcode || "אין"}</p>
                  {focus.kind === "size" && <p className="text-sm text-slate-600">כמות במערכת {formatQty(focus.quantity)}</p>}
                </div>
              </div>
              {countNote && <p className="text-sm text-slate-600">{countNote}</p>}
              {focus.kind === "size" && (
                <label className="block text-sm font-medium text-slate-700">כמות שנספרה
                  <input className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" inputMode="numeric" value={counted} onChange={(event) => setCounted(event.target.value)} aria-label="כמות שנספרה" />
                </label>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setFocus(null)}>סגירה</Button>
                {focus.kind === "size" && <Button disabled={busy} onClick={() => void saveSizeCount()}>שמירת ספירה</Button>}
              </div>
            </div>
          )}
        </Modal>

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
  onEdit,
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
  onEdit: () => void;
}) {
  const media = useInventoryMedia();
  const barcode = media.byId.get(radius.id)?.barcode ?? "";
  const sizes = active(radius.sizes);
  const units = titaniumQuantityTotal(sizes);
  return (
    <div className={cn("rounded-lg border bg-slate-50", open ? "border-opal-gold/60" : "border-slate-200")}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <MediaFace kind="radius" id={radius.id} name={`רדיוס ${radius.name}`} canEdit={canEdit} size="thumb" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 text-sm font-semibold text-slate-900">רדיוס</span>
            <EditableName value={radius.name} canEdit={canEdit} onOpen={onToggle} onSave={onRename} className="font-semibold text-slate-900" />
          </div>
          <button type="button" className="flex w-full items-center gap-2 text-right text-xs text-slate-500" aria-expanded={open} onClick={onToggle}>
            <span className="min-w-0 flex-1">{sizes.length} גדלים · {formatQty(units)} יח׳{barcode ? ` · ${barcode}` : ""}</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300", open && "rotate-180")} />
          </button>
        </div>
        {canEdit && (
          <div className="flex shrink-0">
            <IconButton label="עריכה" disabled={busy} onClick={onEdit}><Pencil className="h-4 w-4" /></IconButton>
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
  const media = useInventoryMedia();
  const barcode = media.byId.get(size.id)?.barcode ?? "";
  const parsed = Number(draft);
  const exact = draft.trim() !== "" && Number.isInteger(parsed) && parsed >= 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MediaFace kind="size" id={size.id} name={size.label} canEdit={canEdit} size="thumb" />
      <EditableName value={size.label} canEdit={canEdit} onSave={onRename} className="text-sm font-medium text-slate-800" />
      {barcode && <span className="text-xs text-slate-500">{barcode}</span>}
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
