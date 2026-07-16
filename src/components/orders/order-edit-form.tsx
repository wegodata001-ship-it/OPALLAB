"use client";

import { useState } from "react";
import type { OrderWithRelations, MaterialType, WorkType, Gender } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DentalChart } from "@/components/orders/dental-chart";
import { ShadePicker } from "@/components/orders/shade-picker";
import { MATERIAL_TYPE_LABELS, WORK_TYPE_LABELS, GENDER_LABELS } from "@/lib/constants/labels";
import { useApp } from "@/providers/AppProvider";
import { cn } from "@/lib/utils";
import { Pencil, X, Save } from "lucide-react";

interface OrderEditFormProps {
  order: OrderWithRelations;
  onDone: () => void;
}

export function OrderEditForm({ order, onDone }: OrderEditFormProps) {
  const { doctors, updateOrder } = useApp();
  const [doctorName, setDoctorName] = useState(order.doctor.name);
  const [patientName, setPatientName] = useState(order.patient.name);
  const [patientAge, setPatientAge] = useState(order.patient.age?.toString() ?? "");
  const [patientGender, setPatientGender] = useState<Gender | "">(order.patient.gender ?? "");
  const [shade, setShade] = useState(order.shade ?? "");
  const [materials, setMaterials] = useState<MaterialType[]>(order.materials);
  const [workTypes, setWorkTypes] = useState<WorkType[]>(order.workTypes);
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>(order.selectedTeeth);
  const [description, setDescription] = useState(order.description ?? "");
  const [completionDate, setCompletionDate] = useState(
    order.completionDate ? order.completionDate.toISOString().slice(0, 10) : ""
  );
  const [totalPrice, setTotalPrice] = useState(order.totalPrice?.toString() ?? "");
  const [notes, setNotes] = useState(order.notes ?? "");

  const matched = doctors.find((d) => d.name.trim() === doctorName.trim());

  const handleSave = () => {
    updateOrder({
      orderId: order.id,
      doctorId: matched?.id,
      doctorName: doctorName.trim(),
      patientName: patientName.trim(),
      patientAge: patientAge ? parseInt(patientAge) : null,
      patientGender: patientGender || null,
      shade: shade || null,
      materials, workTypes, selectedTeeth,
      description: description || null,
      completionDate: completionDate ? new Date(completionDate) : null,
      totalPrice: totalPrice ? parseFloat(totalPrice) : null,
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
          <div><Label>צבע Shade</Label><ShadePicker value={shade} onChange={setShade} /></div>
          <div><Label>תאריך סיום</Label><Input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} /></div>
          <div><Label>מחיר ₪</Label><Input type="number" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} /></div>
        </div>
        <div>
          <Label>סוג חומר</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {(Object.keys(MATERIAL_TYPE_LABELS) as MaterialType[]).map((m) => (
              <label key={m} className={cn("px-3 py-1 rounded-lg border text-sm cursor-pointer", materials.includes(m) ? "border-opal-gold bg-opal-gold/10" : "border-slate-200")}>
                <input type="checkbox" className="sr-only" checked={materials.includes(m)} onChange={() => setMaterials((p) => p.includes(m) ? p.filter((x) => x !== m) : [...p, m])} />
                {MATERIAL_TYPE_LABELS[m]}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label>סוג עבודה</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {(Object.keys(WORK_TYPE_LABELS) as WorkType[]).map((w) => (
              <label key={w} className={cn("px-3 py-1 rounded-lg border text-sm cursor-pointer", workTypes.includes(w) ? "border-opal-gold bg-opal-gold/10" : "border-slate-200")}>
                <input type="checkbox" className="sr-only" checked={workTypes.includes(w)} onChange={() => setWorkTypes((p) => p.includes(w) ? p.filter((x) => x !== w) : [...p, w])} />
                {WORK_TYPE_LABELS[w]}
              </label>
            ))}
          </div>
        </div>
        <DentalChart selectedTeeth={selectedTeeth} onChange={setSelectedTeeth} />
        <div><Label>תיאור</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
        <div><Label>הערות פנימיות</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        <div className="flex gap-2">
          <Button onClick={handleSave}><Save className="h-4 w-4" />שמירה</Button>
          <Button variant="outline" onClick={onDone}>ביטול</Button>
        </div>
      </CardContent>
    </Card>
  );
}
