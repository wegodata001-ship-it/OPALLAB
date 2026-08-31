"use client";

import { useMemo, useState } from "react";
import type { OrderWithRelations, MaterialType, WorkType, Gender, PricingMode } from "@/lib/types";
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
import {
  OTHER_WORK_TYPE_CODE,
  parseOtherWorkKind,
  parsePricingMode,
  type OtherWorkKind,
} from "@/lib/orders/doctor-pricing";
import { useOrderPricingForm } from "@/hooks/use-order-pricing-form";
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

function sameNumberArray(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
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
    order.completionDate ? order.completionDate.toISOString().slice(0, 10) : "",
  );
  const [notes, setNotes] = useState(order.notes ?? "");
  const initialMode = parsePricingMode(
    order.pricingMode ??
      (order.otherWorkKind ? "OTHER" : "REGULAR"),
  );
  const [pricingMode, setPricingMode] = useState<PricingMode>(initialMode);
  const [allInXType, setAllInXType] = useState<string | null>(order.allInXType ?? null);
  const [otherWorkKind, setOtherWorkKind] = useState<OtherWorkKind | null>(
    parseOtherWorkKind(order.otherWorkKind),
  );
  const [otherWorkNotes, setOtherWorkNotes] = useState(order.otherWorkNotes ?? "");

  const matched = doctors.find((d) => d.name.trim() === doctorName.trim());
  const resolvedDoctorId = matched?.id ?? order.doctorId ?? "";

  const originalSplintIds = order.splintTypeIds?.length
    ? order.splintTypeIds
    : order.splintTypeId
      ? [order.splintTypeId]
      : [];

  const pricingCompositionChanged = useMemo(() => {
    const savedMode = parsePricingMode(
      order.pricingMode ?? (order.otherWorkKind ? "OTHER" : "REGULAR"),
    );
    return (
      resolvedDoctorId !== (order.doctorId ?? "") ||
      pricingMode !== savedMode ||
      (allInXType ?? null) !== (order.allInXType ?? null) ||
      !sameStringArray(materials, order.materials) ||
      !sameStringArray(workTypes, order.workTypes) ||
      !sameStringArray(splintTypeIds, originalSplintIds) ||
      !sameNumberArray(selectedTeeth, order.selectedTeeth) ||
      (otherWorkKind ?? null) !== (parseOtherWorkKind(order.otherWorkKind) ?? null)
    );
  }, [
    resolvedDoctorId,
    order,
    pricingMode,
    allInXType,
    materials,
    workTypes,
    splintTypeIds,
    originalSplintIds,
    selectedTeeth,
    otherWorkKind,
  ]);

  const pricing = useOrderPricingForm({
    doctorId: resolvedDoctorId,
    pricingMode,
    materials,
    workTypes,
    splintTypeIds,
    selectedTeeth,
    otherWorkKind,
    allInXType,
    initial: {
      finalPrice: order.totalPrice ?? null,
      priceManuallyEdited: Boolean(order.priceManuallyEdited),
    },
  });

  const handlePricingModeChange = (mode: PricingMode) => {
    setPricingMode(mode);
    if (mode === "ALL_IN_X") {
      setMaterials([]);
      setWorkTypes([]);
      setSplintTypeIds([]);
      setOtherWorkKind(null);
      setOtherWorkNotes("");
    } else if (mode === "OTHER") {
      setMaterials([]);
      setWorkTypes([OTHER_WORK_TYPE_CODE]);
      setSplintTypeIds([]);
      setAllInXType(null);
    } else {
      setAllInXType(null);
      setOtherWorkKind(null);
      setOtherWorkNotes("");
      setWorkTypes((prev) => prev.filter((w) => w !== OTHER_WORK_TYPE_CODE));
    }
  };

  const onSplintTypeChange = (ids: string[]) => {
    setSplintTypeIds(ids);
    setWorkTypes((prev) => syncWorkTypesWithSplint(prev, ids));
  };

  const toggleWorkType = (w: WorkType) => {
    setWorkTypes((p) => (p.includes(w) ? p.filter((x) => x !== w) : [...p, w]));
  };

  const handleSave = () => {
    const useLive = pricingCompositionChanged;
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
      notes: notes || null,
      pricingMode,
      allInXType: pricingMode === "ALL_IN_X" ? allInXType : null,
      otherWorkKind: pricingMode === "OTHER" ? otherWorkKind : null,
      otherWorkNotes: otherWorkNotes.trim() || null,
      ...(useLive
        ? {
            totalPrice: pricing.finalPrice,
            priceLines: pricing.lines,
            priceUnit: pricing.unitPrice,
            priceQuantity: pricing.quantity,
            calculatedPrice: pricing.calculatedPrice,
            priceManuallyEdited: pricing.priceManuallyEdited,
            pricePerJaw: pricing.pricePerJaw,
            jawCount: pricing.jawCount,
          }
        : {
            totalPrice: order.totalPrice ?? null,
            priceLines: order.priceLines,
            priceUnit: order.priceUnit ?? null,
            priceQuantity: order.priceQuantity ?? null,
            calculatedPrice: order.calculatedPrice ?? null,
            priceManuallyEdited: Boolean(order.priceManuallyEdited),
            pricePerJaw: order.pricePerJaw ?? null,
            jawCount: order.jawCount ?? null,
          }),
    });
    onDone();
  };

  return (
    <Card className="mb-6 border-opal-gold/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Pencil className="h-5 w-5" />
          עריכת הזמנה
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onDone}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>שם הרופא</Label>
            <Input list="edit-doctors" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
            <datalist id="edit-doctors">
              {doctors.map((d) => (
                <option key={d.id} value={d.name} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>שם המטופל</Label>
            <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} />
          </div>
          <div>
            <Label>גיל</Label>
            <Input type="number" value={patientAge} onChange={(e) => setPatientAge(e.target.value)} />
          </div>
          <div>
            <Label>מין</Label>
            <div className="flex gap-3 mt-2">
              {(["MALE", "FEMALE"] as Gender[]).map((g) => (
                <label key={g} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={patientGender === g}
                    onChange={() => setPatientGender(g)}
                    className="accent-opal-gold"
                  />
                  {GENDER_LABELS[g]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label>תאריך סיום</Label>
            <Input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} />
          </div>
        </div>
        <ShadePicker value={shade} onChange={setShade} />
        <OrderPricePanel
          pricing={pricing}
          pricingMode={pricingMode}
          onPricingModeChange={handlePricingModeChange}
          doctorId={resolvedDoctorId || undefined}
          useSnapshot={!pricingCompositionChanged}
          snapshot={{
            lines: order.priceLines,
            unitPrice: order.priceUnit,
            quantity: order.priceQuantity,
            calculatedPrice: order.calculatedPrice,
            finalPrice: order.totalPrice,
            priceManuallyEdited: order.priceManuallyEdited,
            pricingMode: parsePricingMode(order.pricingMode),
            otherWorkKind: parseOtherWorkKind(order.otherWorkKind),
            otherWorkNotes: order.otherWorkNotes,
            allInXType: order.allInXType,
            pricePerJaw: order.pricePerJaw,
            jawCount: order.jawCount,
          }}
          otherWorkKind={otherWorkKind}
          onOtherWorkKindChange={setOtherWorkKind}
          otherWorkNotes={otherWorkNotes}
          onOtherWorkNotesChange={setOtherWorkNotes}
          allInXType={allInXType}
          onAllInXTypeChange={setAllInXType}
        />
        {pricingMode === "REGULAR" && (
          <>
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
              onToggle={toggleWorkType}
              onCatalogChanged={refreshQuiet}
            />
            <SplintTypeSelect
              value={splintTypeIds}
              onChange={onSplintTypeChange}
              includeInactiveIds={originalSplintIds}
            />
          </>
        )}
        <DentalChart
          selectedTeeth={selectedTeeth}
          onChange={setSelectedTeeth}
          bridgeGroups={bridgeGroups}
          onBridgeGroupsChange={setBridgeGroups}
        />
        <div>
          <Label>תיאור</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div>
          <Label>הערות פנימיות</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave}>
            <Save className="h-4 w-4" />
            שמירה
          </Button>
          <Button variant="outline" onClick={onDone}>
            ביטול
          </Button>
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
