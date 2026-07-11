"use client";

import { useState } from "react";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useApp } from "@/providers/AppProvider";
import { isPrimarySystemUser } from "@/lib/people/protected-users";
import { USER_ROLE_LABELS, SALARY_TYPE_LABELS } from "@/lib/constants/labels";
import type { Courier, Doctor, SalaryType, User, UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RoleMultiSelect } from "@/components/settings/role-multi-select";
import { DoctorFormModal } from "@/components/settings/doctor-form-modal";
import { getUserRoles, primaryRole } from "@/lib/user-roles";
import { UserPlus, Stethoscope, Truck, Pencil, Trash2 } from "lucide-react";

type DeleteTarget =
  | { kind: "employee"; id: string; name: string }
  | { kind: "doctor"; id: string; name: string }
  | { kind: "courier"; id: string; name: string };

export default function SettingsPage() {
  const {
    users, doctors, couriers, currentUser,
    addUser, updateUser, deleteUser,
    addCourier, updateCourier, deleteCourier,
    deleteDoctor,
  } = useApp();

  const [tab, setTab] = useState<"employees" | "doctors" | "couriers">("employees");
  const [doctorModal, setDoctorModal] = useState<null | { mode: "create" } | { mode: "edit"; doctor: Doctor }>(null);

  const [newEmp, setNewEmp] = useState({
    username: "", password: "1234", name: "", phone: "", email: "",
    roles: ["DESIGNER"] as UserRole[],
    address: "", salary: "", salaryType: "MONTHLY" as SalaryType, hourlyRate: "", color: "#3b82f6",
  });

  const [editEmp, setEditEmp] = useState<User | null>(null);
  const [editEmpForm, setEditEmpForm] = useState({
    name: "", username: "", email: "", phone: "", address: "", color: "#3b82f6",
    roles: [] as UserRole[], salary: "", salaryType: "MONTHLY" as SalaryType, hourlyRate: "",
    isActive: true, password: "",
  });


  const [newCourier, setNewCourier] = useState({ name: "", phone: "", address: "" });
  const [editCourier, setEditCourier] = useState<Courier | null>(null);
  const [editCourierForm, setEditCourierForm] = useState({ name: "", phone: "", address: "", isActive: true });
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const employees = users.filter((u) => !getUserRoles(u).includes("DOCTOR"));

  const canDeleteUser = (user: User) => {
    if (!currentUser) return false;
    if (user.id === currentUser.id) return false;
    return !isPrimarySystemUser(user);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      if (deleteTarget.kind === "employee") await deleteUser(deleteTarget.id);
      if (deleteTarget.kind === "doctor") await deleteDoctor(deleteTarget.id);
      if (deleteTarget.kind === "courier") await deleteCourier(deleteTarget.id);
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "מחיקה נכשלה");
    }
  };

  const openEditEmployee = (user: User) => {
    setEditEmp(user);
    setEditEmpForm({
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone ?? "",
      address: user.address ?? "",
      color: user.color ?? "#3b82f6",
      roles: getUserRoles(user),
      salary: user.salary?.toString() ?? "",
      salaryType: user.salaryType ?? "MONTHLY",
      hourlyRate: user.hourlyRate?.toString() ?? "",
      isActive: user.isActive,
      password: "",
    });
  };

  const handleAddEmployee = async () => {
    const username = newEmp.username.trim() || `emp_${Date.now()}`;
    const name = newEmp.name.trim() || "עובד חדש";
    const roles = newEmp.roles.length ? newEmp.roles : ["DESIGNER" as UserRole];
    await addUser({
      username,
      password: newEmp.password || "1234",
      email: newEmp.email.trim() || `${username}@opallab.co.il`,
      name,
      phone: newEmp.phone,
      role: primaryRole(roles),
      roles,
      nfcTagId: null,
      address: newEmp.address,
      salary: newEmp.salaryType === "MONTHLY" && newEmp.salary ? parseFloat(newEmp.salary) : null,
      salaryType: newEmp.salaryType,
      hourlyRate: newEmp.salaryType === "HOURLY" && newEmp.hourlyRate ? parseFloat(newEmp.hourlyRate) : null,
      color: newEmp.color,
      isActive: true,
    });
    setNewEmp({
      username: "", password: "1234", name: "", phone: "", email: "",
      roles: ["DESIGNER"], address: "", salary: "", salaryType: "MONTHLY", hourlyRate: "", color: "#3b82f6",
    });
  };

  const saveEditEmployee = async () => {
    if (!editEmp) return;
    await updateUser(editEmp.id, {
      name: editEmpForm.name,
      username: editEmpForm.username,
      email: editEmpForm.email,
      phone: editEmpForm.phone || null,
      address: editEmpForm.address || null,
      color: editEmpForm.color,
      roles: editEmpForm.roles,
      role: primaryRole(editEmpForm.roles),
      salary: editEmpForm.salaryType === "MONTHLY" && editEmpForm.salary ? parseFloat(editEmpForm.salary) : null,
      salaryType: editEmpForm.salaryType,
      hourlyRate: editEmpForm.salaryType === "HOURLY" && editEmpForm.hourlyRate ? parseFloat(editEmpForm.hourlyRate) : null,
      isActive: editEmpForm.isActive,
      ...(editEmpForm.password.trim() ? { password: editEmpForm.password } : {}),
    });
    setEditEmp(null);
  };

  const openEditCourier = (courier: Courier) => {
    setEditCourier(courier);
    setEditCourierForm({
      name: courier.name,
      phone: courier.phone,
      address: courier.address ?? "",
      isActive: courier.isActive,
    });
  };

  return (
    <>
      <Header title="הגדרות" description="ניהול עובדים, רופאים, שליחים והרשאות" />

      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          { key: "employees" as const, label: "עובדים", icon: UserPlus },
          { key: "doctors" as const, label: "רופאים", icon: Stethoscope },
          { key: "couriers" as const, label: "שליחים", icon: Truck },
        ]).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium", tab === key ? "bg-opal-gold text-white" : "bg-white border")}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === "employees" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>הוספת עובד</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>שם</Label><Input value={newEmp.name} onChange={(e) => setNewEmp({ ...newEmp, name: e.target.value })} /></div>
                <div><Label>שם משתמש</Label><Input value={newEmp.username} onChange={(e) => setNewEmp({ ...newEmp, username: e.target.value })} /></div>
                <div><Label>אימייל</Label><Input value={newEmp.email} onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })} /></div>
                <div><Label>סיסמה</Label><Input value={newEmp.password} onChange={(e) => setNewEmp({ ...newEmp, password: e.target.value })} /></div>
                <div><Label>טלפון</Label><Input value={newEmp.phone} onChange={(e) => setNewEmp({ ...newEmp, phone: e.target.value })} /></div>
                <div><Label>כתובת</Label><Input value={newEmp.address} onChange={(e) => setNewEmp({ ...newEmp, address: e.target.value })} /></div>
              </div>
              <RoleMultiSelect value={newEmp.roles} onChange={(roles) => setNewEmp({ ...newEmp, roles })} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>סוג שכר</Label>
                  <Select value={newEmp.salaryType} onChange={(e) => setNewEmp({ ...newEmp, salaryType: e.target.value as SalaryType })}>
                    {(Object.keys(SALARY_TYPE_LABELS) as SalaryType[]).map((t) => (
                      <option key={t} value={t}>{SALARY_TYPE_LABELS[t]}</option>
                    ))}
                  </Select>
                </div>
                {newEmp.salaryType === "MONTHLY" ? (
                  <div><Label>משכורת חודשית ₪</Label><Input type="number" value={newEmp.salary} onChange={(e) => setNewEmp({ ...newEmp, salary: e.target.value })} /></div>
                ) : (
                  <div><Label>תעריף שעתי ₪</Label><Input type="number" value={newEmp.hourlyRate} onChange={(e) => setNewEmp({ ...newEmp, hourlyRate: e.target.value })} /></div>
                )}
                <div className="col-span-2">
                  <Label>צבע זיהוי</Label>
                  <input type="color" value={newEmp.color} onChange={(e) => setNewEmp({ ...newEmp, color: e.target.value })} className="h-10 w-full rounded" />
                </div>
              </div>
              <Button onClick={() => void handleAddEmployee()}>הוספה</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>עובדים ({employees.length})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-slate-500 text-right">
                    <th className="p-2 font-medium">עובד</th>
                    <th className="p-2 font-medium hidden sm:table-cell">תפקידים</th>
                    <th className="p-2 font-medium w-28">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="p-2">
                        <div className="flex items-start gap-2">
                          <div className="h-3 w-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: u.color ?? "#94a3b8" }} />
                          <div>
                            <p className="font-medium">{u.name}</p>
                            <p className="text-xs text-slate-500">{u.username}{!u.isActive && " · לא פעיל"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-2 text-xs text-slate-600 hidden sm:table-cell">
                        {getUserRoles(u).map((r) => USER_ROLE_LABELS[r]).join(" · ")}
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEditEmployee(u)} title="עריכה">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {canDeleteUser(u) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 hover:border-red-300"
                              onClick={() => { setDeleteError(null); setDeleteTarget({ kind: "employee", id: u.id, name: u.name }); }}
                              title="מחיקה"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "doctors" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>רופאים ({doctors.length})</CardTitle>
            <Button onClick={() => setDoctorModal({ mode: "create" })}>
              <Stethoscope className="h-4 w-4" />
              הוספת רופא
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-slate-500 text-right">
                  <th className="p-2 font-medium">רופא</th>
                  <th className="p-2 font-medium hidden md:table-cell">פרטים</th>
                  <th className="p-2 font-medium w-28">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((d) => {
                  const linkedUser = d.userId ? users.find((u) => u.id === d.userId) : undefined;
                  return (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="p-2">
                        <p className="font-medium">{d.name}</p>
                        <p className="text-xs text-opal-gold-dark">
                          {linkedUser ? `משתמש: ${linkedUser.username}` : "ללא משתמש התחברות"}
                        </p>
                      </td>
                      <td className="p-2 text-xs text-slate-500 hidden md:table-cell">
                        {d.clinic} · {d.phone} · {d.email}
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => setDoctorModal({ mode: "edit", doctor: d })} title="עריכה">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700 hover:border-red-300"
                            onClick={() => { setDeleteError(null); setDeleteTarget({ kind: "doctor", id: d.id, name: d.name }); }}
                            title="מחיקה"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === "couriers" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>הוספת שליח</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>שם</Label><Input value={newCourier.name} onChange={(e) => setNewCourier({ ...newCourier, name: e.target.value })} /></div>
              <div><Label>טלפון</Label><Input value={newCourier.phone} onChange={(e) => setNewCourier({ ...newCourier, phone: e.target.value })} /></div>
              <div><Label>כתובת / אזור</Label><Input value={newCourier.address} onChange={(e) => setNewCourier({ ...newCourier, address: e.target.value })} /></div>
              <Button onClick={handleAddCourier}>הוספה</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>שליחים ({couriers.length})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-slate-500 text-right">
                    <th className="p-2 font-medium">שליח</th>
                    <th className="p-2 font-medium hidden sm:table-cell">פרטים</th>
                    <th className="p-2 font-medium w-28">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {couriers.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="p-2 font-medium">{c.name}</td>
                      <td className="p-2 text-slate-500 hidden sm:table-cell">{c.phone} · {c.address}</td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEditCourier(c)} title="עריכה">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700 hover:border-red-300"
                            onClick={() => { setDeleteError(null); setDeleteTarget({ kind: "courier", id: c.id, name: c.name }); }}
                            title="מחיקה"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(null); }}
        title="אישור מחיקה"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            האם למחוק את {deleteTarget?.kind === "employee" ? "העובד" : deleteTarget?.kind === "doctor" ? "הרופא" : "השליח"}
            {" "}
            <strong>{deleteTarget?.name}</strong>?
          </p>
          <p className="text-sm text-red-600">פעולה זו אינה ניתנת לשחזור.</p>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>ביטול</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={() => void confirmDelete()}>מחק</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editEmp} onClose={() => setEditEmp(null)} title="עריכת עובד" className="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>שם</Label><Input value={editEmpForm.name} onChange={(e) => setEditEmpForm({ ...editEmpForm, name: e.target.value })} /></div>
            <div><Label>שם משתמש</Label><Input value={editEmpForm.username} onChange={(e) => setEditEmpForm({ ...editEmpForm, username: e.target.value })} /></div>
            <div><Label>אימייל</Label><Input value={editEmpForm.email} onChange={(e) => setEditEmpForm({ ...editEmpForm, email: e.target.value })} /></div>
            <div><Label>טלפון</Label><Input value={editEmpForm.phone} onChange={(e) => setEditEmpForm({ ...editEmpForm, phone: e.target.value })} /></div>
            <div><Label>כתובת</Label><Input value={editEmpForm.address} onChange={(e) => setEditEmpForm({ ...editEmpForm, address: e.target.value })} /></div>
            <div><Label>צבע זיהוי</Label><input type="color" value={editEmpForm.color} onChange={(e) => setEditEmpForm({ ...editEmpForm, color: e.target.value })} className="h-10 w-full rounded" /></div>
          </div>
          <RoleMultiSelect value={editEmpForm.roles} onChange={(roles) => setEditEmpForm({ ...editEmpForm, roles })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>סוג שכר</Label>
              <Select value={editEmpForm.salaryType} onChange={(e) => setEditEmpForm({ ...editEmpForm, salaryType: e.target.value as SalaryType })}>
                {(Object.keys(SALARY_TYPE_LABELS) as SalaryType[]).map((t) => (
                  <option key={t} value={t}>{SALARY_TYPE_LABELS[t]}</option>
                ))}
              </Select>
            </div>
            {editEmpForm.salaryType === "MONTHLY" ? (
              <div><Label>משכורת ₪</Label><Input type="number" value={editEmpForm.salary} onChange={(e) => setEditEmpForm({ ...editEmpForm, salary: e.target.value })} /></div>
            ) : (
              <div><Label>תעריף שעתי ₪</Label><Input type="number" value={editEmpForm.hourlyRate} onChange={(e) => setEditEmpForm({ ...editEmpForm, hourlyRate: e.target.value })} /></div>
            )}
          </div>
          <div>
            <Label>סיסמה חדשה (השאר ריק אם אין שינוי)</Label>
            <Input type="password" value={editEmpForm.password} onChange={(e) => setEditEmpForm({ ...editEmpForm, password: e.target.value })} placeholder="••••••" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editEmpForm.isActive} onChange={(e) => setEditEmpForm({ ...editEmpForm, isActive: e.target.checked })} className="accent-opal-gold" />
            עובד פעיל
          </label>
          <Button onClick={() => void saveEditEmployee()} className="w-full">שמירה</Button>
        </div>
      </Modal>

      <DoctorFormModal
        open={!!doctorModal}
        onClose={() => setDoctorModal(null)}
        mode={doctorModal?.mode ?? "create"}
        doctor={doctorModal?.mode === "edit" ? doctorModal.doctor : null}
        linkedUser={
          doctorModal?.mode === "edit" && doctorModal.doctor.userId
            ? users.find((u) => u.id === doctorModal.doctor.userId) ?? null
            : null
        }
      />

      <Modal open={!!editCourier} onClose={() => setEditCourier(null)} title="עריכת שליח">
        <div className="space-y-3">
          <div><Label>שם</Label><Input value={editCourierForm.name} onChange={(e) => setEditCourierForm({ ...editCourierForm, name: e.target.value })} /></div>
          <div><Label>טלפון</Label><Input value={editCourierForm.phone} onChange={(e) => setEditCourierForm({ ...editCourierForm, phone: e.target.value })} /></div>
          <div><Label>כתובת</Label><Input value={editCourierForm.address} onChange={(e) => setEditCourierForm({ ...editCourierForm, address: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editCourierForm.isActive} onChange={(e) => setEditCourierForm({ ...editCourierForm, isActive: e.target.checked })} className="accent-opal-gold" />
            שליח פעיל
          </label>
          <Button onClick={() => { if (editCourier) void updateCourier(editCourier.id, editCourierForm).then(() => setEditCourier(null)); }} className="w-full">שמירה</Button>
        </div>
      </Modal>
    </>
  );

  function handleAddCourier() {
    const name = newCourier.name.trim() || "שליח חדש";
    addCourier({ ...newCourier, name, isActive: true });
    setNewCourier({ name: "", phone: "", address: "" });
  }
}
