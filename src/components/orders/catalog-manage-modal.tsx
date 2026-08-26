"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { apiDelete, apiPatch, apiPost } from "@/lib/api/client";
import { CATALOG_CATEGORY_LABELS } from "@/lib/orders/order-catalog";
import type { OrderCatalogCategory, OrderCatalogOption } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  category: OrderCatalogCategory;
  options: OrderCatalogOption[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
};

export function CatalogManageModal({ open, category, options, onClose, onChanged }: Props) {
  const [rows, setRows] = useState<OrderCatalogOption[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(
      [...options]
        .filter((o) => o.category === category)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "he")),
    );
    setNewLabel("");
    setEditId(null);
    setError("");
    setDragId(null);
  }, [open, options, category]);

  const title = useMemo(() => `ניהול ${CATALOG_CATEGORY_LABELS[category]}`, [category]);

  const persistOrder = async (ordered: OrderCatalogOption[]) => {
    setBusy(true);
    setError("");
    try {
      await apiPatch("/api/order-catalog", {
        category,
        orderedIds: ordered.map((o) => o.id),
      });
      setRows(ordered);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שינוי סדר נכשל");
    } finally {
      setBusy(false);
    }
  };

  const onAdd = async () => {
    if (!newLabel.trim()) {
      setError("יש להזין שם");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiPost("/api/order-catalog", { category, label: newLabel.trim() });
      setNewLabel("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הוספה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const onSaveEdit = async () => {
    if (!editId || !editLabel.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiPatch("/api/order-catalog", { id: editId, label: editLabel.trim() });
      setEditId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "עריכה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const onToggleActive = async (row: OrderCatalogOption) => {
    setBusy(true);
    setError("");
    try {
      await apiPatch("/api/order-catalog", { id: row.id, isActive: !row.isActive });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "עדכון נכשל");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row: OrderCatalogOption) => {
    if (!window.confirm(`למחוק / להסתיר את «${row.label}»?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiDelete<{ archived?: boolean }>(`/api/order-catalog?id=${row.id}`);
      if (res.archived) {
        setError("הערך בשימוש בהזמנות — הוסתר מבחירה חדשה (לא נמחק)");
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const from = rows.findIndex((r) => r.id === dragId);
    const to = rows.findIndex((r) => r.id === targetId);
    if (from < 0 || to < 0) {
      setDragId(null);
      return;
    }
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    if (!moved) {
      setDragId(null);
      return;
    }
    next.splice(to, 0, moved);
    setDragId(null);
    void persistOrder(next);
  };

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-md">
      <div className="space-y-3 text-sm">
        <ul className="max-h-72 space-y-1.5 overflow-auto">
          {rows.map((row) => (
            <li
              key={row.id}
              draggable={!busy && editId !== row.id}
              onDragStart={() => setDragId(row.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(row.id)}
              onDragEnd={() => setDragId(null)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2 py-1.5",
                row.isActive ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-70",
                dragId === row.id && "opacity-50",
              )}
            >
              <span
                className="cursor-grab touch-none text-slate-400 active:cursor-grabbing"
                title="גרור לשינוי סדר"
                aria-hidden
              >
                <GripVertical className="h-4 w-4" />
              </span>

              {editId === row.id ? (
                <Input
                  className="flex-1"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  autoFocus
                />
              ) : (
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                  {row.label}
                  {!row.isActive && <span className="mr-1 text-[10px] text-slate-400">(מוסתר)</span>}
                </span>
              )}

              {editId === row.id ? (
                <Button type="button" size="sm" disabled={busy} onClick={() => void onSaveEdit()}>
                  שמור
                </Button>
              ) : (
                <button
                  type="button"
                  className="rounded p-1 text-slate-500 hover:bg-slate-100"
                  onClick={() => {
                    setEditId(row.id);
                    setEditLabel(row.label);
                  }}
                  aria-label="עריכה"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}

              <button
                type="button"
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                onClick={() => void onToggleActive(row)}
                aria-label={row.isActive ? "הסתר" : "הצג"}
              >
                {row.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>

              <button
                type="button"
                className="rounded p-1 text-red-600 hover:bg-red-50"
                onClick={() => void onDelete(row)}
                aria-label="מחק"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {rows.length === 0 && <li className="py-6 text-center text-slate-400">אין אפשרויות</li>}
        </ul>

        <div className="flex items-end gap-2 border-t pt-3">
          <div className="flex-1">
            <Label>אפשרות חדשה</Label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="שם לתצוגה"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onAdd();
                }
              }}
            />
          </div>
          <Button type="button" disabled={busy} onClick={() => void onAdd()}>
            <Plus className="h-4 w-4" />
            הוסף
          </Button>
        </div>

        {error && <p className="text-xs text-amber-700">{error}</p>}
      </div>
    </Modal>
  );
}
