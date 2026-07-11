"use client";

import { useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DentalChart } from "@/components/orders/dental-chart";
import { StatusBadge } from "@/components/orders/status-badge";
import { OrderStageIndicator } from "@/components/orders/order-stage-indicator";
import { ExportActions } from "@/components/shared/export-actions";
import { useApp } from "@/providers/AppProvider";
import { LAB_INFO, MATERIAL_TYPE_LABELS, WORK_TYPE_LABELS, GENDER_LABELS, ORDER_STATUS_LABELS } from "@/lib/constants/labels";
import {
  getOrderStageRelevance,
  isPrivilegedRole,
  STAGE_RELEVANCE_CARD_CLASS,
} from "@/lib/workflow-permissions";
import { formatDate, formatCurrency } from "@/lib/utils";
import type { MaterialType, WorkType, Gender, OrderStatus, DateRange } from "@/lib/types";
import { Search, Plus, Upload, List, UserPlus } from "lucide-react";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { DoctorFormModal } from "@/components/settings/doctor-form-modal";
import { cn } from "@/lib/utils";

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") === "new" ? "new" : "list";
  const setTab = (t: "list" | "new") => router.push(t === "new" ? "/orders?tab=new" : "/orders");

  const { orders, doctors, createOrder, addOrderFile, currentUser } = useApp();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [uploadOrderId, setUploadOrderId] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });

  // New order form state
  const [doctorId, setDoctorId] = useState("");
  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState<Gender | "">("");
  const [shade, setShade] = useState("");
  const [materials, setMaterials] = useState<MaterialType[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);
  const [description, setDescription] = useState("");
  const [completionDate, setCompletionDate] = useState("");
  const [totalPrice, setTotalPrice] = useState("");

  const isAdmin = currentUser ? isPrivilegedRole(currentUser) : false;
  const tab = !isAdmin && tabParam === "new" ? "list" : tabParam;
  const savedSerial = searchParams.get("saved");
  const sortedForEmployee = isAdmin || !currentUser
    ? orders
    : [...orders].sort((a, b) => {
        const rank = (s: typeof a.status) => {
          const r = getOrderStageRelevance(currentUser, s);
          if (r === "mine") return 0;
          if (r === "future") return 1;
          if (r === "past") return 2;
          return 3;
        };
        return rank(a.status) - rank(b.status) || b.entryDate.getTime() - a.entryDate.getTime();
      });

  const filtered = sortedForEmployee.filter((o) => {
    const matchSearch = !search || o.serialNumber.includes(search) || o.doctor.name.includes(search) || o.patient.name.includes(search);
    const matchStatus = statusFilter === "ALL" || o.status === statusFilter;
    const inRange = (!dateRange.from && !dateRange.to) || (
      (!dateRange.from || o.entryDate >= dateRange.from) &&
      (!dateRange.to || o.entryDate <= new Date(dateRange.to.getTime() + 86400000))
    );
    return matchSearch && matchStatus && inRange;
  });

  const toggleMaterial = (m: MaterialType) =>
    setMaterials((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  const toggleWorkType = (w: WorkType) =>
    setWorkTypes((p) => (p.includes(w) ? p.filter((x) => x !== w) : [...p, w]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const order = await createOrder({
      doctorId: doctorId || undefined,
      patientName: patientName.trim() || undefined,
      patientAge: patientAge ? parseInt(patientAge) : undefined,
      patientGender: patientGender || undefined,
      shade: shade || undefined, materials, workTypes, selectedTeeth,
      description: description || undefined,
      completionDate: completionDate ? new Date(completionDate) : undefined,
      totalPrice: totalPrice ? parseFloat(totalPrice) : undefined,
    });
    setDoctorId("");
    setPatientName("");
    setPatientAge("");
    setPatientGender("");
    setShade("");
    setMaterials([]);
    setWorkTypes([]);
    setSelectedTeeth([]);
    setDescription("");
    setCompletionDate("");
    setTotalPrice("");
    router.push(`/orders?saved=${order.serialNumber}`);
  };

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !uploadOrderId) return;
    const batchFolderId = crypto.randomUUID();
    for (const f of Array.from(files)) {
      await addOrderFile(uploadOrderId, f, undefined, batchFolderId);
    }
  }, [uploadOrderId, addOrderFile]);

  const listExportHtml = `<h2>רשימת הזמנות</h2><table><tr><th>מספר</th><th>רופא</th><th>מטופל</th><th>סטטוס</th></tr>
    ${filtered.map((o) => `<tr><td>${o.serialNumber}</td><td>${o.doctor.name}</td><td>${o.patient.name}</td><td>${ORDER_STATUS_LABELS[o.status]}</td></tr>`).join("")}
    </table>`;

  return (
    <>
      <Header
        title="הזמנות"
        description={
          isAdmin
            ? "ניהול הזמנות, קליטה חדשה ושיוך קבצים"
            : "כל הזמנות המעבדה — שלב נוכחי מסומן; «בטיפול שלי» = דורש את התפקיד שלך כעת"
        }
        actions={
          <ExportActions
            title="הזמנות OPAL LAB"
            whatsappText={`רשימת הזמנות OPAL LAB\n${filtered.map((o) => `${o.serialNumber} - ${o.patient.name} (${ORDER_STATUS_LABELS[o.status]})`).join("\n")}`}
            pdfHtml={listExportHtml}
          />
        }
      />

      <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-xl w-fit">
        <button onClick={() => setTab("list")} className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all", tab === "list" ? "bg-white shadow text-slate-900" : "text-slate-500")}>
          <List className="h-4 w-4" /> רשימה
        </button>
        {isAdmin && (
          <button onClick={() => setTab("new")} className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all", tab === "new" ? "bg-white shadow text-opal-gold-dark" : "text-slate-500")}>
            <Plus className="h-4 w-4" /> הזמנה חדשה
          </button>
        )}
      </div>

      {tab === "list" ? (
        <>
          {savedSerial && (
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              ההזמנה <strong>{savedSerial}</strong> נשמרה במאגר ההזמנות.
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-4 py-3">
            <p className="text-sm font-medium text-slate-700">
              מאגר הזמנות: <span className="text-opal-gold-dark font-bold">{orders.length}</span> הזמנות
              {filtered.length !== orders.length && (
                <span className="text-slate-400 font-normal"> · מוצגות {filtered.length} לפי סינון</span>
              )}
            </p>
            <p className="text-xs text-slate-400">הנתונים נשמרים אוטומטית בדפדפן</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="חיפוש..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "ALL")} className="sm:w-44">
              <option value="ALL">כל הסטטוסים</option>
              {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => (
                <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
              ))}
            </Select>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>

          {/* File upload strip */}
          <Card className="mb-4 border-dashed border-opal-gold/30 bg-opal-gold/5">
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-center">
              <Upload className="h-5 w-5 text-opal-gold shrink-0" />
              <Select value={uploadOrderId} onChange={(e) => setUploadOrderId(e.target.value)} className="flex-1">
                <option value="">בחר הזמנה לשיוך קבצי סריקה...</option>
                {orders.filter((o) => !["DELIVERED", "SHIPPED", "CANCELLED"].includes(o.status)).map((o) => (
                  <option key={o.id} value={o.id}>{o.serialNumber} — {o.patient.name}</option>
                ))}
              </Select>
                <label className={cn("cursor-pointer rounded-lg bg-opal-gold px-4 py-2 text-sm text-white font-medium", !uploadOrderId && "opacity-50 pointer-events-none")}>
                  <input type="file" multiple className="hidden" accept="*/*" onChange={(e) => handleFiles(e.target.files)} />
                  העלאת קבצים / תמונות
                </label>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {filtered.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-slate-500">
                  {orders.length === 0 ? (
                    <>
                      <p className="font-medium text-slate-700">אין עדיין הזמנות במאגר</p>
                      <p className="text-sm mt-1">לחץ על &quot;הזמנה חדשה&quot; כדי לקלוט את ההזמנה הראשונה</p>
                      <Button className="mt-4" onClick={() => setTab("new")}><Plus className="h-4 w-4 ml-1" /> הזמנה חדשה</Button>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-slate-700">לא נמצאו הזמנות לפי הסינון</p>
                      <p className="text-sm mt-1">נסה לשנות את החיפוש או טווח התאריכים</p>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : filtered.map((order) => {
              const relevance = currentUser && !isAdmin
                ? getOrderStageRelevance(currentUser, order.status)
                : null;
              return (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <Card
                  className={cn(
                    "hover:shadow-md transition-all cursor-pointer",
                    relevance ? STAGE_RELEVANCE_CARD_CLASS[relevance] : "hover:border-opal-gold/20",
                  )}
                >
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900">{order.serialNumber}</span>
                        {currentUser && !isAdmin ? (
                          <OrderStageIndicator user={currentUser} status={order.status} />
                        ) : (
                          <StatusBadge status={order.status} />
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-0.5">{order.doctor.name} · {order.patient.name}</p>
                      <p className="text-xs text-slate-400">
                        {order.materials.map((m) => MATERIAL_TYPE_LABELS[m]).join(", ")}
                        {order.selectedTeeth.length > 0 && ` · שיניים ${order.selectedTeeth.join(",")}`}
                      </p>
                    </div>
                    <div className="text-left text-sm text-slate-500">
                      <p>יעד: {formatDate(order.completionDate)}</p>
                      {order.totalPrice && <p className="font-semibold text-opal-gold-dark">{formatCurrency(order.totalPrice)}</p>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
            })}
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <Card className="border-opal-gold/20 overflow-hidden">
            <div className="bg-gradient-to-l from-opal-gold/10 to-transparent px-6 py-4 border-b flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-opal-gold flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="currentColor"><path d="M12 2C8.5 2 6 4.5 6 8c0 2 1 3.5 2.5 4.5C7 13.5 5 15.5 5 19h14c0-3.5-2-5.5-3.5-6.5C17 11.5 18 10 18 8c0-3.5-2.5-6-6-6z" /></svg>
              </div>
              <div>
                <p className="font-bold">{LAB_INFO.fullName}</p>
                <p className="text-xs text-slate-500">טופס קבלת הזמנה דיגיטלי · {LAB_INFO.businessId}</p>
              </div>
            </div>
            <CardContent className="p-6 space-y-5">
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <Label>רופא</Label>
                  <div className="flex gap-2 mt-1">
                    <Select
                      value={doctorId}
                      onChange={(e) => setDoctorId(e.target.value)}
                      className="flex-1"
                    >
                      <option value="">בחר רופא...</option>
                      {doctors.filter((d) => d.isActive).map((d) => (
                        <option key={d.id} value={d.id}>{d.name}{d.clinic ? ` · ${d.clinic}` : ""}</option>
                      ))}
                    </Select>
                    <Button type="button" variant="outline" onClick={() => setShowDoctorModal(true)}>
                      <UserPlus className="h-4 w-4" />
                      רופא חדש
                    </Button>
                  </div>
                </div>
                <div><Label>שם המטופל</Label><Input value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="אופציונלי" /></div>
                <div><Label>צבע Shade</Label><Input value={shade} onChange={(e) => setShade(e.target.value)} placeholder="A2" /></div>
              </div>
              <div className="grid sm:grid-cols-4 gap-4">
                <div><Label>גיל</Label><Input type="number" value={patientAge} onChange={(e) => setPatientAge(e.target.value)} /></div>
                <div><Label>מין</Label>
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
                <div><Label>מחיר ₪</Label><Input type="number" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} /></div>
              </div>
              <div>
                <Label>סוג חומר</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {(Object.keys(MATERIAL_TYPE_LABELS) as MaterialType[]).map((m) => (
                    <label key={m} className={cn("px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors", materials.includes(m) ? "border-opal-gold bg-opal-gold/10 text-opal-gold-dark font-medium" : "border-slate-200 hover:border-slate-300")}>
                      <input type="checkbox" className="sr-only" checked={materials.includes(m)} onChange={() => toggleMaterial(m)} />
                      {MATERIAL_TYPE_LABELS[m]}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>סוג עבודה</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {(Object.keys(WORK_TYPE_LABELS) as WorkType[]).map((w) => (
                    <label key={w} className={cn("px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors", workTypes.includes(w) ? "border-opal-gold bg-opal-gold/10 text-opal-gold-dark font-medium" : "border-slate-200")}>
                      <input type="checkbox" className="sr-only" checked={workTypes.includes(w)} onChange={() => toggleWorkType(w)} />
                      {WORK_TYPE_LABELS[w]}
                    </label>
                  ))}
                </div>
              </div>
              <DentalChart selectedTeeth={selectedTeeth} onChange={setSelectedTeeth} />
              <div><Label>תיאור עבודה</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" size="lg">שמירת הזמנה</Button>
                <Button type="button" variant="outline" onClick={() => setTab("list")}>ביטול</Button>
              </div>
              <p className="text-xs text-slate-400">כל השדות אופציונליים — ניתן לשמור הזמנה ריקה ולהשלים מאוחר יותר</p>
            </CardContent>
          </Card>
        </form>
      )}

      <DoctorFormModal
        open={showDoctorModal}
        onClose={() => setShowDoctorModal(false)}
        mode="create"
        onSaved={(doctor) => setDoctorId(doctor.id)}
      />
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">טוען...</div>}>
      <OrdersContent />
    </Suspense>
  );
}
