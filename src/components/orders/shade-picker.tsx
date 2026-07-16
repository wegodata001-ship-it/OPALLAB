"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export interface ShadeOption {
  code: string;
  /** Approximate visual hex — not clinically exact */
  color: string;
  group: "A" | "B" | "C" | "D" | "BL";
}

export const SHADE_CATALOG: ShadeOption[] = [
  { code: "A1", color: "#f5e6c8", group: "A" },
  { code: "A2", color: "#edd9a8", group: "A" },
  { code: "A3", color: "#e0c07a", group: "A" },
  { code: "A3.5", color: "#d4a85c", group: "A" },
  { code: "A4", color: "#c08a3e", group: "A" },
  { code: "B1", color: "#f7eed8", group: "B" },
  { code: "B2", color: "#efe0b8", group: "B" },
  { code: "B3", color: "#e2c88a", group: "B" },
  { code: "B4", color: "#d4b05e", group: "B" },
  { code: "C1", color: "#e8e0d0", group: "C" },
  { code: "C2", color: "#d6cbb0", group: "C" },
  { code: "C3", color: "#c4b490", group: "C" },
  { code: "C4", color: "#a8926c", group: "C" },
  { code: "D2", color: "#e8dcc8", group: "D" },
  { code: "D3", color: "#d4c4a0", group: "D" },
  { code: "D4", color: "#b8a078", group: "D" },
  { code: "BL1", color: "#faf8f2", group: "BL" },
  { code: "BL2", color: "#f5f0e4", group: "BL" },
  { code: "BL3", color: "#efe8d6", group: "BL" },
  { code: "BL4", color: "#e8dfc8", group: "BL" },
];

const FAVORITES = ["A1", "A2", "A3", "B1", "BL2"] as const;

const GROUP_LABELS: Record<ShadeOption["group"], string> = {
  A: "A Shades",
  B: "B Shades",
  C: "C Shades",
  D: "D Shades",
  BL: "Bleach Shades",
};

const GROUP_ORDER: ShadeOption["group"][] = ["A", "B", "C", "D", "BL"];

interface ShadePickerProps {
  value: string;
  onChange: (shade: string) => void;
  disabled?: boolean;
  className?: string;
}

function ShadeSwatch({
  shade,
  selected,
  onSelect,
  favorite,
}: {
  shade: ShadeOption;
  selected: boolean;
  onSelect: (code: string) => void;
  favorite?: boolean;
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
      {favorite && (
        <span className="absolute top-1 left-1 text-[10px] leading-none" aria-hidden>
          ⭐
        </span>
      )}
      {selected && (
        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-opal-gold text-white">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      )}
      <span
        className="h-8 w-8 rounded-full border border-slate-200 shadow-inner"
        style={{ background: `linear-gradient(145deg, #fff 0%, ${shade.color} 45%, ${shade.color} 100%)` }}
      />
      <span className={cn("text-xs font-bold", selected ? "text-opal-gold-dark" : "text-slate-700")}>
        {shade.code}
      </span>
    </button>
  );
}

export function ShadePicker({ value, onChange, disabled, className }: ShadePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusIndex, setFocusIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = SHADE_CATALOG.find((s) => s.code === value);
  const displayCode = selected?.code ?? (value || "");
  const displayColor = selected?.color ?? "#e2e8f0";

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return SHADE_CATALOG;
    return SHADE_CATALOG.filter((s) => s.code.includes(q));
  }, [query]);

  const favorites = useMemo(
    () =>
      FAVORITES.map((code) => SHADE_CATALOG.find((s) => s.code === code)!).filter((s) =>
        filtered.some((f) => f.code === s.code),
      ),
    [filtered],
  );

  const groups = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      label: GROUP_LABELS[group],
      shades: filtered.filter((s) => s.group === group),
    })).filter((g) => g.shades.length > 0);
  }, [filtered]);

  const flatList = useMemo(() => {
    const favCodes = new Set(favorites.map((f) => f.code));
    const rest = filtered.filter((s) => !favCodes.has(s.code) || query.trim());
    // When searching, show flat filtered order; otherwise favorites first then groups
    if (query.trim()) return filtered;
    return [...favorites, ...filtered.filter((s) => !favCodes.has(s.code))];
  }, [favorites, filtered, query]);

  const handleSelect = useCallback(
    (code: string) => {
      onChange(code);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange("");
    },
    [onChange],
  );

  useEffect(() => {
    if (!open) return;
    setFocusIndex(0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(i + 1, Math.max(flatList.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatList[focusIndex];
        if (item) handleSelect(item.code);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flatList, focusIndex, handleSelect]);

  return (
    <div className={className}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm",
          "hover:border-opal-gold/50 focus:outline-none focus:ring-2 focus:ring-opal-gold/30 focus:border-opal-gold",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {displayCode ? (
          <>
            <span
              className="h-5 w-5 shrink-0 rounded-full border border-slate-200"
              style={{ background: displayColor }}
            />
            <span className="flex-1 text-right font-medium text-slate-800">{displayCode}</span>
          </>
        ) : (
          <span className="flex-1 text-right text-slate-400">בחר Shade...</span>
        )}
        {value && !disabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={handleClear}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleClear(e as unknown as React.MouseEvent);
            }}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="נקה Shade"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="בחירת Shade" className="max-w-xl">
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חפש Shade..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-10 pl-3 text-sm focus:border-opal-gold focus:outline-none focus:ring-2 focus:ring-opal-gold/30"
            />
          </div>

          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">לא נמצאו גוונים התואמים לחיפוש</p>
          )}

          {!query.trim() && favorites.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400">בשימוש נפוץ</h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {favorites.map((shade) => (
                  <ShadeSwatch
                    key={`fav-${shade.code}`}
                    shade={shade}
                    selected={value === shade.code}
                    onSelect={handleSelect}
                    favorite
                  />
                ))}
              </div>
            </section>
          )}

          {groups.map(({ group, label, shades }) => (
            <section key={group}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400">{label}</h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {shades.map((shade) => {
                  const flatIdx = flatList.findIndex((s) => s.code === shade.code);
                  const isFocused = flatIdx === focusIndex;
                  return (
                    <div
                      key={shade.code}
                      className={cn(isFocused && "rounded-xl ring-2 ring-opal-gold/50")}
                    >
                      <ShadeSwatch
                        shade={shade}
                        selected={value === shade.code}
                        onSelect={handleSelect}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <p className="text-center text-[10px] text-slate-400">
            Escape לסגירה · חיצים לניווט · Enter לבחירה
          </p>
        </div>
      </Modal>
    </div>
  );
}
