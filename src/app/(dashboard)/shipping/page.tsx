"use client";

import { useState } from "react";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { ExportActions } from "@/components/shared/export-actions";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { useApp } from "@/providers/AppProvider";
import { StatusBadge } from "@/components/orders/status-badge";
import { formatDate, formatDateTime } from "@/lib/utils";
import { filterByDateRange } from "@/lib/date-filter";
import { printHtml, shareWhatsApp } from "@/lib/export";
import { LAB_INFO } from "@/lib/constants/labels";
import type { DateRange } from "@/lib/types";
import { Package, Truck, FileText, Printer, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ShippingPage() {
  const { orders, shipments, couriers, previewDeliveryNote, createShipment, updateOrderStatus, currentUser } = useApp();
  const [tab, setTab] = useState<"ship" | "archive">("ship");
  const [selectedId, setSelectedId] = useState("");
  const [courierId, setCourierId] = useState("");
  const [previewNote, setPreviewNote] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });

  const readyOrders = orders.filter((o) => o.status === "FINISH" || o.status === "PACKAGING");
  const selected = orders.find((o) => o.id === selectedId);
  const courier = couriers.find((c) => c.id === courierId);

  const archivedShipments = filterByDateRange(
    shipments.map((s) => ({ ...s, order: orders.find((o) => o.id === s.orderId) })).filter((s) => s.order),
    (s) => s.shippedAt ?? s.createdAt,
    dateRange
  );

  const generatePreview = () => {
    if (!selectedId) return;
    setPreviewNote(previewDeliveryNote(selectedId));
    updateOrderStatus({ orderId: selectedId, status: "PACKAGING", changedBy: currentUser!.id, notes: "מוכן לאריזה" });
  };

  const deliveryHtml = (note: string, order = selected) => {
    if (!order) return "";
    return `<h2>תעודת משלוח ${note}</h2><table>
      <tr><td>עבודה</td><td>${order.serialNumber}</td></tr>
      <tr><td>רופא</td><td>${order.doctor.name}</td></tr>
      <tr><td>מטופל</td><td>${order.patient.name}</td></tr>
      <tr><td>תאריך</td><td>${formatDate(new Date())}</td></tr></table>`;
  };

  const confirmShip = () => {
    if (!selectedId || !previewNote) return;
    createShipment(selectedId, previewNote, courier ? { name: courier.name, phone: courier.phone } : undefined);
    setSelectedId(""); setPreviewNote(""); setCourierId("");
  };

  return (
    <>
      <Header title="אריזה ושילוח" description="הפקת תעודות משלוח וארכיון" />

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab("ship")} className={cn("px-4 py-2 rounded-xl text-sm font-medium", tab === "ship" ? "bg-opal-gold text-white" : "bg-white border")}>שילוח חדש</button>
        <button onClick={() => setTab("archive")} className={cn("px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1", tab === "archive" ? "bg-opal-gold text-white" : "bg-white border")}>
          <Archive className="h-4 w-4" />ארכיון ({shipments.length})
        </button>
      </div>

      {tab === "ship" ? (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />מוכנות לשילוח</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {readyOrders.map((o) => (
                <button key={o.id} onClick={() => { setSelectedId(o.id); setPreviewNote(""); }}
                  className={cn("w-full text-right p-3 rounded-xl border", selectedId === o.id ? "border-opal-gold bg-opal-gold/5" : "hover:bg-slate-50")}>
                  <div className="flex justify-between"><StatusBadge status={o.status} /><span className="font-bold">{o.serialNumber}</span></div>
                  <p className="text-sm text-slate-500">{o.doctor.name} · {o.patient.name}</p>
                </button>
              ))}
            </CardContent>
          </Card>
          {selected && (
            <Card className="border-opal-gold/30">
              <CardHeader><CardTitle><FileText className="h-5 w-5 inline ml-2" />תעודת משלוח</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {!previewNote ? (
                  <Button className="w-full" size="lg" onClick={generatePreview}><FileText className="h-5 w-5" />הפקת תעודת משלוח</Button>
                ) : (
                  <>
                    <div className="text-center p-6 rounded-xl bg-opal-gold/10">
                      <p className="text-3xl font-bold text-opal-gold-dark">{previewNote}</p>
                      <p className="text-sm mt-2">{selected.serialNumber} · {selected.patient.name}</p>
                      <div className="flex gap-2 justify-center mt-3">
                        <Button variant="outline" size="sm" onClick={() => printHtml(`משלוח ${previewNote}`, deliveryHtml(previewNote))}><Printer className="h-4 w-4" />PDF</Button>
                      </div>
                    </div>
                    <div><Label>שליח</Label>
                      <Select value={courierId} onChange={(e) => setCourierId(e.target.value)}>
                        <option value="">בחר שליח</option>
                        {couriers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
                      </Select>
                    </div>
                    <Button className="w-full" size="lg" onClick={confirmShip}><Truck className="h-5 w-5" />אישור שילוח</Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <>
          <DateRangeFilter value={dateRange} onChange={setDateRange} className="mb-4" />
          <div className="space-y-3">
            {archivedShipments.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-opal-gold-dark">{s.deliveryNote}</p>
                    <p className="text-sm">{s.order?.serialNumber} · {s.order?.patient.name} · {s.order?.doctor.name}</p>
                    <p className="text-xs text-slate-400">{s.courierName} {s.courierPhone} · {formatDateTime(s.shippedAt ?? s.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => printHtml(`משלוח ${s.deliveryNote}`, deliveryHtml(s.deliveryNote, s.order))}><Printer className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => shareWhatsApp(`תעודת משלוח ${s.deliveryNote}\n${LAB_INFO.name}\n${s.order?.serialNumber}`)}>WhatsApp</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
