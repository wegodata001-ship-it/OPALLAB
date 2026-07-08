"use client";

import { useState } from "react";
import { useApp } from "@/providers/AppProvider";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/orders/status-badge";
import { WorkflowTracker } from "@/components/orders/workflow-tracker";
import { ExportActions } from "@/components/shared/export-actions";
import { formatDate, formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, MATERIAL_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants/labels";
import { Stethoscope, CreditCard, Package, ChevronDown, ChevronUp } from "lucide-react";

export default function DoctorPortalPage() {
  const { currentUser, getDoctorForUser, getOrdersByDoctor, payments } = useApp();
  const [tab, setTab] = useState<"orders" | "ledger">("orders");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const doctor = currentUser ? getDoctorForUser(currentUser.id) : null;
  const doctorId = doctor?.id;
  const myOrders = doctorId ? getOrdersByDoctor(doctorId) : [];
  const activeOrders = myOrders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status));
  const completedOrders = myOrders.filter((o) => o.status === "DELIVERED");
  const doctorPayments = doctorId
    ? payments.filter((p) => p.doctorId === doctorId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    : [];

  if (!doctor) {
    return (
      <div className="text-center py-20 text-slate-500">
        <Stethoscope className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">פורטל זה מיועד לרופאים בלבד</p>
        <p className="text-sm mt-1">התחבר עם חשבון רופא (למשל drmansour / 1234)</p>
      </div>
    );
  }

  const exportHtml = `<h2>פורטל רופא — ${doctor.name}</h2>
    <p>יתרה: ${formatCurrency(doctor.balance)}</p>
    <table><tr><th>עבודה</th><th>מטופל</th><th>סטטוס</th><th>יעד</th></tr>
    ${activeOrders.map((o) => `<tr><td>${o.serialNumber}</td><td>${o.patient.name}</td><td>${ORDER_STATUS_LABELS[o.status]}</td><td>${formatDate(o.completionDate)}</td></tr>`).join("")}
    </table>`;

  return (
    <>
      <Header
        title={`שלום, ${doctor.name}`}
        description={doctor.clinic ?? doctor.address ?? "פורטל רופא — OPAL LAB"}
        actions={
          <ExportActions
            title={`פורטל ${doctor.name}`}
            whatsappText={activeOrders.map((o) => `${o.serialNumber}: ${ORDER_STATUS_LABELS[o.status]} — יעד ${formatDate(o.completionDate)}`).join("\n")}
            pdfHtml={exportHtml}
            phone={doctor.phone ?? undefined}
          />
        }
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card className="border-blue-100">
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{activeOrders.length}</p>
              <p className="text-xs text-slate-500">עבודות בטיפול</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-100">
          <CardContent className="p-4 flex items-center gap-3">
            <CreditCard className="h-8 w-8 text-amber-500" />
            <div>
              <p className={cn("text-2xl font-bold", doctor.balance < 0 ? "text-red-600" : "text-slate-900")}>
                {formatCurrency(doctor.balance)}
              </p>
              <p className="text-xs text-slate-500">{PAYMENT_STATUS_LABELS[doctor.paymentStatus]}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-100">
          <CardContent className="p-4 flex items-center gap-3">
            <Stethoscope className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="text-2xl font-bold">{completedOrders.length}</p>
              <p className="text-xs text-slate-500">הושלמו ונמסרו</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 mb-6">
        {([
          { key: "orders" as const, label: "מעקב הזמנות" },
          { key: "ledger" as const, label: "כרטסת" },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
              tab === key ? "bg-opal-gold text-white shadow-md" : "bg-white border text-slate-600 hover:bg-slate-50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "orders" ? (
        <div className="space-y-3">
          {activeOrders.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-slate-500">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>אין הזמנות פעילות כרגע</p>
              </CardContent>
            </Card>
          ) : activeOrders.map((order) => {
            const expanded = expandedId === order.id;
            return (
              <Card key={order.id} className="overflow-hidden">
                <button
                  type="button"
                  className="w-full text-right"
                  onClick={() => setExpandedId(expanded ? null : order.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-lg">{order.serialNumber}</p>
                        <p className="text-sm text-slate-600">מטופל: {order.patient.name}</p>
                        {order.shade && <p className="text-xs text-slate-400">צבע: {order.shade}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={order.status} />
                        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs text-slate-500 mb-1">שלב נוכחי: <strong>{ORDER_STATUS_LABELS[order.status]}</strong></p>
                      <WorkflowTracker currentStatus={order.status} compact />
                    </div>
                    <p className="text-sm text-slate-500 mt-2">
                      מועד מסירה משוער: <strong>{formatDate(order.completionDate)}</strong>
                    </p>
                  </CardContent>
                </button>
                {expanded && (
                  <div className="border-t bg-slate-50/50 px-4 py-4 space-y-3">
                    <WorkflowTracker currentStatus={order.status} />
                    {order.materials.length > 0 && (
                      <p className="text-sm text-slate-600">
                        חומר: {order.materials.map((m) => MATERIAL_TYPE_LABELS[m]).join(", ")}
                      </p>
                    )}
                    {order.description && (
                      <p className="text-sm text-slate-500">{order.description}</p>
                    )}
                    {order.totalPrice && (
                      <p className="text-sm font-semibold text-opal-gold-dark">עלות: {formatCurrency(order.totalPrice)}</p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}

          {completedOrders.length > 0 && (
            <Card className="mt-6">
              <CardHeader><CardTitle className="text-base">הזמנות שהושלמו</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {completedOrders.slice(0, 5).map((o) => (
                  <div key={o.id} className="flex justify-between text-sm p-2 rounded-lg bg-slate-50">
                    <span>{o.serialNumber} — {o.patient.name}</span>
                    <StatusBadge status={o.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle>סיכום כרטסת</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl bg-slate-900 text-white p-4 text-center">
                <p className="text-xs text-slate-400">יתרה נוכחית</p>
                <p className={cn("text-3xl font-bold mt-1", doctor.balance < 0 ? "text-red-400" : "text-white")}>
                  {formatCurrency(doctor.balance)}
                </p>
                <p className="text-xs text-slate-400 mt-2">{PAYMENT_STATUS_LABELS[doctor.paymentStatus]}</p>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                חיובים נרשמים בעת קליטת עבודות. תשלומים מעדכנים את היתרה. לשאלות — צרו קשר עם המעבדה.
              </p>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>תנועות בחשבון</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[32rem] overflow-y-auto">
              {doctorPayments.length === 0 ? (
                <p className="text-center text-slate-400 py-10">אין תנועות עדיין</p>
              ) : doctorPayments.map((p) => (
                <div key={p.id} className="p-3 rounded-xl border text-sm">
                  <div className="flex justify-between items-start">
                    <span className={cn("font-bold text-base", p.type === "PAYMENT" ? "text-emerald-600" : "text-red-600")}>
                      {p.type === "PAYMENT" ? "+" : "−"}{formatCurrency(p.amount)}
                    </span>
                    <span className="text-xs text-slate-400">{formatDate(p.createdAt)}</span>
                  </div>
                  {p.serialNumber && (
                    <p className="text-opal-gold-dark font-medium mt-1">עבודה {p.serialNumber}</p>
                  )}
                  {p.patientName && <p className="text-slate-600">מטופל: {p.patientName}</p>}
                  <p className="text-slate-500 mt-0.5">{p.description}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-400 mt-1">
                    {p.paymentMethod && <span>{PAYMENT_METHOD_LABELS[p.paymentMethod]}</span>}
                    {p.referenceNumber && <span>אסמכתא: {p.referenceNumber}</span>}
                    {p.paidAt && <span>שולם {formatDate(p.paidAt)}</span>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
