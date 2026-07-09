"use client";

import { useState } from "react";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useApp } from "@/providers/AppProvider";
import { USER_ROLE_LABELS, SALARY_TYPE_LABELS } from "@/lib/constants/labels";
import type { Courier, Doctor, SalaryType, User, UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { rolesSummary } from "@/lib/workflow-permissions";
import { RoleMultiSelect } from "@/components/settings/role-multi-select";
import { DoctorFormModal } from "@/components/settings/doctor-form-modal";
import { getUserRoles, primaryRole } from "@/lib/user-roles";
import { UserPlus, Stethoscope, Truck, Wifi, Pencil } from "lucide-react";

export default function SettingsPage() {
  const {
    users, doctors, couriers, labSettings,
    addUser, updateUser, addCourier, updateCourier, updateLabSettings,
  } = useApp();

  const [tab, setTab] = useState<"employees" | "doctors" | "couriers" | "system">("employees");
  const [newWifi, setNewWifi] = useState("");
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

  const employees = users.filter((u) => !getUserRoles(u).includes("DOCTOR"));

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
          { key: "system" as const, label: "מערכת / WiFi", icon: Wifi },
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
            <CardContent className="space-y-2 max-h-[32rem] overflow-y-auto">
              {employees.map((u) => (
                <div key={u.id} className="p-3 rounded-xl border flex items-start gap-3">
                  <div className="h-4 w-4 rounded-full shrink-0 mt-1" style={{ backgroundColor: u.color ?? "#94a3b8" }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{u.name}</p>
                    <p className="text-xs text-slate-500">
                      {getUserRoles(u).map((r) => USER_ROLE_LABELS[r]).join(" · ")} · {u.username}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 leading-snug">{rolesSummary(getUserRoles(u))}</p>
                    {!u.isActive && <span className="text-xs text-red-500">לא פעיל</span>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openEditEmployee(u)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
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
          <CardContent className="space-y-2">
            {doctors.map((d) => {
              const linkedUser = d.userId ? users.find((u) => u.id === d.userId) : undefined;
              return (
                <div key={d.id} className="p-3 rounded-xl border text-sm flex justify-between gap-2">
                  <div>
                    <p className="font-medium">{d.name}</p>
                    <p className="text-slate-500">{d.clinic} · {d.phone}</p>
                    <p className="text-xs text-slate-400">{d.email} · {d.address}</p>
                    <p className="text-xs text-opal-gold-dark mt-1">
                      {linkedUser ? `משתמש: ${linkedUser.username}` : "ללא משתמש התחברות"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setDoctorModal({ mode: "edit", doctor: d })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
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
            <CardContent className="space-y-2">
              {couriers.map((c) => (
                <div key={c.id} className="p-3 rounded-xl border text-sm flex justify-between gap-2">
                  <div><p className="font-medium">{c.name}</p><p className="text-slate-500">{c.phone} · {c.address}</p></div>
                  <Button size="sm" variant="outline" onClick={() => openEditCourier(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "system" && (
        <Card>
          <CardHeader><CardTitle>נוכחות דרך WiFi</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-w-lg">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={labSettings.wifiAttendanceEnabled} onChange={(e) => updateLabSettings({ wifiAttendanceEnabled: e.target.checked })} className="accent-opal-gold" />
              חייב דיווח נוכחות דרך רשת WiFi מורשית
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={labSettings.requireGeofence} onChange={(e) => updateLabSettings({ requireGeofence: e.target.checked })} className="accent-opal-gold" />
              אימות מיקום GPS (גיאופנס) בנוסף ל-WiFi
            </label>
            <div>
              <Label>קוד נוכחות (אופציונלי)</Label>
              <Input value={labSettings.attendanceCode} onChange={(e) => updateLabSettings({ attendanceCode: e.target.value })} placeholder="opal1234" />
            </div>
            <div>
              <Label>רשתות WiFi מורשות</Label>
              <div className="flex gap-2 mt-1">
                <Input value={newWifi} onChange={(e) => setNewWifi(e.target.value)} placeholder="שם הרשת (SSID)" />
                <Button type="button" onClick={addWifi}>הוספה</Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {labSettings.allowedWifiSsids.map((ssid) => (
                  <span key={ssid} className="px-3 py-1 rounded-full bg-slate-100 text-sm flex items-center gap-2">
                    {ssid}
                    <button type="button" className="text-red-500 text-xs" onClick={() => updateLabSettings({ allowedWifiSsids: labSettings.allowedWifiSsids.filter((s) => s !== ssid) })}>×</button>
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

  function addWifi() {
    const ssid = newWifi.trim();
    if (!ssid || labSettings.allowedWifiSsids.includes(ssid)) return;
    updateLabSettings({ allowedWifiSsids: [...labSettings.allowedWifiSsids, ssid] });
    setNewWifi("");
  }

  function handleAddCourier() {
    const name = newCourier.name.trim() || "שליח חדש";
    addCourier({ ...newCourier, name, isActive: true });
    setNewCourier({ name: "", phone: "", address: "" });
  }
}
