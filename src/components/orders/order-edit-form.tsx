"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrderWithRelations, MaterialType, WorkType, Gender } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DentalChart } from "@/components/DentalChart";
import { ShadePicker } from "@/components/orders/shade-picker";
import { TelegramOrderButton } from "@/components/orders/telegram-order-button";
import { SplintTypeSelect } from "@/components/orders/splint-type-select";
import { CatalogChipField } from "@/components/orders/catalog-chip-field";
import { OrderPricePanel } from "@/components/orders/order-price-panel";
import { GENDER_LABELS } from "@/lib/constants/labels";
import { syncWorkTypesWithSplint } from "@/lib/orders/splint-types";
import { useDoctorOrderPricing } from "@/hooks/use-doctor-order-pricing";
import { useApp } from "@/providers/AppProvider";
import { Pencil, X, Save } from "lucide-react";

interface OrderEditFormProps {
  order: OrderWithRelations;
  onDone: () => void;
}

function sameStringArray(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export function OrderEditForm({ order, onDone }: OrderEditFormProps) {
  const { doctors, updateOrder, orderCatalog, refreshQuiet } = useApp();
  const [doctorName, setDoctorName] = useState(order.doctor?.name ?? "");
  const [patientName, setPatientName] = useState(order.patient.name);
  const [patientAge, setPatientAge] = useState(order.patient.age?.toString() ?? "");
  const [patientGender, setPatientGender] = useState<Gender | "">(order.patient.gender ?? "");
  const [shade, setShade] = useState(order.shade ?? "");
  const [materials, setMaterials] = useState<MaterialType[]>(order.materials);
  const [workTypes, setWorkTypes] = useState<WorkType[]>(order.workTypes);
  const [splintTypeIds, setSplintTypeIds] = useState<string[]>(
    order.splintTypeIds?.length
      ? order.splintTypeIds
      : order.splintTypeId
        ? [order.splintTypeId]
        : [],
  );
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>(order.selectedTeeth);
  const [bridgeGroups, setBridgeGroups] = useState<number[][]>(order.bridgeGroups ?? []);
  const [description, setDescription] = useState(order.description ?? "");
  const [completionDate, setCompletionDate] = useState(
    order.completionDate ? order.completionDate.toISOString().slice(0, 10) : ""
  );
  const [totalPrice, setTotalPrice] = useState(order.totalPrice?.toString() ?? "");
  const [notes, setNotes] = useState(order.notes ?? "");

  const matched = doctors.find((d) => d.name.trim() === doctorName.trim());
  const resolvedDoctorId = matched?.id ?? order.doctorId ?? "";

  const originalSplintIds = order.splintTypeIds?.length
    ? order.splintTypeIds
    : order.splintTypeId
      ? [order.splintTypeId]
      : [];

  const compositionChanged = useMemo(() => {
    return (
      resolvedDoctorId !== (order.doctorId ?? "") ||
      !sameStringArray(materials, order.materials) ||
      !sameStringArray(workTypes, order.workTypes) ||
      !sameStringArray(splintTypeIds, originalSplintIds)
    );
  }, [
    resolvedDoctorId,
    order.doctorId,
    materials,
    order.materials,
    workTypes,
    order.workTypes,
    splintTypeIds,
    originalSplintIds,
  ]);

  const pricing = useDoctorOrderPricing({
    doctorId: resolvedDoctorId,
    materials,
    workTypes,
    splintTypeIds,
  });

  useEffect(() => {
    if (!compositionChanged) {
      setTotalPrice(order.totalPrice?.toString() ?? "");
      return;
    }
    if (!pricing.hasSelections) return;
    if (pricing.total != null) setTotalPrice(String(pricing.total));
    else setTotalPrice("");
  }, [
    compositionChanged,
    pricing.hasSelections,
    pricing.total,
    pricing.missing.length,
    order.totalPrice,
  ]);

  const onSplintTypeChange = (ids: string[]) => {
    setSplintTypeIds(ids);
    setWorkTypes((prev) => syncWorkTypesWithSplint(prev, ids));
  };

  const handleSave = () => {
    updateOrder({
      orderId: order.id,
      doctorId: matched?.id,
      doctorName: doctorName.trim(),
      patientName: patientName.trim(),
      patientAge: patientAge ? parseInt(patientAge) : null,
      patientGender: patientGender || null,
      shade: shade || null,
      materials,
      workTypes,
      splintTypeIds,
      selectedTeeth,
      bridgeGroups,
      description: description || null,
      completionDate: completionDate ? new Date(completionDate) : null,
      totalPrice: totalPrice ? parseFloat(totalPrice) : null,
      ...(compositionChanged ? { priceLines: pricing.lines } : {}),
      notes: notes || null,
    });
    onDone();
  };

  return (
    <Card className="mb-6 border-opal-gold/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Pencil className="h-5 w-5" />עריכת הזמנה</CardTitle>
        <Button variant="ghost" size="sm" onClick={onDone}><X className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>שם הרופא</Label>
            <Input list="edit-doctors" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
            <datalist id="edit-doctors">{doctors.map((d) => <option key={d.id} value={d.name} />)}</datalist>
          </div>
          <div><Label>שם המטופל</Label><Input value={patientName} onChange={(e) => setPatientName(e.target.value)} /></div>
          <div><Label>גיל</Label><Input type="number" value={patientAge} onChange={(e) => setPatientAge(e.target.value)} /></div>
          <div>
            <Label>מין</Label>
            <div className="flex gap-3 mt-2">
              {(["MALE", "FEMALE"] as Gender[]).map((g) => (
                <label key={g} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" checked={patientGender === g} onChange={() => setPatientGender(g)} className="accent-opal-gold" />
                  {GENDER_LABELS[g]}
                </label>
              ))}
            </div>
          </div>
          <div><Label>תאריך סיום</Label><Input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} /></div>
          <div>
            <Label>מחיר ₪</Label>
            <Input type="number" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} />
          </div>
        </div>
        <OrderPricePanel
          pricing={pricing}
          doctorId={resolvedDoctorId || undefined}
          useSnapshot={!compositionChanged}
          snapshotLines={order.priceLines}
          snapshotTotal={order.totalPrice}
        />
        <ShadePicker value={shade} onChange={setShade} />
        <CatalogChipField
          category="MATERIAL"
          title="סוג חומר"
          catalog={orderCatalog}
          selected={materials}
          onToggle={(m) =>
            setMaterials((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]))
          }
          onCatalogChanged={refreshQuiet}
        />
        <CatalogChipField
          category="WORK_TYPE"
          title="סוג עבודה"
          catalog={orderCatalog}
          selected={workTypes}
          onToggle={(w) =>
            setWorkTypes((p) => (p.includes(w) ? p.filter((x) => x !== w) : [...p, w]))
          }
          onCatalogChanged={refreshQuiet}
        />
        <SplintTypeSelect
          value={splintTypeIds}
          onChange={onSplintTypeChange}
          includeInactiveIds={
            order.splintTypeIds?.length
              ? order.splintTypeIds
              : order.splintTypeId
                ? [order.splintTypeId]
                : []
          }
        />
        <DentalChart
          selectedTeeth={selectedTeeth}
          onChange={setSelectedTeeth}
          bridgeGroups={bridgeGroups}
          onBridgeGroupsChange={setBridgeGroups}
        />
        <div><Label>תיאור</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
        <div><Label>הערות פנימיות</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave}><Save className="h-4 w-4" />שמירה</Button>
          <Button variant="outline" onClick={onDone}>ביטול</Button>
          <TelegramOrderButton
            size="md"
            order={{
              serialNumber: order.serialNumber,
              patientName,
              doctorName: doctorName || order.doctor?.name || "—",
              workTypes,
              orderId: order.id,
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
