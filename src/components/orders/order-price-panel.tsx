"use client";

import Link from "next/link";
import { Input, Label, Textarea } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import type { OrderPricingFormState } from "@/hooks/use-order-pricing-form";
import {
  ALL_IN_X_TYPE_SHORT_LABELS,
  OTHER_WORK_KIND_LABELS,
  PRICING_MODE_LABELS,
  type OtherWorkKind,
  type PricingMode,
} from "@/lib/orders/doctor-pricing";
import { allInXBillableOptions } from "@/lib/orders/doctor-pricing";
import { canEditOrders, canManageOrderCatalog } from "@/lib/permissions";
import { useApp } from "@/providers/AppProvider";
import type { OrderPriceLine } from "@/lib/types";
import { cn } from "@/lib/utils";

interface OrderPricePanelProps {
  pricing: OrderPricingFormState;
  pricingMode: PricingMode;
  onPricingModeChange: (mode: PricingMode) => void;
  doctorId?: string;
  useSnapshot?: boolean;
  snapshot?: {
    lines: OrderPriceLine[];
    unitPrice?: number | null;
    quantity?: number | null;
    calculatedPrice?: number | null;
    finalPrice?: number | null;
    priceManuallyEdited?: boolean;
    pricingMode?: PricingMode;
    otherWorkKind?: OtherWorkKind | null;
    otherWorkNotes?: string | null;
    allInXType?: string | null;
    pricePerJaw?: number | null;
    jawCount?: number | null;
  };
  otherWorkKind: OtherWorkKind | null;
  onOtherWorkKindChange: (kind: OtherWorkKind | null) => void;
  otherWorkNotes: string;
  onOtherWorkNotesChange: (notes: string) => void;
  allInXType: string | null;
  onAllInXTypeChange: (code: string | null) => void;
  allowFinalEdit?: boolean;
  className?: string;
}

function FinalPriceInput({
  canEdit,
  value,
  onChange,
}: {
  canEdit: boolean;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  if (!canEdit) {
    return (
      <span className="font-semibold tabular-nums text-opal-gold-dark">
        {value != null ? formatCurrency(value) : "—"}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-slate-400">₪</span>
      <Input
        type="number"
        min={0}
        step="0.01"
        className="w-28 text-left font-semibold"
        dir="ltr"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (!raw) {
            onChange(null);
            return;
          }
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : null);
        }}
      />
    </div>
  );
}

export function OrderPricePanel({
  pricing,
  pricingMode,
  onPricingModeChange,
  doctorId,
  useSnapshot,
  snapshot,
  otherWorkKind,
  onOtherWorkKindChange,
  otherWorkNotes,
  onOtherWorkNotesChange,
  allInXType,
  onAllInXTypeChange,
  allowFinalEdit,
  className,
}: OrderPricePanelProps) {
  const { currentUser, orderCatalog } = useApp();
  const canManage = currentUser ? canManageOrderCatalog(currentUser) : false;
  const canEditFinal =
    allowFinalEdit ?? (currentUser ? canEditOrders(currentUser) : false);

  const allInOptions = allInXBillableOptions(orderCatalog);

  const mode = useSnapshot && snapshot?.pricingMode ? snapshot.pricingMode : pricingMode;
  const displayMode =
    useSnapshot && snapshot
      ? snapshot.otherWorkKind === "REWORK_FREE"
        ? "REWORK_FREE"
        : snapshot.otherWorkKind === "REPAIR_OTHER"
          ? "REPAIR_OTHER"
          : snapshot.pricingMode === "ALL_IN_X"
            ? "ALL_IN_X"
            : pricing.mode
      : pricing.mode;

  const lines = useSnapshot && snapshot?.lines?.length ? snapshot.lines : pricing.lines;
  const quantity =
    useSnapshot && snapshot?.quantity != null ? snapshot.quantity : pricing.quantity;
  const unitPrice =
    useSnapshot && snapshot?.unitPrice != null ? snapshot.unitPrice : pricing.unitPrice;
  const pricePerJaw =
    useSnapshot && snapshot?.pricePerJaw != null ? snapshot.pricePerJaw : pricing.pricePerJaw;
  const jawCount =
    useSnapshot && snapshot?.jawCount != null ? snapshot.jawCount : pricing.jawCount;
  const calculated =
    useSnapshot && snapshot?.calculatedPrice != null
      ? snapshot.calculatedPrice
      : pricing.calculatedPrice;
  const finalPrice =
    useSnapshot && snapshot?.finalPrice != null ? snapshot.finalPrice : pricing.finalPrice;
  const manuallyEdited = useSnapshot
    ? Boolean(snapshot?.priceManuallyEdited)
    : pricing.priceManuallyEdited;
  const missing = useSnapshot ? [] : pricing.missing;
  const notesDisplay = useSnapshot ? snapshot?.otherWorkNotes ?? otherWorkNotes : otherWorkNotes;
  const snapAllInType = useSnapshot ? snapshot?.allInXType ?? allInXType : allInXType;

  return (
    <div className={cn("rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3", className)}>
      <p className="text-sm font-semibold text-slate-700">תמחור</p>

      {!useSnapshot && (
        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-lg w-fit">
          {(["REGULAR", "ALL_IN_X", "OTHER"] as PricingMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onPricingModeChange(m)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                pricingMode === m
                  ? "bg-white shadow text-slate-900"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {PRICING_MODE_LABELS[m]}
            </button>
          ))}
        </div>
      )}

      {/* OTHER */}
      {mode === "OTHER" && !useSnapshot && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
          <div className="flex flex-col gap-2">
            {(["REWORK_FREE", "REPAIR_OTHER"] as OtherWorkKind[]).map((kind) => (
              <label key={kind} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="other-work-kind"
                  className="accent-opal-gold"
                  checked={otherWorkKind === kind}
                  onChange={() => onOtherWorkKindChange(kind)}
                />
                {OTHER_WORK_KIND_LABELS[kind]}
              </label>
            ))}
          </div>
          {otherWorkKind === "REPAIR_OTHER" && (
            <div>
              <Label>תיאור העבודה / הערות</Label>
              <Textarea
                rows={4}
                value={otherWorkNotes}
                onChange={(e) => onOtherWorkNotesChange(e.target.value)}
                placeholder={"לדוגמה: תיקון שבר בכתר קיים\nהמטופל החזיר את העבודה..."}
              />
            </div>
          )}
          {otherWorkKind === "REWORK_FREE" && (
            <div>
              <Label>הערות</Label>
              <Textarea
                rows={3}
                value={otherWorkNotes}
                onChange={(e) => onOtherWorkNotesChange(e.target.value)}
                placeholder="הסבר חופשי על העבודה החוזרת..."
              />
            </div>
          )}
        </div>
      )}

      {/* ALL IN X type picker */}
      {mode === "ALL_IN_X" && !useSnapshot && (
        <div className="space-y-2">
          <Label>סוג ALL IN X</Label>
          <div className="flex flex-wrap gap-2">
            {allInOptions.map((opt) => {
              const on = allInXType === opt.code;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onAllInXTypeChange(opt.code)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-opal-gold bg-opal-gold/15 text-opal-gold-dark"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  {ALL_IN_X_TYPE_SHORT_LABELS[opt.code] ?? opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {displayMode === "REWORK_FREE" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 space-y-1">
          <p className="font-semibold">עבודה חוזרת – ללא חיוב</p>
          {notesDisplay?.trim() && (
            <p className="text-emerald-800/90 whitespace-pre-wrap">{notesDisplay}</p>
          )}
          <p className="font-semibold pt-1 border-t border-emerald-200">סה״כ: {formatCurrency(0)}</p>
        </div>
      )}

      {displayMode === "REPAIR_OTHER" && (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-slate-700">תיקון / עבודה אחרת</p>
          {notesDisplay?.trim() && (
            <p className="text-slate-600 whitespace-pre-wrap">{notesDisplay}</p>
          )}
          <div className="flex justify-between gap-3 items-center">
            <span className="text-slate-600">מחיר</span>
            <FinalPriceInput
              canEdit={canEditFinal && !useSnapshot}
              value={finalPrice}
              onChange={pricing.setFinalPrice}
            />
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
            <span>סה״כ</span>
            <span className="tabular-nums text-opal-gold-dark">
              {finalPrice != null ? formatCurrency(finalPrice) : "—"}
            </span>
          </div>
        </div>
      )}

      {displayMode === "ALL_IN_X" && (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-slate-700">
            ALL IN X
            {snapAllInType
              ? ` — ${ALL_IN_X_TYPE_SHORT_LABELS[snapAllInType] ?? snapAllInType}`
              : ""}
          </p>
          <div className="flex justify-between gap-3">
            <span className="text-slate-600">מחיר ללסת</span>
            <span className="tabular-nums font-medium">
              {pricePerJaw != null ? formatCurrency(pricePerJaw) : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-600">לסתות שנבחרו</span>
            <span className="tabular-nums font-medium">{jawCount}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-600">מחיר מחושב</span>
            <span className="tabular-nums font-medium">
              {calculated != null ? formatCurrency(calculated) : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-3 items-center border-t border-slate-200 pt-2">
            <span className="font-semibold">מחיר סופי</span>
            <FinalPriceInput
              canEdit={canEditFinal && !useSnapshot}
              value={finalPrice}
              onChange={pricing.setFinalPrice}
            />
          </div>
          {manuallyEdited &&
            calculated != null &&
            finalPrice != null &&
            finalPrice !== calculated && (
              <p className="text-xs text-slate-500">
                נערך ידנית (מחושב היה {formatCurrency(calculated)})
              </p>
            )}
        </div>
      )}

      {displayMode === "BOOK" && (
        <div className="space-y-2 text-sm">
          {lines.length === 1 && (
            <>
              <div className="flex justify-between gap-3">
                <span className="text-slate-600">מחיר ליחידה</span>
                <span className="tabular-nums font-medium">
                  {unitPrice != null ? formatCurrency(unitPrice) : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-600">כמות (שיניים)</span>
                <span className="tabular-nums font-medium">{quantity}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-600">מחיר מחושב</span>
                <span className="tabular-nums font-medium">
                  {calculated != null ? formatCurrency(calculated) : "—"}
                </span>
              </div>
            </>
          )}
          {lines.length > 1 && (
            <ul className="space-y-1.5">
              {lines.map((line) => (
                <li key={`${line.catalogOptionId}-${line.code}`} className="flex justify-between gap-3">
                  <span className="text-slate-600">
                    {line.nameSnapshot}
                    {` · ${formatCurrency(line.unitPrice)} × ${line.quantity}`}
                  </span>
                  <span className="font-medium tabular-nums">{formatCurrency(line.lineTotal)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 border-t border-slate-200 pt-2">
                <span className="text-slate-600">מחיר מחושב</span>
                <span className="tabular-nums font-medium">
                  {calculated != null ? formatCurrency(calculated) : "—"}
                </span>
              </li>
            </ul>
          )}
          {lines.length > 0 && (
            <div className="flex justify-between gap-3 items-center border-t border-slate-200 pt-2">
              <span className="font-semibold text-slate-800">מחיר סופי</span>
              <FinalPriceInput
                canEdit={canEditFinal && !useSnapshot}
                value={finalPrice}
                onChange={pricing.setFinalPrice}
              />
            </div>
          )}
          {manuallyEdited &&
            calculated != null &&
            finalPrice != null &&
            finalPrice !== calculated && (
              <p className="text-xs text-slate-500">
                נערך ידנית (מחושב היה {formatCurrency(calculated)})
              </p>
            )}
        </div>
      )}

      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 space-y-2">
          {missing.map((m) => (
            <p key={m.catalogOptionId || m.code}>
              לא הוגדר מחיר עבור הרופא
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
