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
import { Check, Circle, Loader2, RotateCcw } from "lucide-react";
import type { DateRange } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCallback, useRef, useState } from "react";
import { filterByDateRange } from "@/lib/date-filter";
import {
  PRODUCTION_STAGES,
  canCompleteStage,
  canUndoStage,
  getProductionStageState,
  hasStageCompletionRole,
  isStageCompletionAdmin,
} from "@/lib/workflow-permissions";
import { OrderHistoryButton } from "@/components/orders/order-history-modal";
import { shippingLog } from "@/lib/shipping/action-log";

export default function WorkflowPage() {
  const { orders, currentUser, completeStage, undoStage, users } = useApp();
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const lockRef = useRef<Set<string>>(new Set());

  const runStageAction = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      if (lockRef.current.has(key)) {
        shippingLog("click", key, { ignored: "double-submit" });
        return;
      }
      lockRef.current.add(key);
      setBusyKey(key);
      setActionError(null);
      shippingLog("click", key);
      try {
        await fn();
        shippingLog("ui:updated", key);
      } catch (error) {
        const message = error instanceof Error ? error.message : "הפעולה נכשלה";
        setActionError(message);
        shippingLog("error", key, { message });
      } finally {
        lockRef.current.delete(key);
        setBusyKey(null);
      }
    },
    [],
  );

  if (!currentUser) return null;

  const isAdmin = isStageCompletionAdmin(currentUser);
  // Everyone sees the full pipeline; only actions are role-gated
  const visibleStages = PRODUCTION_STAGES;

  const activeOrders = filterByDateRange(
    orders.filter((o) => !["DELIVERED", "CANCELLED", "SHIPPED"].includes(o.status)),
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
          isAdmin
            ? "ניהול מלא — ניתן לסמן, להחזיר ולדלג לכל שלב"
            : "כל ההזמנות גלויות — ניתן לבצע פעולה רק בשלב שלך"
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

      {actionError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="space-y-4">
        {activeOrders.map((order) => (
          <Card key={order.id} className="overflow-hidden">
            <div className="flex flex-col lg:flex-row">
              <div className="relative lg:w-56 bg-slate-900 text-white p-4 shrink-0">
                <div className="absolute left-3 top-3">
                  <OrderHistoryButton
                    order={order}
                    className="border-slate-600 bg-slate-800 text-slate-200 hover:border-violet-400 hover:bg-slate-700 hover:text-white"
                  />
                </div>
                <Link href={`/orders/${order.id}`} className="hover:text-opal-gold transition-colors">
                  <p className="text-xl font-bold pl-8 lg:pl-0">{order.serialNumber}</p>
                </Link>
                <p className="text-sm text-slate-300 mt-1">{order.patient.name}</p>
                <p className="text-xs text-slate-400">{order.doctor?.name ?? "—"}</p>
                <div className="mt-3"><StatusBadge status={order.status} /></div>
                <p className="text-xs text-slate-500 mt-2">יעד: {formatDate(order.completionDate)}</p>
              </div>

              <CardContent className="flex-1 p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {visibleStages.map((stage) => {
                    const stageState = getProductionStageState(
                      stage.status,
                      order.status,
                      order.completedStages,
                    );
                    const done = stageState === "COMPLETED";
                    const isCurrent = stageState === "CURRENT";
                    const completion = order.completedStages[stage.status];
                    const completer = completion
                      ? users.find((u) => u.id === completion.completedBy)
                      : null;
                    const hasRole = hasStageCompletionRole(currentUser, stage.status);
                    const canDo = canCompleteStage(
                      currentUser,
                      stage.status,
                      order.status,
                      order.completedStages,
                    );
                    const canUndo = canUndoStage(
                      currentUser,
                      stage.status,
                      order.completedStages,
                      order.status,
                    );
                    const noPermission = !isAdmin && isCurrent && !hasRole;

                    return (
                      <div
                        key={stage.status}
                        className={cn(
                          "rounded-xl border-2 p-3 text-center transition-all",
                          done && "border-emerald-300 bg-emerald-50",
                          isCurrent && "border-opal-gold bg-opal-gold/5 ring-2 ring-opal-gold/20",
                          stageState === "WAITING" && "border-slate-100 bg-slate-50",
                          isAdmin && stageState === "WAITING" && "border-slate-200 bg-white",
                        )}
                      >
                        <p className="text-xs font-medium text-slate-600 mb-2">{stage.label}</p>
                        {done ? (
                          <div className="flex flex-col items-center gap-1">
                            <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center">
                              <Check className="h-6 w-6 text-white" strokeWidth={3} />
                            </div>
                            <p className="text-[10px] text-emerald-700 font-medium">
                              {completer?.name?.split(" ")[0] ?? "הושלם"}
                            </p>
                            {completion?.completedAt ? (
                              <p className="text-[9px] text-slate-400">
                                {formatDateTime(completion.completedAt)}
                              </p>
                            ) : (
                              <p className="text-[9px] text-slate-400">שלב קודם</p>
                            )}
                            {canUndo ? (
                              <button
                                type="button"
                                disabled={busyKey === `undo:${order.id}:${stage.status}`}
                                onClick={() =>
                                  void runStageAction(`undo:${order.id}:${stage.status}`, () =>
                                    undoStage({
                                      orderId: order.id,
                                      stage: stage.status,
                                      undoneBy: currentUser.id,
                                    }),
                                  )
                                }
                                className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-red-500 hover:underline disabled:opacity-50"
                              >
                                {busyKey === `undo:${order.id}:${stage.status}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3 w-3" />
                                )}
                                {isAdmin ? "החזר שלב" : "ביטול שלי"}
                              </button>
                            ) : (
                              <p className="mt-1 text-[9px] text-slate-300">נחתם</p>
                            )}
                          </div>
                        ) : canDo ? (
                          <Button
                            size="sm"
                            className="h-10 w-full"
                            disabled={Boolean(busyKey)}
                            onClick={() =>
                              void runStageAction(`complete:${order.id}:${stage.status}`, () =>
                                completeStage({
                                  orderId: order.id,
                                  stage: stage.status,
                                  completedBy: currentUser.id,
                                }),
                              )
                            }
                          >
                            {busyKey === `complete:${order.id}:${stage.status}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            {busyKey === `complete:${order.id}:${stage.status}`
                              ? "שומר..."
                              : isAdmin && !isCurrent
                                ? "השלם עד כאן"
                                : "סיימתי"}
                          </Button>
                        ) : noPermission ? (
                          <span
                            title="אין לך הרשאה לסמן שלב זה"
                            className="inline-flex w-full cursor-not-allowed"
                          >
                            <Button
                              size="sm"
                              className="pointer-events-none h-10 w-full"
                              disabled
                              aria-label="אין לך הרשאה לסמן שלב זה"
                            >
                              <Check className="h-4 w-4" />
                              סיימתי
                            </Button>
                          </span>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-slate-200">
                              <Circle className="h-4 w-4 text-slate-300" />
                            </div>
                            <p className="text-[10px] text-slate-400">ממתין</p>
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
          <div className="py-16 text-center text-slate-400">
            <Check className="mx-auto mb-3 h-12 w-12 opacity-30" />
            <p>אין עבודות פעילות כרגע</p>
          </div>
        )}
      </div>
    </>
  );
}
