"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { MATERIAL_TYPE_LABELS } from "@/lib/constants/labels";
import { ALL_IN_X_TYPE_SHORT_LABELS, PRICING_MODE_LABELS } from "@/lib/orders/doctor-pricing";
import type { OrderWithRelations, Payment } from "@/lib/types";
import { ExternalLink, Pencil } from "lucide-react";

function workLabel(order: OrderWithRelations): string {
  if (order.pricingMode === "ALL_IN_X" && order.allInXType) {
    return (
      ALL_IN_X_TYPE_SHORT_LABELS[order.allInXType] ??
      order.allInXType.replace(/^ALL_IN_X_/, "")
    );
  }
  if (order.pricingMode === "OTHER") {
    return order.otherWorkKind === "REWORK_FREE"
      ? "עבודה חוזרת – ללא חיוב"
      : "תיקון / עבודה אחרת";
  }
  const mats = order.materials
    .map((m) => MATERIAL_TYPE_LABELS[m] ?? m)
    .filter(Boolean);
  if (mats.length) return mats.join(" · ");
  if (order.workTypes.length) return order.workTypes.join(" · ");
  return PRICING_MODE_LABELS[order.pricingMode ?? "REGULAR"] ?? "עבודה";
}

function qtyLabel(order: OrderWithRelations): string | null {
  if (order.pricingMode === "ALL_IN_X") {
    const jaws = order.jawCount ?? 0;
    if (jaws <= 0) return null;
    return jaws === 1 ? "לסת אחת" : `${jaws} לסתות`;
  }
  const teeth = order.selectedTeeth?.length ?? order.priceQuantity ?? 0;
  if (!teeth) return null;
  return teeth === 1 ? "שן אחת" : `${teeth} שיניים`;
}

export function WorkChargeLedgerCard({
  charge,
  adjustments,
  order,
  canEdit,
  onAdjust,
}: {
  charge: Payment;
  adjustments: Payment[];
  order: OrderWithRelations | undefined;
  canEdit: boolean;
  onAdjust: (input: {
    orderId: string;
    newPrice: number;
    reason: string;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const net = useMemo(
    () => charge.amount + adjustments.reduce((s, a) => s + a.amount, 0),
    [charge.amount, adjustments],
  );

  const openEdit = () => {
    setPrice(String(net));
    setReason("");
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!order) return;
    const newPrice = parseFloat(price);
    if (!Number.isFinite(newPrice) || newPrice < 0) {
      setError("מחיר לא תקין");
      return;
    }
    if (!reason.trim()) {
      setError("חובה לציין סיבת שינוי");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAdjust({ orderId: order.id, newPrice, reason: reason.trim() });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 rounded-xl border text-sm space-y-2 bg-white">
      <div className="flex justify-between items-start gap-2">
        <div>
          <p className="font-bold text-opal-gold-dark">
            {order?.serialNumber ?? charge.serialNumber ?? "עבודה"}
          </p>
          {(order?.patient?.name || charge.patientName) && (
            <p className="text-slate-600">
              מטופל: {order?.patient?.name ?? charge.patientName}
            </p>
          )}
          {order && (
            <>
              <p className="text-slate-700 font-medium mt-0.5">{workLabel(order)}</p>
              {qtyLabel(order) && (
                <p className="text-xs text-slate-500">{qtyLabel(order)}</p>
              )}
            </>
          )}
          <p className="text-xs text-slate-400 mt-1">{formatDate(charge.createdAt)}</p>
        </div>
        <div className="text-left shrink-0 space-y-1">
          <p className="font-bold text-red-600">-{formatCurrency(Math.abs(net))}</p>
          <p className="text-[11px] text-slate-400">חיוב סופי</p>
        </div>
      </div>

      <div className="rounded-lg bg-slate-50 border px-2.5 py-2 space-y-1 text-xs">
        <div className="flex justify-between">
          <span>חיוב עבודה</span>
          <span className="font-medium">{formatCurrency(charge.amount)}</span>
        </div>
        {adjustments.map((a) => (
          <div key={a.id} className="flex justify-between gap-2">
            <span className="text-slate-600 truncate">
              התאמת מחיר
              {a.description?.includes("—")
                ? ` (${a.description.split("—").pop()?.trim() ?? ""})`
                : ""}
            </span>
            <span
              className={cn(
                "font-medium shrink-0",
                a.amount < 0 ? "text-emerald-600" : "text-red-600",
              )}
            >
              {a.amount > 0 ? "+" : ""}
              {formatCurrency(a.amount)}
            </span>
          </div>
        ))}
        {adjustments.length > 0 && (
          <div className="flex justify-between border-t pt-1 font-semibold">
            <span>חיוב סופי</span>
            <span>{formatCurrency(net)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {order && (
          <Link
            href={`/orders/${order.id}`}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            צפייה בהזמנה
          </Link>
        )}
        {canEdit && order && (
          <button
            type="button"
            onClick={openEdit}
            className="inline-flex items-center gap-1 text-xs text-opal-gold-dark hover:underline font-medium"
          >
            <Pencil className="h-3 w-3" />
            עריכת חיוב
          </button>
        )}
      </div>

      <Modal open={open} onClose={() => !saving && setOpen(false)} title="עריכת חיוב עבודה" className="max-w-md">
        <div className="space-y-3">
          <p className="text-sm">
            הזמנה:{" "}
            <span className="font-bold text-opal-gold-dark">
              {order?.serialNumber}
            </span>
          </p>
          <p className="text-sm">
            מחיר נוכחי: <span className="font-bold">{formatCurrency(net)}</span>
          </p>
          <div>
            <Label>מחיר חדש (₪)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={saving}
            />
          </div>
          <div>
            <Label>סיבת שינוי *</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="לדוגמה: הנחה / תיקון טעות בתמחור"
              disabled={saving}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              ביטול
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "שומר…" : "שמור שינוי"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
