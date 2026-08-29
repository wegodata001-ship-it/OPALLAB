"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DentalChart } from "@/components/DentalChart";
import { ShadePicker } from "@/components/orders/shade-picker";
import {
  OrderUploadTiles,
  type OrderUploadTilesHandle,
  type FmUploadAggregate,
} from "@/components/orders/order-upload-tiles";
import { FmSaveUploadHint } from "@/components/file-manager-v2/fm-global-progress";
import { TelegramOrderButton } from "@/components/orders/telegram-order-button";
import { CatalogChipField } from "@/components/orders/catalog-chip-field";
import { OrderPricePanel } from "@/components/orders/order-price-panel";
import { useApp } from "@/providers/AppProvider";
import { useOrderCreateDraft } from "@/hooks/use-order-create-draft";
import { useDoctorOrderPricing } from "@/hooks/use-doctor-order-pricing";
import { GENDER_LABELS } from "@/lib/constants/labels";
import { syncWorkTypesWithSplint } from "@/lib/orders/splint-types";
import { SplintTypeSelect } from "@/components/orders/splint-type-select";
import { openTelegramOrderShare } from "@/lib/orders/telegram-order";
import { cn } from "@/lib/utils";
import type { Gender, MaterialType, Order, WorkType } from "@/lib/types";
import { Plus } from "lucide-react";
import { loadPendingFromDraft, persistSlotUploads } from "@/lib/orders/persist-slot-uploads";

interface DoctorOrderFormProps {
  doctorId: string;
  onCreated?: (serialNumber: string) => void;
}

export function DoctorOrderForm({ doctorId, onCreated }: DoctorOrderFormProps) {
  const { refresh, refreshQuiet, doctors, orderCatalog } = useApp();
  const doctorName = doctors.find((d) => d.id === doctorId)?.name ?? "רופא";
  const uploadRef = useRef<OrderUploadTilesHandle>(null);
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState<Gender | "">("");
  const [shade, setShade] = useState("");
  const [materials, setMaterials] = useState<MaterialType[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [splintTypeIds, setSplintTypeIds] = useState<string[]>([]);
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);
  const [bridgeGroups, setBridgeGroups] = useState<number[][]>([]);
  const [description, setDescription] = useState("");
  const [completionDate, setCompletionDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadState, setUploadState] = useState<FmUploadAggregate | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const pricing = useDoctorOrderPricing({
    doctorId,
    materials,
    workTypes,
    splintTypeIds,
  });

  const draftKey = `doctor-order-${doctorId}`;
  const draft = useOrderCreateDraft(draftKey, { doctorId, enabled: true });
  const saveDraftFields = draft.saveDraftFields;
  const draftOrderId = draft.orderId;

  const hasUploadFiles = (uploadState?.total ?? 0) > 0;
  const uploadBlocking = uploadState?.hasBlocking ?? false;
  const saveReady =
    draft.ready && !uploadBlocking && (!hasUploadFiles || uploadState?.isComplete === true);

  const toggleMaterial = (m: string) =>
    setMaterials((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  const toggleWorkType = (w: string) =>
    setWorkTypes((p) => (p.includes(w) ? p.filter((x) => x !== w) : [...p, w]));

  const onSplintTypeChange = (ids: string[]) => {
    setSplintTypeIds(ids);
    setWorkTypes((prev) => syncWorkTypesWithSplint(prev, ids));
  };

  useEffect(() => {
    const h = draft.hydrateFromDraft;
    if (!h) return;
    startTransition(() => {
      if (h.patient?.name && h.patient.name !== "טיוטה") setPatientName(h.patient.name);
      if (h.patient?.age != null) setPatientAge(String(h.patient.age));
      if (h.patient?.gender) setPatientGender(h.patient.gender);
      if (h.shade) setShade(h.shade);
      if (h.materials?.length) setMaterials(h.materials);
      if (h.workTypes?.length) setWorkTypes(h.workTypes);
      if (h.splintTypeIds?.length) setSplintTypeIds(h.splintTypeIds);
      else if (h.splintTypeId) setSplintTypeIds([h.splintTypeId]);
      if (h.selectedTeeth?.length) setSelectedTeeth(h.selectedTeeth);
      if (h.bridgeGroups != null) {
        setBridgeGroups(
          Array.isArray(h.bridgeGroups)
            ? h.bridgeGroups.filter((g): g is number[] => Array.isArray(g))
            : [],
        );
      }
      if (h.description) setDescription(h.description);
      if (h.completionDate) {
        setCompletionDate(new Date(h.completionDate).toISOString().slice(0, 10));
      }
    });
  }, [draft.hydrateFromDraft]);

  useEffect(() => {
    if (!draftOrderId) return;
    const t = window.setTimeout(() => {
      void saveDraftFields({
        doctorId,
        patientName: patientName.trim() || "טיוטה",
        patientAge: patientAge ? parseInt(patientAge, 10) : null,
        patientGender: patientGender || null,
        shade: shade || null,
        materials,
        workTypes,
        splintTypeIds,
        selectedTeeth,
        bridgeGroups,
        description: description || null,
        completionDate: completionDate ? new Date(completionDate) : null,
      });
    }, 900);
    return () => window.clearTimeout(t);
  }, [
    draftOrderId,
    doctorId,
    patientName,
    patientAge,
    patientGender,
    shade,
    materials,
    workTypes,
    splintTypeIds,
    selectedTeeth,
    bridgeGroups,
    description,
    completionDate,
    saveDraftFields,
  ]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (uploadRef.current?.hasFiles()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const resetForm = () => {
    setPatientName("");
    setPatientAge("");
    setPatientGender("");
    setShade("");
    setMaterials([]);
    setWorkTypes([]);
    setSelectedTeeth([]);
    setDescription("");
    setCompletionDate("");
  };

  const saveOrder = async (): Promise<Order> => {
    if (uploadRef.current?.hasBlockingUploads()) {
      throw new Error("יש להמתין עד שכל הקבצים יסתיימו");
    }
    await uploadRef.current?.waitForUploads();
    const alreadyOnServer = uploadRef.current?.hasUploadedFiles() ?? false;
    let pending = uploadRef.current?.getPendingUploads() ?? [];
    if (pending.length === 0 && !alreadyOnServer) {
      pending = await loadPendingFromDraft(draftKey);
    }

    const order = await draft.finalize({
      doctorId,
      patientName: patientName.trim(),
      patientAge: patientAge ? parseInt(patientAge, 10) : undefined,
      patientGender: patientGender || undefined,
      shade: shade || undefined,
      materials,
      workTypes,
      splintTypeIds,
      selectedTeeth,
      bridgeGroups,
      description: description || undefined,
      completionDate: completionDate ? new Date(completionDate) : undefined,
      totalPrice: pricing.total ?? undefined,
      priceLines: pricing.lines,
    });

    if (!order?.id) {
      throw new Error("ההזמנה נשמרה ללא מזהה");
    }

    if (pending.length > 0) {
      await persistSlotUploads(order.id, pending, {
        askVersionMode: (fileName, existingName, existingVersion) =>
          uploadRef.current?.askVersionMode(fileName, existingName, existingVersion) ??
          Promise.resolve("new_version"),
      });
    }

    await uploadRef.current?.clear();
    await refresh();
    return order;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!patientName.trim()) {
      setError("יש למלא שם מטופל");
      return;
    }
    setSaving(true);
    try {
      const order = await saveOrder();
      setSuccess("ההזמנה נשמרה");
      resetForm();
      onCreated?.(order.serialNumber);
    } catch (err) {
      console.error("[doctor-order] submit failed", err);
      setError(err instanceof Error ? err.message : "שגיאה בשליחת ההזמנה");
      try {
        await refresh();
      } catch {
        /* ignore */
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-opal-gold/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="h-5 w-5 text-opal-gold" />
          הזמנה חדשה למעבדה
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label>שם המטופל *</Label>
              <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} required />
            </div>
            <div>
              <Label>גיל</Label>
              <Input type="number" value={patientAge} onChange={(e) => setPatientAge(e.target.value)} />
            </div>
            <div>
              <Label>מין</Label>
              <div className="mt-2 flex gap-3">
                {(["MALE", "FEMALE"] as Gender[]).map((g) => (
                  <label key={g} className="flex cursor-pointer items-center gap-1 text-sm">
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
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>צבע Shade</Label>
              <ShadePicker value={shade} onChange={setShade} />
            </div>
            <div>
              <Label>תאריך סיום מבוקש</Label>
              <Input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} />
            </div>
          </div>

          <CatalogChipField
            category="MATERIAL"
            title="סוג חומר"
            catalog={orderCatalog}
            selected={materials}
            onToggle={toggleMaterial}
            onCatalogChanged={refreshQuiet}
          />

          <div className="space-y-2">
            <CatalogChipField
              category="WORK_TYPE"
              title="סוג עבודה"
              catalog={orderCatalog}
              selected={workTypes}
              onToggle={toggleWorkType}
              onCatalogChanged={refreshQuiet}
            />
            <div className="max-w-xs">
              <SplintTypeSelect value={splintTypeIds} onChange={onSplintTypeChange} />
            </div>
          </div>

          <OrderPricePanel pricing={pricing} doctorId={doctorId} />

          <div>
            <Label>מבנה שיניים</Label>
            <DentalChart
              selectedTeeth={selectedTeeth}
              onChange={setSelectedTeeth}
              bridgeGroups={bridgeGroups}
              onBridgeGroupsChange={setBridgeGroups}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label>הערות / תיאור עבודה</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div>
            <Label>תמונות וסריקות</Label>
            <div className="mt-2">
              <OrderUploadTiles
                ref={uploadRef}
                draftKey={draftKey}
                orderId={draft.orderId ?? undefined}
                ensureOrderId={() => draft.ensureDraft(doctorId)}
                onUploadStateChange={setUploadState}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {draft.error && <p className="text-sm text-amber-700">{draft.error}</p>}
          {success && <p className="text-sm text-emerald-700 font-medium">{success}</p>}
          <FmSaveUploadHint
            state={
              uploadState ?? {
                total: 0,
                queued: 0,
                uploading: 0,
                done: 0,
                error: 0,
                overallProgress: 0,
                isUploading: false,
                isComplete: true,
                hasBlocking: false,
                kindSummary: [],
              }
            }
            hasAnyFiles={hasUploadFiles}
          />

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="submit"
              className={cn(
                "flex-1",
                saveReady && hasUploadFiles && "bg-opal-gold hover:bg-opal-gold-dark text-white",
              )}
              size="lg"
              disabled={saving || !saveReady}
            >
              {saving ? "שומר הזמנה..." : "שלח הזמנה למעבדה"}
            </Button>
            <TelegramOrderButton
              className="flex-1"
              disabled={saving || !saveReady}
              onClick={async () => {
                if (!patientName.trim()) {
                  setError("יש למלא שם מטופל");
                  return;
                }
                setSaving(true);
                setError("");
                try {
                  const savedPatient = patientName.trim();
                  const savedWork = workTypes;
                  const order = await saveOrder();
                  openTelegramOrderShare({
                    serialNumber: order.serialNumber,
                    patientName: savedPatient,
                    doctorName,
                    workTypes: savedWork,
                    orderId: order.id,
                  });
                  setSuccess("ההזמנה נשמרה");
                  resetForm();
                  onCreated?.(order.serialNumber);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "שגיאה בשליחת ההזמנה");
                } finally {
                  setSaving(false);
                }
              }}
            />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
