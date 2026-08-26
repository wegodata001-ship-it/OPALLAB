"use client";

import { useState, useCallback, Suspense, useRef, useEffect, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DentalChart } from "@/components/DentalChart";
import { OrderHistoryButton } from "@/components/orders/order-history-modal";
import { ShadePicker } from "@/components/orders/shade-picker";
import {
  OrderUploadTiles,
  type OrderUploadTilesHandle,
  type FmUploadAggregate,
} from "@/components/orders/order-upload-tiles";
import { FmSaveUploadHint } from "@/components/file-manager-v2/fm-global-progress";
import { DraftLeaveDialog } from "@/components/orders/draft-leave-dialog";
import { TelegramOrderButton } from "@/components/orders/telegram-order-button";
import { loadPendingFromDraft, persistSlotUploads } from "@/lib/orders/persist-slot-uploads";
import { openTelegramOrderShare } from "@/lib/orders/telegram-order";
import { uploadAudit } from "@/lib/orders/upload-audit";
import { StatusBadge } from "@/components/orders/status-badge";
import { OrderStageIndicator } from "@/components/orders/order-stage-indicator";
import { ExportActions } from "@/components/shared/export-actions";
import { useApp } from "@/providers/AppProvider";
import { useOrderCreateDraft } from "@/hooks/use-order-create-draft";
import { LAB_INFO, GENDER_LABELS, ORDER_STATUS_LABELS } from "@/lib/constants/labels";
import { catalogLabel } from "@/lib/orders/order-catalog";
import type { Order } from "@/lib/types";
import { syncWorkTypesWithSplint } from "@/lib/orders/splint-types";
import { SplintTypeSelect } from "@/components/orders/splint-type-select";
import { CatalogChipField } from "@/components/orders/catalog-chip-field";
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

const STAFF_DRAFT_KEY = "staff-order-create";

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") === "new" ? "new" : "list";

  const { orders, doctors, addOrderFile, currentUser, refresh, refreshQuiet, orderCatalog } = useApp();
  const uploadRef = useRef<OrderUploadTilesHandle>(null);
  const [formError, setFormError] = useState("");
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
  const [splintTypeIds, setSplintTypeIds] = useState<string[]>([]);
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);
  const [bridgeGroups, setBridgeGroups] = useState<number[][]>([]);
  const [description, setDescription] = useState("");
  const [completionDate, setCompletionDate] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadState, setUploadState] = useState<FmUploadAggregate | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);

  const isAdmin = currentUser ? isPrivilegedRole(currentUser) : false;
  const tab = !isAdmin && tabParam === "new" ? "list" : tabParam;

  const draft = useOrderCreateDraft(STAFF_DRAFT_KEY, {
    doctorId: doctorId || undefined,
    enabled: isAdmin && tab === "new",
  });

  const hasUploadFiles = (uploadState?.total ?? 0) > 0;
  const uploadBlocking = uploadState?.hasBlocking ?? false;
  const saveReady =
    draft.ready && !uploadBlocking && (!hasUploadFiles || uploadState?.isComplete === true);

  const requestLeaveCreate = () => {
    const hasLocalOrServerFiles =
      uploadRef.current?.hasFiles() || uploadRef.current?.hasUploadedFiles();
    if (hasLocalOrServerFiles) {
      setLeaveOpen(true);
      return;
    }
    // Empty form — discard empty server draft quietly.
    void draft.discard();
    router.push("/orders");
  };

  const setTab = (t: "list" | "new") => {
    if (t === "list" && tab === "new") {
      requestLeaveCreate();
      return;
    }
    router.push(t === "new" ? "/orders?tab=new" : "/orders");
  };
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
    const doctorName = o.doctor?.name ?? "";
    const matchSearch = !search || o.serialNumber.includes(search) || doctorName.includes(search) || o.patient.name.includes(search);
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

  const onSplintTypeChange = (ids: string[]) => {
    setSplintTypeIds(ids);
    setWorkTypes((prev) => syncWorkTypesWithSplint(prev, ids));
  };

  // Resume form fields from a kept draft (browser reopen / save-draft leave).
  useEffect(() => {
    const h = draft.hydrateFromDraft;
    if (!h) return;
    startTransition(() => {
      if (h.doctorId) setDoctorId(h.doctorId);
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
      if (h.totalPrice != null) setTotalPrice(String(h.totalPrice));
    });
  }, [draft.hydrateFromDraft]);

  const saveDraftFields = draft.saveDraftFields;
  const draftOrderId = draft.orderId;

  useEffect(() => {
    if (tab !== "new") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (uploadRef.current?.hasFiles()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [tab]);

  // Auto-save draft form fields (debounced) so browser close does not lose data.
  useEffect(() => {
    if (tab !== "new" || !draftOrderId) return;
    const t = window.setTimeout(() => {
      void saveDraftFields({
        doctorId: doctorId || undefined,
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
        totalPrice: totalPrice ? parseFloat(totalPrice) : null,
      });
    }, 900);
    return () => window.clearTimeout(t);
  }, [
    tab,
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
    totalPrice,
    saveDraftFields,
  ]);

  const resetCreateForm = () => {
    setDoctorId("");
    setPatientName("");
    setPatientAge("");
    setPatientGender("");
    setShade("");
    setMaterials([]);
    setWorkTypes([]);
    setSplintTypeIds([]);
    setSelectedTeeth([]);
    setBridgeGroups([]);
    setDescription("");
    setCompletionDate("");
    setTotalPrice("");
  };

  const saveNewOrder = async (): Promise<Order> => {
    if (uploadRef.current?.hasBlockingUploads()) {
      throw new Error("יש להמתין עד שכל הקבצים יסתיימו");
    }
    // Wait for in-flight draft uploads before finalize.
    await uploadRef.current?.waitForUploads();

    const alreadyOnServer = uploadRef.current?.hasUploadedFiles() ?? false;
    let pending = uploadRef.current?.getPendingUploads() ?? [];
    // Only fall back to IndexedDB when NOTHING reached the server yet.
    // Otherwise IDB still holds copies of uploaded files → conflict / empty screen.
    if (pending.length === 0 && !alreadyOnServer) {
      pending = await loadPendingFromDraft(STAFF_DRAFT_KEY);
    }

    uploadAudit({
      step: "CREATE_ORDER",
      orderId: draft.orderId,
      count: pending.length,
      extra: { alreadyOnServer, pendingNames: pending.map((p) => p.file.name) },
    });

    const order = await draft.finalize({
      doctorId: doctorId || undefined,
      patientName: patientName.trim() || undefined,
      patientAge: patientAge ? parseInt(patientAge) : undefined,
      patientGender: patientGender || undefined,
      shade: shade || undefined,
      materials,
      workTypes,
      splintTypeIds,
        selectedTeeth,
        bridgeGroups,
        description: description || undefined,
        completionDate: completionDate ? new Date(completionDate) : undefined,
        totalPrice: totalPrice ? parseFloat(totalPrice) : undefined,
      });

    if (!order?.id) {
      throw new Error("ההזמנה נשמרה ללא מזהה");
    }

    // Only files that never reached the draft (e.g. draft not ready yet).
    if (pending.length > 0) {
      await persistSlotUploads(order.id, pending, {
        askVersionMode: (fileName, existingName, existingVersion) =>
          uploadRef.current?.askVersionMode(fileName, existingName, existingVersion) ??
          Promise.resolve("new_version"),
      });
    }

    await uploadRef.current?.clear();
    uploadAudit({ step: "INVALIDATE_CACHE", orderId: order.id, success: true });
    await refresh();
    uploadAudit({ step: "REFRESH_FILES", orderId: order.id, success: true });
    return order;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const order = await saveNewOrder();
      resetCreateForm();
      // Open order detail so files are visible immediately (no manual refresh).
      router.push(`/orders/${order.id}`);
    } catch (err) {
      console.error("[staff-order] submit failed", err);
      setFormError(err instanceof Error ? err.message : "שגיאה בשמירת ההזמנה או הקבצים");
      try {
        await refresh();
      } catch {
        /* ignore */
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTelegramSaveAndShare = async () => {
    setSaving(true);
    setFormError("");
    try {
      const savedPatient = patientName.trim() || "לא צוין";
      const savedWorkTypes = workTypes;
      const savedDoctorId = doctorId;
      const order = await saveNewOrder();
      const doctorName =
        doctors.find((d) => d.id === savedDoctorId)?.name ||
        doctors.find((d) => d.id === order.doctorId)?.name ||
        "—";
      openTelegramOrderShare({
        serialNumber: order.serialNumber,
        patientName: savedPatient,
        doctorName,
        workTypes: savedWorkTypes,
        orderId: order.id,
      });
      resetCreateForm();
      router.push(`/orders/${order.id}`);
    } catch (err) {
      console.error("[staff-order] telegram save failed", err);
      setFormError(err instanceof Error ? err.message : "שגיאה בשמירת ההזמנה");
      try {
        await refresh();
      } catch {
        /* ignore */
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !uploadOrderId) return;
    const batchFolderId = crypto.randomUUID();
    for (const f of Array.from(files)) {
      await addOrderFile(uploadOrderId, f, undefined, batchFolderId);
    }
  }, [uploadOrderId, addOrderFile]);

  const listExportHtml = `<h2>רשימת הזמנות</h2><table><tr><th>מספר</th><th>רופא</th><th>מטופל</th><th>סטטוס</th></tr>
    ${filtered.map((o) => `<tr><td>${o.serialNumber}</td><td>${o.doctor?.name ?? ""}</td><td>${o.patient.name}</td><td>${ORDER_STATUS_LABELS[o.status]}</td></tr>`).join("")}
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
              {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[])
                .filter((s) => s !== "DRAFT")
                .map((s) => (
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
              <div key={order.id} className="relative">
                <div className="absolute left-3 top-3 z-10" onClick={(e) => e.stopPropagation()}>
                  <OrderHistoryButton order={order} />
                </div>
                <Link href={`/orders/${order.id}`}>
                  <Card
                    className={cn(
                      "hover:shadow-md transition-all cursor-pointer",
                      relevance ? STAGE_RELEVANCE_CARD_CLASS[relevance] : "hover:border-opal-gold/20",
                    )}
                  >
                    <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 pl-12">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">{order.serialNumber}</span>
                          {currentUser && !isAdmin ? (
                            <OrderStageIndicator user={currentUser} status={order.status} />
                          ) : (
                            <StatusBadge status={order.status} />
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mt-0.5">{order.doctor?.name ?? "—"} · {order.patient.name}</p>
                        <p className="text-xs text-slate-400">
                          {order.materials
                            .map((m) => catalogLabel(orderCatalog, "MATERIAL", m))
                            .join(", ")}
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
              </div>
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
                <div className="sm:col-span-1"><ShadePicker value={shade} onChange={setShade} /></div>
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
              <CatalogChipField
                category="MATERIAL"
                title="סוג חומר"
                catalog={orderCatalog}
                selected={materials}
                onToggle={toggleMaterial}
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
              <SplintTypeSelect value={splintTypeIds} onChange={onSplintTypeChange} />
              <DentalChart
                selectedTeeth={selectedTeeth}
                onChange={setSelectedTeeth}
                bridgeGroups={bridgeGroups}
                onBridgeGroupsChange={setBridgeGroups}
              />
              <div><Label>תיאור עבודה</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
              <div>
                <Label>תמונות וסריקות</Label>
                <div className="mt-2">
                  <OrderUploadTiles
                    ref={uploadRef}
                    draftKey={STAFF_DRAFT_KEY}
                    orderId={draft.orderId ?? undefined}
                    ensureOrderId={() => draft.ensureDraft(doctorId || undefined)}
                    onUploadStateChange={setUploadState}
                  />
                </div>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              {draft.error && <p className="text-sm text-amber-700">{draft.error}</p>}
              <FmSaveUploadHint
                state={uploadState ?? { total: 0, queued: 0, uploading: 0, done: 0, error: 0, overallProgress: 0, isUploading: false, isComplete: true, hasBlocking: false, kindSummary: [] }}
                hasAnyFiles={hasUploadFiles}
              />
              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  type="submit"
                  size="lg"
                  disabled={saving || !saveReady}
                  className={cn(
                    saveReady && hasUploadFiles && "bg-opal-gold hover:bg-opal-gold-dark text-white",
                  )}
                >
                  {saving ? "שומר הזמנה..." : "שמירת הזמנה"}
                </Button>
                <Button type="button" variant="outline" onClick={requestLeaveCreate} disabled={saving}>
                  ביטול
                </Button>
                <TelegramOrderButton
                  disabled={saving || !saveReady}
                  onClick={() => void handleTelegramSaveAndShare()}
                />
              </div>
              <p className="text-xs text-slate-400">
                {uploadBlocking
                  ? "יש להמתין עד שכל הקבצים יסתיימו לפני שמירת ההזמנה."
                  : "ניתן להעלות קבצים מיד. לחיצה על «שמירת הזמנה» משייכת את הקבצים להזמנה הסופית."}
              </p>
            </CardContent>
          </Card>
        </form>
      )}

      <DraftLeaveDialog
        open={leaveOpen}
        busy={leaveBusy}
        onContinue={() => setLeaveOpen(false)}
        onSaveDraft={() => {
          setLeaveBusy(true);
          void (async () => {
            try {
              await saveDraftFields({
                doctorId: doctorId || undefined,
                patientName: patientName.trim() || "טיוטה",
                patientAge: patientAge ? parseInt(patientAge, 10) : null,
                patientGender: patientGender || null,
                shade: shade || null,
                materials,
                workTypes,
                selectedTeeth,
                bridgeGroups,
                description: description || null,
                completionDate: completionDate ? new Date(completionDate) : null,
                totalPrice: totalPrice ? parseFloat(totalPrice) : null,
              });
              draft.keepAndLeave();
              setLeaveOpen(false);
              router.push("/orders");
            } finally {
              setLeaveBusy(false);
            }
          })();
        }}
        onDiscard={() => {
          setLeaveBusy(true);
          void (async () => {
            try {
              await uploadRef.current?.clear();
              await draft.discard();
              resetCreateForm();
              setLeaveOpen(false);
              router.push("/orders");
            } finally {
              setLeaveBusy(false);
            }
          })();
        }}
      />

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
