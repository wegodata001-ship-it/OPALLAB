"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { canManageOrderCatalog } from "@/lib/permissions";
import { useApp } from "@/providers/AppProvider";
import { cn } from "@/lib/utils";

type SplintTypeSelectProps = {
  value: string[];
  onChange: (splintTypeIds: string[]) => void;
  className?: string;
  /** Keep inactive options visible when already selected on an existing order. */
  includeInactiveIds?: string[];
};

export function SplintTypeSelect({
  value,
  onChange,
  className,
  includeInactiveIds = [],
}: SplintTypeSelectProps) {
  const {
    splintTypes,
    currentUser,
    createSplintType,
    updateSplintType,
    reorderSplintTypes,
    deleteSplintType,
    refreshQuiet,
  } = useApp();
  const canManage = currentUser ? canManageOrderCatalog(currentUser) : false;
  const [manageOpen, setManageOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const inactiveKeep = useMemo(() => new Set(includeInactiveIds.concat(value)), [includeInactiveIds, value]);

  const options = useMemo(
    () =>
      [...splintTypes]
        .filter((t) => t.isActive || inactiveKeep.has(t.id))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he")),
    [splintTypes, inactiveKeep],
  );

  const sorted = useMemo(
    () => [...splintTypes].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he")),
    [splintTypes],
  );

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">סוג סד</p>
        {canManage && (
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:border-opal-gold/40 hover:text-opal-gold"
            title="ניהול סוג סד"
          >
            <Settings2 className="h-3 w-3" />
            ניהול
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((t) => {
          const on = value.includes(t.id);
          return (
            <label
              key={t.id}
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
                onChange={() => toggle(t.id)}
              />
              {t.name}
            </label>
          );
        })}
        {options.length === 0 && (
          <span className="text-xs text-slate-400">אין אפשרויות פעילות</span>
        )}
      </div>

      <Modal open={manageOpen} onClose={() => setManageOpen(false)} title="ניהול סוגי סד" className="max-w-md">
        <div className="space-y-3 text-sm">
          <ul className="max-h-72 space-y-1.5 overflow-auto">
            {sorted.map((row, index) => (
              <li
                key={row.id}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1.5",
                  row.isActive ? "bg-white" : "bg-slate-50 opacity-70",
                )}
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    className="p-0.5 text-slate-400 disabled:opacity-30"
                    onClick={() => {
                      const ids = sorted.map((t) => t.id);
                      const j = index - 1;
                      if (j < 0) return;
                      const next = [...ids];
                      [next[index], next[j]] = [next[j]!, next[index]!];
                      setBusy(true);
                      void reorderSplintTypes(next)
                        .catch((e) => setError(e instanceof Error ? e.message : "שגיאה"))
                        .finally(() => setBusy(false));
                    }}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy || index === sorted.length - 1}
                    className="p-0.5 text-slate-400 disabled:opacity-30"
                    onClick={() => {
                      const ids = sorted.map((t) => t.id);
                      const j = index + 1;
                      if (j >= ids.length) return;
                      const next = [...ids];
                      [next[index], next[j]] = [next[j]!, next[index]!];
                      setBusy(true);
                      void reorderSplintTypes(next)
                        .catch((e) => setError(e instanceof Error ? e.message : "שגיאה"))
                        .finally(() => setBusy(false));
                    }}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                {editId === row.id ? (
                  <Input className="flex-1" value={editName} onChange={(e) => setEditName(e.target.value)} />
                ) : (
                  <span className="flex-1 truncate font-medium">{row.name}</span>
                )}
                {editId === row.id ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void updateSplintType({ id: row.id, name: editName.trim() })
                        .then(() => setEditId(null))
                        .catch((e) => setError(e instanceof Error ? e.message : "שגיאה"))
                        .finally(() => setBusy(false));
                    }}
                  >
                    שמור
                  </Button>
                ) : (
                  <button
                    type="button"
                    className="p-1 text-slate-500"
                    onClick={() => {
                      setEditId(row.id);
                      setEditName(row.name);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  className="p-1 text-slate-500"
                  onClick={() => {
                    setBusy(true);
                    void updateSplintType({ id: row.id, isActive: !row.isActive })
                      .catch((e) => setError(e instanceof Error ? e.message : "שגיאה"))
                      .finally(() => setBusy(false));
                  }}
                >
                  {row.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  className="p-1 text-red-600"
                  onClick={() => {
                    if (!window.confirm(`למחוק «${row.name}»?`)) return;
                    setBusy(true);
                    void deleteSplintType(row.id)
                      .then(() => {
                        setError("אם הסוג היה בשימוש — הוסתר במקום מחיקה");
                        return refreshQuiet();
                      })
                      .catch((e) => setError(e instanceof Error ? e.message : "שגיאה"))
                      .finally(() => setBusy(false));
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-end gap-2 border-t pt-3">
            <div className="flex-1">
              <Label>סוג סד חדש</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="שם" />
            </div>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!newName.trim()) return;
                setBusy(true);
                void createSplintType({ name: newName.trim() })
                  .then(() => setNewName(""))
                  .catch((e) => setError(e instanceof Error ? e.message : "שגיאה"))
                  .finally(() => setBusy(false));
              }}
            >
              <Plus className="h-4 w-4" />
              הוסף
            </Button>
          </div>
          {error && <p className="text-xs text-amber-700">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
