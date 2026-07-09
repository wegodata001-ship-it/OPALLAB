"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useApp } from "@/providers/AppProvider";
import type { CreateDoctorInput, Doctor, UpdateDoctorInput, User } from "@/lib/types";

export const emptyDoctorForm = {
  name: "",
  clinic: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  username: "",
  password: "",
  confirmPassword: "",
  isActive: true,
  userIsActive: true,
};

type DoctorFormState = typeof emptyDoctorForm;

interface DoctorFormModalProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  doctor?: Doctor | null;
  linkedUser?: User | null;
  onSaved?: (doctor: Doctor) => void;
}

export function DoctorFormModal({
  open,
  onClose,
  mode,
  doctor,
  linkedUser,
  onSaved,
}: DoctorFormModalProps) {
  const { addDoctor, updateDoctor } = useApp();
  const [form, setForm] = useState<DoctorFormState>(emptyDoctorForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (mode === "edit" && doctor) {
      setForm({
        name: doctor.name,
        clinic: doctor.clinic ?? "",
        phone: doctor.phone ?? "",
        email: doctor.email ?? linkedUser?.email ?? "",
        address: doctor.address ?? "",
        notes: "",
        username: linkedUser?.username ?? "",
        password: "",
        confirmPassword: "",
        isActive: doctor.isActive,
        userIsActive: linkedUser?.isActive ?? true,
      });
    } else {
      setForm(emptyDoctorForm);
    }
  }, [open, mode, doctor, linkedUser]);

  const set = (patch: Partial<DoctorFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async () => {
    setError("");
    setSaving(true);
    try {
      if (mode === "create") {
        if (!form.name.trim()) throw new Error("שם מלא חובה");
        if (!form.username.trim()) throw new Error("שם משתמש חובה");
        if (!form.email.trim()) throw new Error("אימייל חובה");
        if (!form.password) throw new Error("סיסמה חובה");
        if (form.password !== form.confirmPassword) throw new Error("אימות הסיסמה אינו תואם");

        const input: CreateDoctorInput = {
          name: form.name.trim(),
          clinic: form.clinic.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim(),
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
          username: form.username.trim(),
          password: form.password,
          confirmPassword: form.confirmPassword,
        };
        const saved = await addDoctor(input);
        onSaved?.(saved);
        onClose();
        return;
      }

      if (!doctor) return;

      const updates: UpdateDoctorInput = {
        name: form.name.trim(),
        clinic: form.clinic.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        isActive: form.isActive,
        userIsActive: form.userIsActive,
      };

      if (form.username.trim()) updates.username = form.username.trim();
      if (form.password.trim()) updates.password = form.password;

      if (!linkedUser && form.username.trim() && form.email.trim() && form.password.trim()) {
        updates.username = form.username.trim();
        updates.email = form.email.trim();
        updates.password = form.password;
      }

      const saved = await updateDoctor(doctor.id, updates);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "הוספת רופא" : "עריכת רופא"}
      className="max-w-2xl"
    >
      <div className="space-y-5">
        <section>
          <p className="text-sm font-semibold text-slate-700 mb-3">פרטי רופא</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>שם מלא *</Label>
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div>
              <Label>שם המרפאה</Label>
              <Input value={form.clinic} onChange={(e) => set({ clinic: e.target.value })} />
            </div>
            <div>
              <Label>טלפון</Label>
              <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>אימייל *</Label>
              <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
          </div>
        </section>

        <section>
          <p className="text-sm font-semibold text-slate-700 mb-3">פרטי התחברות</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>שם משתמש {mode === "create" ? "*" : ""}</Label>
              <Input value={form.username} onChange={(e) => set({ username: e.target.value })} />
            </div>
            <div>
              <Label>{mode === "create" ? "סיסמה *" : "סיסמה חדשה"}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
                placeholder={mode === "edit" ? "השאר ריק אם אין שינוי" : ""}
              />
            </div>
            {mode === "create" && (
              <div className="sm:col-span-2">
                <Label>אימות סיסמה *</Label>
                <Input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => set({ confirmPassword: e.target.value })}
                />
              </div>
            )}
          </div>
          {!linkedUser && mode === "edit" && (
            <p className="text-xs text-amber-600 mt-2">
              לרופא זה אין משתמש התחברות. מלא שם משתמש, אימייל וסיסמה כדי ליצור חשבון.
            </p>
          )}
        </section>

        <section>
          <p className="text-sm font-semibold text-slate-700 mb-3">מידע נוסף</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>כתובת</Label>
              <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>הערות</Label>
              <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} />
            </div>
          </div>
        </section>

        {mode === "edit" && (
          <section className="rounded-xl border bg-slate-50 p-3 space-y-2">
            <p className="text-sm font-semibold text-slate-700">כרטיס התחברות</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.userIsActive}
                onChange={(e) => set({ userIsActive: e.target.checked, isActive: e.target.checked })}
                className="accent-opal-gold"
              />
              משתמש פעיל (גישה לפורטל רופא)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set({ isActive: e.target.checked })}
                className="accent-opal-gold"
              />
              רופא פעיל במערכת
            </label>
          </section>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button className="w-full" disabled={saving} onClick={() => void handleSubmit()}>
          {saving ? "שומר..." : mode === "create" ? "יצירת רופא ומשתמש" : "שמירה"}
        </Button>
      </div>
    </Modal>
  );
}
