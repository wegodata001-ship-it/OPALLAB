"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { CatalogManageModal } from "@/components/orders/catalog-manage-modal";
import { activeCatalogOptions } from "@/lib/orders/order-catalog";
import { isSplintWorkType } from "@/lib/orders/splint-types";
import { canManageOrderCatalog } from "@/lib/permissions";
import { useApp } from "@/providers/AppProvider";
import type { OrderCatalogCategory, OrderCatalogOption } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  category: OrderCatalogCategory;
  title: string;
  catalog: OrderCatalogOption[];
  selected: string[];
  onToggle: (code: string) => void;
  onCatalogChanged: () => void | Promise<void>;
  className?: string;
};

export function CatalogChipField({
  category,
  title,
  catalog,
  selected,
  onToggle,
  onCatalogChanged,
  className,
}: Props) {
  const { currentUser } = useApp();
  const canManage = currentUser ? canManageOrderCatalog(currentUser) : false;
  const [manageOpen, setManageOpen] = useState(false);
  const options = activeCatalogOptions(catalog, category).filter(
    (o) => category !== "WORK_TYPE" || !isSplintWorkType(o.code),
  );

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        {canManage && (
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:border-opal-gold/40 hover:text-opal-gold"
            title={`ניהול ${title}`}
          >
            <Settings2 className="h-3 w-3" />
            ניהול
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.code);
          return (
            <label
              key={o.id}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                on
                  ? "border-opal-gold bg-opal-gold/15 text-opal-gold-dark"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={() => onToggle(o.code)}
              />
              {o.label}
            </label>
          );
        })}
        {options.length === 0 && (
          <span className="text-xs text-slate-400">אין אפשרויות פעילות</span>
        )}
      </div>

      {canManage && (
        <CatalogManageModal
          open={manageOpen}
          category={category}
          options={catalog}
          onClose={() => setManageOpen(false)}
          onChanged={async () => {
            await onCatalogChanged();
          }}
        />
      )}
    </div>
  );
}
