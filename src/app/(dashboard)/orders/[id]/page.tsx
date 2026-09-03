"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/providers/AppProvider";
import { prefetchOrderModels } from "@/lib/orders/load-model-fast";
import { StatusBadge } from "@/components/orders/status-badge";
import { WorkflowTracker } from "@/components/orders/workflow-tracker";
import { DentalChart } from "@/components/DentalChart";
import { OrderEditForm } from "@/components/orders/order-edit-form";
import { OrderFilesSection } from "@/components/orders/order-files-section";
import { TelegramOrderButton } from "@/components/orders/telegram-order-button";
import { ExportActions } from "@/components/shared/export-actions";
import { OrderHistoryButton } from "@/components/orders/order-history-modal";
import { formatDate, formatCurrency } from "@/lib/utils";
import { canEditOrders, canDeleteOrders } from "@/lib/permissions";
import { catalogLabel } from "@/lib/orders/order-catalog";
import {
  GENDER_LABELS,
  ORDER_STATUS_LABELS,
  LAB_INFO,
} from "@/lib/constants/labels";
import { ArrowRight, User, Pencil } from "lucide-react";
import { OrderDeleteButton } from "@/components/orders/order-delete-button";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getOrderById, currentUser, addOrderFile, orderCatalog, splintTypes } = useApp();
  const [editing, setEditing] = useState(false);
  const order = getOrderById(id);

  useEffect(() => {
    if (!order?.files?.length) return;
    void prefetchOrderModels(order.files);
  }, [order?.id, order?.files]);

  if (!order) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500 mb-4">הזמנה לא נמצאה</p>
        <Link href="/orders"><Button>חזרה להזמנות</Button></Link>
      </div>
    );
  }

  const canEdit = currentUser && canEditOrders(currentUser);
  const canDelete = currentUser && canDeleteOrders(currentUser);
  const materialLabels = order.materials.map((m) => catalogLabel(orderCatalog, "MATERIAL", m));
  const workLabels = order.workTypes
    .filter((w) => w !== "NIGHT_GUARD_WHITENING_MILLED")
    .map((w) => catalogLabel(orderCatalog, "WORK_TYPE", w));
  const splintIds =
    order.splintTypeIds?.length
      ? order.splintTypeIds
      : order.splintTypeId
        ? [order.splintTypeId]
        : [];
  const splintLabels = splintIds
    .map((id) => splintTypes.find((t) => t.id === id)?.name ?? order.splintType?.name)
    .filter(Boolean) as string[];

  const pdfHtml = `
    <h2>הזמנה ${order.serialNumber}</h2>
    <table>
      <tr><td>רופא</td><td>${order.doctor?.name ?? "—"}</td></tr>
      <tr><td>מטופל</td><td>${order.patient.name}</td></tr>
      <tr><td>צבע</td><td>${order.shade ?? "—"}</td></tr>
      <tr><td>שיניים</td><td>${order.selectedTeeth.join(", ") || "—"}</td></tr>
      <tr><td>חומרים</td><td>${materialLabels.join(", ")}</td></tr>
      <tr><td>סוג עבודה</td><td>${[...workLabels, ...splintLabels].filter(Boolean).join(", ")}</td></tr>
      <tr><td>תיאור</td><td>${order.description ?? "—"}</td></tr>
      <tr><td>סטטוס</td><td>${ORDER_STATUS_LABELS[order.status]}</td></tr>
      <tr><td>מחיר</td><td>${order.totalPrice ? formatCurrency(order.totalPrice) : "—"}</td></tr>
    </table>`;

  const waText = `${LAB_INFO.name}\nהזמנה: ${order.serialNumber}\nרופא: ${order.doctor?.name ?? "—"}\nמטופל: ${order.patient.name}\nסטטוס: ${ORDER_STATUS_LABELS[order.status]}\nיעד: ${formatDate(order.completionDate)}`;

  return (
    <>
      <Header
        title={order.serialNumber}
        description={`${order.doctor?.name ?? "—"} · ${order.patient.name}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <OrderHistoryButton order={order} showLabel />
            {canEdit && !editing && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />עריכה
              </Button>
            )}
            {canDelete && <OrderDeleteButton order={order} />}
            <TelegramOrderButton
              size="md"
              order={{
                serialNumber: order.serialNumber,
                patientName: order.patient.name,
                doctorName: order.doctor?.name ?? "—",
                workTypes: order.workTypes,
                orderId: order.id,
              }}
            />
            <ExportActions title={`הזמנה ${order.serialNumber}`} whatsappText={waText} pdfHtml={pdfHtml} phone={order.doctor?.phone ?? undefined} />
          </div>
        }
      />

      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowRight className="h-4 w-4" />חזרה להזמנות
      </Link>

      {editing && <OrderEditForm order={order} onDone={() => setEditing(false)} />}

      <StatusBadge status={order.status} className="text-sm px-3 py-1 mb-4" />

      <Card className="mb-6">
        <CardContent className="p-4"><WorkflowTracker currentStatus={order.status} /></CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />פרטים</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-slate-500">רופא</span><span className="font-medium">{order.doctor?.name ?? "—"}</span>
            <span className="text-slate-500">מטופל</span><span>{order.patient.name}{order.patient.age ? ` (${order.patient.age})` : ""}{order.patient.gender ? ` ${GENDER_LABELS[order.patient.gender]}` : ""}</span>
            <span className="text-slate-500">צבע</span><span>{order.shade || "—"}</span>
            <span className="text-slate-500">כניסה</span><span>{formatDate(order.entryDate)}</span>
            <span className="text-slate-500">יעד</span><span>{formatDate(order.completionDate)}</span>
            <span className="text-slate-500">מחיר</span>
            <span className="font-semibold text-opal-gold-dark">
              {order.totalPrice != null ? formatCurrency(order.totalPrice) : "—"}
            </span>
            <span className="text-slate-500">כרטסת</span>
            <span className="text-sm">
              {order.ledgerChargeId ? (
                <span className="text-emerald-700 font-medium">
                  חויב בכרטסת
                  {order.totalPrice != null ? `: ${formatCurrency(order.totalPrice)}` : ""}
                </span>
              ) : order.totalPrice != null && order.totalPrice > 0 ? (
                <span className="text-amber-700">טרם חויב בכרטסת</span>
              ) : (
                <span className="text-slate-500">ללא חיוב</span>
              )}
            </span>
            {(order.priceQuantity != null ||
              order.calculatedPrice != null ||
              order.otherWorkKind ||
              order.pricingMode === "ALL_IN_X" ||
              (order.priceLines?.length ?? 0) > 0) && (
              <>
                <span className="text-slate-500 col-span-2">פירוט תמחור</span>
                <div className="col-span-2 space-y-1 text-sm">
                  {order.pricingMode === "ALL_IN_X" && (
                    <>
                      <div className="flex justify-between gap-2">
                        <span>ALL IN X</span>
                        <span>{order.allInXType ?? "—"}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span>מחיר ללסת</span>
                        <span className="tabular-nums">
                          {order.pricePerJaw != null ? formatCurrency(order.pricePerJaw) : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span>מספר לסתות</span>
                        <span className="tabular-nums">{order.jawCount ?? "—"}</span>
                      </div>
                    </>
                  )}
                  {order.otherWorkKind === "REWORK_FREE" && (
                    <p>
                      עבודה חוזרת – ללא חיוב
                      {order.otherWorkNotes ? (
                        <span className="block text-slate-500 whitespace-pre-wrap mt-1">
                          {order.otherWorkNotes}
                        </span>
                      ) : null}
                    </p>
                  )}
                  {order.otherWorkKind === "REPAIR_OTHER" && (
                    <p>
                      תיקון / עבודה אחרת
                      {order.otherWorkNotes ? (
                        <span className="block text-slate-500 whitespace-pre-wrap mt-1">
                          {order.otherWorkNotes}
                        </span>
                      ) : null}
                    </p>
                  )}
                  {(!order.pricingMode || order.pricingMode === "REGULAR") &&
                    !order.otherWorkKind &&
                    order.priceLines?.length === 1 && (
                    <>
                      <div className="flex justify-between gap-2">
                        <span>מחיר ליחידה</span>
                        <span className="tabular-nums">
                          {formatCurrency(order.priceUnit ?? order.priceLines[0].unitPrice)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span>כמות</span>
                        <span className="tabular-nums">
                          {order.priceQuantity ?? order.priceLines[0].quantity}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span>מחיר מחושב</span>
                        <span className="tabular-nums">
                          {formatCurrency(
                            order.calculatedPrice ?? order.priceLines[0].lineTotal,
                          )}
                        </span>
                      </div>
                    </>
                  )}
                  {(!order.pricingMode || order.pricingMode === "REGULAR") &&
                    !order.otherWorkKind &&
                    (order.priceLines?.length ?? 0) > 1 &&
                    order.priceLines.map((line) => (
                      <div
                        key={`${line.catalogOptionId}-${line.code}`}
                        className="flex justify-between gap-2"
                      >
                        <span>
                          {line.nameSnapshot} · {formatCurrency(line.unitPrice)} × {line.quantity}
                        </span>
                        <span className="tabular-nums">{formatCurrency(line.lineTotal)}</span>
                      </div>
                    ))}
                  {order.calculatedPrice != null &&
                    (order.pricingMode === "ALL_IN_X" || order.priceManuallyEdited) && (
                    <div className="flex justify-between gap-2">
                      <span>מחיר מחושב</span>
                      <span className="tabular-nums">{formatCurrency(order.calculatedPrice)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 border-t border-slate-100 pt-1 font-semibold">
                    <span>סה״כ</span>
                    <span className="tabular-nums text-opal-gold-dark">
                      {order.totalPrice != null ? formatCurrency(order.totalPrice) : "—"}
                    </span>
                  </div>
                  {order.priceManuallyEdited &&
                    order.calculatedPrice != null &&
                    order.totalPrice != null &&
                    order.totalPrice !== order.calculatedPrice && (
                      <p className="text-xs text-slate-400">
                        נערך ידנית (מחושב: {formatCurrency(order.calculatedPrice)})
                      </p>
                    )}
                </div>
              </>
            )}
            <span className="text-slate-500 col-span-2">חומרים</span>
            <span className="col-span-2">{materialLabels.join(", ") || "—"}</span>
            <span className="text-slate-500 col-span-2">עבודה</span>
            <span className="col-span-2">
              {[...workLabels, ...splintLabels].filter(Boolean).join(", ") || "—"}
            </span>
            {order.description && <><span className="text-slate-500 col-span-2">תיאור</span><span className="col-span-2">{order.description}</span></>}
            {order.shipment && <><span className="text-slate-500">תעודת משלוח</span><span className="font-bold text-opal-gold-dark">{order.shipment.deliveryNote}</span></>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>מבנה שיניים</CardTitle></CardHeader>
          <CardContent>
            <DentalChart
              selectedTeeth={order.selectedTeeth}
              bridgeGroups={order.bridgeGroups}
              onChange={() => {}}
              readOnly
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              קבצים (
              {order.files.filter((f) => f.isCurrent !== false).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500 mb-3">
              הקבצים נטענים ממסד הנתונים · זמינים גם אחרי רענון או ממכשיר אחר
            </p>
            <OrderFilesSection
              orderId={order.id}
              files={order.files}
              canUpload={!!canEdit}
              onUpload={async (f, folderId, meta, onProgress) => {
                await addOrderFile(
                  order.id,
                  f,
                  undefined,
                  folderId,
                  {
                    category: meta?.category,
                    slotKey: meta?.slotKey,
                  },
                  onProgress,
                );
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>היסטוריית תנועות</CardTitle>
            <OrderHistoryButton order={order} showLabel />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500">
              {order.statusHistory.length} תנועות · לחץ על היסטוריה לצפייה מלאה
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
