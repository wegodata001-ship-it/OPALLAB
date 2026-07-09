"use client";

import Link from "next/link";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExportActions } from "@/components/shared/export-actions";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { useApp } from "@/providers/AppProvider";
import { StatusBadge } from "@/components/orders/status-badge";
import { ORDER_STATUS_LABELS } from "@/lib/constants/labels";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Check, Circle } from "lucide-react";
import type { OrderStatus, DateRange } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { filterByDateRange } from "@/lib/date-filter";
import {
  PRODUCTION_STAGES,
  canCompleteStage,
  canUndoStage,
  canViewOrderInWorkflow,
  isPrivilegedRole,
} from "@/lib/workflow-permissions";

export default function WorkflowPage() {
  const { orders, currentUser, completeStage, undoStage, users } = useApp();
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });

  if (!currentUser) return null;

  const activeOrders = filterByDateRange(
    orders.filter((o) =>
      !["DELIVERED", "CANCELLED", "SHIPPED"].includes(o.status) &&
      canViewOrderInWorkflow(currentUser, o.status, o.completedStages)
    ),
    (o) => o.entryDate,
    dateRange
  );

  const exportHtml = `<h2>מעקב ייצור</h2><table><tr><th>עבודה</th><th>מטופל</th><th>שלב</th></tr>
    ${activeOrders.map((o) => `<tr><td>${o.serialNumber}</td><td>${o.patient.name}</td><td>${ORDER_STATUS_LABELS[o.status]}</td></tr>`).join("")}
    </table>`;

  return (
    <>
      <Header
        title="מעקב ייצור"
        description={
          isPrivilegedRole(currentUser)
            ? "סמן ✓ בסיום כל שלב — ניהול מלא"
            : "ניתן לסמן ולבטל רק את השלבים השייכים לתפקידך"
        }
        actions={
          <ExportActions
            title="מעקב ייצור"
            whatsappText={activeOrders.map((o) => `${o.serialNumber}: ${ORDER_STATUS_LABELS[o.status]}`).join("\n")}
            pdfHtml={exportHtml}
          />
        }
      />

      <DateRangeFilter value={dateRange} onChange={setDateRange} className="mb-4" />

      <div className="space-y-4">
        {activeOrders.map((order) => (
          <Card key={order.id} className="overflow-hidden">
            <div className="flex flex-col lg:flex-row">
              <div className="lg:w-56 bg-slate-900 text-white p-4 shrink-0">
                <Link href={`/orders/${order.id}`} className="hover:text-opal-gold transition-colors">
                  <p className="text-xl font-bold">{order.serialNumber}</p>
                </Link>
                <p className="text-sm text-slate-300 mt-1">{order.patient.name}</p>
                <p className="text-xs text-slate-400">{order.doctor.name}</p>
                <div className="mt-3"><StatusBadge status={order.status} /></div>
                <p className="text-xs text-slate-500 mt-2">יעד: {formatDate(order.completionDate)}</p>
              </div>

              <CardContent className="flex-1 p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {PRODUCTION_STAGES.map((stage) => {
                    const done = !!order.completedStages[stage.status];
                    const completion = order.completedStages[stage.status];
                    const completer = done ? users.find((u) => u.id === completion?.completedBy) : null;
                    const canDo = canCompleteStage(currentUser, stage.status, order.status, order.completedStages);
                    const canUndo = done && canUndoStage(currentUser, stage.status, order.completedStages);

                    return (
                      <div
                        key={stage.status}
                        className={cn(
                          "rounded-xl border-2 p-3 text-center transition-all",
                          done && "border-emerald-300 bg-emerald-50",
                          order.status === stage.status && !done && "border-opal-gold bg-opal-gold/5 ring-2 ring-opal-gold/20",
                          !done && order.status !== stage.status && "border-slate-100 bg-slate-50"
                        )}
                      >
                        <p className="text-xs font-medium text-slate-600 mb-2">{stage.label}</p>
                        {done ? (
                          <div className="flex flex-col items-center gap-1">
                            <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center">
                              <Check className="h-6 w-6 text-white" strokeWidth={3} />
                            </div>
                            <p className="text-[10px] text-emerald-700 font-medium">{completer?.name?.split(" ")[0]}</p>
                            <p className="text-[9px] text-slate-400">{formatDateTime(completion!.completedAt)}</p>
                            {canUndo ? (
                              <button
                                type="button"
                                onClick={() => undoStage({ orderId: order.id, stage: stage.status, undoneBy: currentUser.id })}
                                className="text-[10px] text-red-500 hover:underline mt-1"
                              >
                                ביטול שלי
                              </button>
                            ) : (
                              <p className="text-[9px] text-slate-300 mt-1">נחתם</p>
                            )}
                          </div>
                        ) : canDo ? (
                          <Button
                            size="sm"
                            className="w-full h-10"
                            onClick={() => completeStage({ orderId: order.id, stage: stage.status, completedBy: currentUser.id })}
                          >
                            <Check className="h-4 w-4" />
                            סיימתי
                          </Button>
                        ) : (
                          <div className="h-10 w-10 mx-auto rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center">
                            <Circle className="h-4 w-4 text-slate-300" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </div>
          </Card>
        ))}

        {activeOrders.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Check className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>אין עבודות פעילות בתפקידך כרגע</p>
          </div>
        )}
      </div>
    </>
  );
}
