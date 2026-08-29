"use client";

import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import type { DoctorOrderPricingResult } from "@/hooks/use-doctor-order-pricing";
import { canManageOrderCatalog } from "@/lib/permissions";
import { useApp } from "@/providers/AppProvider";
import type { OrderPriceLine } from "@/lib/types";

interface OrderPricePanelProps {
  pricing: DoctorOrderPricingResult;
  /** When editing an existing order — show frozen snapshot instead of live book. */
  snapshotLines?: OrderPriceLine[];
  snapshotTotal?: number | null;
  useSnapshot?: boolean;
  /** Optional: open doctor settings for missing prices */
  doctorId?: string;
  className?: string;
}

export function OrderPricePanel({
  pricing,
  snapshotLines,
  snapshotTotal,
  useSnapshot,
  doctorId,
  className,
}: OrderPricePanelProps) {
  const { currentUser } = useApp();
  const canManage = currentUser ? canManageOrderCatalog(currentUser) : false;

  const lines = useSnapshot && snapshotLines?.length ? snapshotLines : pricing.lines;
  const total =
    useSnapshot && snapshotTotal != null
      ? snapshotTotal
      : useSnapshot && snapshotLines?.length
        ? snapshotLines.reduce((s, l) => s + l.lineTotal, 0)
        : pricing.total;
  const missing = useSnapshot ? [] : pricing.missing;

  if (!pricing.hasSelections && !lines.length && !missing.length) {
    return null;
  }

  return (
    <div className={className ?? "rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3"}>
      <p className="text-sm font-semibold text-slate-700">תמחור לפי מחירון הרופא</p>

      {lines.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {lines.map((line) => (
            <li key={`${line.catalogOptionId}-${line.code}`} className="flex justify-between gap-3">
              <span className="text-slate-600">
                {line.nameSnapshot}
                {line.quantity > 1 ? ` × ${line.quantity}` : ""}
              </span>
              <span className="font-medium tabular-nums text-slate-900">
                {formatCurrency(line.lineTotal)}
              </span>
            </li>
          ))}
          {total != null && (
            <li className="flex justify-between gap-3 border-t border-slate-200 pt-2 mt-1 font-semibold">
              <span>סה״כ</span>
              <span className="tabular-nums text-opal-gold-dark">{formatCurrency(total)}</span>
            </li>
          )}
        </ul>
      )}

      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 space-y-2">
          {missing.map((m) => (
            <p key={m.catalogOptionId}>
              לא הוגדר מחיר לסוג עבודה זה עבור הרופא
              <span className="font-medium"> ({m.label})</span>
            </p>
          ))}
          {canManage && doctorId ? (
            <Link
              href="/settings?tab=doctors"
              className="inline-flex text-sm font-semibold text-opal-gold-dark underline-offset-2 hover:underline"
            >
              הגדר מחיר
            </Link>
          ) : (
            !canManage && (
              <p className="text-xs text-amber-800/80">פנה למנהל המערכת להגדרת מחיר.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
