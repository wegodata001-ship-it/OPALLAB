"use client";

import { useState, useMemo } from "react";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { ExportActions } from "@/components/shared/export-actions";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { useApp } from "@/providers/AppProvider";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { filterByDateRange } from "@/lib/date-filter";
import { PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS, USER_ROLE_LABELS } from "@/lib/constants/labels";
import { calculateEmployeePay, getSalaryLabel } from "@/lib/salary";
import { printHtml } from "@/lib/export";
import { AttendanceAdminRecord } from "@/components/attendance/AttendanceAdminRecord";
import { canViewAttendanceVerification } from "@/lib/attendance/attendance-verification";
import { LAB_INFO } from "@/lib/constants/labels";
import type { DateRange, Payment, PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Printer, FileText, User } from "lucide-react";

type LedgerView = "all" | "patient" | "delivery";

function PaymentRow({ p, onViewDelivery }: { p: Payment; onViewDelivery?: (note: string) => void }) {
  return (
    <div className="p-3 rounded-xl border text-sm">
      <div className="flex justify-between">
        <span className={cn("font-bold", p.type === "PAYMENT" ? "text-emerald-600" : "text-red-600")}>
          {p.type === "PAYMENT" ? "+" : "-"}{formatCurrency(p.amount)}
        </span>
        <span className="text-slate-400">{formatDate(p.createdAt)}</span>
      </div>
      {p.serialNumber && <p className="text-opal-gold-dark font-medium mt-1">עבודה: {p.serialNumber}</p>}
      {p.patientName && <p className="text-slate-600">מטופל: {p.patientName}</p>}
      {p.deliveryNote && (
        <button type="button" onClick={() => onViewDelivery?.(p.deliveryNote!)} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
          <FileText className="h-3 w-3" />תעודת משלוח: {p.deliveryNote}
        </button>
      )}
      <p className="text-slate-500">{p.description}</p>
      <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-400">
        <span>{PAYMENT_STATUS_LABELS[p.status]}</span>
        {p.paymentMethod && <span>· {PAYMENT_METHOD_LABELS[p.paymentMethod]}</span>}
        {p.referenceNumber && <span>· אסמכתא: {p.referenceNumber}</span>}
        {p.paidAt && <span>· שולם {formatDate(p.paidAt)}</span>}
      </div>
    </div>
  );
}

export default function AccountsPage() {
  const { doctors, users, payments, orders, shipments, addPayment, attendance, updateAttendance, currentUser } = useApp();
  const [tab, setTab] = useState<"doctors" | "employees">("doctors");
  const [selectedDoctor, setSelectedDoctor] = useState(doctors[0]?.id ?? "");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const [ledgerView, setLedgerView] = useState<LedgerView>("all");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [selectedOrder, setSelectedOrder] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("TRANSFER");
  const [referenceNumber, setReferenceNumber] = useState("");

  const employees = users.filter((u) => !["DOCTOR"].includes(u.role));
  const doctor = doctors.find((d) => d.id === selectedDoctor);
  const emp = employees.find((e) => e.id === selectedEmployee);

  const doctorPayments = filterByDateRange(
    payments.filter((p) => p.doctorId === selectedDoctor),
    (p) => p.createdAt, dateRange
  );

  const doctorOrders = orders.filter((o) => o.doctorId === selectedDoctor);
  const doctorShipments = shipments.filter((s) => doctorOrders.some((o) => o.id === s.orderId));

  const groupedByPatient = useMemo(() => {
    const map = new Map<string, Payment[]>();
    for (const p of doctorPayments) {
      const key = p.patientName || "ללא מטופל";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "he"));
  }, [doctorPayments]);

  const viewDeliveryNote = (note: string) => {
    const shipment = shipments.find((s) => s.deliveryNote === note);
    const order = shipment ? orders.find((o) => o.id === shipment.orderId) : null;
    if (!order) return;
    const html = `<h2>תעודת משלוח ${note}</h2><table>
      <tr><td>עבודה</td><td>${order.serialNumber}</td></tr>
      <tr><td>רופא</td><td>${order.doctor.name}</td></tr>
      <tr><td>מטופל</td><td>${order.patient.name}</td></tr>
      <tr><td>שליח</td><td>${shipment?.courierName ?? "—"} ${shipment?.courierPhone ?? ""}</td></tr>
      <tr><td>תאריך</td><td>${formatDate(shipment?.shippedAt ?? shipment?.createdAt)}</td></tr>
    </table><p>${LAB_INFO.fullName}</p>`;
    printHtml(`משלוח ${note}`, html);
  };

  const recordPayment = (type: "PAYMENT" | "CHARGE") => {
    if (!selectedDoctor || !amount) return;
    const order = orders.find((o) => o.id === selectedOrder);
    const shipment = order?.shipment;
    addPayment({
      doctorId: selectedDoctor, employeeId: null,
      orderId: order?.id ?? null, serialNumber: order?.serialNumber ?? null,
      patientName: order?.patient.name ?? null,
      amount: parseFloat(amount), type, status: type === "PAYMENT" ? "PAID" : "PENDING",
      description: desc || (order ? `עבודה ${order.serialNumber}` : type === "PAYMENT" ? "תשלום" : "חיוב"),
      paymentMethod: type === "PAYMENT" ? paymentMethod : null,
      referenceNumber: type === "PAYMENT" && referenceNumber ? referenceNumber : null,
      deliveryNote: shipment?.deliveryNote ?? null,
      paidAt: type === "PAYMENT" ? new Date() : null,
    });
    setAmount(""); setDesc(""); setSelectedOrder(""); setReferenceNumber("");
  };

  const empAttendance = filterByDateRange(
    attendance.filter((a) => a.userId === selectedEmployee),
    (a) => a.checkIn, dateRange
  );

  const totalHours = empAttendance.reduce((sum, a) => {
    if (!a.checkOut) return sum;
    return sum + (a.checkOut.getTime() - a.checkIn.getTime()) / 3600000;
  }, 0);

  const estimatedPay = emp ? calculateEmployeePay(emp, totalHours) : null;

  return (
    <>
      <Header title="כרטסות" description="רופאים, עובדים, תשלומים ושעות"
        actions={<ExportActions title="כרטסות" whatsappText="סיכום כרטסות OPAL LAB" pdfHtml="<h2>כרטסות</h2>" />} />

      <div className="flex gap-2 mb-4 flex-wrap">
        {(["doctors", "employees"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("px-5 py-2 rounded-xl text-sm font-medium", tab === t ? "bg-opal-gold text-white" : "bg-white border")}>
            {t === "doctors" ? "רופאים" : "עובדים"}
          </button>
        ))}
        <DateRangeFilter value={dateRange} onChange={setDateRange} className="mr-auto" />
      </div>

      {tab === "doctors" ? (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {doctors.map((d) => (
              <button key={d.id} onClick={() => setSelectedDoctor(d.id)} className={cn("w-full text-right p-3 rounded-xl border", selectedDoctor === d.id ? "border-opal-gold bg-opal-gold/5" : "hover:bg-slate-50")}>
                <p className="font-medium text-sm">{d.name}</p>
                <p className={cn("font-bold", d.balance < 0 ? "text-red-600" : "text-emerald-600")}>{formatCurrency(d.balance)}</p>
              </button>
            ))}
          </div>
          <div className="lg:col-span-2 space-y-4">
            {doctor && (
              <Card>
                <CardHeader><CardTitle>{doctor.name}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div><Label>סכום ₪</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                    <div><Label>עבור עבודה</Label>
                      <Select value={selectedOrder} onChange={(e) => setSelectedOrder(e.target.value)}>
                        <option value="">כללי / ללא עבודה</option>
                        {doctorOrders.map((o) => <option key={o.id} value={o.id}>{o.serialNumber} — {o.patient.name}</option>)}
                      </Select>
                    </div>
                    <div><Label>שיטת תשלום</Label>
                      <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                        {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                          <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                        ))}
                      </Select>
                    </div>
                    <div><Label>מספר אסמכתא</Label><Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="צ'ק / העברה / אישור" /></div>
                  </div>
                  <div><Label>תיאור</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
                  <div className="flex gap-2">
                    <Button onClick={() => recordPayment("PAYMENT")}>רישום תשלום</Button>
                    <Button variant="outline" onClick={() => recordPayment("CHARGE")}>רישום חיוב</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-2">
              {([
                { key: "all" as const, label: "הכל" },
                { key: "patient" as const, label: "לפי מטופל" },
                { key: "delivery" as const, label: "תעודות משלוח" },
              ]).map(({ key, label }) => (
                <button key={key} onClick={() => setLedgerView(key)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", ledgerView === key ? "bg-slate-900 text-white" : "bg-white border")}>
                  {label}
                </button>
              ))}
            </div>

            {ledgerView === "all" && (
              <Card>
                <CardHeader><CardTitle>היסטוריית תנועות</CardTitle></CardHeader>
                <CardContent className="space-y-2 max-h-[28rem] overflow-y-auto">
                  {doctorPayments.map((p) => <PaymentRow key={p.id} p={p} onViewDelivery={viewDeliveryNote} />)}
                  {doctorPayments.length === 0 && <p className="text-center text-slate-400 py-6">אין תנועות</p>}
                </CardContent>
              </Card>
            )}

            {ledgerView === "patient" && (
              <div className="space-y-3">
                {groupedByPatient.map(([patient, items]) => {
                  const total = items.reduce((s, p) => s + (p.type === "PAYMENT" ? p.amount : -p.amount), 0);
                  return (
                    <Card key={patient}>
                      <CardHeader className="py-3">
                        <CardTitle className="text-base flex items-center justify-between">
                          <span className="flex items-center gap-2"><User className="h-4 w-4" />{patient}</span>
                          <span className={cn("text-sm", total >= 0 ? "text-emerald-600" : "text-red-600")}>{formatCurrency(Math.abs(total))} {total >= 0 ? "זכות" : "חוב"}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 pt-0">
                        {items.map((p) => <PaymentRow key={p.id} p={p} onViewDelivery={viewDeliveryNote} />)}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {ledgerView === "delivery" && doctor && (
              <Card>
                <CardHeader><CardTitle>תעודות משלוח — {doctor.name}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {doctorShipments.length === 0 ? (
                    <p className="text-center text-slate-400 py-6">אין תעודות משלוח לרופא זה</p>
                  ) : doctorShipments.map((s) => {
                    const order = orders.find((o) => o.id === s.orderId);
                    return (
                      <div key={s.id} className="p-3 rounded-xl border flex justify-between items-center">
                        <div>
                          <p className="font-bold text-opal-gold-dark">{s.deliveryNote}</p>
                          <p className="text-sm">{order?.serialNumber} · {order?.patient.name}</p>
                          <p className="text-xs text-slate-400">{formatDateTime(s.shippedAt ?? s.createdAt)} · {s.courierName}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => viewDeliveryNote(s.deliveryNote)}>
                          <Printer className="h-4 w-4" />צפייה
                        </Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {employees.map((e) => (
              <button key={e.id} onClick={() => setSelectedEmployee(e.id)} className={cn("w-full text-right p-3 rounded-xl border flex items-center gap-2", selectedEmployee === e.id ? "border-opal-gold bg-opal-gold/5" : "")}>
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: e.color ?? "#94a3b8" }} />
                <div><p className="font-medium text-sm">{e.name}</p><p className="text-xs text-slate-500">{USER_ROLE_LABELS[e.role]}</p></div>
              </button>
            ))}
          </div>
          {emp && (
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardContent className="p-4 grid sm:grid-cols-3 gap-4">
                  <div><p className="text-sm text-slate-500">שעות בטווח</p><p className="text-3xl font-bold">{totalHours.toFixed(1)}</p></div>
                  <div><p className="text-sm text-slate-500">סוג שכר</p><p className="text-sm font-medium mt-1">{getSalaryLabel(emp)}</p></div>
                  <div><p className="text-sm text-slate-500">חישוב לתקופה</p><p className="text-3xl font-bold text-opal-gold-dark">{estimatedPay != null ? formatCurrency(estimatedPay) : "—"}</p></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>דיווח שעות — {emp.name}</CardTitle></CardHeader>
                <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                  {empAttendance.map((a) => (
                    <div key={a.id} className="space-y-2">
                      <div className="grid sm:grid-cols-2 gap-2 p-2 rounded-lg bg-slate-50">
                        <div>
                          <Label className="text-[10px]">עריכת כניסה</Label>
                          <Input
                            type="datetime-local"
                            className="h-8 text-xs"
                            defaultValue={a.checkIn.toISOString().slice(0, 16)}
                            onChange={(e) => updateAttendance(a.id, { checkIn: new Date(e.target.value) })}
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">עריכת יציאה</Label>
                          <Input
                            type="datetime-local"
                            className="h-8 text-xs"
                            defaultValue={a.checkOut?.toISOString().slice(0, 16) ?? ""}
                            onChange={(e) => updateAttendance(a.id, { checkOut: e.target.value ? new Date(e.target.value) : null })}
                          />
                        </div>
                      </div>
                      <AttendanceAdminRecord
                        record={a}
                        employeeName={emp.name}
                        canViewPhotos={canViewAttendanceVerification(currentUser, a.userId)}
                      />
                    </div>
                  ))}
                  {empAttendance.length === 0 && <p className="text-center text-slate-400 py-6">אין דיווחים בטווח</p>}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </>
  );
}
