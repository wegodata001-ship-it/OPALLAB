"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StockButtons, InventoryModule } from "@/components/inventory/InventoryStockTools";
import { MediaFace } from "@/components/inventory/InventoryMedia";

type Bit = { id: string; label: string; quantity: number | null };
type DrillType = { id: string; name: string; bits: Bit[] };
type Machine = { id: string; name: string; types: DrillType[] };

async function requestDrills(input?: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; query?: string }) {
  const res = await fetch(`/api/inventory/drills${input?.query ?? ""}`, {
    method: input?.method ?? "GET",
    credentials: "include",
    headers: input?.body ? { "Content-Type": "application/json" } : undefined,
    body: input?.body ? JSON.stringify(input.body) : undefined,
  });
  const json = (await res.json()) as { success: boolean; data?: { canEdit: boolean; machines: Machine[] }; error?: { message?: string } };
  if (!json.success || !json.data) throw new Error(json.error?.message ?? "השמירה נכשלה");
  return json.data;
}

export function DrillsScreen() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const apply = useCallback((data: { canEdit: boolean; machines: Machine[] }) => {
    setMachines(data.machines);
    setCanEdit(data.canEdit);
    setMachineId((current) => current && data.machines.some((machine) => machine.id === current) ? current : data.machines[0]?.id ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestDrills();
        if (!cancelled) apply(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apply]);

  const machine = machines.find((item) => item.id === machineId) ?? null;
  const type = machine?.types.find((item) => item.id === typeId) ?? machine?.types[0] ?? null;

  async function run(body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST", query?: string) {
    setBusy(true);
    setError(null);
    try {
      apply(await requestDrills({ method, body, query }));
      setName("");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <InventoryModule type="DRILLS" title="מלאי מקדחים">
    <>
      <Header title="מלאי מקדחים" description="מכונה, סוג ומספר מקדח" actions={<StockButtons type="DRILLS" />} />
      {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-opal-gold" /></div> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {machines.map((item) => (
              <article key={item.id} className={`rounded-xl border p-3 ${item.id === machine?.id ? "border-opal-gold bg-white" : "border-slate-200 bg-white"}`}>
                <div className="flex items-start gap-2">
                  <MediaFace kind="machine" id={item.id} name={item.name} canEdit={canEdit} />
                  <button type="button" className="min-w-0 flex-1 text-right" onClick={() => { setMachineId(item.id); setTypeId(null); }}>
                    <span className="block font-bold">{item.name}</span>
                    <span className="text-xs text-slate-500">{item.types.length} סוגים</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
          {canEdit && (
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void run({ kind: "machine", name }); }}>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="מכונה חדשה" aria-label="מכונה חדשה" />
              <Button type="submit" disabled={busy || !name.trim()}>הוסף מכונה</Button>
            </form>
          )}
          {machine && (
            <section className="space-y-2">
              <h2 className="font-bold">{machine.name}</h2>
              <div className="flex flex-wrap gap-2">
                {machine.types.map((item) => (
                  <div key={item.id} className="flex items-center gap-1">
                    <MediaFace kind="type" id={item.id} name={item.name} canEdit={canEdit} />
                    <button type="button" className={`rounded-lg border px-3 py-1.5 text-sm ${item.id === type?.id ? "border-opal-gold bg-opal-gold text-white" : "border-slate-200 bg-white"}`} onClick={() => setTypeId(item.id)}>{item.name}</button>
                  </div>
                ))}
              </div>
              {canEdit && <AddRow placeholder="סוג חדש" disabled={busy} onAdd={(value) => void run({ kind: "type", machineId: machine.id, name: value })} />}
              {type && (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900 text-white"><tr><th className="px-3 py-2 text-right">מקדח</th><th className="px-3 py-2 text-right">כמות</th></tr></thead>
                    <tbody>
                      {type.bits.map((bit) => <tr key={bit.id} className="border-t border-slate-100"><td className="px-3 py-2 font-medium"><span className="flex items-center gap-2"><MediaFace kind="bit" id={bit.id} name={bit.label} canEdit={canEdit} />{bit.label}</span></td><td className="px-3 py-2 font-bold">{bit.quantity === null ? "—" : bit.quantity}</td></tr>)}
                      {type.bits.length === 0 && <tr><td className="px-3 py-3 text-slate-500" colSpan={2}>אין מקדחים</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
              {canEdit && type && <AddRow placeholder="מספר מקדח" disabled={busy} onAdd={(value) => void run({ kind: "bit", typeId: type.id, name: value, quantity: null })} />}
            </section>
          )}
          {machines.length === 0 && <p className="text-sm text-slate-500">אין מכונות. הוסיפו מכונה, אחר כך סוג ומספר מקדח. הכמות נקבעת בטבלה או בספירה.</p>}
        </div>
      )}
    </>
    </InventoryModule>
  );
}

function AddRow({ placeholder, disabled, onAdd }: { placeholder: string; disabled: boolean; onAdd: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!value.trim()) return; onAdd(value.trim()); setValue(""); }}>
      <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <Button type="submit" disabled={disabled || !value.trim()}>הוספה</Button>
    </form>
  );
}
