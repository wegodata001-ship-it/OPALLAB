"use client";

import { useState } from "react";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useApp } from "@/providers/AppProvider";
import { USER_ROLE_LABELS, SALARY_TYPE_LABELS } from "@/lib/constants/labels";
import type { UserRole, SalaryType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ROLE_PERMISSIONS_SUMMARY } from "@/lib/workflow-permissions";
import { UserPlus, Stethoscope, Truck, Wifi } from "lucide-react";

const ROLES: UserRole[] = ["SECRETARY", "DESIGNER", "PRINTER", "MILLING", "PROCESSING", "FINISH", "ADMIN"];

export default function SettingsPage() {
  const { users, doctors, couriers, labSettings, addUser, updateUser, addDoctor, addCourier, updateLabSettings } = useApp();
  const [tab, setTab] = useState<"employees" | "doctors" | "couriers" | "system">("employees");
  const [newWifi, setNewWifi] = useState("");

  const [newEmp, setNewEmp] = useState({
    username: "", password: "1234", name: "", phone: "", role: "DESIGNER" as UserRole,
    address: "", salary: "", salaryType: "MONTHLY" as SalaryType, hourlyRate: "", color: "#3b82f6",
  });
  const [newDoc, setNewDoc] = useState({ name: "", clinic: "", phone: "", email: "", address: "" });
  const [newCourier, setNewCourier] = useState({ name: "", phone: "", address: "" });

  const employees = users.filter((u) => u.role !== "DOCTOR");

  const handleAddEmployee = () => {
    const username = newEmp.username.trim() || `emp_${Date.now()}`;
    const name = newEmp.name.trim() || "עובד חדש";
    addUser({
      username, password: newEmp.password || "1234", email: `${username}@opallab.co.il`,
      name, phone: newEmp.phone, role: newEmp.role, nfcTagId: null,
      address: newEmp.address,
      salary: newEmp.salaryType === "MONTHLY" && newEmp.salary ? parseFloat(newEmp.salary) : null,
      salaryType: newEmp.salaryType,
      hourlyRate: newEmp.salaryType === "HOURLY" && newEmp.hourlyRate ? parseFloat(newEmp.hourlyRate) : null,
      color: newEmp.color, isActive: true,
    });
    setNewEmp({ username: "", password: "1234", name: "", phone: "", role: "DESIGNER", address: "", salary: "", salaryType: "MONTHLY", hourlyRate: "", color: "#3b82f6" });
  };

  const addWifi = () => {
    const ssid = newWifi.trim();
    if (!ssid || labSettings.allowedWifiSsids.includes(ssid)) return;
    updateLabSettings({ allowedWifiSsids: [...labSettings.allowedWifiSsids, ssid] });
    setNewWifi("");
  };

  const handleAddDoctor = () => {
    const name = newDoc.name.trim() || "רופא חדש";
    addDoctor({ ...newDoc, name, userId: null, isActive: true });
    setNewDoc({ name: "", clinic: "", phone: "", email: "", address: "" });
  };

  const handleAddCourier = () => {
    const name = newCourier.name.trim() || "שליח חדש";
    addCourier({ ...newCourier, name, isActive: true });
    setNewCourier({ name: "", phone: "", address: "" });
  };

  return (
    <>
      <Header title="הגדרות" description="ניהול עובדים, רופאים, שליחים והרשאות" />

      <div className="flex gap-2 mb-6">
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
                <div><Label>סיסמה</Label><Input value={newEmp.password} onChange={(e) => setNewEmp({ ...newEmp, password: e.target.value })} /></div>
                <div><Label>טלפון</Label><Input value={newEmp.phone} onChange={(e) => setNewEmp({ ...newEmp, phone: e.target.value })} /></div>
                <div><Label>תפקיד / הרשאה</Label>
                  <Select value={newEmp.role} onChange={(e) => setNewEmp({ ...newEmp, role: e.target.value as UserRole })}>
                    {ROLES.map((r) => <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>)}
                  </Select>
                  <p className="text-xs text-slate-400 mt-1">{ROLE_PERMISSIONS_SUMMARY[newEmp.role]}</p>
                </div>
                <div>
                  <Label>סוג שכר</Label>
                  <Select value={newEmp.salaryType} onChange={(e) => setNewEmp({ ...newEmp, salaryType: e.target.value as SalaryType })}>
                    {(Object.keys(SALARY_TYPE_LABELS) as SalaryType[]).map((t) => (
                      <option key={t} value={t}>{SALARY_TYPE_LABELS[t]}</option>
                    ))}
                  </Select>
                </div>
                {newEmp.salaryType === "MONTHLY" ? (
                  <div>
                    <Label>משכורת חודשית (ברוטו) ₪</Label>
                    <Input type="number" value={newEmp.salary} onChange={(e) => setNewEmp({ ...newEmp, salary: e.target.value })} placeholder="8000" />
                  </div>
                ) : (
                  <div>
                    <Label>תעריף שעתי ₪</Label>
                    <Input type="number" value={newEmp.hourlyRate} onChange={(e) => setNewEmp({ ...newEmp, hourlyRate: e.target.value })} placeholder="45" />
                  </div>
                )}
                <div><Label>כתובת</Label><Input value={newEmp.address} onChange={(e) => setNewEmp({ ...newEmp, address: e.target.value })} /></div>
                <div>
                  <Label>צבע זיהוי במערכת</Label>
                  <input type="color" value={newEmp.color} onChange={(e) => setNewEmp({ ...newEmp, color: e.target.value })} className="h-10 w-full rounded" />
                  <p className="text-xs text-slate-400 mt-1">מופיע ליד שם העובד ברשימות ומעקב עבודה</p>
                </div>
              </div>
              <Button onClick={handleAddEmployee}>הוספה</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>עובדים ({employees.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {employees.map((u) => (
                <div key={u.id} className="p-3 rounded-xl border flex items-start gap-3">
                  <div className="h-4 w-4 rounded-full shrink-0 mt-1" style={{ backgroundColor: u.color ?? "#94a3b8" }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{u.name}</p>
                    <p className="text-xs text-slate-500">{USER_ROLE_LABELS[u.role]} · {u.username}</p>
                    <p className="text-[10px] text-slate-400 mt-1 leading-snug">{ROLE_PERMISSIONS_SUMMARY[u.role]}</p>
                  </div>
                  <Select className="w-28 h-8 text-xs shrink-0" value={u.role} onChange={(e) => updateUser(u.id, { role: e.target.value as UserRole })}>
                    {ROLES.map((r) => <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>)}
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "doctors" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>הוספת רופא</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>שם</Label><Input value={newDoc.name} onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })} /></div>
              <div><Label>מרפאה</Label><Input value={newDoc.clinic} onChange={(e) => setNewDoc({ ...newDoc, clinic: e.target.value })} /></div>
              <div><Label>טלפון</Label><Input value={newDoc.phone} onChange={(e) => setNewDoc({ ...newDoc, phone: e.target.value })} /></div>
              <div><Label>אימייל</Label><Input value={newDoc.email} onChange={(e) => setNewDoc({ ...newDoc, email: e.target.value })} /></div>
              <div><Label>כתובת</Label><Input value={newDoc.address} onChange={(e) => setNewDoc({ ...newDoc, address: e.target.value })} /></div>
              <div className="col-span-2"><Button onClick={handleAddDoctor}>הוספה</Button></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>רופאים ({doctors.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {doctors.map((d) => (
                <div key={d.id} className="p-3 rounded-xl border text-sm">
                  <p className="font-medium">{d.name}</p>
                  <p className="text-slate-500">{d.clinic} · {d.phone}</p>
                  <p className="text-xs text-slate-400">{d.address}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
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
                <div key={c.id} className="p-3 rounded-xl border text-sm flex justify-between">
                  <div><p className="font-medium">{c.name}</p><p className="text-slate-500">{c.phone} · {c.address}</p></div>
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
            <p className="text-xs text-slate-400">בדפדפן העובד בוחר את רשת ה-WiFi שאליה מחובר. מנהל ומזכירות פטורים מאימות.</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
