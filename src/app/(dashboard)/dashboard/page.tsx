"use client";

import Link from "next/link";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { ExportActions } from "@/components/shared/export-actions";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { UpcomingMeetingsCard } from "@/components/dashboard/upcoming-meetings-card";
import { useApp } from "@/providers/AppProvider";
import { StatusBadge } from "@/components/orders/status-badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { filterByDateRange } from "@/lib/date-filter";
import { canAccessCalendar } from "@/lib/calendar/permissions";
import type { DateRange, OrderStatus } from "@/lib/types";
import { useState } from "react";
import {
  TrendingUp, AlertTriangle, Users, Package, DollarSign, Clock,
} from "lucide-react";

const STAGE_COLUMNS: { status: OrderStatus; label: string; color: string }[] = [
  { status: "RECEIVED", label: "התקבלו", color: "#64748b" },
  { status: "FILES_ATTACHED", label: "קבצים", color: "#3b82f6" },
  { status: "DESIGN", label: "עיצוב", color: "#8b5cf6" },
  { status: "PRINTING_3D", label: "הדפסה 3D", color: "#06b6d4" },
  { status: "MILLING", label: "חריטה", color: "#6366f1" },
  { status: "PROCESSING", label: "עיבוד", color: "#f59e0b" },
  { status: "FINISH", label: "גימור", color: "#f97316" },
  { status: "PACKAGING", label: "אריזה", color: "#14b8a6" },
];

export default function DashboardPage() {
  const { getDashboardStats, orders, users, doctors, getActiveAttendance, getLowStockItems, currentUser } = useApp();
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const stats = getDashboardStats();
  const isOwner = currentUser?.role === "OWNER" || currentUser?.role === "ADMIN";
  const showCalendar = currentUser ? canAccessCalendar(currentUser) : false;

  const filteredOrders = filterByDateRange(orders, (o) => o.entryDate, dateRange);

  const ownerCards = [
    { label: "הכנסות החודש", value: formatCurrency(stats.monthlyRevenue), icon: DollarSign, color: "text-emerald-600 bg-emerald-50" },
    { label: "עבודות פעילות", value: stats.activeOrders, icon: Package, color: "text-blue-600 bg-blue-50" },
    { label: "חובות באיחור", value: stats.overduePayments, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "נוכחים כעת", value: getActiveAttendance().length, icon: Users, color: "text-purple-600 bg-purple-50" },
    { label: "מלאי נמוך", value: stats.lowStockCount, icon: TrendingUp, color: "text-amber-600 bg-amber-50" },
    { label: "ממתינות לאריזה", value: stats.pendingPackaging, icon: Clock, color: "text-teal-600 bg-teal-50" },
  ];

  const bottomCols =
    showCalendar && isOwner ? "lg:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2";

  return (
    <>
      <Header
        title={`לוח בקרה`}
        description={`${currentUser?.name} · ${formatDate(new Date())}`}
        actions={<ExportActions title="דוח OPAL LAB" whatsappText={`דוח OPAL LAB\nעבודות פעילות: ${stats.activeOrders}\nהכנסות: ${formatCurrency(stats.monthlyRevenue)}`} pdfHtml={`<h2>דוח יומי</h2>`} />}
      />

      <DateRangeFilter value={dateRange} onChange={setDateRange} className="mb-6" />

      {isOwner && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
          {ownerCards.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.label} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className={`inline-flex p-2 rounded-lg mb-2 ${c.color}`}><Icon className="h-4 w-4" /></div>
                  <p className="text-2xl font-bold">{c.value}</p>
                  <p className="text-xs text-slate-500">{c.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Kanban by stage */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900 mb-3">עמודות ייצור — מבט על</h2>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {STAGE_COLUMNS.map((col) => {
              const colOrders = filteredOrders.filter((o) => o.status === col.status);
              return (
                <div key={col.status} className="w-44 shrink-0">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                    <span className="text-sm font-semibold">{col.label}</span>
                    <span className="text-xs bg-slate-100 px-1.5 rounded-full mr-auto">{colOrders.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[120px] rounded-xl p-2" style={{ backgroundColor: col.color + "10" }}>
                    {colOrders.slice(0, 5).map((o) => (
                      <Link key={o.id} href={`/orders/${o.id}`}>
                        <div className="bg-white rounded-lg p-2 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-white">
                          <p className="font-bold text-xs">{o.serialNumber}</p>
                          <p className="text-[10px] text-slate-500 truncate">{o.patient.name}</p>
                          <p className="text-[10px] text-slate-400">{formatDate(o.completionDate)}</p>
                        </div>
                      </Link>
                    ))}
                    {colOrders.length === 0 && <p className="text-center text-[10px] text-slate-400 py-4">ריק</p>}
                    {colOrders.length > 5 && <p className="text-center text-[10px] text-slate-500">+{colOrders.length - 5} נוספות</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`grid gap-6 ${bottomCols}`}>
        {showCalendar && <UpcomingMeetingsCard />}

        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">הזמנות אחרונות</h3>
            <div className="space-y-2">
              {filteredOrders.slice(0, 6).map((o) => (
                <Link key={o.id} href={`/orders/${o.id}`} className="flex justify-between items-center p-2 rounded-lg hover:bg-slate-50">
                  <div><p className="font-medium text-sm">{o.serialNumber}</p><p className="text-xs text-slate-500">{o.doctor?.name ?? "—"}</p></div>
                  <StatusBadge status={o.status} />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {isOwner && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3">דוחות בעלים</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 rounded-lg bg-slate-50">
                  <span>רופאים עם חוב</span>
                  <span className="font-bold text-red-600">{doctors.filter((d) => d.balance < 0).length}</span>
                </div>
                <div className="flex justify-between p-2 rounded-lg bg-slate-50">
                  <span>סה״כ חובות רופאים</span>
                  <span className="font-bold">{formatCurrency(doctors.filter((d) => d.balance < 0).reduce((s, d) => s + Math.abs(d.balance), 0))}</span>
                </div>
                <div className="flex justify-between p-2 rounded-lg bg-slate-50">
                  <span>עובדים במעבדה</span>
                  <span className="font-bold">{getActiveAttendance().length} / {users.filter((u) => u.role !== "DOCTOR").length}</span>
                </div>
                {getLowStockItems().slice(0, 3).map((i) => (
                  <div key={i.id} className="flex justify-between p-2 rounded-lg bg-amber-50 text-amber-800">
                    <span>{i.name}</span><span>נותרו {i.quantity}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
