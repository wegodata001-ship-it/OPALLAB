"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/providers/AppProvider";
import { StatusBadge } from "@/components/orders/status-badge";
import { WorkflowTracker } from "@/components/orders/workflow-tracker";
import { DentalChart } from "@/components/DentalChart";
import { OrderEditForm } from "@/components/orders/order-edit-form";
import { OrderFilesSection } from "@/components/orders/order-files-section";
import { ExportActions } from "@/components/shared/export-actions";
import { OrderHistoryButton } from "@/components/orders/order-history-modal";
import { formatDate, formatCurrency } from "@/lib/utils";
import { canEditOrders } from "@/lib/permissions";
import {
  MATERIAL_TYPE_LABELS,
  WORK_TYPE_LABELS,
  GENDER_LABELS,
  ORDER_STATUS_LABELS,
  LAB_INFO,
} from "@/lib/constants/labels";
import { ArrowRight, User, Pencil } from "lucide-react";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getOrderById, currentUser, addOrderFile } = useApp();
  const [editing, setEditing] = useState(false);
  const order = getOrderById(id);

  if (!order) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500 mb-4">הזמנה לא נמצאה</p>
        <Link href="/orders"><Button>חזרה להזמנות</Button></Link>
      </div>
    );
  }

  const canEdit = currentUser && canEditOrders(currentUser);

  const pdfHtml = `
    <h2>הזמנה ${order.serialNumber}</h2>
    <table>
      <tr><td>רופא</td><td>${order.doctor.name}</td></tr>
      <tr><td>מטופל</td><td>${order.patient.name}</td></tr>
      <tr><td>צבע</td><td>${order.shade ?? "—"}</td></tr>
      <tr><td>שיניים</td><td>${order.selectedTeeth.join(", ") || "—"}</td></tr>
      <tr><td>חומרים</td><td>${order.materials.map((m) => MATERIAL_TYPE_LABELS[m]).join(", ")}</td></tr>
      <tr><td>סוג עבודה</td><td>${order.workTypes.map((w) => WORK_TYPE_LABELS[w]).join(", ")}</td></tr>
      <tr><td>תיאור</td><td>${order.description ?? "—"}</td></tr>
      <tr><td>סטטוס</td><td>${ORDER_STATUS_LABELS[order.status]}</td></tr>
      <tr><td>מחיר</td><td>${order.totalPrice ? formatCurrency(order.totalPrice) : "—"}</td></tr>
    </table>`;

  const waText = `${LAB_INFO.name}\nהזמנה: ${order.serialNumber}\nרופא: ${order.doctor.name}\nמטופל: ${order.patient.name}\nסטטוס: ${ORDER_STATUS_LABELS[order.status]}\nיעד: ${formatDate(order.completionDate)}`;

  return (
    <>
      <Header
        title={order.serialNumber}
        description={`${order.doctor.name} · ${order.patient.name}`}
        actions={
          <div className="flex gap-2">
            <OrderHistoryButton order={order} showLabel />
            {canEdit && !editing && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />עריכה
              </Button>
            )}
            <ExportActions title={`הזמנה ${order.serialNumber}`} whatsappText={waText} pdfHtml={pdfHtml} phone={order.doctor.phone ?? undefined} />
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
            <span className="text-slate-500">רופא</span><span className="font-medium">{order.doctor.name}</span>
            <span className="text-slate-500">מטופל</span><span>{order.patient.name}{order.patient.age ? ` (${order.patient.age})` : ""}{order.patient.gender ? ` ${GENDER_LABELS[order.patient.gender]}` : ""}</span>
            <span className="text-slate-500">צבע</span><span>{order.shade || "—"}</span>
            <span className="text-slate-500">כניסה</span><span>{formatDate(order.entryDate)}</span>
            <span className="text-slate-500">יעד</span><span>{formatDate(order.completionDate)}</span>
            <span className="text-slate-500">מחיר</span><span className="font-semibold text-opal-gold-dark">{order.totalPrice ? formatCurrency(order.totalPrice) : "—"}</span>
            <span className="text-slate-500 col-span-2">חומרים</span><span className="col-span-2">{order.materials.map((m) => MATERIAL_TYPE_LABELS[m]).join(", ") || "—"}</span>
            <span className="text-slate-500 col-span-2">עבודה</span><span className="col-span-2">{order.workTypes.map((w) => WORK_TYPE_LABELS[w]).join(", ") || "—"}</span>
            {order.description && <><span className="text-slate-500 col-span-2">תיאור</span><span className="col-span-2">{order.description}</span></>}
            {order.shipment && <><span className="text-slate-500">תעודת משלוח</span><span className="font-bold text-opal-gold-dark">{order.shipment.deliveryNote}</span></>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>מבנה שיניים</CardTitle></CardHeader>
          <CardContent><DentalChart selectedTeeth={order.selectedTeeth} onChange={() => {}} readOnly /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>קבצים ({order.files.length})</CardTitle></CardHeader>
          <CardContent>
            <OrderFilesSection
              orderId={order.id}
              files={order.files}
              canUpload={!!canEdit}
              onUpload={(f, folderId, meta) =>
                addOrderFile(order.id, f, undefined, folderId, {
                  category: meta?.category,
                  slotKey: meta?.slotKey,
                })
              }
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
