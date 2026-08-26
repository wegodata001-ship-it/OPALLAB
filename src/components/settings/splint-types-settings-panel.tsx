"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useApp } from "@/providers/AppProvider";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";

export function SplintTypesSettingsPanel() {
  const {
    splintTypes,
    createSplintType,
    updateSplintType,
    reorderSplintTypes,
    deleteSplintType,
  } = useApp();

  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () => [...splintTypes].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he")),
    [splintTypes],
  );

  const onAdd = async () => {
    setError("");
    if (!name.trim()) {
      setError("יש להזין שם");
      return;
    }
    setBusy(true);
    try {
      await createSplintType({ name: name.trim() });
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "הוספה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const move = async (id: string, dir: -1 | 1) => {
    const ids = sorted.map((t) => t.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setBusy(true);
    try {
      await reorderSplintTypes(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שינוי סדר נכשל");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>הוספת סוג סד</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>שם לתצוגה</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="למשל: Michigan"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="button" disabled={busy} onClick={() => void onAdd()}>
            <Plus className="h-4 w-4" />
            הוסף
          </Button>
          <p className="text-xs text-slate-500">
            הרשימה מופיעה ככפתורי בחירה ב«סוג סד» במסך ההזמנה. השתמשו בשם נקי ללא אימוג׳ים.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>סוגי סדים ({sorted.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-slate-500">אין סוגי סדים</p>
          ) : (
            sorted.map((t, index) => (
              <div
                key={t.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2",
                  t.isActive ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-70",
                )}
              >
                <Input
                  className="min-w-[10rem] flex-1"
                  defaultValue={t.name}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== t.name) {
                      void updateSplintType({ id: t.id, name: next }).catch((err) =>
                        setError(err instanceof Error ? err.message : "עדכון נכשל"),
                      );
                    }
                  }}
                />
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={busy || index === 0}
                    onClick={() => void move(t.id, -1)}
                    title="העלה"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={busy || index === sorted.length - 1}
                    onClick={() => void move(t.id, 1)}
                    title="הורד"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={busy}
                    title={t.isActive ? "הסתר" : "הצג"}
                    onClick={() =>
                      void updateSplintType({ id: t.id, isActive: !t.isActive }).catch((err) =>
                        setError(err instanceof Error ? err.message : "עדכון נכשל"),
                      )
                    }
                  >
                    {t.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  {!t.isSystem && (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="border-red-200 text-red-700"
                      disabled={busy}
                      title="מחק"
                      onClick={() =>
                        void deleteSplintType(t.id).catch((err) =>
                          setError(err instanceof Error ? err.message : "מחיקה נכשלה"),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {t.isSystem && (
                  <span className="text-[10px] font-medium text-slate-400">מערכת</span>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
