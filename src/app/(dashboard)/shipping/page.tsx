"use client";

import { useCallback, useRef, useState } from "react";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { useApp } from "@/providers/AppProvider";
import { StatusBadge } from "@/components/orders/status-badge";
import { formatDateTime } from "@/lib/utils";
import { filterByDateRange } from "@/lib/date-filter";
import { openWhatsAppUrl, printHtml } from "@/lib/export";
import type { DateRange, OrderWithRelations, Shipment } from "@/lib/types";
import {
  Package,
  Truck,
  FileText,
  Printer,
  Archive,
  PenLine,
  CheckCircle2,
  Download,
  Maximize2,
  Trash2,
  RefreshCw,
  Lock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SignaturePadModal } from "@/components/shipping/signature-pad-modal";
import {
  buildDeliveryNoteHtml,
  shipmentSignatureForPdf,
} from "@/lib/shipping/delivery-note-html";
import { apiDelete, apiPost, apiPut } from "@/lib/api/client";
import { shippingLog, shippingTimed } from "@/lib/shipping/action-log";

type WhatsAppPhase = "idle" | "pdf" | "upload" | "open" | "done" | "error";

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  const key = "opal-shipping-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

type PendingSignature = {
  dataUrl: string;
  signerName: string;
};

export default function ShippingPage() {
  const {
    orders,
    shipments,
    couriers,
    previewDeliveryNote,
    createShipment,
    updateOrderStatus,
    currentUser,
    refreshQuiet,
  } = useApp();
  const [tab, setTab] = useState<"ship" | "archive">("ship");
  const [selectedId, setSelectedId] = useState("");
  const [courierId, setCourierId] = useState("");
  const [previewNote, setPreviewNote] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const [pendingSignature, setPendingSignature] = useState<PendingSignature | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [padForShipmentId, setPadForShipmentId] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState<string | null>(null);
  const [waBusyId, setWaBusyId] = useState<string | null>(null);
  const [waPhase, setWaPhase] = useState<WhatsAppPhase>("idle");
  const [waMessage, setWaMessage] = useState<string | null>(null);
  const actionLock = useRef<Set<string>>(new Set());

  const shareShipmentWhatsApp = useCallback(async (shipmentId: string) => {
    if (waBusyId) return;
    shippingLog("click", "whatsapp", { shipmentId });
    setWaBusyId(shipmentId);
    setWaPhase("pdf");
    setWaMessage("יוצר PDF...");
    const timer = shippingTimed("whatsapp");
    try {
      shippingLog("api:start", "whatsapp", { shipmentId });

      const data = await apiPost<{
        phone: string;
        pdfPublicUrl: string;
        message: string;
        waUrl: string;
        created: boolean;
        serialNumber: string;
      }>(`/api/shipments/${shipmentId}/whatsapp`);

      setWaPhase("upload");
      setWaMessage(data.created ? "מעלה..." : "קישור PDF מוכן...");
      shippingLog("GENERATE_PUBLIC_URL", "whatsapp", {
        shipmentId,
        pdfPublicUrl: data.pdfPublicUrl,
        created: data.created,
      });

      setWaPhase("open");
      setWaMessage("פותח WhatsApp...");
      shippingLog("OPEN_WHATSAPP", "whatsapp", { shipmentId, phone: data.phone });

      const opened = openWhatsAppUrl(data.waUrl);
      if (!opened) {
        shippingLog("ERROR", "whatsapp", { shipmentId, reason: "popup-blocked" });
        void apiPost(`/api/shipments/${shipmentId}/whatsapp/audit`, {
          action: "ERROR",
          details: { phase: "OPEN_WHATSAPP", reason: "popup-blocked", waUrl: data.waUrl },
        });
        setWaPhase("error");
        setWaMessage("WhatsApp נחסם על ידי הדפדפן. אפשרו חלונות קופצים ונסו שוב.");
        // Fallback: navigate so the user still gets the ready message + PDF link
        window.setTimeout(() => {
          window.location.assign(data.waUrl);
        }, 400);
        timer.end("error", { reason: "popup-blocked" });
        return;
      }

      void apiPost(`/api/shipments/${shipmentId}/whatsapp/audit`, {
        action: "OPEN_WHATSAPP",
        details: { phone: data.phone, pdfPublicUrl: data.pdfPublicUrl },
      });
      void apiPost(`/api/shipments/${shipmentId}/whatsapp/audit`, {
        action: "SUCCESS",
        details: { pdfPublicUrl: data.pdfPublicUrl },
      });

      shippingLog("SUCCESS", "whatsapp", { shipmentId });
      setWaPhase("done");
      setWaMessage("בוצע בהצלחה.");
      timer.end("ui:updated", { pdfPublicUrl: data.pdfPublicUrl });
      window.setTimeout(() => {
        setWaPhase("idle");
        setWaMessage(null);
      }, 3500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "שליחת WhatsApp נכשלה";
      shippingLog("ERROR", "whatsapp", { shipmentId, message });
      void apiPost(`/api/shipments/${shipmentId}/whatsapp/audit`, {
        action: "ERROR",
        details: { message },
      });
      setWaPhase("error");
      setWaMessage(message);
      timer.end("error", { message });
    } finally {
      setWaBusyId(null);
    }
  }, [waBusyId]);

  const withActionLock = useCallback(async <T,>(key: string, fn: () => Promise<T>): Promise<T | undefined> => {
    if (actionLock.current.has(key)) {
      shippingLog("click", key, { ignored: "double-submit" });
      return undefined;
    }
    actionLock.current.add(key);
    try {
      return await fn();
    } finally {
      actionLock.current.delete(key);
    }
  }, []);

  const readyOrders = orders.filter((o) => o.status === "FINISH" || o.status === "PACKAGING");
  const selected = orders.find((o) => o.id === selectedId);
  const courier = couriers.find((c) => c.id === courierId);

  const archivedShipments = filterByDateRange(
    shipments
      .map((s) => ({ ...s, order: orders.find((o) => o.id === s.orderId) }))
      .filter((s) => s.order),
    (s) => s.shippedAt ?? s.createdAt,
    dateRange,
  );

  const generatePreview = async () => {
    if (!selectedId || !currentUser || generating || confirming) return;
    shippingLog("click", "generatePreview", { selectedId });
    await withActionLock(`preview:${selectedId}`, async () => {
      setGenerating(true);
      setConfirmError(null);
      const timer = shippingTimed("generatePreview");
      try {
        const note = await previewDeliveryNote();
        setPreviewNote(note);
        setPendingSignature(null);
        await updateOrderStatus({
          orderId: selectedId,
          status: "PACKAGING",
          changedBy: currentUser.id,
          notes: "מוכן לאריזה",
        });
        timer.end("ui:updated", { note });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "הפקת תעודת המשלוח נכשלה";
        setConfirmError(message);
        timer.end("error", { message });
      } finally {
        setGenerating(false);
      }
    });
  };

  const deliveryHtml = useCallback(
    (
      note: string,
      order: OrderWithRelations | undefined = selected,
      opts?: { signatureDataUrl?: string | null; shipment?: Shipment | null },
    ) => {
      if (!order) return "";
      const courierLabel = courier
        ? `${courier.name}${courier.phone ? ` (${courier.phone})` : ""}`
        : opts?.shipment
          ? `${opts.shipment.courierName ?? "—"}${opts.shipment.courierPhone ? ` (${opts.shipment.courierPhone})` : ""}`
          : "—";

      let signature: {
        imageUrl: string;
        signedAt: Date | string;
        signerName?: string | null;
      } | null = null;

      if (opts?.signatureDataUrl) {
        signature = {
          imageUrl: opts.signatureDataUrl,
          signedAt: new Date(),
          signerName: pendingSignature?.signerName || currentUser?.name,
        };
      } else if (opts?.shipment) {
        signature = shipmentSignatureForPdf(opts.shipment);
      }

      return buildDeliveryNoteHtml({
        note,
        order,
        courierLabel,
        signature,
      });
    },
    [selected, courier, pendingSignature, currentUser?.name],
  );

  const confirmShip = async () => {
    shippingLog("click", "confirmShip", {
      selectedId,
      previewNote,
      courierId,
      hasSignature: Boolean(pendingSignature),
    });
    setConfirmError(null);
    setConfirmSuccess(null);

    if (!selectedId) {
      setConfirmError("יש לבחור הזמנה");
      return;
    }
    if (!previewNote) {
      setConfirmError("יש להפיק תעודת משלוח לפני האישור");
      return;
    }
    if (!courierId || !courier) {
      setConfirmError("יש לבחור שליח לפני אישור המשלוח");
      return;
    }
    if (!currentUser) {
      setConfirmError("נדרשת התחברות מחדש");
      return;
    }

    await withActionLock(`confirm:${selectedId}`, async () => {
      setConfirming(true);
      const timer = shippingTimed("confirmShip");
      try {
        const shipment = await createShipment(
          selectedId,
          previewNote,
          { name: courier.name, phone: courier.phone },
          pendingSignature
            ? {
                dataUrl: pendingSignature.dataUrl,
                signerName: pendingSignature.signerName || currentUser.name,
                deviceId: getDeviceId(),
              }
            : null,
        );
        setConfirmSuccess("✓ המשלוח אושר בהצלחה");
        setSelectedId("");
        setPreviewNote("");
        setCourierId("");
        setPendingSignature(null);
        setTab("archive");
        timer.end("ui:updated", { shipmentId: shipment.id });
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "אישור המשלוח נכשל — נסו שוב";
        setConfirmError(message);
        timer.end("error", { message });
      } finally {
        setConfirming(false);
      }
    });
  };

  const openPadForNew = () => {
    setPadForShipmentId(null);
    setPadOpen(true);
  };

  const openPadForShipment = (shipmentId: string) => {
    if (archiveBusy) return;
    setPadForShipmentId(shipmentId);
    setPadOpen(true);
  };

  const onPadSave = async (result: { dataUrl: string; signerName: string }) => {
    if (!padForShipmentId) {
      setPendingSignature(result);
      setPadOpen(false);
      setPadForShipmentId(null);
      return;
    }

    const shipmentId = padForShipmentId;
    await withActionLock(`sig:${shipmentId}`, async () => {
      setArchiveBusy(shipmentId);
      const timer = shippingTimed("saveSignature");
      try {
        await apiPut(`/api/shipments/${shipmentId}/signature`, {
          dataUrl: result.dataUrl,
          signerName: result.signerName || currentUser?.name,
          deviceId: getDeviceId(),
        });
        await refreshQuiet();
        timer.end("ui:updated", { shipmentId });
        setPadOpen(false);
        setPadForShipmentId(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "שמירת החתימה נכשלה";
        setConfirmError(message);
        timer.end("error", { message });
      } finally {
        setArchiveBusy(null);
      }
    });
  };

  const deleteSignature = async (shipmentId: string) => {
    if (!window.confirm("למחוק את חתימת המקבל?")) return;
    await withActionLock(`delsig:${shipmentId}`, async () => {
      setArchiveBusy(shipmentId);
      const timer = shippingTimed("deleteSignature");
      try {
        await apiDelete(`/api/shipments/${shipmentId}/signature`);
        await refreshQuiet();
        timer.end("ui:updated", { shipmentId });
      } catch (error) {
        setConfirmError(error instanceof Error ? error.message : "מחיקת החתימה נכשלה");
        timer.end("error");
      } finally {
        setArchiveBusy(null);
      }
    });
  };

  const lockShipment = async (shipmentId: string) => {
    if (!window.confirm("לנעול את המשלוח? לאחר נעילה לא ניתן לשנות את החתימה.")) return;
    await withActionLock(`lock:${shipmentId}`, async () => {
      setArchiveBusy(shipmentId);
      const timer = shippingTimed("lockShipment");
      try {
        await apiPost(`/api/shipments/${shipmentId}/lock`);
        await refreshQuiet();
        timer.end("ui:updated", { shipmentId });
      } catch (error) {
        setConfirmError(error instanceof Error ? error.message : "נעילת המשלוח נכשלה");
        timer.end("error");
      } finally {
        setArchiveBusy(null);
      }
    });
  };

  const viewSignature = async (shipment: Shipment) => {
    if (!shipment.recipientSignatureUrl) return;
    setViewerUrl(shipment.recipientSignatureUrl);
  };

  return (
    <>
      <Header title="אריזה ושילוח" description="הפקת תעודות משלוח וארכיון" />

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => {
            setTab("ship");
            setConfirmSuccess(null);
          }}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium",
            tab === "ship" ? "bg-opal-gold text-white" : "bg-white border",
          )}
        >
          שילוח חדש
        </button>
        <button
          onClick={() => setTab("archive")}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1",
            tab === "archive" ? "bg-opal-gold text-white" : "bg-white border",
          )}
        >
          <Archive className="h-4 w-4" />
          ארכיון ({shipments.length})
        </button>
      </div>

      {confirmSuccess && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {confirmSuccess}
        </div>
      )}

      {tab === "ship" ? (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                מוכנות לשילוח
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {readyOrders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    setSelectedId(o.id);
                    setPreviewNote("");
                    setPendingSignature(null);
                    setConfirmError(null);
                    setConfirmSuccess(null);
                  }}
                  className={cn(
                    "w-full text-right p-3 rounded-xl border",
                    selectedId === o.id ? "border-opal-gold bg-opal-gold/5" : "hover:bg-slate-50",
                  )}
                >
                  <div className="flex justify-between">
                    <StatusBadge status={o.status} />
                    <span className="font-bold">{o.serialNumber}</span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {o.doctor?.name ?? "—"} · {o.patient.name}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>
          {selected && (
            <Card className="border-opal-gold/30">
              <CardHeader>
                <CardTitle>
                  <FileText className="h-5 w-5 inline ml-2" />
                  תעודת משלוח
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!previewNote ? (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => void generatePreview()}
                    disabled={generating || confirming}
                  >
                    {generating ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <FileText className="h-5 w-5" />
                    )}
                    {generating ? "מפיק תעודה..." : "הפקת תעודת משלוח"}
                  </Button>
                ) : (
                  <>
                    <div className="text-center p-6 rounded-xl bg-opal-gold/10">
                      <p className="text-3xl font-bold text-opal-gold-dark">{previewNote}</p>
                      <p className="text-sm mt-2">
                        {selected.serialNumber} · {selected.patient.name}
                      </p>
                      <div className="flex gap-2 justify-center mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            printHtml(
                              `משלוח ${previewNote}`,
                              deliveryHtml(previewNote, selected, {
                                signatureDataUrl: pendingSignature?.dataUrl,
                              }),
                            )
                          }
                        >
                          <Printer className="h-4 w-4" />
                          PDF
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label>שליח *</Label>
                      <Select
                        value={courierId}
                        onChange={(e) => {
                          setCourierId(e.target.value);
                          setConfirmError(null);
                        }}
                        disabled={confirming}
                      >
                        <option value="">בחר שליח</option>
                        {couriers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} — {c.phone}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="rounded-xl border border-dashed border-slate-200 p-3 space-y-2">
                      <p className="text-sm font-medium text-slate-700">חתימת מקבל (אופציונלי)</p>
                      {!pendingSignature ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={openPadForNew}
                          disabled={confirming}
                        >
                          <PenLine className="h-4 w-4" />
                          הוסף חתימה
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <div className="rounded-lg border bg-white p-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={pendingSignature.dataUrl}
                              alt="חתימה"
                              className="max-h-24 mx-auto"
                            />
                          </div>
                          {pendingSignature.signerName && (
                            <p className="text-xs text-slate-500 text-center">
                              {pendingSignature.signerName}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={openPadForNew}
                              disabled={confirming}
                            >
                              <RefreshCw className="h-4 w-4" />
                              החלף
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => setPendingSignature(null)}
                              disabled={confirming}
                            >
                              <Trash2 className="h-4 w-4" />
                              מחק
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {confirmError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {confirmError}
                      </div>
                    )}

                    <Button
                      type="button"
                      className="w-full"
                      size="lg"
                      onClick={() => void confirmShip()}
                      disabled={confirming || generating}
                    >
                      {confirming ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Truck className="h-5 w-5" />
                      )}
                      {confirming ? "מאשר משלוח..." : "אישור שליחה"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <>
          <DateRangeFilter value={dateRange} onChange={setDateRange} className="mb-4" />
          {waMessage && (
            <div
              className={cn(
                "mb-3 rounded-xl border px-3 py-2 text-sm",
                waPhase === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : waPhase === "done"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-50 text-slate-700",
              )}
            >
              {waMessage}
            </div>
          )}
          <div className="space-y-3">
            {archivedShipments.map((s) => {
              const locked = Boolean(s.lockedAt);
              const hasSig = Boolean(s.recipientSignatureUrl);
              return (
                <Card key={s.id}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-opal-gold-dark">{s.deliveryNote}</p>
                        <p className="text-sm">
                          {s.order?.serialNumber} · {s.order?.patient.name} · {s.order?.doctor?.name ?? "—"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {s.courierName} {s.courierPhone} ·{" "}
                          {formatDateTime(s.shippedAt ?? s.createdAt)}
                          {locked ? " · נעול" : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            printHtml(
                              `משלוח ${s.deliveryNote}`,
                              deliveryHtml(s.deliveryNote, s.order, { shipment: s }),
                            )
                          }
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={waBusyId === s.id}
                          onClick={() => void shareShipmentWhatsApp(s.id)}
                          title="שליחת תעודת משלוח ב-WhatsApp עם קישור PDF"
                        >
                          {waBusyId === s.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              {waPhase === "pdf"
                                ? "יוצר PDF..."
                                : waPhase === "upload"
                                  ? "מעלה..."
                                  : waPhase === "open"
                                    ? "פותח..."
                                    : "WhatsApp"}
                            </>
                          ) : (
                            "WhatsApp"
                          )}
                        </Button>
                        {!locked && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void lockShipment(s.id)}
                            title="נעילת משלוח"
                            disabled={archiveBusy === s.id}
                          >
                            {archiveBusy === s.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Lock className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {hasSig && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" />
                            חתימה קיימת
                            {s.recipientSignerName ? ` · ${s.recipientSignerName}` : ""}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void viewSignature(s)}
                            >
                              צפייה
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setViewerUrl(s.recipientSignatureUrl!)}
                            >
                              <Maximize2 className="h-4 w-4" />
                              הגדלה
                            </Button>
                            <a
                              href={s.recipientSignatureUrl!}
                              download={`signature-${s.deliveryNote}.png`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Button type="button" size="sm" variant="outline">
                                <Download className="h-4 w-4" />
                                הורדה
                              </Button>
                            </a>
                            {!locked && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openPadForShipment(s.id)}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  החלף
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void deleteSignature(s.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  מחק
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {!hasSig && !locked && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="self-start"
                        onClick={() => openPadForShipment(s.id)}
                      >
                        <PenLine className="h-4 w-4" />
                        הוסף חתימה
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <SignaturePadModal
        open={padOpen}
        defaultSignerName={currentUser?.name ?? ""}
        onCancel={() => {
          setPadOpen(false);
          setPadForShipmentId(null);
        }}
        onSave={onPadSave}
      />

      {viewerUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setViewerUrl(null)}
        >
          <div
            className="bg-white rounded-2xl p-4 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-bold mb-3">חתימת מקבל</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewerUrl} alt="חתימה" className="w-full bg-slate-50 rounded-lg border" />
            <Button className="w-full mt-3" variant="outline" onClick={() => setViewerUrl(null)}>
              סגור
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
