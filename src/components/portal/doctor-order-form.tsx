"use client";

import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DentalChart } from "@/components/DentalChart";
import { ShadePicker } from "@/components/orders/shade-picker";
import { useApp } from "@/providers/AppProvider";
import { MATERIAL_TYPE_LABELS, WORK_TYPE_LABELS, GENDER_LABELS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";
import type { Gender, MaterialType, WorkType } from "@/lib/types";
import { Plus, Upload } from "lucide-react";

interface DoctorOrderFormProps {
  doctorId: string;
  onCreated?: (serialNumber: string) => void;
}

export function DoctorOrderForm({ doctorId, onCreated }: DoctorOrderFormProps) {
  const { createOrder, addOrderFile } = useApp();
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState<Gender | "">("");
  const [shade, setShade] = useState("");
  const [materials, setMaterials] = useState<MaterialType[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);
  const [description, setDescription] = useState("");
  const [completionDate, setCompletionDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleMaterial = (m: MaterialType) =>
    setMaterials((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  const toggleWorkType = (w: WorkType) =>
    setWorkTypes((p) => (p.includes(w) ? p.filter((x) => x !== w) : [...p, w]));

  const onFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!patientName.trim()) {
      setError("יש למלא שם מטופל");
      return;
    }
    setSaving(true);
    try {
      const order = await createOrder({
        doctorId,
        patientName: patientName.trim(),
        patientAge: patientAge ? parseInt(patientAge, 10) : undefined,
        patientGender: patientGender || undefined,
        shade: shade || undefined,
        materials,
        workTypes,
        selectedTeeth,
        description: description || undefined,
        completionDate: completionDate ? new Date(completionDate) : undefined,
      });

      if (files.length) {
        const folderId = crypto.randomUUID();
        for (const f of files) {
          await addOrderFile(order.id, f, undefined, folderId);
        }
      }

      setPatientName("");
      setPatientAge("");
      setPatientGender("");
      setShade("");
      setMaterials([]);
      setWorkTypes([]);
      setSelectedTeeth([]);
      setDescription("");
      setCompletionDate("");
      setFiles([]);
      onCreated?.(order.serialNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחת ההזמנה");
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

          <div>
            <Label>סוג חומר</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(Object.keys(MATERIAL_TYPE_LABELS) as MaterialType[]).map((m) => (
                <label
                  key={m}
                  className={cn(
                    "cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    materials.includes(m)
                      ? "border-opal-gold bg-opal-gold/10 font-medium text-opal-gold-dark"
                      : "border-slate-200",
                  )}
                >
                  <input type="checkbox" className="sr-only" checked={materials.includes(m)} onChange={() => toggleMaterial(m)} />
                  {MATERIAL_TYPE_LABELS[m]}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>סוג עבודה</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(Object.keys(WORK_TYPE_LABELS) as WorkType[]).map((w) => (
                <label
                  key={w}
                  className={cn(
                    "cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    workTypes.includes(w)
                      ? "border-opal-gold bg-opal-gold/10 font-medium text-opal-gold-dark"
                      : "border-slate-200",
                  )}
                >
                  <input type="checkbox" className="sr-only" checked={workTypes.includes(w)} onChange={() => toggleWorkType(w)} />
                  {WORK_TYPE_LABELS[w]}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>מבנה שיניים</Label>
            <DentalChart selectedTeeth={selectedTeeth} onChange={setSelectedTeeth} className="mt-1.5" />
          </div>

          <div>
            <Label>הערות / תיאור עבודה</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div>
            <Label>קבצים (STL / תמונות)</Label>
            <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-opal-gold/40 bg-opal-gold/5 px-4 py-6 text-sm text-slate-600 hover:bg-opal-gold/10">
              <Upload className="h-4 w-4 text-opal-gold" />
              העלאת קבצים
              <input type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
            {files.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">{files.length} קבצים נבחרו</p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" className="w-full" size="lg" disabled={saving}>
            {saving ? "שולח..." : "שלח הזמנה למעבדה"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
