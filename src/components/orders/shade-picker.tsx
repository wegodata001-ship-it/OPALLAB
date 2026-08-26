"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Settings2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { CatalogManageModal } from "@/components/orders/catalog-manage-modal";
import { activeCatalogOptions } from "@/lib/orders/order-catalog";
import { canManageOrderCatalog } from "@/lib/permissions";
import { useApp } from "@/providers/AppProvider";
import { cn } from "@/lib/utils";
import type { OrderCatalogOption } from "@/lib/types";

export interface ShadeOption {
  code: string;
  color: string;
  group: string;
}

const FAVORITES = ["A1", "A2", "A3", "B1", "BL2"] as const;

const GROUP_LABELS: Record<string, string> = {
  A: "A Shades",
  B: "B Shades",
  C: "C Shades",
  D: "D Shades",
  BL: "Bleach Shades",
};

interface ShadePickerProps {
  value: string;
  onChange: (shade: string) => void;
  disabled?: boolean;
  className?: string;
}

function toShadeOption(o: OrderCatalogOption): ShadeOption {
  return {
    code: o.code,
    color: o.color || "#e5e7eb",
    group: o.group || "A",
  };
}

function ShadeSwatch({
  shade,
  selected,
  onSelect,
}: {
  shade: ShadeOption;
  selected: boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(shade.code)}
      className={cn(
        "relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-2.5 transition-all duration-150",
        "hover:border-opal-gold hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-opal-gold/40",
        selected
          ? "border-opal-gold bg-opal-gold/10 shadow-sm"
          : "border-slate-200 bg-white",
      )}
      title={shade.code}
    >
      <span
        className="h-10 w-10 rounded-full border border-black/10 shadow-inner"
        style={{ background: shade.color }}
      />
      <span className="text-xs font-semibold text-slate-700">{shade.code}</span>
      {selected && (
        <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-opal-gold text-white shadow">
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

export function ShadePicker({ value, onChange, disabled, className }: ShadePickerProps) {
  const { orderCatalog, currentUser, refreshQuiet } = useApp();
  const canManage = currentUser ? canManageOrderCatalog(currentUser) : false;
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const catalog = useMemo(
    () => activeCatalogOptions(orderCatalog ?? [], "SHADE").map(toShadeOption),
    [orderCatalog],
  );

  const selected = catalog.find((s) => s.code === value);

  const filtered = useMemo(() => {
    const query = q.trim().toUpperCase();
    if (!query) return catalog;
    return catalog.filter((s) => s.code.includes(query) || s.group.includes(query));
  }, [catalog, q]);

  const favorites = useMemo(
    () => FAVORITES.map((code) => catalog.find((s) => s.code === code)).filter(Boolean) as ShadeOption[],
    [catalog],
  );

  const groups = useMemo(() => {
    const map = new Map<string, ShadeOption[]>();
    for (const s of filtered) {
      const list = map.get(s.group) ?? [];
      list.push(s);
      map.set(s.group, list);
    }
    return [...map.entries()];
  }, [filtered]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => searchRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
    setQ("");
  }, [open]);

  const pick = useCallback(
    (code: string) => {
      onChange(code);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div className={cn("relative", className)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">צבע Shade</span>
        {canManage && !disabled && (
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:border-opal-gold/40 hover:text-opal-gold"
          >
            <Settings2 className="h-3 w-3" />
            ניהול
          </button>
        )}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right transition-colors",
          "hover:border-opal-gold/50 disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <span
          className="h-8 w-8 shrink-0 rounded-full border border-black/10"
          style={{ background: selected?.color ?? "#f1f5f9" }}
        />
        <span className="flex-1 text-sm font-medium text-slate-800">
          {value || "בחר צבע..."}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="בחירת Shade" className="max-w-lg">
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש קוד..."
              className="w-full rounded-lg border border-slate-200 py-2 pr-9 pl-3 text-sm"
            />
            {q && (
              <button
                type="button"
                className="absolute left-2 top-2 rounded p-1 text-slate-400 hover:bg-slate-100"
                onClick={() => setQ("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {favorites.length > 0 && !q && (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500">נפוצים</p>
              <div className="flex flex-wrap gap-2">
                {favorites.map((s) => (
                  <ShadeSwatch
                    key={s.code}
                    shade={s}
                    selected={value === s.code}
                    onSelect={pick}
                  />
                ))}
              </div>
            </div>
          )}

          {groups.map(([group, shades]) => (
            <div key={group}>
              <p className="mb-2 text-xs font-semibold text-slate-500">
                {GROUP_LABELS[group] ?? group}
              </p>
              <div className="flex flex-wrap gap-2">
                {shades.map((s) => (
                  <ShadeSwatch
                    key={s.code}
                    shade={s}
                    selected={value === s.code}
                    onSelect={pick}
                  />
                ))}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">אין תוצאות</p>
          )}
        </div>
      </Modal>

      {canManage && (
        <CatalogManageModal
          open={manageOpen}
          category="SHADE"
          options={orderCatalog ?? []}
          onClose={() => setManageOpen(false)}
          onChanged={() => refreshQuiet()}
        />
      )}
    </div>
  );
}
