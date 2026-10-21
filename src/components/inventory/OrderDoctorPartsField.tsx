"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { orderNeedsDoctorParts } from "@/lib/inventory/doctor-parts-rules";

type CatalogPart = { id: string; name: string; code: string; quantity: number; unit: string };
export type SelectedDoctorPart = {
  partId: string;
  quantity: number;
  appliedQty?: number;
  name?: string;
  code?: string;
};

export function OrderDoctorPartsField({
  materials,
  workTypes,
  allInXType,
  pricingMode,
  value,
  onChange,
}: {
  materials: string[];
  workTypes: string[];
  allInXType?: string | null;
  pricingMode?: string | null;
  value: SelectedDoctorPart[];
  onChange: (next: SelectedDoctorPart[]) => void;
}) {
  const visible = orderNeedsDoctorParts({ materials, workTypes, allInXType, pricingMode });
  const [parts, setParts] = useState<CatalogPart[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [draftQty, setDraftQty] = useState("1");

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/inventory/doctor-parts", { credentials: "include" });
        const json = (await res.json()) as { success: boolean; data?: { parts: CatalogPart[] }; error?: { message?: string } };
        if (!json.success || !json.data) throw new Error(json.error?.message ?? "שגיאה בטעינת חלקים");
        if (!cancelled) setParts(json.data.parts);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "שגיאה בטעינת חלקים");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!visible) return null;

  const available = parts.filter((part) => !value.some((line) => line.partId === part.id));
  const shortfall = value.some((line) => {
    const part = parts.find((item) => item.id === line.partId);
    if (!part) return false;
    const applied = line.appliedQty ?? 0;
    return part.quantity - (line.quantity - applied) < 0;
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-800">חלקים להזמנה</h3>
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          הוסף חלק
        </Button>
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {shortfall && (
        <p className="mb-2 text-sm text-red-600">המלאי אינו מספיק. לאחר שמירת ההזמנה היתרה תהיה שלילית.</p>
      )}
      {value.length === 0 && !adding && <p className="text-sm text-slate-500">לא נבחרו חלקים</p>}
      <ul className="space-y-2">
        {value.map((line) => {
          const part = parts.find((item) => item.id === line.partId);
          return (
            <li key={line.partId} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 font-medium">
                {part?.name ?? line.name ?? "חלק"}
                {(part?.code || line.code) ? <span className="mr-1 text-xs text-slate-500">{part?.code || line.code}</span> : null}
              </span>
              <span className={part && part.quantity < 0 ? "text-red-600" : "text-slate-500"}>במלאי {part?.quantity ?? "—"}</span>
              <Input
                inputMode="numeric"
                aria-label="כמות נדרשת"
                value={String(line.quantity)}
                onChange={(event) => {
                  const quantity = Number(event.target.value);
                  if (!Number.isInteger(quantity) || quantity <= 0) return;
                  onChange(value.map((item) => (item.partId === line.partId ? { ...item, quantity } : item)));
                }}
                className="h-8 w-16 text-center"
              />
              <button
                type="button"
                aria-label="הסרה"
                className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => onChange(value.filter((item) => item.partId !== line.partId))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {adding && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            aria-label="בחירת חלק"
            value={draftId}
            onChange={(event) => setDraftId(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm"
          >
            <option value="">בחרו חלק</option>
            {available.map((part) => (
              <option key={part.id} value={part.id}>
                {part.name} {part.code ? `(${part.code})` : ""} · מלאי {part.quantity}
              </option>
            ))}
          </select>
          <Input inputMode="numeric" aria-label="כמות" value={draftQty} onChange={(event) => setDraftQty(event.target.value)} className="h-10 w-20" />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const quantity = Number(draftQty);
              if (!draftId || !Number.isInteger(quantity) || quantity <= 0) return;
              if (value.some((line) => line.partId === draftId)) return;
              onChange([...value, { partId: draftId, quantity, appliedQty: 0 }]);
              setDraftId("");
              setDraftQty("1");
              setAdding(false);
            }}
          >
            הוספה
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(false)}>
            ביטול
          </Button>
        </div>
      )}
    </section>
  );
}
