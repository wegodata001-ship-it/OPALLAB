"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/providers/AppProvider";
import { fetchAttendanceStatus } from "@/lib/attendance/status";
import { USER_ROLE_LABELS, ORDER_STATUS_LABELS } from "@/lib/constants/labels";
import { formatCurrency } from "@/lib/utils";
import { calculateEmployeePay, getSalaryLabel } from "@/lib/salary";
import { Clock, CheckCircle2, Wallet, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRODUCTION_STAGES,
  getStagesForRole,
  ROLE_PERMISSIONS_SUMMARY,
} from "@/lib/workflow-permissions";
import type { OrderStatus } from "@/lib/types";
import Link from "next/link";

const STAGE_LABELS = Object.fromEntries(PRODUCTION_STAGES.map((s) => [s.status, s.label])) as Record<OrderStatus, string>;

export default function MyWorkPage() {
  const { currentUser, attendance, orders } = useApp();
  const [hasOpenRecord, setHasOpenRecord] = useState<boolean | null>(null);

  const refreshAttendanceStatus = useCallback(async () => {
    if (!currentUser) {
      setHasOpenRecord(null);
      return;
    }
    try {
      const status = await fetchAttendanceStatus();
      setHasOpenRecord(status.hasOpenRecord);
    } catch {
      setHasOpenRecord(null);
    }
  }, [currentUser]);

  useEffect(() => {
    void refreshAttendanceStatus();
  }, [refreshAttendanceStatus]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const myAttendance = attendance
    .filter((a) => a.userId === currentUser?.id && a.checkIn >= monthStart)
    .sort((a, b) => b.checkIn.getTime() - a.checkIn.getTime());

  const totalHours = myAttendance.reduce((sum, a) => {
    if (!a.checkOut) return sum;
    return sum + (a.checkOut.getTime() - a.checkIn.getTime()) / 3600000;
  }, 0);

  const isActive = hasOpenRecord === true;
  const myStages = currentUser ? getStagesForRole(currentUser) : [];

  if (!currentUser) return null;

  const estimatedPay = calculateEmployeePay(currentUser, totalHours);

  const workReports = (() => {
    const reports: { orderId: string; serialNumber: string; patientName: string; stageLabel: string; completedAt: Date }[] = [];
    for (const order of orders) {
      for (const stage of myStages) {
        const c = order.completedStages[stage];
        if (c?.completedBy === currentUser.id) {
          reports.push({
            orderId: order.id,
            serialNumber: order.serialNumber,
            patientName: order.patient.name,
            stageLabel: STAGE_LABELS[stage] ?? ORDER_STATUS_LABELS[stage],
            completedAt: c.completedAt,
          });
        }
      }
    }
    return reports.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  })();

  return (
    <>
      <Header title="העבודה שלי" description={`${currentUser.name} · ${USER_ROLE_LABELS[currentUser.role]}`} />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
              <p className="text-xs text-slate-500">שעות החודש</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="text-2xl font-bold">{workReports.filter((r) => r.completedAt >= monthStart).length}</p>
              <p className="text-xs text-slate-500">דיווחי עבודה החודש</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-8 w-8 text-opal-gold" />
            <div>
              <p className="text-2xl font-bold text-opal-gold-dark">
                {estimatedPay != null ? formatCurrency(estimatedPay) : "—"}
              </p>
              <p className="text-xs text-slate-500">{getSalaryLabel(currentUser)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>נוכחות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center py-4">
            <div>
              <p className="text-sm text-slate-500 mb-1">מצב כעת</p>
              <p
                className={cn(
                  "text-xl font-bold",
                  hasOpenRecord === null ? "text-slate-400" : isActive ? "text-emerald-700" : "text-slate-600",
                )}
              >
                {hasOpenRecord === null ? "טוען..." : isActive ? "בעבודה" : "לא בוצעה כניסה"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 space-y-2">
              <QrCode className="h-8 w-8 text-opal-gold mx-auto" />
              <p className="font-medium text-slate-800">כניסה ויציאה רק בשער המעבדה</p>
              <p>
                סרקו את ה־QR או הצמידו את הטלפון לתג ה־NFC בכניסה.
                אין יותר רישום נוכחות ממסך זה.
              </p>
            </div>

            <Link href="/attendance/checkin">
              <Button variant="outline" className="w-full max-w-xs mx-auto">
                פתיחת שער הנוכחות (בדיקה)
              </Button>
            </Link>
            <Link href="/my-attendance" className="block text-sm text-opal-gold-dark hover:underline">
              לצפייה בהיסטוריית הנוכחות →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>הרשאות התפקיד שלי</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">{ROLE_PERMISSIONS_SUMMARY[currentUser.role]}</p>
          </CardContent>
        </Card>

        {workReports.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>דיווחי עבודה</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {workReports.map((r, i) => (
                <Link key={`${r.orderId}-${i}`} href={`/orders/${r.orderId}`} className="block p-3 rounded-lg border text-sm hover:border-opal-gold/40">
                  <span className="font-bold">{r.serialNumber}</span> — {r.patientName} · {r.stageLabel}
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
