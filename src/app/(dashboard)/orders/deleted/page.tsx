"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PermanentDeleteDialog } from "@/components/orders/order-delete-button";
import { StatusBadge } from "@/components/orders/status-badge";
import { useApp } from "@/providers/AppProvider";
import { canDeleteOrders } from "@/lib/permissions";
import { apiGet, apiPost } from "@/lib/api/client";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants/labels";
import type { OrderWithRelations } from "@/lib/types";
import { RotateCcw, Trash2, Eye, Search } from "lucide-react";

type DeletedOrderRow = OrderWithRelations & {
  deletedByUser?: { id: string; name: string; username: string } | null;
};

export default function DeletedOrdersPage() {
  const { currentUser, refresh, users } = useApp();
  const allowed = currentUser && canDeleteOrders(currentUser);

  const [orders, setOrders] = useState<DeletedOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [deletedBy, setDeletedBy] = useState("");
  const [viewOrder, setViewOrder] = useState<DeletedOrderRow | null>(null);
  const [permanentTarget, setPermanentTarget] = useState<DeletedOrderRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", new Date(from).toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        params.set("to", end.toISOString());
      }
      if (deletedBy) params.set("deletedBy", deletedBy);
      const qs = params.toString();
      const data = await apiGet<{ orders: DeletedOrderRow[] }>(
        `/api/orders/deleted${qs ? `?${qs}` : ""}`,
      );
      setOrders(data.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }, [q, from, to, deletedBy]);

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed, load]);

  const deleters = useMemo(() => {
    const ids = new Set(orders.map((o) => o.deletedBy).filter(Boolean) as string[]);
    return users.filter((u) => ids.has(u.id) || canDeleteOrders(u));
  }, [orders, users]);

  if (!allowed) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-500">אין הרשאה לצפות בהזמנות שנמחקו (מנהל מערכת בלבד).</p>
      </div>
    );
  }

  const onRestore = async (order: DeletedOrderRow) => {
    setBusyId(order.id);
    setActionError("");
    try {
      await apiPost(`/api/orders/${order.id}/restore`, {});
      await refresh();
      await load();
      setViewOrder(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שחזור נכשל");
    } finally {
      setBusyId(null);
    }
  };

  const onPermanent = async (confirm: string) => {
    if (!permanentTarget) return;
    setBusyId(permanentTarget.id);
    setActionError("");
    try {
      await apiPost(`/api/orders/${permanentTarget.id}/permanent-delete`, { confirm });
      setPermanentTarget(null);
      await load();
      setViewOrder(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "מחיקה סופית נכשלה");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Header
        title="הזמנות שנמחקו"
        description="מנהל מערכת — צפייה, שחזור ומחיקה סופית"
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[12rem] flex-1">
            <Label>חיפוש</Label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="מספר הזמנה / מטופל / רופא / סיבה"
            />
          </div>
          <div>
            <Label>מתאריך</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>עד תאריך</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="min-w-[10rem]">
            <Label>מי מחק</Label>
            <select
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              value={deletedBy}
              onChange={(e) => setDeletedBy(e.target.value)}
            >
              <option value="">הכל</option>
              {deleters.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" onClick={() => void load()}>
            <Search className="h-4 w-4" />
            סנן
          </Button>
        </CardContent>
      </Card>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {actionError && <p className="mb-3 text-sm text-red-600">{actionError}</p>}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <p className="p-6 text-center text-slate-500">טוען...</p>
          ) : orders.length === 0 ? (
            <p className="p-6 text-center text-slate-500">אין הזמנות שנמחקו</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-right font-medium">הזמנה</th>
                  <th className="px-3 py-2 text-right font-medium">מטופל</th>
                  <th className="px-3 py-2 text-right font-medium">רופא</th>
                  <th className="px-3 py-2 text-right font-medium">נמחקה</th>
                  <th className="px-3 py-2 text-right font-medium">מי מחק</th>
                  <th className="px-3 py-2 text-right font-medium">סיבה</th>
                  <th className="px-3 py-2 text-right font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-semibold">{order.serialNumber}</td>
                    <td className="px-3 py-2">{order.patient.name}</td>
                    <td className="px-3 py-2">{order.doctor?.name ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {order.deletedAt ? formatDateTime(order.deletedAt) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {order.deletedByUser?.name ?? "—"}
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-2" title={order.deleteReason ?? ""}>
                      {order.deleteReason || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setViewOrder(order)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          צפייה
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyId === order.id}
                          onClick={() => void onRestore(order)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          שחזור
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-700"
                          disabled={busyId === order.id}
                          onClick={() => setPermanentTarget(order)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          סופית
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Modal
        open={!!viewOrder}
        onClose={() => setViewOrder(null)}
        title={viewOrder ? `הזמנה ${viewOrder.serialNumber}` : ""}
      >
        {viewOrder && (
          <div className="space-y-3 text-sm">
            <StatusBadge status={viewOrder.status} />
            <dl className="grid grid-cols-2 gap-2">
              <dt className="text-slate-500">מטופל</dt>
              <dd>{viewOrder.patient.name}</dd>
              <dt className="text-slate-500">רופא</dt>
              <dd>{viewOrder.doctor?.name ?? "—"}</dd>
              <dt className="text-slate-500">סטטוס לפני מחיקה</dt>
              <dd>
                {viewOrder.statusBeforeDelete
                  ? ORDER_STATUS_LABELS[viewOrder.statusBeforeDelete]
                  : "—"}
              </dd>
              <dt className="text-slate-500">נמחקה ב</dt>
              <dd>{viewOrder.deletedAt ? formatDateTime(viewOrder.deletedAt) : "—"}</dd>
              <dt className="text-slate-500">מי מחק</dt>
              <dd>{viewOrder.deletedByUser?.name ?? "—"}</dd>
              <dt className="text-slate-500">סיבה</dt>
              <dd>{viewOrder.deleteReason || "—"}</dd>
              <dt className="text-slate-500">כניסה</dt>
              <dd>{formatDate(viewOrder.entryDate)}</dd>
              <dt className="text-slate-500">קבצים</dt>
              <dd>{viewOrder.files?.length ?? 0}</dd>
            </dl>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                disabled={busyId === viewOrder.id}
                onClick={() => void onRestore(viewOrder)}
              >
                <RotateCcw className="h-4 w-4" />
                שחזור הזמנה
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-700"
                onClick={() => setPermanentTarget(viewOrder)}
              >
                <Trash2 className="h-4 w-4" />
                מחיקה סופית
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <PermanentDeleteDialog
        open={!!permanentTarget}
        onClose={() => setPermanentTarget(null)}
        serialNumber={permanentTarget?.serialNumber ?? ""}
        busy={busyId === permanentTarget?.id}
        error={actionError}
        onConfirm={(confirm) => void onPermanent(confirm)}
      />
    </>
  );
}
