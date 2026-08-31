"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useApp } from "@/providers/AppProvider";
import {
  allInXBillableOptions,
  regularBillableOptions,
} from "@/lib/orders/doctor-pricing";
import { canManageOrderCatalog } from "@/lib/permissions";

interface DoctorPriceBookProps {
  doctorId: string;
}

function PriceRows({
  options,
  draft,
  setDraft,
}: {
  options: Array<{ id: string; label: string }>;
  draft: Record<string, string>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <div key={opt.id} className="flex items-center gap-3">
          <Label className="flex-1 text-sm font-normal text-slate-700 min-w-0 truncate">
            {opt.label}
          </Label>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-slate-400">₪</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              className="w-28 text-left"
              dir="ltr"
              placeholder="—"
              value={draft[opt.id] ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, [opt.id]: e.target.value }))
              }
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Admin-only batch editor — regular (per unit) + ALL IN X (per jaw). */
export function DoctorPriceBook({ doctorId }: DoctorPriceBookProps) {
  const { currentUser, orderCatalog, doctorPrices, saveDoctorPrices } = useApp();
  const canManage = currentUser ? canManageOrderCatalog(currentUser) : false;

  const regular = useMemo(() => regularBillableOptions(orderCatalog), [orderCatalog]);
  const allInX = useMemo(() => allInXBillableOptions(orderCatalog), [orderCatalog]);
  const allOptions = useMemo(() => [...regular, ...allInX], [regular, allInX]);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const opt of allOptions) {
      const row = doctorPrices.find(
        (p) => p.doctorId === doctorId && p.catalogOptionId === opt.id && p.isActive,
      );
      next[opt.id] = row != null ? String(row.price) : "";
    }
    setDraft(next);
    setMessage("");
    setError("");
  }, [doctorId, allOptions, doctorPrices]);

  if (!canManage) {
    return (
      <p className="text-sm text-slate-500">רק מנהל מערכת יכול לערוך את מחירון הרופא.</p>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const items = allOptions.map((opt) => {
        const raw = (draft[opt.id] ?? "").trim();
        if (!raw) return { catalogOptionId: opt.id, price: null as number | null };
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(`מחיר לא תקין עבור ${opt.label}`);
        }
        return { catalogOptionId: opt.id, price: n };
      });
      await saveDoctorPrices(doctorId, items);
      setMessage("המחירון נשמר");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת המחירון");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">מחירון</p>
        <p className="text-xs text-slate-500 mt-0.5">שדה ריק = מחיר לא מוגדר.</p>
      </div>

      <div className="space-y-4 max-h-80 overflow-y-auto pe-1">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            מחירים רגילים — ליחידה / לשן
          </p>
          <PriceRows options={regular} draft={draft} setDraft={setDraft} />
        </div>

        <div className="border-t border-slate-200 pt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            ALL IN X — מחיר ללסת
          </p>
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
            מחירי ALL IN X הם ללסת אחת. שתי לסתות = מחיר × 2.
          </p>
          <PriceRows options={allInX} draft={draft} setDraft={setDraft} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <Button type="button" className="w-full sm:w-auto" disabled={saving} onClick={() => void handleSave()}>
        {saving ? "שומר..." : "שמור מחירון"}
      </Button>
    </section>
  );
}
